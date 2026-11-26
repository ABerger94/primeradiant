// Step 7 — Mule watch. Flags major events that no lane had any forecast touching. Flags are
// candidates only; an entry reaches The Mule page when it is published with a post-mortem.
import { jaccard } from '../../lib/scope.js';
import { S } from '../gemini.js';
import { digestText } from './ingest.js';

export async function muleWatch(ctx, { digest }, records) {
  const { llm, db, now, log, dryRun } = ctx;
  const recent = records
    .filter((r) => r.status === 'open' || (r.resolved_at && now - new Date(r.resolved_at) < 30 * 86400000))
    .map((r) => `${r.id}: ${r.question}`)
    .join('\n');
  const out = await llm.json({
    system:
      'You watch for black-swan events for Prime Radiant: major, surprising, widely reported developments of systemic consequence (a war starting, a government falling, a market crash, a new pandemic declaration, a landmark technology event, a catastrophic disaster) — not routine news. For each, decide whether ANY existing forecast question touched it (concerned the same event or its direct precursor). Return only major events that no forecast touched. Return an empty list on an ordinary day; most days are ordinary.',
    prompt: `Today is ${now.toISOString().slice(0, 10)}.\n\n# Today's digest\n${digestText(digest)}\n\n# Existing forecasts (id: question)\n${recent || '(none)'}`,
    schema: S.obj({
      events: S.arr(
        S.obj({
          title: S.str('Short headline for the event'),
          summary: S.str('2 sentences: what happened'),
          evidence_url: S.str('Best source link from the digest'),
          why_major: S.str('Why this is systemic and surprising'),
          touched_by_forecast_id: S.int('Id of a forecast that touched it, or 0'),
        }),
        '',
      ),
    }),
    temperature: 0.2,
  });
  const prior = (await db.execute("SELECT title FROM mule_candidates WHERE flagged_at >= date('now', '-30 days')")).rows.map((r) => r.title);
  const flagged = [];
  for (const e of out.events || []) {
    if (e.touched_by_forecast_id > 0) continue;
    if (!/^https?:\/\//.test(e.evidence_url || '')) continue;
    if (prior.some((t) => jaccard(t, e.title) > 0.5)) continue;
    flagged.push(e);
    if (!dryRun) {
      await db.execute({
        sql: 'INSERT INTO mule_candidates (flagged_at, event_date, title, summary, evidence_url, why_major) VALUES (?,?,?,?,?,?)',
        args: [now.toISOString(), now.toISOString().slice(0, 10), e.title, e.summary, e.evidence_url, e.why_major],
      });
    }
  }
  log(`mule: ${flagged.length} event(s) flagged outside every model`);
  return flagged;
}

/** Draft a post-mortem: what were the lanes assuming when reality declined to cooperate? */
export async function draftPostmortem(llm, candidate, records) {
  const context = records
    .slice(-60)
    .map((r) => `- ${r.public_id} [${r.category}] ${r.question} — F ${Math.round(r.forecaster_prob * 100)}%, A ${Math.round(r.actuary_prob * 100)}%${r.market_prob !== null ? `, M ${Math.round(r.market_prob * 100)}%` : ''}`)
    .join('\n');
  const out = await llm.json({
    system:
      "You write short post-mortems for The Mule, Prime Radiant's page of events outside every model. Plain, unsentimental, specific. Explain what the lanes' open questions implicitly assumed about the world, and why none of them was looking at this. Never claim the event was predictable in hindsight unless the record shows it. 120–200 words.",
    prompt: `EVENT: ${candidate.title}\n${candidate.summary}\nWhy major: ${candidate.why_major}\nSource: ${candidate.evidence_url}\n\nTHE RECORD AT THE TIME:\n${context || '(empty)'}`,
    schema: S.obj({ postmortem: S.str(''), related_forecast_ids: S.arr(S.int(''), 'Forecasts whose assumptions it disturbed') }),
    temperature: 0.4,
  });
  return out;
}
