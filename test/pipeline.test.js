// End-to-end pipeline run against an in-memory database, a fake Gemini and fake sources.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyChain } from '../lib/lock.js';
import { loadRawForecasts, loadRecords } from '../lib/records.js';
import { loadConfig } from '../pipeline/config.js';
import { forecastStage } from '../pipeline/run.js';
import { resolveSweep } from '../pipeline/steps/resolve.js';
import { muleWatch } from '../pipeline/steps/mule.js';
import { addDays, memDb } from './helpers.js';

const cand = (i, over = {}) => ({
  category: ['Geopolitics', 'Tech & AI', 'Public Health', 'Economy & Markets', 'Climate & Disasters', 'US Politics & Policy'][i % 6],
  question: [
    'Will Russia and Ukraine sign a written ceasefire agreement by the deadline?',
    'Will a frontier AI lab release a model scoring above 90% on the GPQA Diamond benchmark?',
    'Will the WHO declare a new Public Health Emergency of International Concern?',
    'Will US CPI year-over-year inflation for the latest month print below 2.5%?',
    'Will a Category 5 Atlantic hurricane make landfall in the United States?',
    'Will the US Senate pass a federal data privacy bill by the deadline?',
    'Will the pope die before the deadline?',
  ][i],
  deadline: addDays([20, 50, 120, 30, 160, 90, 40][i]),
  resolution_criteria: 'YES if the named source publishes the deciding fact on or before the deadline; NO otherwise.',
  resolution_source_name: 'Named official source',
  resolution_source_url: 'https://example.org/source',
  reference_class: 'Comparable situations over the past two decades',
  base_rate_kind: i === 2 ? 'annual_rate' : 'proportion',
  base_rate_value: i === 2 ? 0.5 : 0.2,
  base_rate_evidence: '8 of 40 cases 2000–2025',
  base_rate_source: 'Official historical statistics',
  base_rate_source_url: 'https://example.org/stats',
  polymarket_id: i === 0 ? 'pm1' : '',
  news_urls: ['https://news.example/a'],
  ...over,
});

function fakeLlm({ skipBaseRateOn = -1 } = {}) {
  const calls = [];
  return {
    model: 'fake-gemini',
    calls,
    async json({ system, prompt, schema }) {
      calls.push(system.slice(0, 40));
      const keys = Object.keys(schema.properties);
      if (keys.includes('candidates')) return { candidates: Array.from({ length: 7 }, (_, i) => cand(i)) };
      if (keys.includes('reviews')) {
        const n = (prompt.match(/^\[\d+\]/gm) || []).length;
        return { reviews: Array.from({ length: n }, (_, index) => ({ index, about_system_not_individual: true, no_named_person_death_or_health: true, falsifiable_yes_no: true, resolution_source_is_public_and_named: true, resolvable_without_subjective_judgment: true, outcome_unknown_today: true, base_rate_is_relevant: true, reason: 'ok' })) };
      }
      if (keys.includes('results')) return { results: [] };
      if (keys.includes('probability')) {
        assert.doesNotMatch(prompt, /YES=|yes price|0\.6[0-9]? market/i, 'forecaster must not see the market price');
        const skip = skipBaseRateOn >= 0 && prompt.includes(cand(skipBaseRateOn).question);
        return { reference_class: 'Comparable situations', base_rate_statement: skip ? '' : '20% (official statistics)', differences_for: ['x'], differences_against: ['y'], probability: 35, reasoning_summary: 'Anchored at the 20% base rate and adjusted upward for current conditions described in the digest.', sources: [{ title: 'a', url: 'https://news.example/a' }] };
      }
      if (keys.includes('matches')) return { matches: [{ index: 0, market_id: 'pm1', same_event: true, same_threshold: true, same_deadline: true, reason: 'same' }] };
      if (keys.includes('verdict')) return { verdict: 'yes', confidence: 'high', evidence_url: 'https://example.org/proof', evidence_quote: 'It happened.', explanation: 'The named source reports the YES condition met.' };
      if (keys.includes('events')) return { events: [{ title: 'Surprise event', summary: 's', evidence_url: 'https://news.example/b', why_major: 'w', touched_by_forecast_id: 0 }, { title: 'Covered', summary: 's', evidence_url: 'https://news.example/c', why_major: 'w', touched_by_forecast_id: 1 }] };
      throw new Error(`unexpected schema ${keys}`);
    },
  };
}

const fakeSources = () => ({
  async categoryNews() { return [{ title: 'Headline', url: 'https://news.example/a', source: 'example' }]; },
  async markets() { return [{ id: 'pm1', slug: 'ceasefire', question: 'Russia x Ukraine ceasefire agreement signed?', description: '', end_date: addDays(21), yes: 0.61, event_slug: 'ru-ua' }]; },
  async marketSnapshot(id) { return { id, slug: 'ceasefire', question: 'Russia x Ukraine ceasefire?', end_date: addDays(21), yes: 0.615, event_slug: 'ru-ua' }; },
  async reachable() { return true; },
  async pageText() { return { ok: true, status: 200, text: 'proof' }; },
  async search() { return []; },
});

async function ctxFor(llm, env = {}) {
  return { db: await memDb(), llm, sources: fakeSources(), config: loadConfig(env), log: process.env.DEBUG ? console.log : () => {}, now: new Date(), dryRun: false };
}

test('daily run publishes 3–5 locked, diverse, scope-clean forecasts', async () => {
  const ctx = await ctxFor(fakeLlm({ skipBaseRateOn: 1 }));
  const ingested = { digest: { Geopolitics: [] }, markets: await ctx.sources.markets() };
  const { published, rejected } = await forecastStage(ctx, ingested);
  assert.equal(published.length, 5);
  assert.ok(rejected.some((r) => /pope die/.test(r.candidate.question) && r.stage === 'scope:rules'));
  assert.ok(rejected.some((r) => r.stage === 'price:discipline' && r.reasons.includes('skipped the base rate')));
  const records = await loadRecords(ctx.db);
  assert.equal(new Set(records.map((r) => r.category)).size, 5);
  const cease = records.find((r) => /ceasefire/.test(r.question));
  assert.equal(cease.market_prob, 0.615);
  assert.equal(cease.market.snapshot_at, cease.created_at, 'market snapshot is taken at the lock');
  assert.ok(records.filter((r) => r.id !== cease.id).every((r) => r.market_prob === null));
  const ph = records.find((r) => r.category === 'Public Health');
  assert.ok(ph.actuary_prob > 0.1 && ph.actuary_prob < 0.2, 'annual rate 0.5/yr over ~120 days');
  assert.ok(records.every((r) => r.forecaster_prob === 0.35));
  assert.deepEqual(verifyChain(await loadRawForecasts(ctx.db)), []);

  // A second run the same day respects the daily maximum.
  const again = await forecastStage(ctx, ingested);
  assert.equal(again.published.length, 0);
});

test('resolution sweep: auto-applies high-confidence YES; early checks only', async () => {
  const ctx = await ctxFor(fakeLlm());
  await forecastStage(ctx, { digest: {}, markets: [] });
  const summary = await resolveSweep(ctx);
  assert.equal(summary.checked, 4);
  assert.equal(summary.applied, 4);
  const records = await loadRecords(ctx.db);
  assert.equal(records.filter((r) => r.status === 'resolved-yes').length, 4);
  assert.ok(records.every((r) => r.status === 'open' || r.evidence === 'https://example.org/proof'));
});

test('resolution sweep in review mode queues instead of applying', async () => {
  const ctx = await ctxFor(fakeLlm(), { RESOLUTION_MODE: 'review' });
  await forecastStage(ctx, { digest: {}, markets: [] });
  const s = await resolveSweep(ctx);
  assert.equal(s.applied, 0);
  assert.equal(s.queued, 4);
});

test('mule watch flags only untouched events, once', async () => {
  const ctx = await ctxFor(fakeLlm());
  const flagged = await muleWatch(ctx, { digest: {} }, []);
  assert.deepEqual(flagged.map((f) => f.title), ['Surprise event']);
  assert.equal((await muleWatch(ctx, { digest: {} }, [])).length, 0);
});
