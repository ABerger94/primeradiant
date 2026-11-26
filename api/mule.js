// GET /api/mule — events outside every model, with post-mortems.
import { loadMule } from '../lib/records.js';
import { db, handle, send } from './_util.js';

export default handle(async (_q, res) => {
  send(res, 200, { entries: await loadMule(db()) });
});
