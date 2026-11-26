// Attach a dated correction note. The forecast itself never changes.
//   npm run note -- PR-0012 "The resolution source moved to …"
import { parsePublicId, publicId } from '../../lib/categories.js';
import { getDb, migrate } from '../../lib/db.js';

const [idArg, ...words] = process.argv.slice(2);
const id = parsePublicId(idArg || '');
const body = words.join(' ').trim();
if (!id || body.length < 5) {
  console.log('usage: note <PR-0001> "text of the note"');
  process.exit(1);
}
const db = getDb();
await migrate(db);
await db.execute({ sql: 'INSERT INTO notes (forecast_id, created_at, body) VALUES (?, ?, ?)', args: [id, new Date().toISOString(), body] });
console.log(`note attached to ${publicId(id)}`);
