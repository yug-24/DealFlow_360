/**
 * llm/client.js — single call point for the hosted LLM API
 * (Architecture.md §2: "called only by the Explanation/Resolution service
 * — never in the request path of the deterministic scorer"). Uses the
 * Anthropic Messages API when ANTHROPIC_API_KEY is set; otherwise callers
 * fall back to a deterministic template so the demo never hard-depends on
 * network/LLM availability.
 */

async function callLLM(systemPrompt, userPrompt, { maxTokens = 500 } = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null; // signal "no LLM available" -> caller uses fallback

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      console.warn('[llm] call failed:', response.status, await response.text());
      return null;
    }

    const data = await response.json();
    const text = (data.content || [])
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('\n')
      .trim();
    return text || null;
  } catch (err) {
    console.warn('[llm] call errored:', err.message);
    return null;
  }
}

module.exports = { callLLM };
