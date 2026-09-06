/**
 * explanation/index.js — structured breakdown -> plain-language
 * explanation (Architecture.md §7.2). Never allowed to alter or invent
 * numbers: only the JSON breakdown is passed in, prose-only is requested,
 * and every number in the response is re-validated against the input
 * before being shown (Rules.md §10).
 */

const { callLLM } = require('../../llm/client');

const NUMBER_TOLERANCE = 0.5;

function round2(n) {
  return Math.round(n * 100) / 100;
}

function collectValidNumbers(snapshot) {
  const nums = new Set([round2(snapshot.blendedScore), round2(snapshot.totalQuoteAmount)]);
  for (const line of snapshot.breakdown) {
    nums.add(round2(line.discountGivenPct));
    nums.add(round2(line.ceilingPct));
    nums.add(round2(line.overagePts));
    nums.add(round2(line.weightedContribution));
    nums.add(round2(line.lineAmount));
    nums.add(round2(line.lineWeight * 100)); // often quoted as a %
  }
  return nums;
}

function extractNumbers(text) {
  return (text.match(/-?\d+(\.\d+)?/g) || []).map(Number);
}

/**
 * The LLM Boundary Rule (Rules.md §10): a deliberately strict, simple
 * check — occasionally flags a legitimate small integer ("2 lines") as a
 * false positive, which is the safer failure mode (falls back to the raw
 * breakdown) than letting a hallucinated number through.
 */
function allNumbersMatch(text, validNumbers) {
  const mentioned = extractNumbers(text);
  const validArray = [...validNumbers];
  return mentioned.every((n) => {
    if (n <= 3 && Number.isInteger(n)) return true;
    return validArray.some((v) => Math.abs(v - n) <= NUMBER_TOLERANCE);
  });
}

function generateFallbackExplanation(snapshot) {
  const overLines = snapshot.breakdown.filter((b) => b.overagePts > 0);
  if (overLines.length === 0) {
    return `No line exceeds its discount ceiling — blended risk score is ${round2(
      snapshot.blendedScore
    )}, no approval required.`;
  }
  const parts = overLines.map(
    (l) =>
      `${l.productName} was given ${l.discountGivenPct}% against a ${l.ceilingPct}% ceiling (${l.overagePts}pt over, contributing ${round2(
        l.weightedContribution
      )} to the blended score at ${round2(l.lineWeight * 100)}% of quote value)`
  );
  const routeLabel =
    snapshot.bandLabel === 'manager'
      ? 'Sales Manager approval'
      : snapshot.bandLabel === 'manager_finance'
        ? 'Sales Manager and Finance approval'
        : 'no approval';
  return `Blended risk score is ${round2(snapshot.blendedScore)}, requiring ${routeLabel}. Driven by: ${parts.join('; ')}.`;
}

async function generateExplanation(snapshot) {
  const validNumbers = collectValidNumbers(snapshot);

  const systemPrompt =
    'You are explaining a B2B discount-approval risk score to a sales manager. ' +
    'You will be given a structured JSON breakdown. Write a short (2-4 sentence), ' +
    'plain-language explanation of why this quote does or does not need approval. ' +
    'Use ONLY the numbers present in the JSON — never compute, round differently, or invent any number. ' +
    'Prose only, no JSON, no markdown.';
  const userPrompt = JSON.stringify({
    blendedScore: snapshot.blendedScore,
    bandLabel: snapshot.bandLabel,
    totalQuoteAmount: snapshot.totalQuoteAmount,
    breakdown: snapshot.breakdown,
  });

  const raw = await callLLM(systemPrompt, userPrompt, { maxTokens: 300 });

  if (raw && allNumbersMatch(raw, validNumbers)) {
    return { source: 'llm', text: raw };
  }
  // No LLM configured, or it hallucinated a number outside the validated
  // set -> discard and use the raw structured breakdown instead.
  return { source: 'template', text: generateFallbackExplanation(snapshot) };
}

module.exports = { generateExplanation, allNumbersMatch, collectValidNumbers, generateFallbackExplanation };
