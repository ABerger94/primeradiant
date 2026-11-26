export const pct = (p) => (p === null || p === undefined ? '—' : `${Math.round(p * 100)}%`);
export const brierFmt = (b) => (b === null || b === undefined ? '—' : b.toFixed(3));

export function dateFmt(iso, opts = {}) {
  if (!iso) return '—';
  const d = iso.length === 10 ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC', ...opts });
}

export function dateTimeFmt(iso) {
  return `${new Date(iso).toISOString().replace('T', ' ').slice(0, 16)} UTC`;
}

export function countdown(deadline, now = Date.now()) {
  const ms = new Date(`${deadline}T23:59:59Z`).getTime() - now;
  if (ms <= 0) return { text: 'Deadline passed', past: true };
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  if (d === 0) return { text: `${h}h left`, past: false, soon: true };
  if (d < 14) return { text: `${d}d ${h}h left`, past: false, soon: d < 7 };
  return { text: `${d} days left`, past: false };
}
