import { useMemo, useState } from 'react';
import { CATEGORIES } from '../../lib/categories.js';
import { CardGrid } from '../components/ForecastCard.jsx';
import { Empty, ErrorNote, Loading, PageTitle } from '../components/ui.jsx';
import { useApi } from '../lib/api.js';

export function Filters({ value, onChange, options, label }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={`rounded-full px-3 py-1 text-xs transition-colors ${
            value === v ? 'bg-gold/15 text-gold-bright ring-1 ring-gold/40' : 'text-muted ring-1 ring-line hover:text-ivory'
          }`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

export default function Vault() {
  const { data, error, loading } = useApi('/api/forecasts?status=open');
  const [cat, setCat] = useState('all');
  const [sort, setSort] = useState('deadline');
  const records = useMemo(() => {
    let rs = data?.records || [];
    if (cat !== 'all') rs = rs.filter((r) => r.category === cat);
    if (sort === 'newest') rs = [...rs].sort((a, b) => b.id - a.id);
    if (sort === 'split') rs = [...rs].sort((a, b) => Math.abs(b.forecaster_prob - b.actuary_prob) - Math.abs(a.forecaster_prob - a.actuary_prob));
    return rs;
  }, [data, cat, sort]);

  return (
    <div>
      <PageTitle eyebrow="Every open forecast" title="The Vault">
        The record is the product. Each question below was locked at publication — its wording, criteria and all three lanes' probabilities are
        frozen until reality reports.
      </PageTitle>
      <div className="mb-6 flex flex-col gap-3">
        <Filters label="Category" value={cat} onChange={setCat} options={[['all', 'All categories'], ...CATEGORIES.map((c) => [c, c])]} />
        <Filters
          label="Sort"
          value={sort}
          onChange={setSort}
          options={[
            ['deadline', 'Soonest deadline'],
            ['newest', 'Newest'],
            ['split', 'Forecaster vs Actuary split'],
          ]}
        />
      </div>
      {loading && <Loading />}
      {error && <ErrorNote error={error} />}
      {data && (records.length ? <CardGrid records={records} /> : <Empty>No open forecasts{cat !== 'all' ? ` in ${cat}` : ''}.</Empty>)}
    </div>
  );
}
