// Step 6 — Resolution sweep. Past-deadline forecasts are checked against their named source;
// a few open ones are checked early in case they already resolved YES. Gemini proposes, the
// policy decides: only high-confidence YES/NO with an evidence link applies automatically
// (RESOLUTION_MODE=auto). Everything else — and every void — waits for a reviewer.
import { publicId } from '../../lib/categories.js';
import { S } from '../gemini.js';

export async function applyResolution(db, { forecastId, verdict, evidenceUrl, explanation, method, resolvedAt }) {
  const status = verdict === 'yes' ? 'resolved-yes' : verdict === 'no' ? 'resolved-no' : verdict === 'void' ? 'void' : null;
  if (!status) throw new Error(`cannot apply verdict "${verdict}"`);
  if (!/^https?:\/\//.test(evidenceUrl || '')) throw new Error('a resolution needs an evidence link');
  if (!explanation || explanation.trim().length < 10) throw new Error('a resolution needs an explanation');
  await db.execute({
    sql: 'INSERT INTO resolutions (forecast_id, status, outcome, resolved_at, evidence_url, explanation, method) VALUES (?,?,?,?,?,?,?)',
    args: [forecastId, status, status === 'void' ? null : status === 'resolved-yes' ? 1 : 0, resolvedAt || new Date().toISOString(), evidenceUrl, explanation.trim(), method],
  });
}

const RESOLVER_SYSTEM = `You resolve forecasts for Prime Radiant, a public scored record. You read the resolution criteria LITERALLY and decide only from evidence in front of you.
Verdicts:
- "yes": the evidence shows the YES condition was met (on or before the deadline).
- "no": the deadline has passed and the YES condition was not met; or, before the deadline, YES has become impossible.
- "void": the question became unanswerable in a way the criteria did not cover (e.g. the event was cancelled, the source stopped publishing). Rare.
- "undetermined": the evidence is insufficient. Prefer this over guessing.
Confidence "high" only when a primary or clearly authoritative source states the deciding fact. evidence_url must be the single best link proving the verdict.`;

const resolverSchema = S.obj({
  verdict: S.enum(['yes', 'no', 'void', 'undetermined'], ''),
  confidence: S.enum(['high', 'medium', 'low'], ''),
  evidence_url: S.str('Best link proving the verdict, or empty'),
  evidence_quote: S.str('The deciding sentence or figure, quoted'),
  explanation: S.str('2–3 sentences for publication'),
});

export async function proposeResolution(ctx, f) {
  const { llm, sources, now } = ctx;
  const page = await sources.pageText(f.resolution_source_url);
  const since = Math.ceil((now - new Date(f.created_at)) / 86400000) + 2;
  const news = await sources.search(f.question.replace(/^will\s+/i, '').replace(/\?$/, '').slice(0, 120), { days: since });
  const pastDeadline = new Date(`${f.deadline}T23:59:59Z`) < now;
  const prompt = `Today is ${now.toISOString()}. The deadline ${pastDeadline ? 'HAS PASSED' : 'has NOT yet passed'}.

QUESTION (${publicId(f.id)}): ${f.question}
LOCKED: ${f.created_at}
DEADLINE: ${f.deadline} 23:59:59 UTC
RESOLUTION CRITERIA: ${f.resolution_criteria}
RESOLUTION SOURCE: ${f.resolution_source_name} <${f.resolution_source_url}>

RESOLUTION SOURCE PAGE (fetched now, ${page.ok ? 'OK' : `failed: ${page.status || page.error}`}):
${page.text || '(no text)'}

RECENT NEWS:
${news.map((n) => `- ${n.title} (${n.source || n.via}, ${n.date || ''}) <${n.url}>`).join('\n') || '- (none)'}`;
  const out = await llm.json({ system: RESOLVER_SYSTEM, prompt, schema: resolverSchema, temperature: 0 });
  return { ...out, pastDeadline };
}

export async function resolveSweep(ctx) {
  const { db, config, log, now, dryRun } = ctx;
  const nowIso = now.toISOString();
  const open = (
    await db.execute(`SELECT f.* FROM forecasts f LEFT JOIN resolutions r ON r.forecast_id = f.id WHERE r.forecast_id IS NULL ORDER BY f.deadline`)
  ).rows;
  const pending = new Set(
    (await db.execute("SELECT forecast_id FROM resolution_proposals WHERE state = 'pending' AND verdict != 'undetermined'")).rows.map((r) => Number(r.forecast_id)),
  );
  const checks = new Map((await db.execute('SELECT * FROM resolution_checks')).rows.map((r) => [Number(r.forecast_id), r.last_checked_at]));

  const due = open.filter((f) => new Date(`${f.deadline}T23:59:59Z`) < now && !pending.has(Number(f.id)));
  const weekAgo = new Date(now - 7 * 86400000).toISOString();
  const early = open
    .filter((f) => new Date(`${f.deadline}T23:59:59Z`) >= now && !pending.has(Number(f.id)) && (checks.get(Number(f.id)) || '') < weekAgo)
    .sort((a, b) => (checks.get(Number(a.id)) || '').localeCompare(checks.get(Number(b.id)) || ''))
    .slice(0, config.earlyChecksPerRun);

  const summary = { checked: 0, applied: 0, queued: 0, undetermined: 0 };
  for (const f of [...due, ...early]) {
    const id = Number(f.id);
    summary.checked += 1;
    let p;
    try {
      p = await proposeResolution(ctx, f);
    } catch (e) {
      log(`resolve: ${publicId(id)} check failed: ${e.message}`);
      continue;
    }
    if (dryRun) {
      log(`resolve (dry run): ${publicId(id)} → ${p.verdict} (${p.confidence})`);
      continue;
    }
    await db.execute({
      sql: 'INSERT INTO resolution_checks (forecast_id, last_checked_at) VALUES (?, ?) ON CONFLICT(forecast_id) DO UPDATE SET last_checked_at = excluded.last_checked_at',
      args: [id, nowIso],
    });
    if (p.verdict === 'undetermined') {
      summary.undetermined += 1;
      if (p.pastDeadline) {
        await db.execute({ sql: "UPDATE resolution_proposals SET state = 'superseded' WHERE forecast_id = ? AND state = 'pending'", args: [id] });
        await db.execute({
          sql: 'INSERT INTO resolution_proposals (forecast_id, proposed_at, verdict, confidence, evidence_url, explanation) VALUES (?,?,?,?,?,?)',
          args: [id, nowIso, 'undetermined', p.confidence, p.evidence_url || null, p.explanation || 'insufficient evidence'],
        });
      }
      continue;
    }
    // Early NO is only possible when YES has become impossible; that always gets a human look.
    const auto =
      config.resolutionMode === 'auto' &&
      p.confidence === 'high' &&
      /^https?:\/\//.test(p.evidence_url || '') &&
      (p.verdict === 'yes' || (p.verdict === 'no' && p.pastDeadline));
    const explanation = [p.explanation, p.evidence_quote && `Evidence: “${p.evidence_quote}”`].filter(Boolean).join(' ');
    if (auto) {
      await applyResolution(db, { forecastId: id, verdict: p.verdict, evidenceUrl: p.evidence_url, explanation, method: 'auto' });
      await db.execute({ sql: "UPDATE resolution_proposals SET state = 'superseded' WHERE forecast_id = ? AND state = 'pending'", args: [id] });
      summary.applied += 1;
      log(`resolve: ${publicId(id)} resolved ${p.verdict.toUpperCase()} (auto, high confidence)`);
    } else {
      await db.execute({ sql: "UPDATE resolution_proposals SET state = 'superseded' WHERE forecast_id = ? AND state = 'pending'", args: [id] });
      await db.execute({
        sql: 'INSERT INTO resolution_proposals (forecast_id, proposed_at, verdict, confidence, evidence_url, explanation) VALUES (?,?,?,?,?,?)',
        args: [id, nowIso, p.verdict, p.confidence, p.evidence_url || null, explanation],
      });
      summary.queued += 1;
      log(`resolve: ${publicId(id)} → ${p.verdict} (${p.confidence}) queued for review`);
    }
  }
  return summary;
}
