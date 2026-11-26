// The lock. Each forecast's locked fields are hashed at publication, and each hash is chained
// to the one before it, so an edited, inserted or deleted record breaks every hash after it.
// Anyone with the export can recompute both. Node-only (uses node:crypto).
import { createHash } from 'node:crypto';

export const LOCKED_FIELDS = [
  'id',
  'question',
  'category',
  'created_at',
  'deadline',
  'resolution_criteria',
  'resolution_source_name',
  'resolution_source_url',
  'forecaster_prob',
  'market_prob',
  'market_ref',
  'actuary_prob',
  'base_rate',
  'reasoning',
  'reasoning_detail',
  'sources',
  'model',
];

/** Canonical JSON: object keys sorted recursively, no whitespace. */
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
    .join(',')}}`;
}

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

/** row: DB-shaped values (JSON columns as strings). */
export function lockHash(row) {
  const o = {};
  for (const f of LOCKED_FIELDS) o[f] = row[f] ?? null;
  return sha256(canonical(o));
}

export function chainHash(prev, lock) {
  return sha256(`${prev || 'GENESIS'}:${lock}`);
}

/** Verify a sequence of DB-shaped rows ordered by id. Returns a list of problems. */
export function verifyChain(rows) {
  const problems = [];
  let prev = null;
  for (const r of rows) {
    const lh = lockHash(r);
    if (lh !== r.lock_hash) problems.push(`id ${r.id}: lock hash mismatch (record altered)`);
    if ((r.prev_chain_hash || null) !== prev) problems.push(`id ${r.id}: chain break (record inserted or removed before it)`);
    const ch = chainHash(prev, r.lock_hash);
    if (ch !== r.chain_hash) problems.push(`id ${r.id}: chain hash mismatch`);
    prev = r.chain_hash;
  }
  return problems;
}
