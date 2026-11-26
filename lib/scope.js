// The psychohistory constraint, as code. A candidate that fails any rule does not publish.
// The LLM scope review (pipeline/steps/draft.js) runs in addition to these checks, never instead.
import { CATEGORIES } from './categories.js';

export const MIN_DAYS = 7;
export const MAX_DAYS = 183;

// A named person's death or health is never a forecast. These terms reject outright;
// population-level phrasing ("cholera deaths exceed 1,000") stays allowed.
const PERSONAL_FATE = /\b(dies?|died|dying|death of|pass(es)? away|assassinat\w*|hospitali[sz]ed|incapacitat\w*|(still|remain|stays?) alive|his health|her health|their health|terminal(ly)? ill)\b/i;

// Personal outcomes rather than systems: a single individual's life events.
const PERSONAL_OUTCOME = /\b(get(s)? (married|divorced|pregnant)|have a baby|personal life|go(es)? to (jail|prison) for (his|her))\b/i;

const isUrl = (s) => typeof s === 'string' && /^https?:\/\/[^\s]+\.[^\s]+/.test(s);
const DAY = 86400000;

export function daysUntil(deadline, now = new Date()) {
  const end = new Date(`${deadline}T23:59:59Z`).getTime();
  return (end - now.getTime()) / DAY;
}

/** Returns a list of human-readable violations; empty list means the candidate passes. */
export function scopeViolations(c, { now = new Date(), disabledCategories = [] } = {}) {
  const v = [];
  if (!CATEGORIES.includes(c.category)) v.push(`category "${c.category}" is not a v1 category`);
  if (disabledCategories.includes(c.category)) v.push(`category "${c.category}" is paused`);

  const q = (c.question || '').trim();
  if (q.length < 20 || q.length > 300) v.push('question must be 20–300 characters');
  if (!q.endsWith('?')) v.push('question must be a yes/no question ending in "?"');
  if (!/^(will|is|are|does|do|has|have|can|shall|would)\b/i.test(q)) v.push('question must be phrased as yes/no ("Will …?")');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.deadline || '') || Number.isNaN(new Date(`${c.deadline}T00:00:00Z`).getTime())) {
    v.push('deadline must be a YYYY-MM-DD date');
  } else {
    const d = daysUntil(c.deadline, now);
    if (d < MIN_DAYS) v.push(`deadline is ${d.toFixed(1)} days out; minimum is ${MIN_DAYS}`);
    if (d > MAX_DAYS + 1) v.push(`deadline is ${d.toFixed(0)} days out; maximum is ${MAX_DAYS}`);
  }

  if (!c.resolution_criteria || c.resolution_criteria.trim().length < 30) v.push('resolution criteria missing or too thin');
  if (!c.resolution_source_name || !c.resolution_source_name.trim()) v.push('no named resolution source');
  if (!isUrl(c.resolution_source_url)) v.push('resolution source needs a public URL');

  const br = c.base_rate || {};
  if (!br.reference_class || br.reference_class.trim().length < 10) v.push('no reference class stated');
  if (br.kind === 'proportion') {
    if (!(br.value >= 0 && br.value <= 1)) v.push('proportion base rate must be within 0..1');
  } else if (br.kind === 'annual_rate') {
    if (!(br.value >= 0 && br.value <= 100)) v.push('annual-rate base rate must be within 0..100 events/yr');
  } else {
    v.push('base rate kind must be "proportion" or "annual_rate"');
  }
  if (!br.source || br.source.trim().length < 5) v.push('base rate has no cited source — it does not publish');
  if (!isUrl(br.source_url)) v.push('base rate source needs a URL');

  const text = `${q} ${c.resolution_criteria || ''}`;
  if (PERSONAL_FATE.test(text)) v.push("touches an individual's death or health — out of scope");
  if (PERSONAL_OUTCOME.test(text)) v.push("about an individual's personal outcome — out of scope");

  return v;
}

const STOP = new Set(
  'will the a an of in on by to be is are and or for at as with from than more less before after end its it this that which who what when 2025 2026 2027 any least'.split(' '),
);

export function tokens(s) {
  return new Set(
    String(s)
      .toLowerCase()
      .replace(/[^a-z0-9%$. ]+/g, ' ')
      .split(/\s+/)
      .map((t) => t.replace(/\.$/, ''))
      .filter((t) => t.length > 1 && !STOP.has(t)),
  );
}

export function jaccard(a, b) {
  const A = a instanceof Set ? a : tokens(a);
  const B = b instanceof Set ? b : tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  return inter / (A.size + B.size - inter);
}
