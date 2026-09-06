/**
 * dashboard/index.js — Deal Health & Anomaly Dashboard queries
 * (Rules.md §7, §8, §9). Implements the stalled-deal query, surfaces
 * recent discount anomalies, and the delivery-promise-slippage check.
 */

const { Quotation, DiscountAnomaly } = require('../../models');

const STALL_THRESHOLD_DAYS = Number(process.env.STALL_THRESHOLD_DAYS || 5);
const SLIPPAGE_BUFFER_DAYS = Number(process.env.SLIPPAGE_BUFFER_DAYS || 2);

/**
 * A quotation is stalled if `now - lastActivityAt > STALL_THRESHOLD_DAYS`
 * while status is not Confirmed or Rejected (Rules.md §8).
 */
async function getStalledDeals(thresholdDays = STALL_THRESHOLD_DAYS) {
  const cutoff = new Date(Date.now() - thresholdDays * 86400000);
  return Quotation.find({
    status: { $nin: ['Confirmed', 'Rejected'] },
    lastActivityAt: { $lt: cutoff },
  })
    .sort({ lastActivityAt: 1 })
    .populate('customerId', 'name tier')
    .lean();
}

async function getRecentAnomalies(limit = 50) {
  return DiscountAnomaly.find().sort({ createdAt: -1 }).limit(limit).lean();
}

/** Rules.md §9: quotations whose ship date has drifted beyond the buffer. */
async function getSlippageIndicators(bufferDays = SLIPPAGE_BUFFER_DAYS) {
  const candidates = await Quotation.find({
    promisedShipDate: { $ne: null },
    currentProjectedShipDate: { $ne: null },
  }).lean();

  return candidates
    .map((q) => {
      const deltaDays = Math.round(
        (new Date(q.currentProjectedShipDate) - new Date(q.promisedShipDate)) / 86400000
      );
      return {
        quotationId: q._id,
        promisedShipDate: q.promisedShipDate,
        currentProjectedShipDate: q.currentProjectedShipDate,
        deltaDays,
      };
    })
    .filter((r) => r.deltaDays > bufferDays);
}

async function getDealHealth() {
  const [stalledDeals, anomalies, slippage] = await Promise.all([
    getStalledDeals(),
    getRecentAnomalies(),
    getSlippageIndicators(),
  ]);
  return {
    stalledDeals,
    stalledCount: stalledDeals.length,
    anomalies,
    anomalyCount: anomalies.length,
    slippage,
    slippageCount: slippage.length,
  };
}

async function getSummary() {
  const quotations = await Quotation.find().select('status lines updatedAt').lean();
  const statusCounts = {};
  let totalValue = 0;
  for (const quotation of quotations) {
    statusCounts[quotation.status] = (statusCounts[quotation.status] || 0) + 1;
    totalValue += (quotation.lines || []).reduce(
      (sum, line) => sum + line.qty * line.unitPrice * (1 - line.discountPct / 100),
      0
    );
  }
  return {
    quotationCount: quotations.length,
    totalValue: Math.round(totalValue * 100) / 100,
    statusCounts,
  };
}

module.exports = {
  getDealHealth,
  getSummary,
  getStalledDeals,
  getRecentAnomalies,
  getSlippageIndicators,
  STALL_THRESHOLD_DAYS,
  SLIPPAGE_BUFFER_DAYS,
};
