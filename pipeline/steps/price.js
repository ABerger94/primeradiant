// Step 4 — Price the lanes.
//   Forecaster: Gemini, base-rate-first (schema order: reference class → base rate → differences → probability).
//               It never sees the market price.
//   Actuary:    code only — the drafted base rate, extrapolated to the window.
//   Market:     match to a Polymarket market asking the same question; the price itself is
//               snapshotted later, at the moment of lock.
import { actuaryProbability, windowDays } from '../../lib/actuary.js';
import { jaccard, tokens } from '../../lib/scope.js';
import { S } from '../gemini.js';
import { digestText } from './ingest.js';

export const FORECASTER_SYSTEM = `You are the Forecaster lane of Prime Radiant, a public record where every forecast is locked, timestamped and scored by Brier score against reality. Overconfidence is punished; so is timidity. You are scored on calibration: your 70% forecasts should come true about 70% of the time.

Discipline, in this exact order — a forecast that skips a step does not publish:
1. Reference class: state the class of comparable past situations.
2. Base rate: state its historical frequency and source. Start from it. (One is supplied; you may refine the reference class, but you must anchor on a base rate.)
3. What is different this time: specific, evidence-backed reasons the probability should be HIGHER than the base rate, and reasons it should be LOWER.
4. Only then: the probability (integer 1–99) that the question resolves YES under its written criteria, by its deadline.

Read the resolution criteria literally. Account for the time remaining. Cite the digest items or other public sources you relied on.`;

const forecastSchema = S.obj({
  reference_class: S.str('Step 1: the reference class'),
  base_rate_statement: S.str('Step 2: the base rate you anchor on, with its source'),
  differences_for: S.arr(S.str('A reason for a higher probability'), 'Step 3a'),
  differences_against: S.arr(S.str('A reason for a lower probability'), 'Step 3b'),
  probability: S.int('Step 4: integer 1–99, probability of YES'),
  reasoning_summary: S.str('2–4 sentences for publication: base rate, the adjustment, why'),
  sources: S.arr(S.obj({ title: S.str(''), url: S.str('') }), 'Sources relied on'),
});

/** Validates the base-rate-first discipline. Returns violations. */
export function forecastViolations(f) {
  const v = [];
  if (!f || typeof f !== 'object') return ['no forecast returned'];
  if (!f.reference_class || f.reference_class.trim().length < 10) v.push('skipped the reference class');
  if (!f.base_rate_statement || f.base_rate_statement.trim().length < 10) v.push('skipped the base rate');
  if (!Array.isArray(f.differences_for) || !Array.isArray(f.differences_against)) v.push('skipped what-is-different');
  else if (f.differences_for.length + f.differences_against.length === 0) v.push('no differences considered');
  if (!Number.isInteger(f.probability) || f.probability < 1 || f.probability > 99) v.push('probability must be an integer 1–99');
  if (!f.reasoning_summary || f.reasoning_summary.trim().length < 40) v.push('no reasoning summary');
  return v;
}

export async function forecastOne(ctx, c, digest) {
  const { llm, now } = ctx;
  const relevant = digest[c.category] || [];
  const br = c.base_rate;
  const prompt = `Today is ${now.toISOString().slice(0, 10)}.

QUESTION: ${c.question}
CATEGORY: ${c.category}
DEADLINE: ${c.deadline} (23:59:59 UTC) — ${Math.round(windowDays(now.toISOString(), c.deadline))} days from now
RESOLUTION CRITERIA: ${c.resolution_criteria}
RESOLUTION SOURCE: ${c.resolution_source_name} <${c.resolution_source_url}>

SUPPLIED BASE RATE
- Reference class: ${br.reference_class}
- ${br.kind === 'proportion' ? `Proportion YES: ${br.value}` : `Rate: ${br.value} qualifying events per year`}
- Evidence: ${br.evidence}
- Source: ${br.source} <${br.source_url}>

NEWS DIGEST (${c.category})
${digestText({ [c.category]: relevant }, { perCategory: 25 })}
${c.news_urls.length ? `\nItems that prompted this question:\n${c.news_urls.map((u) => `- ${u}`).join('\n')}` : ''}`;

  return llm.json({ system: FORECASTER_SYSTEM, prompt, schema: forecastSchema, temperature: 0.2 });
}

export function shortlistMarkets(c, markets, n = 6) {
  const t = tokens(c.question);
  const scored = markets
    .map((m) => ({ m, s: jaccard(t, tokens(m.question)) + (c.polymarket_id === m.id ? 1 : 0) }))
    .filter((x) => x.s >= 0.12)
    .sort((a, b) => b.s - a.s)
    .slice(0, n);
  return scored.map((x) => x.m);
}

const dayDiff = (a, b) => Math.abs(new Date(`${a}T00:00:00Z`) - new Date(`${b}T00:00:00Z`)) / 86400000;

export async function matchMarkets(ctx, candidates, markets) {
  const { llm, config, log } = ctx;
  const lists = candidates.map((c) => shortlistMarkets(c, markets));
  const withLists = candidates.map((c, i) => ({ c, i, list: lists[i] })).filter((x) => x.list.length);
  const result = new Map();
  if (!withLists.length) return result;

  const prompt = withLists
    .map(
      ({ c, i, list }) =>
        `[${i}] ${c.question}\n  Deadline: ${c.deadline}\n  Criteria: ${c.resolution_criteria}\n  Candidate markets:\n${list
          .map((m) => `   - id=${m.id} | ends ${m.end_date} | ${m.question} — ${m.description.slice(0, 300)}`)
          .join('\n')}`,
    )
    .join('\n\n');
  const out = await llm.json({
    system:
      'You match forecast questions to Polymarket markets. A match is valid ONLY if the market would resolve YES in exactly the same situations as the question: same event, same threshold, and effectively the same deadline. Related-but-different markets are NOT matches. When unsure, return no match.',
    prompt,
    schema: S.obj({
      matches: S.arr(
        S.obj({
          index: S.int(''),
          market_id: S.str('Matching market id, or empty string'),
          same_event: S.bool(''),
          same_threshold: S.bool(''),
          same_deadline: S.bool(''),
          reason: S.str(''),
        }),
        '',
      ),
    }),
    temperature: 0,
  });
  for (const m of out.matches || []) {
    if (!m.market_id || !(m.same_event && m.same_threshold && m.same_deadline)) continue;
    const c = candidates[m.index];
    const market = lists[m.index]?.find((x) => x.id === m.market_id);
    if (!c || !market) continue;
    if (!market.end_date || dayDiff(market.end_date, c.deadline) > config.marketDeadlineToleranceDays) continue;
    result.set(m.index, market);
  }
  log(`market: ${result.size} of ${candidates.length} candidates matched a Polymarket market`);
  return result;
}

export async function price(ctx, candidates, { digest, markets }) {
  const { log, now } = ctx;
  const priced = [];
  const rejected = [];
  for (const c of candidates) {
    let f;
    try {
      f = await forecastOne(ctx, c, digest);
    } catch (e) {
      rejected.push({ candidate: c, reasons: [`forecaster error: ${e.message}`], stage: 'price' });
      continue;
    }
    const v = forecastViolations(f);
    if (v.length) {
      rejected.push({ candidate: c, reasons: v, stage: 'price:discipline' });
      continue;
    }
    priced.push({
      ...c,
      forecast: f,
      actuary_prob: actuaryProbability(c.base_rate, windowDays(now.toISOString(), c.deadline)),
    });
  }
  const matches = priced.length ? await matchMarkets(ctx, priced, markets) : new Map();
  priced.forEach((p, i) => {
    p.market_match = matches.get(i) || null;
  });
  log(`price: ${priced.length} priced, ${rejected.length} rejected`);
  return { priced, rejected };
}
