// Step 5 — Publish. Publication is the lock: the Market snapshot is taken, the timestamp is
// stamped, the hashes are computed and the row is written — after this, nothing changes.
import { publicId } from '../../lib/categories.js';
import { chainHash, lockHash } from '../../lib/lock.js';
import { daysUntil } from '../../lib/scope.js';

const bucket = (deadline, now) => {
  const d = daysUntil(deadline, now);
  return d <= 31 ? 'weeks' : d <= 92 ? 'months' : 'half-year';
};

/** Greedy pick for spread: favour unseen categories, then unseen deadline horizons. */
export function pickDiverse(items, n, now) {
  const pool = [...items];
  const chosen = [];
  const cats = new Set();
  const horizons = new Set();
  while (chosen.length < n && pool.length) {
    let best = 0;
    let bestScore = -1;
    pool.forEach((c, i) => {
      const s = (cats.has(c.category) ? 0 : 2) + (horizons.has(bucket(c.deadline, now)) ? 0 : 1);
      if (s > bestScore) {
        best = i;
        bestScore = s;
      }
    });
    const [c] = pool.splice(best, 1);
    chosen.push(c);
    cats.add(c.category);
    horizons.add(bucket(c.deadline, now));
  }
  return chosen;
}

/** Writes one locked forecast. `f` holds final values; created_at is stamped here. */
export async function insertForecast(db, f, { createdAt } = {}) {
  const tx = await db.transaction('write');
  try {
    const seq = await tx.execute("SELECT seq FROM sqlite_sequence WHERE name = 'forecasts'");
    const max = await tx.execute('SELECT MAX(id) AS m FROM forecasts');
    const id = Math.max(Number(seq.rows[0]?.seq || 0), Number(max.rows[0]?.m || 0)) + 1;
    const last = await tx.execute('SELECT chain_hash FROM forecasts ORDER BY id DESC LIMIT 1');
    const prev = last.rows[0]?.chain_hash || null;
    const row = {
      id,
      question: f.question,
      category: f.category,
      created_at: createdAt || new Date().toISOString(),
      deadline: f.deadline,
      resolution_criteria: f.resolution_criteria,
      resolution_source_name: f.resolution_source_name,
      resolution_source_url: f.resolution_source_url,
      forecaster_prob: f.forecaster_prob,
      market_prob: f.market_prob ?? null,
      market_ref: f.market_ref ? JSON.stringify(f.market_ref) : null,
      actuary_prob: f.actuary_prob,
      base_rate: JSON.stringify(f.base_rate),
      reasoning: f.reasoning,
      reasoning_detail: JSON.stringify(f.reasoning_detail),
      sources: JSON.stringify(f.sources || []),
      model: f.model,
    };
    row.lock_hash = lockHash(row);
    row.prev_chain_hash = prev;
    row.chain_hash = chainHash(prev, row.lock_hash);
    const cols = Object.keys(row);
    await tx.execute({
      sql: `INSERT INTO forecasts (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
      args: cols.map((c) => row[c]),
    });
    await tx.commit();
    return row;
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

export async function publish(ctx, priced, { slots }) {
  const { db, sources, log, dryRun, llm } = ctx;
  const chosen = pickDiverse(priced, slots, ctx.now);
  const published = [];
  for (const p of chosen) {
    let market_prob = null;
    let market_ref = null;
    if (p.market_match) {
      try {
        const snap = await sources.marketSnapshot(p.market_match.id);
        const snapshotAt = new Date().toISOString();
        market_prob = Math.round(snap.yes * 1000) / 1000;
        market_ref = {
          source: 'polymarket',
          id: snap.id,
          slug: snap.slug,
          question: snap.question,
          end_date: snap.end_date,
          url: snap.event_slug ? `https://polymarket.com/event/${snap.event_slug}` : `https://polymarket.com/market/${snap.slug}`,
          snapshot_at: snapshotAt,
        };
      } catch (e) {
        log(`publish: market snapshot failed for "${p.question.slice(0, 50)}…": ${e.message} — publishing without a Market price`);
      }
    }
    const f = p.forecast;
    const record = {
      question: p.question,
      category: p.category,
      deadline: p.deadline,
      resolution_criteria: p.resolution_criteria,
      resolution_source_name: p.resolution_source_name,
      resolution_source_url: p.resolution_source_url,
      forecaster_prob: f.probability / 100,
      market_prob,
      market_ref,
      actuary_prob: p.actuary_prob,
      base_rate: p.base_rate,
      reasoning: f.reasoning_summary.trim(),
      reasoning_detail: {
        reference_class: f.reference_class,
        base_rate_statement: f.base_rate_statement,
        for: f.differences_for,
        against: f.differences_against,
      },
      sources: (f.sources || []).filter((s) => s && /^https?:\/\//.test(s.url)).slice(0, 10),
      model: llm.model,
    };
    if (dryRun) {
      log(`publish (dry run): ${record.question} — F ${record.forecaster_prob} / M ${record.market_prob} / A ${record.actuary_prob}`);
      published.push(record);
      continue;
    }
    // The market snapshot above and this timestamp are taken back to back: that is the lock.
    const row = await insertForecast(db, record, { createdAt: market_ref?.snapshot_at || new Date().toISOString() });
    log(`publish: ${publicId(row.id)} locked — ${row.question}`);
    published.push(row);
  }
  return published;
}
