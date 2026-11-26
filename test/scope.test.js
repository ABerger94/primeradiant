import assert from 'node:assert/strict';
import { test } from 'node:test';
import { jaccard, scopeViolations } from '../lib/scope.js';
import { addDays } from './helpers.js';

const good = () => ({
  category: 'Public Health',
  question: 'Will the WHO report more than 500 confirmed human H5N1 cases globally by the deadline?',
  deadline: addDays(60),
  resolution_criteria: 'YES if the WHO cumulative H5N1 table shows more than 500 confirmed human cases reported since 2003… (cumulative count above 1,500).',
  resolution_source_name: 'WHO cumulative H5N1 case table',
  resolution_source_url: 'https://www.who.int/teams/global-influenza-programme',
  base_rate: { reference_class: 'Quarterly H5N1 case growth 2015–2025', kind: 'proportion', value: 0.1, source: 'WHO case tables', source_url: 'https://www.who.int' },
});

test('a well-formed public-health question passes', () => {
  assert.deepEqual(scopeViolations(good()), []);
});

test('named-person health and death are out of scope', () => {
  assert.ok(scopeViolations({ ...good(), question: 'Will the president be hospitalized before the deadline arrives?' }).some((v) => /death or health/.test(v)));
  assert.ok(scopeViolations({ ...good(), question: 'Will the pope die before the end of the deadline window?' }).some((v) => /death or health/.test(v)));
  // population-level deaths are fine
  assert.deepEqual(scopeViolations({ ...good(), question: 'Will reported cholera deaths in Sudan exceed 2,000 by the deadline?' }), []);
});

test('deadline window, base rate citation, source and yes/no form are required', () => {
  assert.ok(scopeViolations({ ...good(), deadline: addDays(2) }).some((v) => /minimum/.test(v)));
  assert.ok(scopeViolations({ ...good(), deadline: addDays(300) }).some((v) => /maximum/.test(v)));
  assert.ok(scopeViolations({ ...good(), base_rate: { ...good().base_rate, source: '' } }).some((v) => /does not publish/.test(v)));
  assert.ok(scopeViolations({ ...good(), resolution_source_url: 'news reports' }).some((v) => /URL/.test(v)));
  assert.ok(scopeViolations({ ...good(), question: 'How many H5N1 cases will WHO report by the deadline?' }).some((v) => /yes\/no/.test(v)));
  assert.ok(scopeViolations({ ...good(), category: 'Sports' }).length);
  assert.ok(scopeViolations(good(), { disabledCategories: ['Public Health'] }).some((v) => /paused/.test(v)));
});

test('jaccard similarity', () => {
  assert.ok(jaccard('Will the Fed cut rates in December 2026?', 'Will the Fed cut rates at the December 2026 meeting?') > 0.55);
  assert.ok(jaccard('Will the Fed cut rates?', 'Will a hurricane hit Florida?') < 0.1);
});
