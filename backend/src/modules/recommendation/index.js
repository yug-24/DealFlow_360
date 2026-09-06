/**
 * recommendation/index.js — Upsell/Cross-Sell Ranking Engine
 * (PRD.md §7 Should-Have #9). Cut Priority item #3 if time-short: reduce
 * to a static suggestion list — this heuristic already IS that reduced
 * form (no ML, just margin-delta ranking), so there's no further fallback
 * needed.
 *
 * Heuristic: any Active product not already on the quote, ranked by
 * margin delta (price - cost) descending — the (imagined) highest-margin
 * add-on the rep should be nudged to attach.
 */

const { Quotation, Product } = require('../../models');

async function suggestUpsells(quotationId, limit = 3) {
  const quotation = await Quotation.findById(quotationId).lean();
  if (!quotation) throw new Error('Quotation not found.');

  const existingProductIds = new Set(quotation.lines.map((l) => String(l.productId)));

  const candidates = await Product.find({
    _id: { $nin: [...existingProductIds] },
    status: 'Active',
  }).lean();

  return candidates
    .map((p) => ({
      productId: p._id,
      name: p.name,
      category: p.category,
      price: p.price,
      marginDelta: Math.round((p.price - p.cost) * 100) / 100,
    }))
    .sort((a, b) => b.marginDelta - a.marginDelta)
    .slice(0, limit);
}

module.exports = { suggestUpsells };
