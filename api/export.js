// GET /api/export — the full record, raw, exactly as hashed. Re-derive every score yourself.
import { loadMule, loadRawForecasts } from '../lib/records.js';
import { LOCKED_FIELDS } from '../lib/lock.js';
import { plainRows } from '../lib/db.js';
import { db, handle, send } from './_util.js';

export default handle(async (_q, res) => {
  const d = db();
  const [forecasts, resolutions, notes, mule] = await Promise.all([
    loadRawForecasts(d),
    d.execute('SELECT * FROM resolutions ORDER BY forecast_id').then(plainRows),
    d.execute('SELECT * FROM notes ORDER BY id').then(plainRows),
    loadMule(d),
  ]);
  res.setHeader('Content-Disposition', 'inline; filename="prime-radiant-record.json"');
  send(res, 200, {
    generated_at: new Date().toISOString(),
    verification: {
      lock_hash: `sha256 of canonical JSON (keys sorted, no whitespace) of fields: ${LOCKED_FIELDS.join(', ')} — JSON columns hashed as their stored strings`,
      chain_hash: 'sha256("<prev_chain_hash or GENESIS>:<lock_hash>")',
      brier: '(probability - outcome)^2, outcome 1 for YES, 0 for NO; voids excluded',
    },
    forecasts,
    resolutions,
    notes,
    mule,
  });
});
