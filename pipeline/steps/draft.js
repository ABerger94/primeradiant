// Step 2 — Draft: Gemini proposes candidate questions; each must pass the code scope rules
// AND an independent LLM scope review. The drafter never sees market prices.
import { CATEGORIES } from '../../lib/categories.js';
import { MAX_DAYS, MIN_DAYS, scopeViolations } from '../../lib/scope.js';
import { S } from '../gemini.js';
import { digestText } from './ingest.js';

const addDays = (d, n) => new Date(d.getTime() + n * 86400000).toISOString().slice(0, 10);

export const DRAFT_SYSTEM = `You draft forecast questions for Prime Radiant, a public, scored record of AI forecasts run on the principles of psychohistory: forecasts about SYSTEMS AND POPULATIONS only — elections, policy, markets, conflicts, technology milestones, climate and disaster events, public-health trends. Never an individual's personal outcome. Never a named person's death or health.

Every question you draft must be:
1. A yes/no question beginning "Will…", about one clearly defined event or threshold.
2. Dated: a deadline (YYYY-MM-DD) between ${MIN_DAYS} days and ${MAX_DAYS} days from today. Spread deadlines: some 1–4 weeks out, some 1–3 months, some 3–6 months.
3. Resolvable by a NAMED PUBLIC SOURCE with a URL (an official statistics page, an agency, a court docket, a government register, an index provider). "News reports" alone is not a source.
4. Written with resolution criteria precise enough that two strangers would agree on the outcome: exact thresholds, units, which release/vintage counts, what happens on edge cases.
5. Genuinely uncertain today: not already decided, not near-certain either way.
6. Grounded in a sourced base rate: name the reference class (the set of comparable past situations), give its historical frequency, and cite where that frequency comes from with a URL. If you cannot ground a question in a citable base rate, do not draft it — pick another.

Base rate kinds:
- "proportion": share of past reference-class cases that resolved YES (0..1). E.g. "Fed held rates at 41 of 64 meetings 2017–2024" → 0.64.
- "annual_rate": average count of qualifying events per year, for "will at least one X happen by the deadline" questions. E.g. "M7.5+ earthquakes: ~5 per year (USGS 1900–2024)" → 5.

Public Health questions: population-level only — case counts, WHO/CDC declarations, regulatory approvals, surveillance thresholds, published by WHO, CDC, ECDC, FDA, EMA, national health ministries. Never about any individual's health.

If a listed Polymarket market asks substantively the same question, you may mirror it exactly (same event, threshold and deadline) and put its id in polymarket_id; otherwise leave polymarket_id empty. Do not change a question to fit a market.`;

const candidateSchema = S.obj({
  category: S.enum(CATEGORIES, 'One of the categories'),
  question: S.str('The exact yes/no question, beginning "Will"'),
  deadline: S.str('YYYY-MM-DD'),
  resolution_criteria: S.str('What counts as YES (and NO), written now, before the outcome is knowable'),
  resolution_source_name: S.str('The named public source that settles it'),
  resolution_source_url: S.str('URL of that source'),
  reference_class: S.str('The set of comparable past situations'),
  base_rate_kind: S.enum(['proportion', 'annual_rate'], 'How the base rate is expressed'),
  base_rate_value: S.num('Proportion 0..1, or events per year'),
  base_rate_evidence: S.str('The counts behind it, e.g. "14 of 52 cases, 1990–2025"'),
  base_rate_source: S.str('Where the frequency comes from'),
  base_rate_source_url: S.str('URL for the base rate source'),
  polymarket_id: S.str('Id of an equivalent Polymarket market, or empty string'),
  news_urls: S.arr(S.str('URL'), 'Digest items that prompted this question'),
});

export async function draftCandidates(ctx, { digest, markets }, { count, existing }) {
  const { llm, now, config, log } = ctx;
  const today = now.toISOString().slice(0, 10);
  const marketList = markets
    .slice(0, 80)
    .map((m) => `- id=${m.id} | ends ${m.end_date || '?'} | ${m.question}`)
    .join('\n');
  const existingList = existing
    .slice(-150)
    .map((e) => `- ${e.question}`)
    .join('\n');

  const prompt = `Today is ${today}. Allowed deadlines: ${addDays(now, MIN_DAYS)} to ${addDays(now, MAX_DAYS)}.
Active categories: ${config.activeCategories.join(', ')}.

Draft ${count} candidate questions, spread across categories and deadline horizons.

# Today's news digest
${digestText(digest)}

# Active Polymarket markets (question and end date only)
${marketList || '- (none available)'}

# Already asked — do not repeat or re-ask in disguise
${existingList || '- (none yet)'}`;

  const out = await llm.json({
    system: DRAFT_SYSTEM,
    prompt,
    schema: S.obj({ candidates: S.arr(candidateSchema, 'Candidate questions') }),
    temperature: 0.7,
  });
  const candidates = (out.candidates || []).map(normalizeCandidate);
  log(`draft: ${candidates.length} candidates proposed`);
  return candidates;
}

export function normalizeCandidate(c) {
  return {
    category: c.category,
    question: String(c.question || '').trim(),
    deadline: String(c.deadline || '').trim(),
    resolution_criteria: String(c.resolution_criteria || '').trim(),
    resolution_source_name: String(c.resolution_source_name || '').trim(),
    resolution_source_url: String(c.resolution_source_url || '').trim(),
    base_rate: {
      reference_class: String(c.reference_class || '').trim(),
      kind: c.base_rate_kind,
      value: Number(c.base_rate_value),
      evidence: String(c.base_rate_evidence || '').trim(),
      source: String(c.base_rate_source || '').trim(),
      source_url: String(c.base_rate_source_url || '').trim(),
    },
    polymarket_id: String(c.polymarket_id || '').trim() || null,
    news_urls: Array.isArray(c.news_urls) ? c.news_urls.filter((u) => /^https?:\/\//.test(u)).slice(0, 6) : [],
  };
}

const REVIEW_SYSTEM = `You are the scope reviewer for Prime Radiant, a scored forecasting record. You are strict: when in doubt, fail the question. A question passes only if ALL are true:
- about_system_not_individual: it concerns a system, institution, market, country or population — not one individual's personal outcome. (An institution acting, e.g. "Will the Senate confirm…", is a system event.)
- no_named_person_death_or_health: it is not about any named person's death, health, illness, or survival.
- falsifiable_yes_no: it is a single yes/no question with a deadline.
- resolution_source_is_public_and_named: the named source is public and would actually publish the deciding fact.
- resolvable_without_subjective_judgment: the criteria leave no room for "it depends"; thresholds and edge cases are specified.
- outcome_unknown_today: the outcome is not already known or effectively certain.
- base_rate_is_relevant: the cited reference class genuinely resembles this question.`;

export async function scopeReview(ctx, candidates) {
  const { llm, now, config, log } = ctx;
  const passed = [];
  const rejected = [];
  const coded = [];
  for (const c of candidates) {
    const v = scopeViolations(c, { now, disabledCategories: config.disabledCategories });
    if (v.length) rejected.push({ candidate: c, reasons: v, stage: 'scope:rules' });
    else coded.push(c);
  }
  if (!coded.length) return { passed, rejected };

  const list = coded
    .map((c, i) => `[${i}] (${c.category}, deadline ${c.deadline}) ${c.question}\n  Criteria: ${c.resolution_criteria}\n  Source: ${c.resolution_source_name} <${c.resolution_source_url}>\n  Reference class: ${c.base_rate.reference_class} — ${c.base_rate.evidence}`)
    .join('\n\n');
  const out = await llm.json({
    system: REVIEW_SYSTEM,
    prompt: `Today is ${now.toISOString().slice(0, 10)}. Review each candidate.\n\n${list}`,
    schema: S.obj({
      reviews: S.arr(
        S.obj({
          index: S.int('Candidate index'),
          about_system_not_individual: S.bool(''),
          no_named_person_death_or_health: S.bool(''),
          falsifiable_yes_no: S.bool(''),
          resolution_source_is_public_and_named: S.bool(''),
          resolvable_without_subjective_judgment: S.bool(''),
          outcome_unknown_today: S.bool(''),
          base_rate_is_relevant: S.bool(''),
          reason: S.str('One sentence; name the failing check if any'),
        }),
        'One review per candidate',
      ),
    }),
    temperature: 0,
  });
  const byIndex = new Map((out.reviews || []).map((r) => [r.index, r]));
  const CHECKS = [
    'about_system_not_individual',
    'no_named_person_death_or_health',
    'falsifiable_yes_no',
    'resolution_source_is_public_and_named',
    'resolvable_without_subjective_judgment',
    'outcome_unknown_today',
    'base_rate_is_relevant',
  ];
  coded.forEach((c, i) => {
    const r = byIndex.get(i);
    const failed = r ? CHECKS.filter((k) => r[k] !== true) : ['no review returned'];
    if (failed.length) rejected.push({ candidate: c, reasons: [...failed, r?.reason].filter(Boolean), stage: 'scope:review' });
    else passed.push(c);
  });
  log(`scope: ${passed.length} passed, ${rejected.length} rejected`);
  return { passed, rejected };
}

/** Base-rate sources and resolution sources must at least exist on the public web. */
export async function checkSources(ctx, candidates) {
  const passed = [];
  const rejected = [];
  for (const c of candidates) {
    const [a, b] = await Promise.all([ctx.sources.reachable(c.resolution_source_url), ctx.sources.reachable(c.base_rate.source_url)]);
    if (a && b) passed.push(c);
    else rejected.push({ candidate: c, reasons: [!a && 'resolution source URL unreachable', !b && 'base rate source URL unreachable'].filter(Boolean), stage: 'sources' });
  }
  ctx.log(`sources: ${passed.length} reachable, ${rejected.length} rejected`);
  return { passed, rejected };
}
