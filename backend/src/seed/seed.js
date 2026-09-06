require('dotenv').config();
const bcrypt = require('bcryptjs');
const { connectDB, mongoose } = require('../config/db');
const {
  User,
  Customer,
  Product,
  PriceList,
  DiscountCeiling,
  ApprovalChainConfig,
  Quotation,
  ScoreSnapshot,
  ApprovalStep,
  AuditLog,
  Warehouse,
  StockLevel,
  FulfillmentSplit,
  SubscriptionPlan,
  BillingSchedule,
  Invoice,
  RepDiscountBaseline,
  DiscountAnomaly,
} = require('../models');

const scoring = require('../modules/scoring');
const approval = require('../modules/approval');
const fulfillment = require('../modules/fulfillment');
const { checkAndRecordAnomaly } = require('../modules/dashboard/anomaly');

// Phase 0/1: master/config data so the scoring engine unit test has
// something to run against. Phase 2-7 demo scenarios appended below now
// that those engines are implemented.

async function seed() {
  await connectDB();
  console.log('[seed] connected, clearing collections...');

  await Promise.all([
    User.deleteMany({}),
    Customer.deleteMany({}),
    Product.deleteMany({}),
    PriceList.deleteMany({}),
    DiscountCeiling.deleteMany({}),
    ApprovalChainConfig.deleteMany({}),
    Quotation.deleteMany({}),
    ApprovalStep.deleteMany({}),
    Warehouse.deleteMany({}),
    StockLevel.deleteMany({}),
    FulfillmentSplit.deleteMany({}),
    SubscriptionPlan.deleteMany({}),
    BillingSchedule.deleteMany({}),
    Invoice.deleteMany({}),
    RepDiscountBaseline.deleteMany({}),
    DiscountAnomaly.deleteMany({}),
    // ScoreSnapshot and AuditLog block deleteMany at the schema level
    // (they're append-only/immutable — Rules.md §11 / Architecture.md §1).
    // For a full reseed we still need to clear them, so we go around the
    // ODM hooks via the raw driver collection instead of the Mongoose model.
    mongoose.connection.collection('scoresnapshots').deleteMany({}),
    mongoose.connection.collection('auditlogs').deleteMany({}),
  ]);

  // --- Users (internal) ---
  const passwordHash = await bcrypt.hash('password123', 10);
  const [rep, manager, finance, admin] = await User.create([
    { name: 'J. Rao', email: 'rep@dealflow360.dev', passwordHash, role: 'SalesRep' },
    { name: 'M. Shah', email: 'manager@dealflow360.dev', passwordHash, role: 'SalesManager' },
    { name: 'R. Iyer', email: 'finance@dealflow360.dev', passwordHash, role: 'Finance' },
    { name: 'Admin', email: 'admin@dealflow360.dev', passwordHash, role: 'Admin' },
  ]);

  // --- Customer (matches PRD.md §10 demo scenario: Gold customer) ---
  const customerPasswordHash = await bcrypt.hash('password123', 10);
  const [acme, globex, northwind] = await Customer.create([
    { name: 'Acme Corp', email: 'portal@acmecorp.dev', passwordHash: customerPasswordHash, tier: 'Gold', company: 'Acme Corp' },
    { name: 'Globex Industries', email: 'portal@globex.dev', passwordHash: customerPasswordHash, tier: 'Silver', company: 'Globex Industries' },
    { name: 'Northwind Traders', email: 'portal@northwind.dev', passwordHash: customerPasswordHash, tier: 'Bronze', company: 'Northwind Traders' },
  ]);

  // --- Discount ceilings (Rules.md §1 worked example) ---
  await DiscountCeiling.create([
    { tier: 'Gold', category: 'Hardware', maxDiscountPct: 15 },
    { tier: 'Gold', category: 'Service', maxDiscountPct: 10 },
    { tier: 'Gold', category: 'Subscription', maxDiscountPct: 10 },
    { tier: 'Silver', category: 'Hardware', maxDiscountPct: 10 },
    { tier: 'Silver', category: 'Service', maxDiscountPct: 7 },
    { tier: 'Silver', category: 'Subscription', maxDiscountPct: 7 },
    { tier: 'Bronze', category: 'Hardware', maxDiscountPct: 5 },
    { tier: 'Bronze', category: 'Service', maxDiscountPct: 5 },
    { tier: 'Bronze', category: 'Subscription', maxDiscountPct: 5 },
  ]);

  // --- Approval chain config (Rules.md §3 bands) ---
  await ApprovalChainConfig.create([
    { bandLabel: 'none', minScore: 0, maxScore: 0, requiredSteps: [] },
    { bandLabel: 'manager', minScore: 1, maxScore: 15, requiredSteps: ['SalesManager'] },
    { bandLabel: 'manager_finance', minScore: 16, maxScore: null, requiredSteps: ['SalesManager', 'Finance'] },
  ]);

  // --- Price lists ---
  await PriceList.create([
    { tier: 'Bronze', currency: 'USD', rule: 'none', ruleValuePct: 0 },
    { tier: 'Silver', currency: 'USD', rule: 'none', ruleValuePct: 0 },
    { tier: 'Gold', currency: 'USD', rule: 'percent_off_base', ruleValuePct: 10 },
  ]);

  // --- Products (matches wireframe Screen 4 example, + Phase 3/4 demo items) ---
  const [laptop, setup, warranty, routerX, cloudSupport] = await Product.create([
    { name: 'Laptop Pro 14', category: 'Hardware', type: 'Hardware', price: 1200, cost: 900, unit: 'Each', taxPct: 8 },
    { name: 'Onsite Setup Service', category: 'Service', type: 'Service', price: 450, cost: 150, unit: 'Each', taxPct: 0 },
    { name: 'Extended Warranty', category: 'Service', type: 'Service', price: 180, cost: 40, unit: 'Each', taxPct: 0 },
    { name: 'Router X', category: 'Hardware', type: 'Hardware', price: 300, cost: 150, unit: 'Each', taxPct: 8 },
    {
      name: 'Cloud Support Plan',
      category: 'Subscription',
      type: 'Subscription',
      price: 100,
      cost: 20,
      unit: 'Each',
      isRecurring: true,
      recurringCycle: 'monthly',
    },
  ]);

  // --- Warehouses + stock (matches wireframe Screen 7 example, + a third
  // depot so Phase 3's multi-warehouse split has something to demonstrate) ---
  const [main, eastDepot, southDepot] = await Warehouse.create([
    { name: 'Main Warehouse', shippingWeight: 1 },
    { name: 'East Depot', shippingWeight: 1.4 },
    { name: 'South Satellite Depot', shippingWeight: 2 },
  ]);

  await StockLevel.create([
    { warehouseId: main._id, productId: laptop._id, qtyAvailable: 40, qtyReserved: 0 },
    { warehouseId: eastDepot._id, productId: laptop._id, qtyAvailable: 10, qtyReserved: 0 },
    { warehouseId: main._id, productId: routerX._id, qtyAvailable: 6, qtyReserved: 0 },
    { warehouseId: eastDepot._id, productId: routerX._id, qtyAvailable: 10, qtyReserved: 0 },
    { warehouseId: southDepot._id, productId: routerX._id, qtyAvailable: 2, qtyReserved: 0 },
  ]);

  console.log('[seed] master data done. Seeding Phase 2-7 demo scenarios...');

  // ===================================================================
  // Scenario A — the spec's worked example (Phase 1/2 checkpoint):
  // Laptop 12%/15% (no overage) + Setup Service 18%/10% (8pt overage,
  // ~30% of quote value) -> blended_score = 24 -> Manager then Finance.
  // ===================================================================
  const quoteA = await Quotation.create({
    customerId: acme._id,
    assignedRepId: rep._id,
    status: 'Draft',
    lines: [
      { productId: laptop._id, productName: laptop.name, category: 'Hardware', lineType: 'one_time', qty: 1, unitPrice: 1050, discountPct: 12 },
      { productId: setup._id, productName: setup.name, category: 'Service', lineType: 'one_time', qty: 1, unitPrice: 450, discountPct: 18 },
    ],
  });
  const snapA = await scoring.recompute(quoteA._id, { triggeredBy: 'initial_create' });
  await approval.routeForApproval(quoteA._id, snapA);
  console.log(`[seed] Scenario A (worked example) -> blended_score=${snapA.blendedScore} band=${snapA.bandLabel} (expect 24, manager_finance)`);

  // ===================================================================
  // Scenario B — Phase 3 fulfillment split: 12x Router X, no single
  // warehouse has enough stock (Main=6, East=10, South=2) -> greedy
  // allocator should split East(10) + Main(2), 2 shipments.
  // ===================================================================
  const quoteB = await Quotation.create({
    customerId: acme._id,
    assignedRepId: rep._id,
    status: 'Draft',
    lines: [
      { productId: routerX._id, productName: routerX.name, category: 'Hardware', lineType: 'one_time', qty: 12, unitPrice: routerX.price, discountPct: 5 },
    ],
  });
  const snapB = await scoring.recompute(quoteB._id, { triggeredBy: 'initial_create' });
  await approval.routeForApproval(quoteB._id, snapB); // score 0 -> auto-approved, no overage
  const splitB = await fulfillment.suggestSplit(quoteB._id);
  console.log(`[seed] Scenario B (fulfillment split) -> ${splitB.shipmentCount} shipments, ${splitB.allocations.filter((a) => a.isBackorder).length} backorder rows`);

  // ===================================================================
  // Scenario C — Phase 4 hybrid billing: one hardware (one-time) line +
  // one Cloud Support Plan (recurring, monthly) line on the same order,
  // approved and ready to confirm via the portal to generate billing.
  // ===================================================================
  const quoteC = await Quotation.create({
    customerId: acme._id,
    assignedRepId: rep._id,
    status: 'Draft',
    lines: [
      { productId: laptop._id, productName: laptop.name, category: 'Hardware', lineType: 'one_time', qty: 1, unitPrice: laptop.price, discountPct: 10 },
      { productId: cloudSupport._id, productName: cloudSupport.name, category: 'Subscription', lineType: 'recurring', qty: 3, unitPrice: cloudSupport.price, discountPct: 5 },
    ],
  });
  const snapC = await scoring.recompute(quoteC._id, { triggeredBy: 'initial_create' });
  await approval.routeForApproval(quoteC._id, snapC);
  console.log(`[seed] Scenario C (hybrid billing) quotationId=${quoteC._id} status=Approved — confirm via portal to generate invoices/schedule`);

  // ===================================================================
  // Scenario D — Phase 6 stalled deal: PendingApproval with lastActivityAt
  // backdated 10 days (> the default 5-day STALL_THRESHOLD_DAYS).
  // ===================================================================
  const quoteD = await Quotation.create({
    customerId: acme._id,
    assignedRepId: rep._id,
    status: 'Draft',
    lines: [
      { productId: setup._id, productName: setup.name, category: 'Service', lineType: 'one_time', qty: 1, unitPrice: setup.price, discountPct: 16 },
    ],
  });
  const snapD = await scoring.recompute(quoteD._id, { triggeredBy: 'initial_create' });
  await approval.routeForApproval(quoteD._id, snapD); // over ceiling -> PendingApproval
  await Quotation.findByIdAndUpdate(quoteD._id, { lastActivityAt: new Date(Date.now() - 10 * 86400000) });
  console.log('[seed] Scenario D (stalled deal) — lastActivityAt backdated 10 days');

  // ===================================================================
  // Scenario E — Phase 6 discount anomaly: rep has a tight discounting
  // history on Hardware (mean 5%, low stddev), then gives 14% — within
  // the 15% Gold/Hardware ceiling (no approval routing triggered) but a
  // clear z-score anomaly, independent of the ceiling check (Rules.md §7).
  // ===================================================================
  await RepDiscountBaseline.create({ repId: rep._id, category: 'Hardware', count: 8, mean: 5, m2: 8 * Math.pow(1.2, 2) });
  const quoteE = await Quotation.create({
    customerId: acme._id,
    assignedRepId: rep._id,
    status: 'Draft',
    lines: [
      { productId: laptop._id, productName: laptop.name, category: 'Hardware', lineType: 'one_time', qty: 2, unitPrice: laptop.price, discountPct: 14 },
    ],
  });
  const anomalyResult = await checkAndRecordAnomaly({
    repId: rep._id,
    category: 'Hardware',
    discountPct: 14,
    quotationId: quoteE._id,
    lineId: quoteE.lines[0]._id,
  });
  const snapE = await scoring.recompute(quoteE._id, { triggeredBy: 'initial_create' });
  await approval.routeForApproval(quoteE._id, snapE);
  console.log(`[seed] Scenario E (discount anomaly) -> isAnomaly=${anomalyResult.isAnomaly} zScore=${anomalyResult.zScore.toFixed(2)} (expect true, z > 2.0)`);

  // Scenario F/G — additional accounts for dashboard and customer filtering.
  const quoteF = await Quotation.create({
    customerId: globex._id,
    assignedRepId: rep._id,
    status: 'Draft',
    lines: [{ productId: warranty._id, productName: warranty.name, category: 'Service', lineType: 'one_time', qty: 4, unitPrice: warranty.price, discountPct: 4 }],
  });
  const snapF = await scoring.recompute(quoteF._id, { triggeredBy: 'initial_create' });
  await approval.routeForApproval(quoteF._id, snapF);

  const quoteG = await Quotation.create({
    customerId: northwind._id,
    assignedRepId: rep._id,
    status: 'Draft',
    lines: [{ productId: cloudSupport._id, productName: cloudSupport.name, category: 'Subscription', lineType: 'recurring', qty: 8, unitPrice: cloudSupport.price, discountPct: 14 }],
  });
  const snapG = await scoring.recompute(quoteG._id, { triggeredBy: 'initial_create' });
  await approval.routeForApproval(quoteG._id, snapG);
  console.log(`[seed] Scenarios F/G (additional customers) -> ${globex.email}, ${northwind.email}`);

  console.log('\n[seed] done.');
  console.log(`[seed] seeded internal users: ${[rep.email, manager.email, finance.email, admin.email].join(', ')}`);
  console.log(`[seed] seeded portal customer: ${acme.email}`);
  console.log(`\n[seed] Scenario A (score) quotationId: ${quoteA._id}`);
  console.log(`[seed] Scenario B (fulfillment) quotationId: ${quoteB._id}`);
  console.log(`[seed] Scenario C (billing) quotationId: ${quoteC._id}`);
  console.log(`[seed] Scenario D (stalled) quotationId: ${quoteD._id}`);
  console.log(`[seed] Scenario E (anomaly) quotationId: ${quoteE._id}`);

  await mongoose.connection.close();
  process.exit(0);
}

seed().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
