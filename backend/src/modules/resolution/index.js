/**
 * resolution/index.js — Deal Resolution Agent (Architecture.md §7.3).
 * Proposes 1-3 alternative line configurations for a flagged quote. Every
 * candidate — deterministic or LLM-suggested — is fed back through the
 * REAL deterministic scorer before being returned, per the LLM Boundary
 * Rule (Rules.md §10): no candidate is ever shown with a number that
 * didn't come out of `computeBreakdown`/`determineBand`.
 */

const { Quotation, Customer } = require('../../models');
const { computeBreakdown } = require('../scoring/formula');
const { determineBand } = require('../scoring/band');
const { getCeilingsMap, getBandConfigs } = require('../scoring');
const { callLLM } = require('../../llm/client');

async function rescore(lines, ceilingsMap, bandConfigs) {
  const { blendedScore, totalQuoteAmount, breakdown } = computeBreakdown({ lines, ceilingsMap });
  const band = determineBand(blendedScore, bandConfigs);
  return { blendedScore, totalQuoteAmount, breakdown, bandLabel: band.bandLabel, requiredSteps: band.requiredSteps };
}

function cloneWithDiscounts(lines, changeMap) {
  return lines.map((l) => ({
    lineId: l._id ?? l.lineId,
    productName: l.productName,
    category: l.category,
    qty: l.qty,
    unitPrice: l.unitPrice,
    discountPct: changeMap.has(String(l._id ?? l.lineId)) ? changeMap.get(String(l._id ?? l.lineId)) : l.discountPct,
  }));
}

async function buildDeterministicCandidates(lines, ceilingsMap, bandConfigs) {
  const overLines = lines.filter((l) => Math.max(0, l.discountPct - (ceilingsMap[l.category] ?? 0)) > 0);
  if (overLines.length === 0) return [];

  const candidates = [];

  const capAll = new Map(overLines.map((l) => [String(l._id), ceilingsMap[l.category] ?? 0]));
  candidates.push({
    label: 'Cap all over-ceiling lines at their ceiling',
    lineChanges: [...capAll.entries()].map(([lineId, discountPct]) => ({ lineId, discountPct })),
    scored: await rescore(cloneWithDiscounts(lines, capAll), ceilingsMap, bandConfigs),
  });

  const worst = overLines
    .map((l) => ({ l, overage: l.discountPct - (ceilingsMap[l.category] ?? 0) }))
    .sort((a, b) => b.overage - a.overage)[0];
  const capWorst = new Map([[String(worst.l._id), ceilingsMap[worst.l.category] ?? 0]]);
  candidates.push({
    label: `Cap only "${worst.l.productName}" at its ceiling`,
    lineChanges: [{ lineId: String(worst.l._id), discountPct: ceilingsMap[worst.l.category] ?? 0 }],
    scored: await rescore(cloneWithDiscounts(lines, capWorst), ceilingsMap, bandConfigs),
  });

  const halveOverage = new Map(
    overLines.map((l) => {
      const ceiling = ceilingsMap[l.category] ?? 0;
      const overage = l.discountPct - ceiling;
      return [String(l._id), Math.round((ceiling + overage / 2) * 100) / 100];
    })
  );
  candidates.push({
    label: 'Halve the overage on every affected line',
    lineChanges: [...halveOverage.entries()].map(([lineId, discountPct]) => ({ lineId, discountPct })),
    scored: await rescore(cloneWithDiscounts(lines, halveOverage), ceilingsMap, bandConfigs),
  });

  return candidates;
}

/**
 * The LLM's own stated numbers are NEVER trusted — its output is only used
 * as a discount-change proposal, which is then re-run through the real
 * scorer just like the deterministic candidates above. Unparsable or
 * inapplicable output is silently skipped, never surfaced.
 */
async function buildLlmCandidate(lines, ceilingsMap, bandConfigs) {
  const systemPrompt =
    'You suggest ONE alternative discount configuration for a B2B quote to reduce its approval-risk ' +
    'score. Respond with ONLY a JSON array like [{"lineId": "...", "discountPct": 12}] — no prose, ' +
    'no markdown, no explanation. Only include lines whose discount you want to change.';
  const userPrompt = JSON.stringify(
    lines.map((l) => ({
      lineId: String(l._id),
      productName: l.productName,
      category: l.category,
      currentDiscountPct: l.discountPct,
      ceilingPct: ceilingsMap[l.category] ?? 0,
    }))
  );

  const raw = await callLLM(systemPrompt, userPrompt, { maxTokens: 200 });
  if (!raw) return null;

  let parsed;
  try {
    parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
  } catch {
    return null;
  }

  const changeMap = new Map();
  for (const c of parsed) {
    if (c && c.lineId && typeof c.discountPct === 'number' && c.discountPct >= 0) {
      changeMap.set(String(c.lineId), c.discountPct);
    }
  }
  if (changeMap.size === 0) return null;

  return {
    label: 'AI-suggested alternative (re-validated)',
    lineChanges: [...changeMap.entries()].map(([lineId, discountPct]) => ({ lineId, discountPct })),
    scored: await rescore(cloneWithDiscounts(lines, changeMap), ceilingsMap, bandConfigs),
  };
}

async function proposeResolutions(quotationId) {
  const quotation = await Quotation.findById(quotationId);
  if (!quotation) throw new Error('Quotation not found.');

  const customer = await Customer.findById(quotation.customerId);
  const [ceilingsMap, bandConfigs] = await Promise.all([getCeilingsMap(customer.tier), getBandConfigs()]);

  const deterministic = await buildDeterministicCandidates(quotation.lines, ceilingsMap, bandConfigs);
  const llmCandidate = await buildLlmCandidate(quotation.lines, ceilingsMap, bandConfigs).catch(() => null);

  const all = llmCandidate ? [...deterministic, llmCandidate] : deterministic;
  return all.slice(0, 3); // design.md B9: 1-3 proposed configurations
}

module.exports = { proposeResolutions, buildDeterministicCandidates, buildLlmCandidate };
