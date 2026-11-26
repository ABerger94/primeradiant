// Gemini over plain REST (free tier). JSON mode with a response schema; property order in the
// schema is the order the model must reason in — that is how base-rate-first is enforced.
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createGemini({ apiKey, model, minIntervalMs = 7000, fetchImpl = fetch, log = () => {} }) {
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
  let last = 0;
  let calls = 0;

  async function json({ system, prompt, schema, temperature = 0.3 }) {
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature, responseMimeType: 'application/json', responseSchema: schema },
    };
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const wait = last + minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();
      calls += 1;
      const res = await fetchImpl(`${BASE}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
      });
      if (res.status === 429 || res.status >= 500) {
        const backoff = 15000 * 2 ** attempt;
        log(`gemini ${res.status}; retrying in ${backoff / 1000}s`);
        await sleep(backoff);
        continue;
      }
      if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 400)}`);
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
      try {
        return JSON.parse(text);
      } catch {
        log('gemini returned non-JSON; retrying');
      }
    }
    throw new Error('gemini: retries exhausted');
  }

  return { model, json, get calls() { return calls; } };
}

// Schema helpers (Gemini's OpenAPI subset).
export const S = {
  str: (description, extra = {}) => ({ type: 'STRING', description, ...extra }),
  num: (description) => ({ type: 'NUMBER', description }),
  int: (description) => ({ type: 'INTEGER', description }),
  bool: (description) => ({ type: 'BOOLEAN', description }),
  enum: (values, description) => ({ type: 'STRING', enum: values, description }),
  arr: (items, description) => ({ type: 'ARRAY', items, description }),
  obj: (properties, description) => ({
    type: 'OBJECT',
    description,
    properties,
    required: Object.keys(properties),
    propertyOrdering: Object.keys(properties),
  }),
};
