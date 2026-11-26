// Human-in-the-loop resolution. The judgment minutes the design budgets for live here.
//   npm run resolve -- list
//   npm run resolve -- approve <proposalId>
//   npm run resolve -- reject <proposalId>
//   npm run resolve -- manual <PR-0001> yes|no|void --evidence <url> --explanation "…"
import { parsePublicId, publicId } from '../../lib/categories.js';
import { getDb, migrate } from '../../lib/db.js';
import { applyResolution } from '../steps/resolve.js';

const db = getDb();
await migrate(db);
const [cmd, ...rest] = process.argv.slice(2);
const flag = (name) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};

if (!cmd || cmd === 'list') {
  const rows = (
    await db.execute(`SELECT p.*, f.question, f.deadline FROM resolution_proposals p JOIN forecasts f ON f.id = p.forecast_id
      LEFT JOIN resolutions r ON r.forecast_id = f.id WHERE p.state = 'pending' AND r.forecast_id IS NULL ORDER BY p.id`)
  ).rows;
  if (!rows.length) console.log('No pending proposals.');
  for (const r of rows) {
    console.log(`#${r.id}  ${publicId(r.forecast_id)}  → ${String(r.verdict).toUpperCase()} (${r.confidence})  deadline ${r.deadline}`);
    console.log(`     ${r.question}`);
    console.log(`     ${r.explanation}`);
    console.log(`     evidence: ${r.evidence_url || '(none)'}\n`);
  }
} else if (cmd === 'approve' || cmd === 'reject') {
  const id = Number(rest[0]);
  const p = (await db.execute({ sql: "SELECT * FROM resolution_proposals WHERE id = ? AND state = 'pending'", args: [id] })).rows[0];
  if (!p) throw new Error(`no pending proposal #${id}`);
  if (cmd === 'approve') {
    if (p.verdict === 'undetermined') throw new Error('cannot approve an undetermined proposal; use `manual`');
    await applyResolution(db, {
      forecastId: Number(p.forecast_id),
      verdict: p.verdict,
      evidenceUrl: flag('evidence') || p.evidence_url,
      explanation: flag('explanation') || p.explanation,
      method: 'reviewed',
    });
  }
  await db.execute({ sql: 'UPDATE resolution_proposals SET state = ? WHERE id = ?', args: [cmd === 'approve' ? 'applied' : 'rejected', id] });
  console.log(`${cmd}d proposal #${id} for ${publicId(p.forecast_id)}`);
} else if (cmd === 'manual') {
  const forecastId = parsePublicId(rest[0]);
  const verdict = rest[1];
  if (!forecastId || !['yes', 'no', 'void'].includes(verdict)) throw new Error('usage: manual <PR-0001> yes|no|void --evidence <url> --explanation "…"');
  if (verdict === 'void' && !/void policy|unanswerable|cancel/i.test(flag('explanation') || '')) {
    throw new Error('a void must say why the question became unanswerable under the void policy');
  }
  await applyResolution(db, { forecastId, verdict, evidenceUrl: flag('evidence'), explanation: flag('explanation'), method: 'manual' });
  await db.execute({ sql: "UPDATE resolution_proposals SET state = 'superseded' WHERE forecast_id = ? AND state = 'pending'", args: [forecastId] });
  console.log(`${publicId(forecastId)} resolved ${verdict.toUpperCase()}`);
} else {
  console.log('usage: resolve list | approve <id> | reject <id> | manual <PR-0001> yes|no|void --evidence <url> --explanation "…"');
}
