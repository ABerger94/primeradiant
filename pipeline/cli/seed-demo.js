// Fills a LOCAL demo database with clearly labeled fake records, for UI work only.
// Refuses to touch anything but a local file named *demo*.db — the real record is never seeded.
//   npm run seed:demo   then   TURSO_DATABASE_URL=file:demo.db npm run dev
import { existsSync, rmSync } from 'node:fs';
import { CATEGORIES } from '../../lib/categories.js';
import { migrate, openDb } from '../../lib/db.js';
import { insertForecast } from '../steps/publish.js';
import { applyResolution } from '../steps/resolve.js';

const url = 'file:demo.db';
if (process.env.TURSO_DATABASE_URL && process.env.TURSO_DATABASE_URL !== url) {
  console.error('seed:demo only writes to file:demo.db. Unset TURSO_DATABASE_URL.');
  process.exit(1);
}
if (existsSync('demo.db')) rmSync('demo.db');
const db = openDb(url);
await migrate(db);

let s = 7;
const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
const DAY = 86400000;
const iso = (t) => new Date(t).toISOString();
const day = (t) => iso(t).slice(0, 10);
const now = Date.now();

const SUBJECTS = {
  Geopolitics: ['a ceasefire agreement in Region A', 'a new sanctions package from Bloc B', 'a summit communiqué between Country C and D'],
  'US Politics & Policy': ['passage of Bill H.R. 0000', 'a ruling in Case v. Agency', 'a new executive order on topic E'],
  'Economy & Markets': ['a policy-rate cut by Central Bank F', 'monthly CPI printing below 2.5%', 'Index G closing above 6,000'],
  'Tech & AI': ['a model release clearing Benchmark H at 90%', 'approval of Chip Export Rule I', 'a launch reaching orbit by Vehicle J'],
  'Climate & Disasters': ['a Category 4+ landfall in Basin K', 'an M7.0+ earthquake in Zone L', 'record monthly heat in Dataset M'],
  'Public Health': ['a WHO emergency declaration for Pathogen N', 'measles cases in Country O exceeding 1,000', 'regulatory approval of Vaccine P'],
};

for (let i = 0; i < 48; i += 1) {
  const category = CATEGORIES[i % CATEGORIES.length];
  const subj = SUBJECTS[category][i % 3];
  const created = now - (120 - i * 2.4) * DAY;
  const span = 7 + Math.floor(rand() * 90);
  const deadline = day(created + span * DAY);
  const truth = rand();
  const base = Math.round((0.1 + rand() * 0.6) * 100) / 100;
  const fp = Math.min(0.97, Math.max(0.03, Math.round((truth * 0.55 + base * 0.45 + (rand() - 0.5) * 0.2) * 100) / 100));
  const hasMarket = rand() < 0.45;
  const mp = hasMarket ? Math.min(0.98, Math.max(0.02, Math.round((truth * 0.6 + base * 0.4 + (rand() - 0.5) * 0.15) * 1000) / 1000)) : null;
  const row = await insertForecast(
    db,
    {
      question: `[DEMO] Will ${subj} happen by ${deadline}?`,
      category,
      deadline,
      resolution_criteria: 'DEMO RECORD — not a real forecast. YES if the named source reports the event on or before the deadline.',
      resolution_source_name: 'Demo source',
      resolution_source_url: 'https://example.org/demo-source',
      forecaster_prob: fp,
      market_prob: mp,
      market_ref: hasMarket ? { source: 'polymarket', id: `demo-${i}`, slug: 'demo', question: `Demo market ${i}`, url: 'https://example.org/demo-market', snapshot_at: iso(created), end_date: deadline } : null,
      actuary_prob: base,
      base_rate: { reference_class: 'Demo reference class of comparable cases', kind: 'proportion', value: base, evidence: `${Math.round(base * 40)} of 40 demo cases`, source: 'Demo statistics', source_url: 'https://example.org/demo-stats' },
      reasoning: `DEMO. Anchored on the ${Math.round(base * 100)}% base rate, then adjusted for demo conditions to ${Math.round(fp * 100)}%.`,
      reasoning_detail: { reference_class: 'Demo class', base_rate_statement: `${Math.round(base * 100)}%`, for: ['Demo reason for a higher probability'], against: ['Demo reason for a lower probability'] },
      sources: [{ title: 'Demo source', url: 'https://example.org/demo' }],
      model: 'demo',
    },
    { createdAt: iso(created) },
  );
  const deadlineTs = new Date(`${deadline}T23:59:59Z`).getTime();
  if (deadlineTs < now) {
    const isVoid = rand() < 0.05;
    const yes = rand() < truth;
    await applyResolution(db, {
      forecastId: row.id,
      verdict: isVoid ? 'void' : yes ? 'yes' : 'no',
      evidenceUrl: 'https://example.org/demo-evidence',
      explanation: isVoid ? 'DEMO. Event cancelled; unanswerable under the void policy.' : `DEMO. The demo source reports ${yes ? 'the event occurred' : 'no qualifying event'} by the deadline.`,
      method: 'auto',
      resolvedAt: iso(Math.min(now - 3600000, deadlineTs + DAY)),
    });
  }
}
await db.execute({
  sql: 'INSERT INTO mule_entries (created_at, event_date, title, summary, evidence_url, postmortem, related_forecast_ids) VALUES (?,?,?,?,?,?,?)',
  args: [iso(now - 20 * DAY), day(now - 21 * DAY), '[DEMO] An unmodelled event', 'DEMO. A major development that no open forecast touched.', 'https://example.org/demo', 'DEMO post-mortem. The open questions assumed the status quo in this region would hold; none of the lanes was watching it.', '[3,9]'],
});
console.log('demo.db seeded with labeled demo records. Run: TURSO_DATABASE_URL=file:demo.db npm run dev');
