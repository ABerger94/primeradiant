// The Mule desk.
//   npm run mule -- list
//   npm run mule -- publish <candidateId> [--postmortem "…"]   (otherwise Gemini drafts one)
//   npm run mule -- dismiss <candidateId>
import { loadRecords } from '../../lib/records.js';
import { createContext } from '../context.js';
import { draftPostmortem } from '../steps/mule.js';

const [cmd, idArg, ...rest] = process.argv.slice(2);
const i = rest.indexOf('--postmortem');
const manual = i >= 0 ? rest[i + 1] : null;
const ctx = await createContext({ needLlm: cmd === 'publish' && !manual });
const { db } = ctx;

if (!cmd || cmd === 'list') {
  const rows = (await db.execute("SELECT * FROM mule_candidates WHERE state = 'flagged' ORDER BY id")).rows;
  if (!rows.length) console.log('No flagged events.');
  for (const r of rows) console.log(`#${r.id} ${r.event_date}  ${r.title}\n   ${r.summary}\n   why: ${r.why_major}\n   ${r.evidence_url}\n`);
} else if (cmd === 'publish' || cmd === 'dismiss') {
  const c = (await db.execute({ sql: "SELECT * FROM mule_candidates WHERE id = ? AND state = 'flagged'", args: [Number(idArg)] })).rows[0];
  if (!c) throw new Error(`no flagged candidate #${idArg}`);
  if (cmd === 'publish') {
    let postmortem = manual;
    let related = [];
    if (!postmortem) {
      const pm = await draftPostmortem(ctx.llm, c, await loadRecords(db));
      postmortem = pm.postmortem;
      related = pm.related_forecast_ids || [];
      console.log(`Drafted post-mortem:\n\n${postmortem}\n`);
    }
    await db.execute({
      sql: 'INSERT INTO mule_entries (created_at, event_date, title, summary, evidence_url, postmortem, related_forecast_ids) VALUES (?,?,?,?,?,?,?)',
      args: [new Date().toISOString(), c.event_date, c.title, c.summary, c.evidence_url, postmortem, JSON.stringify(related)],
    });
  }
  await db.execute({ sql: 'UPDATE mule_candidates SET state = ? WHERE id = ?', args: [cmd === 'publish' ? 'published' : 'dismissed', c.id] });
  console.log(`${cmd}ed #${c.id}`);
} else {
  console.log('usage: mule list | publish <id> [--postmortem "…"] | dismiss <id>');
}
