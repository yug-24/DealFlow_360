/**
 * scoring/index.js — orchestration layer around the pure formula in
 * formula.js. This is the only place that touches the database on behalf
 * of the scoring engine: it loads inputs, calls the pure function, then
 * persists an immutable, versioned ScoreSnapshot (Architecture.md §1, §7).
 *
 * Wrapped in a Mongo multi-document transaction because reading the
 * quotation, computing the score, and inserting the new snapshot must be
 * consistent -- a partial write here would let the UI show a stale score.
 */

const mongoose = require('mongoose');
const { computeBreakdown } = require('./formula');
const { determineBand, DEFAULT_BANDS } = require('./band');
const { Quotation, Customer, DiscountCeiling, ApprovalChainConfig, ScoreSnapshot } = require('../../models');

async function getCeilingsMap(tier) {
  const rows = await DiscountCeiling.find({ tier }).lean();
  return rows.reduce((map, row) => {
    map[row.category] = row.maxDiscountPct;
    return map;
  }, {});
}

async function getBandConfigs() {
  const rows = await ApprovalChainConfig.find({}).lean();
  return rows.length ? rows : DEFAULT_BANDS;
}

/**
 * Recompute the blended score for a quotation and persist a new,
 * append-only ScoreSnapshot version. Never mutates a previous snapshot.
 *
 * @param {string} quotationId
 * @param {Object} opts
 * @param {'rep_edit'|'portal_counter'|'initial_create'} opts.triggeredBy
 */
async function recompute(quotationId, { triggeredBy = 'rep_edit' } = {}) {
  const session = await mongoose.startSession();
  try {
    let snapshot;
    await session.withTransaction(async () => {
      const quotation = await Quotation.findById(quotationId).session(session);
      if (!quotation) {
        throw new Error(`Quotation ${quotationId} not found.`);
      }

      const customer = await Customer.findById(quotation.customerId).session(session);
      if (!customer) {
        throw new Error(`Customer ${quotation.customerId} not found for quotation ${quotationId}.`);
      }

      const [ceilingsMap, bandConfigs] = await Promise.all([
        getCeilingsMap(customer.tier),
        getBandConfigs(),
      ]);

      const lines = quotation.lines.map((line) => ({
        lineId: line._id,
        productName: line.productName,
        category: line.category,
        qty: line.qty,
        unitPrice: line.unitPrice,
        discountPct: line.discountPct,
      }));

      const { blendedScore, totalQuoteAmount, breakdown } = computeBreakdown({ lines, ceilingsMap });
      const band = determineBand(blendedScore, bandConfigs);

      const lastSnapshot = await ScoreSnapshot.findOne({ quotationId })
        .sort('-version')
        .session(session)
        .lean();
      const nextVersion = lastSnapshot ? lastSnapshot.version + 1 : 1;

      const created = await ScoreSnapshot.create(
        [
          {
            quotationId,
            version: nextVersion,
            blendedScore,
            bandLabel: band.bandLabel,
            breakdown,
            totalQuoteAmount,
            triggeredBy,
          },
        ],
        { session }
      );
      snapshot = created[0];
    });

    return snapshot;
  } finally {
    session.endSession();
  }
}

module.exports = { recompute, getCeilingsMap, getBandConfigs };
