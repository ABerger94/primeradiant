// Turso / libSQL access and schema. The record tables are append-only, enforced by the
// database itself: UPDATE and DELETE on them abort. Corrections are new rows in `notes`.
import { createClient } from '@libsql/client';

let cached;

export function getDb(env = process.env) {
  if (cached) return cached;
  const url = env.TURSO_DATABASE_URL || 'file:local.db';
  cached = createClient({ url, authToken: env.TURSO_AUTH_TOKEN || undefined });
  return cached;
}

export function openDb(url, authToken) {
  return createClient({ url, authToken });
}

const lockTriggers = (table) => [
  `CREATE TRIGGER IF NOT EXISTS ${table}_no_update BEFORE UPDATE ON ${table}
   BEGIN SELECT RAISE(ABORT, '${table} records are locked: append-only'); END`,
  `CREATE TRIGGER IF NOT EXISTS ${table}_no_delete BEFORE DELETE ON ${table}
   BEGIN SELECT RAISE(ABORT, '${table} records are locked: append-only'); END`,
];

export const SCHEMA = [
  // ---- The record (immutable) -------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS forecasts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,         -- AUTOINCREMENT: ids are never reused
    question TEXT NOT NULL,
    category TEXT NOT NULL,
    created_at TEXT NOT NULL,                     -- the lock timestamp (ISO 8601, UTC)
    deadline TEXT NOT NULL,                       -- YYYY-MM-DD, resolves at 23:59:59 UTC
    resolution_criteria TEXT NOT NULL,
    resolution_source_name TEXT NOT NULL,
    resolution_source_url TEXT NOT NULL,
    forecaster_prob REAL NOT NULL CHECK (forecaster_prob >= 0 AND forecaster_prob <= 1),
    market_prob REAL CHECK (market_prob IS NULL OR (market_prob >= 0 AND market_prob <= 1)),
    market_ref TEXT,                              -- JSON: Polymarket market + snapshot time
    actuary_prob REAL NOT NULL CHECK (actuary_prob >= 0 AND actuary_prob <= 1),
    base_rate TEXT NOT NULL,                      -- JSON: reference class, kind, value, source
    reasoning TEXT NOT NULL,
    reasoning_detail TEXT NOT NULL,               -- JSON: {base_rate_statement, for[], against[]}
    sources TEXT NOT NULL,                        -- JSON: [{title, url}]
    model TEXT NOT NULL,
    lock_hash TEXT NOT NULL UNIQUE,               -- sha256 of the locked fields
    prev_chain_hash TEXT,
    chain_hash TEXT NOT NULL UNIQUE               -- sha256(prev_chain_hash + lock_hash)
  )`,
  `CREATE TABLE IF NOT EXISTS resolutions (
    forecast_id INTEGER PRIMARY KEY REFERENCES forecasts(id),
    status TEXT NOT NULL CHECK (status IN ('resolved-yes', 'resolved-no', 'void')),
    outcome INTEGER,
    resolved_at TEXT NOT NULL,
    evidence_url TEXT NOT NULL,
    explanation TEXT NOT NULL,
    method TEXT NOT NULL CHECK (method IN ('auto', 'reviewed', 'manual')),
    CHECK ((status = 'void' AND outcome IS NULL)
        OR (status = 'resolved-yes' AND outcome = 1)
        OR (status = 'resolved-no' AND outcome = 0))
  )`,
  `CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    forecast_id INTEGER NOT NULL REFERENCES forecasts(id),
    created_at TEXT NOT NULL,
    body TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS mule_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    event_date TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    evidence_url TEXT NOT NULL,
    postmortem TEXT NOT NULL,
    related_forecast_ids TEXT NOT NULL DEFAULT '[]'
  )`,
  ...lockTriggers('forecasts'),
  ...lockTriggers('resolutions'),
  ...lockTriggers('notes'),
  ...lockTriggers('mule_entries'),
  `CREATE TRIGGER IF NOT EXISTS resolutions_after_lock BEFORE INSERT ON resolutions
   WHEN NEW.resolved_at < (SELECT created_at FROM forecasts WHERE id = NEW.forecast_id)
   BEGIN SELECT RAISE(ABORT, 'a forecast cannot resolve before it was locked'); END`,
  `CREATE TRIGGER IF NOT EXISTS notes_after_lock BEFORE INSERT ON notes
   WHEN NEW.created_at < (SELECT created_at FROM forecasts WHERE id = NEW.forecast_id)
   BEGIN SELECT RAISE(ABORT, 'a note cannot predate its forecast'); END`,
  `CREATE INDEX IF NOT EXISTS forecasts_deadline ON forecasts(deadline)`,
  `CREATE INDEX IF NOT EXISTS forecasts_created ON forecasts(created_at)`,

  // ---- Engine-room state (mutable, never shown as record) ---------------------------------
  `CREATE TABLE IF NOT EXISTS resolution_proposals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    forecast_id INTEGER NOT NULL REFERENCES forecasts(id),
    proposed_at TEXT NOT NULL,
    verdict TEXT NOT NULL,                        -- yes | no | void | undetermined
    confidence TEXT NOT NULL,
    evidence_url TEXT,
    explanation TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'pending'         -- pending | applied | rejected | superseded
  )`,
  `CREATE TABLE IF NOT EXISTS resolution_checks (
    forecast_id INTEGER PRIMARY KEY REFERENCES forecasts(id),
    last_checked_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS mule_candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    flagged_at TEXT NOT NULL,
    event_date TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    evidence_url TEXT NOT NULL,
    why_major TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'flagged'         -- flagged | published | dismissed
  )`,
  `CREATE TABLE IF NOT EXISTS pipeline_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT NOT NULL,
    summary TEXT
  )`,
];

export async function migrate(db) {
  await db.batch(SCHEMA, 'write');
}

/** Plain objects from a libSQL result (rows are array-like with named props). */
export function plainRows(result) {
  return result.rows.map((row) => Object.fromEntries(result.columns.map((c, i) => [c, row[i]])));
}
