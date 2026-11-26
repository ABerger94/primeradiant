// GET /api/today — the front page: newest batch, resolving this week, recent resolutions, headline.
import { loadRecords } from '../lib/records.js';
import { headline } from '../lib/scoring.js';
import { db, handle, send } from './_util.js';

const DAY = 86400000;

export default handle(async (_q, res) => {
  const records = await loadRecords(db());
  const now = Date.now();
  const latestDay = records.reduce((m, r) => (r.created_at.slice(0, 10) > m ? r.created_at.slice(0, 10) : m), '');
  const todayUtc = new Date().toISOString().slice(0, 10);
  const newest = records.filter((r) => r.created_at.slice(0, 10) === latestDay).sort((a, b) => b.id - a.id);
  const resolvingSoon = records
    .filter((r) => r.status === 'open' && new Date(`${r.deadline}T23:59:59Z`).getTime() - now <= 7 * DAY)
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
  const recentlyResolved = records
    .filter((r) => r.resolved_at && now - new Date(r.resolved_at).getTime() <= 7 * DAY)
    .sort((a, b) => b.resolved_at.localeCompare(a.resolved_at));
  send(res, 200, {
    headline: headline(records),
    latestDay: latestDay || null,
    isToday: latestDay === todayUtc,
    newest,
    resolvingSoon,
    recentlyResolved,
    counts: {
      total: records.length,
      open: records.filter((r) => r.status === 'open').length,
    },
  });
});
