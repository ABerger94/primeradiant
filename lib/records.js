// Read side: turns DB rows into public forecast records. The website only ever reads.
import { publicId } from './categories.js';
import { recordScores } from './scoring.js';
import { plainRows } from './db.js';

const parse = (s, fallback) => {
  if (s === null || s === undefined) return fallback;
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
};

const num = (v) => (v === null || v === undefined ? null : Number(v));

export function shapeRecord(row, notes = [], { now = new Date() } = {}) {
  const status = row.res_status || 'open';
  const deadlineEnd = new Date(`${row.deadline}T23:59:59Z`);
  const rec = {
    id: Number(row.id),
    public_id: publicId(row.id),
    question: row.question,
    category: row.category,
    created_at: row.created_at,
    deadline: row.deadline,
    resolution_criteria: row.resolution_criteria,
    resolution_source: { name: row.resolution_source_name, url: row.resolution_source_url },
    forecaster_prob: num(row.forecaster_prob),
    market_prob: num(row.market_prob),
    market: parse(row.market_ref, null),
    actuary_prob: num(row.actuary_prob),
    base_rate: parse(row.base_rate, {}),
    reasoning: row.reasoning,
    reasoning_detail: parse(row.reasoning_detail, {}),
    sources: parse(row.sources, []),
    model: row.model,
    status,
    outcome: row.res_outcome === null || row.res_outcome === undefined ? null : Number(row.res_outcome),
    resolved_at: row.res_resolved_at || null,
    evidence: row.res_evidence_url || null,
    resolution_explanation: row.res_explanation || null,
    resolution_method: row.res_method || null,
    awaiting_resolution: status === 'open' && deadlineEnd < now,
    notes: notes.map((n) => ({ created_at: n.created_at, body: n.body })),
    lock_hash: row.lock_hash,
    chain_hash: row.chain_hash,
    prev_chain_hash: row.prev_chain_hash || null,
  };
  rec.scores = recordScores(rec);
  return rec;
}

const SELECT = `
  SELECT f.*, r.status AS res_status, r.outcome AS res_outcome, r.resolved_at AS res_resolved_at,
         r.evidence_url AS res_evidence_url, r.explanation AS res_explanation, r.method AS res_method
  FROM forecasts f LEFT JOIN resolutions r ON r.forecast_id = f.id`;

export async function loadRecords(db, { id } = {}) {
  const res = id
    ? await db.execute({ sql: `${SELECT} WHERE f.id = ?`, args: [id] })
    : await db.execute(`${SELECT} ORDER BY f.id`);
  const noteRes = id
    ? await db.execute({ sql: 'SELECT * FROM notes WHERE forecast_id = ? ORDER BY id', args: [id] })
    : await db.execute('SELECT * FROM notes ORDER BY id');
  const byForecast = new Map();
  for (const n of noteRes.rows) {
    const k = Number(n.forecast_id);
    if (!byForecast.has(k)) byForecast.set(k, []);
    byForecast.get(k).push(n);
  }
  const now = new Date();
  return res.rows.map((row) => shapeRecord(row, byForecast.get(Number(row.id)) || [], { now }));
}

export async function loadMule(db) {
  const res = await db.execute('SELECT * FROM mule_entries ORDER BY event_date DESC, id DESC');
  return res.rows.map((m) => ({
    id: Number(m.id),
    created_at: m.created_at,
    event_date: m.event_date,
    title: m.title,
    summary: m.summary,
    evidence_url: m.evidence_url,
    postmortem: m.postmortem,
    related_forecast_ids: parse(m.related_forecast_ids, []),
  }));
}

/** Raw rows for verification/export — exactly the values that were hashed. */
export async function loadRawForecasts(db) {
  return plainRows(await db.execute('SELECT * FROM forecasts ORDER BY id'));
}
