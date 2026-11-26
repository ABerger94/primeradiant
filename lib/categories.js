// The v1 categories. Public Health is the sixth, admitted with extra scope rules
// (populations only; never a named person's health) and watched by the void-rate guard.
export const CATEGORIES = [
  'Geopolitics',
  'US Politics & Policy',
  'Economy & Markets',
  'Tech & AI',
  'Climate & Disasters',
  'Public Health',
];

export const CATEGORY_SLUGS = Object.fromEntries(
  CATEGORIES.map((c) => [c, c.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-')]),
);

export const LANES = ['forecaster', 'market', 'actuary'];

export const LANE_LABELS = {
  forecaster: 'The Forecaster',
  market: 'The Market',
  actuary: 'The Actuary',
};

// Verdict gate: no lane (and no head-to-head) earns a verdict below this many resolved forecasts.
export const VERDICT_GATE = 30;

export function publicId(id) {
  return `PR-${String(id).padStart(4, '0')}`;
}

export function parsePublicId(s) {
  const m = String(s).match(/^(?:PR-)?0*(\d+)$/i);
  return m ? Number(m[1]) : null;
}
