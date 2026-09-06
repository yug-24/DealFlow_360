/**
 * scoring/band.js — maps a blended score to an approval band
 * (Rules.md §3). Bands are configurable per company via ApprovalChainConfig
 * (Admin A3) — these hackathon defaults are only a fallback for when no
 * config rows exist yet (e.g. running the pure formula in isolation/tests).
 */

const DEFAULT_BANDS = [
  { bandLabel: 'none', minScore: 0, maxScore: 0, requiredSteps: [] },
  { bandLabel: 'manager', minScore: 1, maxScore: 15, requiredSteps: ['SalesManager'] },
  { bandLabel: 'manager_finance', minScore: 16, maxScore: null, requiredSteps: ['SalesManager', 'Finance'] },
];

/**
 * @param {number} score
 * @param {Array<{bandLabel:string, minScore:number, maxScore:number|null, requiredSteps:string[]}>} [configs]
 */
function determineBand(score, configs = DEFAULT_BANDS) {
  const bands = configs.length ? configs : DEFAULT_BANDS;
  const sorted = [...bands].sort((a, b) => a.minScore - b.minScore);

  const match = sorted.find(
    (band) => score >= band.minScore && (band.maxScore === null || score <= band.maxScore)
  );

  // If score exceeds every configured band's max, fall back to the highest band.
  return match || sorted[sorted.length - 1];
}

module.exports = { determineBand, DEFAULT_BANDS };
