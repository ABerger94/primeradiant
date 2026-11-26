// Lane 3: the Actuary. No news, no narrative — the reference-class frequency, extrapolated cold.
// Deterministic: same base rate + same window => same probability, computed in code.

export const ACTUARY_FLOOR = 0.01;
export const ACTUARY_CEIL = 0.99;

const DAY = 86400000;

export function windowDays(createdAt, deadline) {
  const start = new Date(createdAt).getTime();
  const end = new Date(`${deadline}T23:59:59Z`).getTime();
  return Math.max(0, (end - start) / DAY);
}

/**
 * base_rate.kind:
 *  - 'proportion'  : value is the share of past reference-class cases that resolved YES (0..1).
 *  - 'annual_rate' : value is the mean number of qualifying events per year; the probability of
 *                    at least one in the forecast window is 1 - exp(-rate * days / 365) (Poisson).
 */
export function actuaryProbability(baseRate, days) {
  let p;
  if (baseRate.kind === 'proportion') p = Number(baseRate.value);
  else if (baseRate.kind === 'annual_rate') p = 1 - Math.exp((-Number(baseRate.value) * days) / 365);
  else throw new Error(`unknown base rate kind: ${baseRate.kind}`);
  if (!Number.isFinite(p)) throw new Error('base rate produced a non-finite probability');
  p = Math.min(ACTUARY_CEIL, Math.max(ACTUARY_FLOOR, p));
  return Math.round(p * 1000) / 1000;
}
