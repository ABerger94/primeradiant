import { openDb, migrate } from '../lib/db.js';

export async function memDb() {
  const db = openDb(':memory:');
  await migrate(db);
  return db;
}

export const addDays = (n, from = new Date()) => new Date(from.getTime() + n * 86400000).toISOString().slice(0, 10);

export function sampleForecast(over = {}) {
  return {
    question: 'Will the US Federal Reserve cut the federal funds target range at its next meeting?',
    category: 'Economy & Markets',
    deadline: addDays(40),
    resolution_criteria: 'YES if the FOMC statement announces a lower target range for the federal funds rate.',
    resolution_source_name: 'Federal Reserve FOMC statements',
    resolution_source_url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
    forecaster_prob: 0.4,
    market_prob: null,
    market_ref: null,
    actuary_prob: 0.3,
    base_rate: { reference_class: 'FOMC meetings 2015–2025', kind: 'proportion', value: 0.3, evidence: '24 of 80', source: 'Federal Reserve', source_url: 'https://www.federalreserve.gov' },
    reasoning: 'Started from 30%; adjusted up for softening labour data.',
    reasoning_detail: { reference_class: 'FOMC meetings', base_rate_statement: '30%', for: ['soft jobs'], against: ['sticky CPI'] },
    sources: [{ title: 'x', url: 'https://example.com' }],
    model: 'test-model',
    ...over,
  };
}
