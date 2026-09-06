/**
 * fulfillment/index.js — Warehouse Fulfillment Allocator (Rules.md §5,
 * Architecture.md §8).
 *
 * StockLevel tracks qtyAvailable (total physical stock) and qtyReserved
 * (already committed to some quotation's current split) separately, with
 * `optimisticConcurrency: true` guarding against oversell on concurrent
 * allocation — a `.save()` that lost a race throws a VersionError, which
 * `reserveStock` below retries.
 *
 * FulfillmentSplit is a single current-state document per quotation
 * (upserted on every suggest/override) — history of overrides lives in
 * AuditLog, not as separate FulfillmentSplit rows.
 */

const { Quotation, Warehouse, StockLevel, FulfillmentSplit, AuditLog } = require('../../models');
const { emitToQuotation } = require('../../realtime');

const SHIP_DAYS_CLEAN = 3;
const SHIP_DAYS_WITH_BACKORDER = 7;

/** Free-to-allocate stock = qtyAvailable - qtyReserved. */
async function buildAvailabilityMap(productIds) {
  const rows = await StockLevel.find({ productId: { $in: productIds } }).lean();
  const warehouseIds = [...new Set(rows.map((r) => String(r.warehouseId)))];
  const warehouses = await Warehouse.find({ _id: { $in: warehouseIds } }).lean();
  const whById = Object.fromEntries(warehouses.map((w) => [String(w._id), w]));

  const map = {};
  for (const r of rows) {
    const key = String(r.productId);
    if (!map[key]) map[key] = [];
    map[key].push({
      warehouseId: r.warehouseId,
      name: whById[String(r.warehouseId)]?.name,
      shippingWeight: whById[String(r.warehouseId)]?.shippingWeight ?? 1,
      free: r.qtyAvailable - r.qtyReserved,
    });
  }
  return map;
}

/**
 * Pure greedy heuristic (Rules.md §5):
 *  1. Per line, sort candidate warehouses by free stock desc, allocate from
 *     the top down; unmet remainder -> backorder.
 *  2. Consolidation pass: if a warehouse carries a tiny fraction (<15%) of
 *     the order's total qty, try to fold it into another warehouse already
 *     used for the same product, reducing shipment count by one.
 */
function computeGreedyAllocation(lines, availabilityMap) {
  const working = {};
  for (const [productId, whList] of Object.entries(availabilityMap)) {
    working[productId] = whList.map((w) => ({ ...w }));
  }

  const allocations = []; // { lineId, productId, warehouseId, qty }
  const backorders = []; // { lineId, productId, qty }

  for (const line of lines) {
    let remainingQty = line.qty;
    const candidates = (working[String(line.productId)] || [])
      .slice()
      .sort((a, b) => b.free - a.free);

    for (const wh of candidates) {
      if (remainingQty <= 0) break;
      if (wh.free <= 0) continue;
      const take = Math.min(wh.free, remainingQty);
      allocations.push({ lineId: line._id, productId: line.productId, warehouseId: wh.warehouseId, qty: take });
      wh.free -= take;
      remainingQty -= take;
    }

    if (remainingQty > 0) {
      backorders.push({ lineId: line._id, productId: line.productId, qty: remainingQty });
    }
  }

  const totalOrderQty = lines.reduce((s, l) => s + l.qty, 0) || 1;
  const byWarehouse = {};
  for (const a of allocations) byWarehouse[String(a.warehouseId)] = (byWarehouse[String(a.warehouseId)] || 0) + a.qty;

  for (const [whId, qty] of Object.entries(byWarehouse)) {
    if (qty / totalOrderQty >= 0.15) continue; // not "tiny"
    const tinyAllocs = allocations.filter((a) => String(a.warehouseId) === whId);
    for (const tiny of tinyAllocs) {
      const candidates = (working[String(tiny.productId)] || []).filter(
        (w) => String(w.warehouseId) !== whId && w.free >= tiny.qty
      );
      if (candidates.length === 0) continue;
      const target = candidates.sort((a, b) => b.free - a.free)[0];
      target.free -= tiny.qty;
      tiny.warehouseId = target.warehouseId;
    }
  }

  const shipmentCount = new Set(allocations.map((a) => String(a.warehouseId))).size;
  return { allocations, backorders, shipmentCount };
}

/** Reserve stock via optimistic concurrency (retry on lost race), guarding against oversell. */
async function reserveStock(warehouseId, productId, qty, maxRetries = 4) {
  if (qty <= 0) return;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const stock = await StockLevel.findOne({ warehouseId, productId });
    if (!stock || stock.qtyAvailable - stock.qtyReserved < qty) {
      throw new Error('Insufficient free stock to reserve (concurrent allocation).');
    }
    stock.qtyReserved += qty;
    try {
      await stock.save(); // optimisticConcurrency: true -> throws VersionError on lost race
      return;
    } catch (err) {
      if (err.name !== 'VersionError' || attempt === maxRetries - 1) throw err;
      await new Promise((r) => setTimeout(r, 20));
    }
  }
}

async function releaseStock(warehouseId, productId, qty, maxRetries = 4) {
  if (qty <= 0) return;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const stock = await StockLevel.findOne({ warehouseId, productId });
    if (!stock) return;
    stock.qtyReserved = Math.max(0, stock.qtyReserved - qty);
    try {
      await stock.save();
      return;
    } catch (err) {
      if (err.name !== 'VersionError' || attempt === maxRetries - 1) throw err;
      await new Promise((r) => setTimeout(r, 20));
    }
  }
}

/** Releases whatever the CURRENT FulfillmentSplit doc has reserved, before recomputing a new one. */
async function releaseCurrentReservation(quotationId) {
  const existing = await FulfillmentSplit.findOne({ quotationId });
  if (!existing) return;
  for (const a of existing.allocations) {
    if (!a.isBackorder) {
      await releaseStock(a.warehouseId, a.productId, a.qty);
    }
  }
}

function estimateShippingCost(allocations, warehousesById) {
  const byWarehouse = {};
  for (const a of allocations) {
    if (a.isBackorder) continue;
    byWarehouse[String(a.warehouseId)] = true;
  }
  return Object.keys(byWarehouse).reduce(
    (sum, whId) => sum + (warehousesById[whId]?.shippingWeight ?? 1),
    0
  );
}

/**
 * Recommended split (design.md B6): "N shipments, optimized from a
 * possible M". Persists the current FulfillmentSplit doc, reserves the
 * allocated stock, and updates the quotation's delivery-promise fields.
 */
async function suggestSplit(quotationId) {
  const quotation = await Quotation.findById(quotationId);
  if (!quotation) throw new Error('Quotation not found.');

  await releaseCurrentReservation(quotationId);

  const productIds = quotation.lines.map((l) => l.productId);
  const availabilityMap = await buildAvailabilityMap(productIds);
  const { allocations, backorders, shipmentCount } = computeGreedyAllocation(quotation.lines, availabilityMap);

  for (const a of allocations) {
    await reserveStock(a.warehouseId, a.productId, a.qty);
  }

  const warehouses = await Warehouse.find().lean();
  const warehousesById = Object.fromEntries(warehouses.map((w) => [String(w._id), w]));

  const allocationDocs = [
    ...allocations.map((a) => ({ warehouseId: a.warehouseId, productId: a.productId, qty: a.qty, isBackorder: false })),
    ...backorders.map((b) => ({ warehouseId: null, productId: b.productId, qty: b.qty, isBackorder: true })),
  ];

  const split = await FulfillmentSplit.findOneAndUpdate(
    { quotationId },
    {
      quotationId,
      allocations: allocationDocs,
      shipmentCount,
      estimatedCost: estimateShippingCost(allocationDocs, warehousesById),
      isOverride: false,
      status: backorders.length > 0 ? 'Backorder' : 'Split',
    },
    { upsert: true, new: true }
  );

  // Delivery Promise Slippage tracking (Rules.md §9).
  const projected = new Date(Date.now() + (backorders.length > 0 ? SHIP_DAYS_WITH_BACKORDER : SHIP_DAYS_CLEAN) * 86400000);
  if (!quotation.promisedShipDate) quotation.promisedShipDate = projected;
  quotation.currentProjectedShipDate = projected;
  await quotation.save();

  await AuditLog.create({
    entity: 'Quotation',
    entityId: quotationId,
    action: 'fulfillment_suggested',
    detail: { shipmentCount, backorderCount: backorders.length },
  });

  emitToQuotation(quotationId, 'fulfillment_updated', split.toObject());
  return split;
}

/**
 * Manual override — always wins over the suggested split and is logged
 * (Rules.md §5). Backordered rows are represented with warehouseId: null.
 */
async function override(quotationId, manualAllocations, actorId) {
  const quotation = await Quotation.findById(quotationId);
  if (!quotation) throw new Error('Quotation not found.');

  await releaseCurrentReservation(quotationId);

  for (const row of manualAllocations) {
    if (row.warehouseId) {
      await reserveStock(row.warehouseId, row.productId, row.qty);
    }
  }

  const warehouses = await Warehouse.find().lean();
  const warehousesById = Object.fromEntries(warehouses.map((w) => [String(w._id), w]));

  const allocationDocs = manualAllocations.map((r) => ({
    warehouseId: r.warehouseId || null,
    productId: r.productId,
    qty: r.qty,
    isBackorder: !r.warehouseId,
  }));
  const backorderCount = allocationDocs.filter((a) => a.isBackorder).length;
  const shipmentCount = new Set(allocationDocs.filter((a) => !a.isBackorder).map((a) => String(a.warehouseId))).size;

  const split = await FulfillmentSplit.findOneAndUpdate(
    { quotationId },
    {
      quotationId,
      allocations: allocationDocs,
      shipmentCount,
      estimatedCost: estimateShippingCost(allocationDocs, warehousesById),
      isOverride: true,
      status: backorderCount > 0 ? 'Backorder' : 'Split',
    },
    { upsert: true, new: true }
  );

  const projected = new Date(Date.now() + (backorderCount > 0 ? SHIP_DAYS_WITH_BACKORDER : SHIP_DAYS_CLEAN) * 86400000);
  quotation.currentProjectedShipDate = projected;
  if (!quotation.promisedShipDate) quotation.promisedShipDate = projected;
  await quotation.save();

  await AuditLog.create({
    entity: 'Quotation',
    entityId: quotationId,
    action: 'fulfillment_override',
    actorId,
    detail: { rowCount: allocationDocs.length, shipmentCount },
  });

  emitToQuotation(quotationId, 'fulfillment_updated', split.toObject());
  return split;
}

module.exports = { suggestSplit, override, computeGreedyAllocation, buildAvailabilityMap };
