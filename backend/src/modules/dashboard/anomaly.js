/**
 * dashboard/anomaly.js — Rep discount anomaly detection (Rules.md §7).
 * Maintains a rolling (mean, stddev) per (rep, category) via Welford's
 * online algorithm so we never recompute over full history on every line.
 */

const { RepDiscountBaseline, DiscountAnomaly } = require('../../models');

const ANOMALY_Z_THRESHOLD = Number(process.env.ANOMALY_Z_THRESHOLD || 2.0);

/**
 * Checks the new discount against the rep's baseline BEFORE folding it in
 * (comparing to a baseline that already includes the point under test
 * would blunt the z-score), then updates the baseline.
 */
async function checkAndRecordAnomaly({ repId, category, discountPct, quotationId, lineId }) {
  let baseline = await RepDiscountBaseline.findOne({ repId, category });
  if (!baseline) {
    baseline = await RepDiscountBaseline.create({ repId, category, count: 0, mean: 0, m2: 0 });
  }

  let isAnomaly = false;
  let zScore = 0;
  const stddevBefore = baseline.stddev; // virtual getter

  if (baseline.count >= 2 && stddevBefore > 0) {
    zScore = (discountPct - baseline.mean) / stddevBefore;
    isAnomaly = zScore > ANOMALY_Z_THRESHOLD;
  }

  if (isAnomaly) {
    await DiscountAnomaly.create({
      quotationId,
      lineId,
      repId,
      category,
      discountPct,
      repMeanAtTime: baseline.mean,
      repStddevAtTime: stddevBefore,
      zScore,
    });
  }

  // Welford's online update.
  const newCount = baseline.count + 1;
  const delta = discountPct - baseline.mean;
  const newMean = baseline.mean + delta / newCount;
  const delta2 = discountPct - newMean;
  baseline.count = newCount;
  baseline.mean = newMean;
  baseline.m2 = baseline.m2 + delta * delta2;
  await baseline.save();

  return { isAnomaly, zScore };
}

module.exports = { checkAndRecordAnomaly, ANOMALY_Z_THRESHOLD };
