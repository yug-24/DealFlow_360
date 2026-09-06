/**
 * scoring/formula.js — the deterministic core described in Architecture.md §7.1.
 *
 * Pure function: no database access, no LLM calls, no side effects.
 * This is the ONLY source of truth for the blended risk score. Everything
 * else (approval routing, dashboards, the explanation/resolution LLM layer)
 * reads the output of this function — never recomputes it independently.
 *
 * Rules.md §2:
 *   line_overage_i = max(0, discount_i - ceiling_i)
 *   line_weight_i  = line_amount_i / total_quote_amount
 *   blended_score  = Σ (line_overage_i * line_weight_i) * SCALE_FACTOR
 *
 * Assumption (not fully pinned down by Rules.md): `line_amount_i` and
 * `total_quote_amount` are the GROSS list values (qty * unitPrice), not
 * post-discount net values. This keeps a line's "share of the deal" stable
 * regardless of the very discount being evaluated, and matches how the
 * spec's worked example computes "30% of quote value" as a fixed weight.
 */

const DEFAULT_SCALE_FACTOR = Number(process.env.SCORE_SCALE_FACTOR || 10);

/**
 * @param {Object} params
 * @param {Array<{productName: string, category: string, qty: number, unitPrice: number, discountPct: number}>} params.lines
 * @param {Record<string, number>} params.ceilingsMap - category -> maxDiscountPct, for the quote's customer tier
 * @param {number} [params.scaleFactor]
 * @returns {{ blendedScore: number, totalQuoteAmount: number, breakdown: Array<Object> }}
 */
function computeBreakdown({ lines, ceilingsMap, scaleFactor = DEFAULT_SCALE_FACTOR }) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return { blendedScore: 0, totalQuoteAmount: 0, breakdown: [] };
  }

  const lineAmounts = lines.map((line) => line.qty * line.unitPrice);
  const totalQuoteAmount = lineAmounts.reduce((sum, amt) => sum + amt, 0);

  if (totalQuoteAmount === 0) {
    return { blendedScore: 0, totalQuoteAmount: 0, breakdown: [] };
  }

  let blendedScore = 0;

  const breakdown = lines.map((line, i) => {
    const ceilingPct = ceilingsMap[line.category] ?? 0;
    const overagePts = Math.max(0, line.discountPct - ceilingPct);
    const lineAmount = lineAmounts[i];
    const lineWeight = lineAmount / totalQuoteAmount;
    const weightedContribution = overagePts * lineWeight * scaleFactor;

    blendedScore += weightedContribution;

    return {
      lineId: line.lineId ?? null,
      productName: line.productName,
      category: line.category,
      discountGivenPct: line.discountPct,
      ceilingPct,
      overagePts,
      lineAmount,
      lineWeight,
      weightedContribution,
    };
  });

  // Round to 2 decimal places to avoid floating-point noise in the stored
  // snapshot and in UI display — never rounds the individual overage/weight
  // inputs, only the final derived numbers, so the math stays reproducible.
  return {
    blendedScore: round2(blendedScore),
    totalQuoteAmount,
    breakdown: breakdown.map((b) => ({
      ...b,
      lineWeight: round4(b.lineWeight),
      weightedContribution: round2(b.weightedContribution),
    })),
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

module.exports = { computeBreakdown, DEFAULT_SCALE_FACTOR };
