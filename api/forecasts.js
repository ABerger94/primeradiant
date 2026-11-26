// GET /api/forecasts?status=open|resolved|void|all&category=…
import { loadRecords } from '../lib/records.js';
import { db, handle, send } from './_util.js';

export default handle(async (q, res) => {
  let records = await loadRecords(db());
  const status = q.status || 'all';
  if (status === 'open') records = records.filter((r) => r.status === 'open');
  else if (status === 'resolved') records = records.filter((r) => r.status !== 'open');
  else if (status === 'void') records = records.filter((r) => r.status === 'void');
  if (q.category) records = records.filter((r) => r.category === q.category);
  if (status === 'open') records.sort((a, b) => a.deadline.localeCompare(b.deadline) || a.id - b.id);
  else records.sort((a, b) => (b.resolved_at || b.created_at).localeCompare(a.resolved_at || a.created_at));
  send(res, 200, { records });
});
