// Scoring. Every number on the scoreboard is computed here from the locked records —
// nothing is hand-entered. Pure functions; runs in Node and in the browser.
import { LANES, VERDICT_GATE } from './categories.js';

export const LANE_PROB_FIELD = {
  forecaster: 'forecaster_prob',
  market: 'market_prob',
  actuary: 'actuary_prob',
};

export function brier(p, outcome) {
  return (p - outcome) ** 2;
}

/** A record counts for scoring only if it resolved YES or NO (voids are shown, never scored). */
export function isScorable(r) {
  return (r.status === 'resolved-yes' || r.status === 'resolved-no') && (r.outcome === 0 || r.outcome === 1);
}

export function laneProb(r, lane) {
  const v = r[LANE_PROB_FIELD[lane]];
  return v === null || v === undefined ? null : Number(v);
}

/** Per-record Brier for each lane that priced it. */
export function recordScores(r) {
  if (!isScorable(r)) return null;
  const out = {};
  for (const lane of LANES) {
    const p = laneProb(r, lane);
    out[lane] = p === null ? null : brier(p, r.outcome);
  }
  return out;
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function calibration(pairs, buckets = 10) {
  // pairs: [{p, o}]. Bucket i covers [i/b, (i+1)/b); p = 1.0 falls in the last bucket.
  const out = Array.from({ length: buckets }, (_, i) => ({
    lo: i / buckets,
    hi: (i + 1) / buckets,
    n: 0,
    yes: 0,
    meanProb: null,
    observed: null,
    _ps: [],
  }));
  for (const { p, o } of pairs) {
    const i = Math.min(buckets - 1, Math.floor(p * buckets));
    out[i].n += 1;
    out[i].yes += o;
    out[i]._ps.push(p);
  }
  return out.map(({ _ps, ...b }) => ({
    ...b,
    meanProb: b.n ? mean(_ps) : null,
    observed: b.n ? b.yes / b.n : null,
  }));
}

/** One lane's standing over every resolved forecast that lane priced. */
export function laneStanding(records, lane) {
  const pairs = [];
  for (const r of records) {
    if (!isScorable(r)) continue;
    const p = laneProb(r, lane);
    if (p === null) continue;
    pairs.push({ p, o: r.outcome });
  }
  const scores = pairs.map(({ p, o }) => brier(p, o));
  return {
    lane,
    resolved: pairs.length,
    priced: records.filter((r) => laneProb(r, lane) !== null).length,
    brier: mean(scores),
    calibration: calibration(pairs),
    verdict: pairs.length >= VERDICT_GATE ? 'VERDICT' : 'PROVISIONAL',
    remainingToGate: Math.max(0, VERDICT_GATE - pairs.length),
  };
}

/**
 * Head-to-head on shared questions only: both lanes priced it and it resolved.
 * delta = brier(a) - brier(b); negative means lane a is better (lower Brier).
 */
export function headToHead(records, a, b) {
  const shared = records.filter((r) => isScorable(r) && laneProb(r, a) !== null && laneProb(r, b) !== null);
  const sa = shared.map((r) => brier(laneProb(r, a), r.outcome));
  const sb = shared.map((r) => brier(laneProb(r, b), r.outcome));
  let aWins = 0;
  let bWins = 0;
  let ties = 0;
  sa.forEach((x, i) => {
    if (Math.abs(x - sb[i]) < 1e-12) ties += 1;
    else if (x < sb[i]) aWins += 1;
    else bWins += 1;
  });
  const ba = mean(sa);
  const bb = mean(sb);
  return {
    a,
    b,
    shared: shared.length,
    brierA: ba,
    brierB: bb,
    delta: shared.length ? ba - bb : null,
    // Brier skill score of a relative to b: 1 - BS_a / BS_b. Positive means a beats b.
    skill: shared.length && bb > 0 ? 1 - ba / bb : null,
    aWins,
    bWins,
    ties,
    verdict: shared.length >= VERDICT_GATE ? 'VERDICT' : 'PROVISIONAL',
  };
}

export function scoreboard(records) {
  const lanes = Object.fromEntries(LANES.map((l) => [l, laneStanding(records, l)]));
  return {
    gate: VERDICT_GATE,
    totals: {
      forecasts: records.length,
      open: records.filter((r) => r.status === 'open').length,
      resolved: records.filter(isScorable).length,
      void: records.filter((r) => r.status === 'void').length,
    },
    lanes,
    headToHead: {
      forecasterVsMarket: headToHead(records, 'forecaster', 'market'),
      forecasterVsActuary: headToHead(records, 'forecaster', 'actuary'),
    },
    headline: headline(records),
  };
}

const NAMES = { forecaster: 'the Forecaster', market: 'the Market', actuary: 'the Actuary' };
const cap = (s) => s[0].toUpperCase() + s.slice(1);

/** The front-page sentence. Says only what the data can support. */
export function headline(records) {
  const fm = headToHead(records, 'forecaster', 'market');
  const fa = headToHead(records, 'forecaster', 'actuary');
  const h = fm.shared > 0 ? fm : fa;
  if (h.shared === 0) {
    return { text: 'No forecast has resolved yet. The record starts now.', provisional: true, n: 0 };
  }
  const plural = h.shared === 1 ? 'resolution' : 'resolutions';
  const shared = h === fm ? ' shared' : '';
  if (Math.abs(h.delta) < 0.0005) {
    return {
      text: `${cap(NAMES[h.a])} and ${NAMES[h.b]} are level through ${h.shared}${shared} ${plural}.`,
      provisional: h.verdict !== 'VERDICT',
      n: h.shared,
    };
  }
  const [lead, trail] = h.delta < 0 ? [h.a, h.b] : [h.b, h.a];
  return {
    text: `${cap(NAMES[lead])} leads ${NAMES[trail]} by ${Math.abs(h.delta).toFixed(3)} Brier through ${h.shared}${shared} ${plural}.`,
    provisional: h.verdict !== 'VERDICT',
    n: h.shared,
  };
}
