// The daily pipeline (run by Milk on a schedule, or by .github/workflows/daily.yml):
//   ingest → draft → dedupe → price the lanes → publish (lock) → resolution sweep → mule watch
// Usage: node pipeline/run.js [--dry-run] [--only=forecast,resolve,mule]
import { loadRecords } from '../lib/records.js';
import { createContext, log } from './context.js';
import { checkSources, draftCandidates, scopeReview } from './steps/draft.js';
import { dedupe } from './steps/dedupe.js';
import { ingest } from './steps/ingest.js';
import { muleWatch } from './steps/mule.js';
import { price } from './steps/price.js';
import { publish } from './steps/publish.js';
import { resolveSweep } from './steps/resolve.js';

/** Void-rate guard: pause drafting in a category whose recent resolutions void too often. */
export function voidGuard(records, config) {
  const paused = [];
  for (const cat of config.activeCategories) {
    const recent = records
      .filter((r) => r.category === cat && r.status !== 'open')
      .sort((a, b) => b.resolved_at.localeCompare(a.resolved_at))
      .slice(0, config.voidGuardWindow);
    if (recent.length < 10) continue;
    const rate = recent.filter((r) => r.status === 'void').length / recent.length;
    if (rate > config.voidGuardMaxRate) paused.push({ category: cat, rate });
  }
  return paused;
}

export async function forecastStage(ctx, ingested) {
  const { db, config, log: say, now } = ctx;
  const records = await loadRecords(db);
  const today = now.toISOString().slice(0, 10);
  const already = records.filter((r) => r.created_at.slice(0, 10) === today).length;
  const slots = config.perDayMax - already;
  if (slots <= 0) {
    say(`forecast: ${already} already published today (max ${config.perDayMax}); skipping`);
    return { published: [], rejected: [] };
  }
  for (const p of voidGuard(records, config)) {
    say(`forecast: pausing ${p.category} — void rate ${(p.rate * 100).toFixed(0)}% over its recent resolutions`);
    config.disabledCategories.push(p.category);
    config.activeCategories = config.activeCategories.filter((c) => c !== p.category);
  }
  const existing = records.map((r) => ({ id: r.id, question: r.question, deadline: r.deadline, status: r.status }));
  const rejected = [];
  const drafts = await draftCandidates(ctx, ingested, { count: Math.max(slots * config.candidateMultiplier, 6), existing });
  const scoped = await scopeReview(ctx, drafts);
  rejected.push(...scoped.rejected);
  const deduped = await dedupe(ctx, scoped.passed, existing);
  rejected.push(...deduped.rejected);
  const sourced = await checkSources(ctx, deduped.passed);
  rejected.push(...sourced.rejected);
  const priced = await price(ctx, sourced.passed.slice(0, slots * 2), ingested);
  rejected.push(...priced.rejected);
  const published = await publish(ctx, priced.priced, { slots });
  const minimumToday = config.perDayMin - already;
  if (published.length < minimumToday) {
    say(`forecast: only ${published.length} passed every gate (target ≥ ${minimumToday}). The bar does not lower to hit volume.`);
  }
  for (const r of rejected) say(`  rejected [${r.stage}] ${r.candidate.question?.slice(0, 80)} — ${r.reasons.join('; ')}`);
  return { published, rejected };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const onlyArg = args.find((a) => a.startsWith('--only='));
  const only = onlyArg ? new Set(onlyArg.slice(7).split(',')) : new Set(['forecast', 'resolve', 'mule']);
  const ctx = await createContext({ dryRun });
  const run = dryRun
    ? null
    : await ctx.db.execute({ sql: "INSERT INTO pipeline_runs (started_at, status) VALUES (?, 'running') RETURNING id", args: [ctx.now.toISOString()] });
  const runId = run?.rows[0]?.id;
  const summary = {};
  let status = 'ok';
  try {
    let ingested = null;
    if (only.has('forecast') || only.has('mule')) ingested = await ingest(ctx);
    if (only.has('forecast')) {
      const r = await forecastStage(ctx, ingested);
      summary.published = r.published.length;
      summary.rejected = r.rejected.length;
    }
    if (only.has('resolve')) summary.resolution = await resolveSweep(ctx);
    if (only.has('mule')) summary.mule = (await muleWatch(ctx, ingested, await loadRecords(ctx.db))).length;
  } catch (e) {
    status = 'error';
    summary.error = e.message;
    log(`pipeline error: ${e.stack || e.message}`);
  }
  summary.geminiCalls = ctx.llm.calls;
  if (runId) {
    await ctx.db.execute({
      sql: 'UPDATE pipeline_runs SET finished_at = ?, status = ?, summary = ? WHERE id = ?',
      args: [new Date().toISOString(), status, JSON.stringify(summary), runId],
    });
  }
  log('done', JSON.stringify(summary));
  if (status !== 'ok') process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
