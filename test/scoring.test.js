import assert from 'node:assert/strict';
import { test } from 'node:test';
import { actuaryProbability } from '../lib/actuary.js';
import { brier, calibration, headline, headToHead, laneStanding, scoreboard } from '../lib/scoring.js';

const rec = (f, a, m, outcome) => ({
  status: outcome === null ? 'void' : outcome ? 'resolved-yes' : 'resolved-no',
  outcome,
  forecaster_prob: f,
  actuary_prob: a,
  market_prob: m,
});

test('brier', () => {
  assert.equal(brier(0.5, 1), 0.25);
  assert.equal(brier(0.5, 0), 0.25);
  assert.ok(Math.abs(brier(0.9, 1) - 0.01) < 1e-12);
});

test('calibration buckets, p=1 falls in the last bucket', () => {
  const c = calibration([{ p: 0.72, o: 1 }, { p: 0.75, o: 0 }, { p: 1, o: 1 }, { p: 0.05, o: 0 }]);
  assert.equal(c[7].n, 2);
  assert.equal(c[7].observed, 0.5);
  assert.equal(c[9].n, 1);
  assert.equal(c[0].observed, 0);
});

test('voids and open forecasts are never scored', () => {
  const rs = [rec(0.9, 0.5, null, 1), rec(0.9, 0.5, null, null), { status: 'open', outcome: null, forecaster_prob: 0.9, actuary_prob: 0.1, market_prob: null }];
  const s = laneStanding(rs, 'forecaster');
  assert.equal(s.resolved, 1);
  assert.ok(Math.abs(s.brier - 0.01) < 1e-12);
  assert.equal(s.verdict, 'PROVISIONAL');
});

test('head-to-head only counts shared questions', () => {
  const rs = [rec(0.8, 0.5, 0.6, 1), rec(0.2, 0.5, null, 1)];
  const h = headToHead(rs, 'forecaster', 'market');
  assert.equal(h.shared, 1);
  assert.ok(Math.abs(h.delta - (0.04 - 0.16)) < 1e-12);
  assert.equal(h.aWins, 1);
  const m = laneStanding(rs, 'market');
  assert.equal(m.resolved, 1);
});

test('verdict gate at 30', () => {
  const rs = Array.from({ length: 30 }, (_, i) => rec(0.6, 0.5, 0.55, i % 2));
  assert.equal(laneStanding(rs, 'forecaster').verdict, 'VERDICT');
  assert.equal(laneStanding(rs.slice(1), 'forecaster').remainingToGate, 1);
  assert.equal(scoreboard(rs).headToHead.forecasterVsMarket.verdict, 'VERDICT');
});

test('headline', () => {
  assert.match(headline([]).text, /No forecast has resolved yet/);
  const h = headline([rec(0.9, 0.5, 0.6, 1)]);
  assert.match(h.text, /^The Forecaster leads the Market by 0\.150 Brier through 1 shared resolution\.$/);
  assert.equal(h.provisional, true);
  assert.match(headline([rec(0.9, 0.5, null, 0)]).text, /^The Actuary leads the Forecaster/);
});

test('actuary: proportion passes through, annual rate extrapolates by Poisson, clamped', () => {
  assert.equal(actuaryProbability({ kind: 'proportion', value: 0.3 }, 50), 0.3);
  assert.equal(actuaryProbability({ kind: 'annual_rate', value: 2 }, 365 / 2), Math.round((1 - Math.exp(-1)) * 1000) / 1000);
  assert.equal(actuaryProbability({ kind: 'proportion', value: 0 }, 10), 0.01);
  assert.equal(actuaryProbability({ kind: 'annual_rate', value: 80 }, 100), 0.99);
  assert.throws(() => actuaryProbability({ kind: 'vibes', value: 1 }, 1));
});
