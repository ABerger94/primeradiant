// Recompute every lock hash and the chain, from the database or from a public export.
//   npm run verify                      (database in TURSO_DATABASE_URL)
//   npm run verify -- https://…/api/export
import { getDb } from '../../lib/db.js';
import { verifyChain } from '../../lib/lock.js';
import { loadRawForecasts } from '../../lib/records.js';

const src = process.argv[2];
const rows = src ? (await (await fetch(src)).json()).forecasts : await loadRawForecasts(getDb());
const problems = verifyChain(rows);
if (problems.length) {
  console.error(`✗ ${problems.length} problem(s):\n${problems.join('\n')}`);
  process.exit(1);
}
console.log(`✓ ${rows.length} forecasts verified; chain head ${rows.at(-1)?.chain_hash || '(empty)'}`);
