// GET /api/scoreboard — every number recomputed from the locked records on each request.
import { loadRecords } from '../lib/records.js';
import { scoreboard } from '../lib/scoring.js';
import { db, handle, send } from './_util.js';

export default handle(async (_q, res) => {
  const records = await loadRecords(db());
  send(res, 200, scoreboard(records));
});
