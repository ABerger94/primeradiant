import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyChain } from '../lib/lock.js';
import { loadRawForecasts, loadRecords } from '../lib/records.js';
import { insertForecast } from '../pipeline/steps/publish.js';
import { applyResolution } from '../pipeline/steps/resolve.js';
import { memDb, sampleForecast } from './helpers.js';

test('forecasts are locked: UPDATE and DELETE abort', async () => {
  const db = await memDb();
  const row = await insertForecast(db, sampleForecast());
  await assert.rejects(db.execute({ sql: 'UPDATE forecasts SET forecaster_prob = 0.9 WHERE id = ?', args: [row.id] }), /locked/);
  await assert.rejects(db.execute({ sql: 'DELETE FROM forecasts WHERE id = ?', args: [row.id] }), /locked/);
});

test('resolutions are locked and cannot predate the lock', async () => {
  const db = await memDb();
  const row = await insertForecast(db, sampleForecast(), { createdAt: '2026-11-01T00:00:00.000Z' });
  await assert.rejects(
    applyResolution(db, { forecastId: row.id, verdict: 'yes', evidenceUrl: 'https://e.com', explanation: 'it happened, see link', method: 'manual', resolvedAt: '2026-10-01T00:00:00Z' }),
    /before it was locked/,
  );
  await applyResolution(db, { forecastId: row.id, verdict: 'yes', evidenceUrl: 'https://e.com', explanation: 'it happened, see link', method: 'manual' });
  await assert.rejects(db.execute('UPDATE resolutions SET outcome = 0'), /locked/);
  await assert.rejects(
    applyResolution(db, { forecastId: row.id, verdict: 'no', evidenceUrl: 'https://e.com', explanation: 'second try at it', method: 'manual' }),
    /UNIQUE|PRIMARY|constraint/i,
  );
  const [r] = await loadRecords(db);
  assert.equal(r.status, 'resolved-yes');
  assert.equal(r.outcome, 1);
  assert.ok(Math.abs(r.scores.forecaster - 0.36) < 1e-12);
  assert.equal(r.scores.market, null);
});

test('void has no outcome and is not scored', async () => {
  const db = await memDb();
  const row = await insertForecast(db, sampleForecast());
  await applyResolution(db, { forecastId: row.id, verdict: 'void', evidenceUrl: 'https://e.com', explanation: 'meeting cancelled; unanswerable under void policy', method: 'manual' });
  const [r] = await loadRecords(db);
  assert.equal(r.status, 'void');
  assert.equal(r.outcome, null);
  assert.equal(r.scores, null);
});

test('hash chain verifies, and detects tampering', async () => {
  const db = await memDb();
  for (let i = 0; i < 3; i += 1) await insertForecast(db, sampleForecast({ question: `Will test question number ${i} resolve yes by its deadline?` }));
  const rows = await loadRawForecasts(db);
  assert.deepEqual(verifyChain(rows), []);
  assert.equal(rows[0].prev_chain_hash, null);
  assert.equal(rows[1].prev_chain_hash, rows[0].chain_hash);
  const tampered = rows.map((r) => ({ ...r }));
  tampered[1].forecaster_prob = 0.99;
  assert.match(verifyChain(tampered).join(), /id 2: lock hash mismatch/);
  assert.match(verifyChain([rows[0], rows[2]]).join(), /id 3: chain break/);
});

test('ids are never reused', async () => {
  const db = await memDb();
  const a = await insertForecast(db, sampleForecast());
  const b = await insertForecast(db, sampleForecast({ question: 'Will a different question entirely resolve yes in time?' }));
  assert.equal(b.id, a.id + 1);
});

test('notes attach without touching the record', async () => {
  const db = await memDb();
  const row = await insertForecast(db, sampleForecast());
  await db.execute({ sql: 'INSERT INTO notes (forecast_id, created_at, body) VALUES (?,?,?)', args: [row.id, new Date().toISOString(), 'Source URL moved.'] });
  const [r] = await loadRecords(db);
  assert.equal(r.notes.length, 1);
  assert.deepEqual(verifyChain(await loadRawForecasts(db)), []);
});
