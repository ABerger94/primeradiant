// GET /api/forecast?id=PR-0012
import { parsePublicId } from '../lib/categories.js';
import { loadRecords } from '../lib/records.js';
import { db, handle, send } from './_util.js';

export default handle(async (q, res) => {
  const id = parsePublicId(q.id);
  if (!id) return send(res, 400, { error: 'bad id' });
  const [record] = await loadRecords(db(), { id });
  if (!record) return send(res, 404, { error: 'not found' });
  send(res, 200, { record });
});
