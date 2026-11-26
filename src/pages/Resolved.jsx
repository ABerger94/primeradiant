import { useMemo, useState } from 'react';
import { CATEGORIES } from '../../lib/categories.js';
import { CardGrid } from '../components/ForecastCard.jsx';
import { Empty, ErrorNote, Loading, PageTitle } from '../components/ui.jsx';
import { useApi } from '../lib/api.js';
import { Filters } from './Vault.jsx';

const bestLane = (r) => {
  if (!r.scores) return null;
  const entries = Object.entries(r.scores).filter(([, v]) => v !== null);
  entries.sort((a, b) => a[1] - b[1]);
  return entries.length && (entries.length < 2 || entries[0][1] < entries[1][1]) ? entries[0][0] : 'tie';
};
// A miss: the Forecaster was on the wrong side of 50%.
const forecasterMissed = (r) => r.scores && (r.forecaster_prob - 0.5) * (r.outcome - 0.5) < 0;

export default function Resolved() {
  const { data, error, loading } = useApi('/api/forecasts?status=resolved');
  const [cat, setCat] = useState('all');
  const [perf, setPerf] = useState('all');
  const records = useMemo(() => {
    let rs = data?.records || [];
    if (cat !== 'all') rs = rs.filter((r) => r.category === cat);
    if (perf === 'void') rs = rs.filter((r) => r.status === 'void');
    else if (perf === 'miss') rs = rs.filter(forecasterMissed);
    else if (perf !== 'all') rs = rs.filter((r) => bestLane(r) === perf);
    return rs;
  }, [data, cat, perf]);

  return (
    <div>
      <PageTitle eyebrow="The full history" title="Resolved">
        Every forecast that has met its deadline or its outcome. Misses are shown at exactly the same size as hits, and voids stay on the record.
      </PageTitle>
      <div className="mb-6 flex flex-col gap-3">
        <Filters label="Category" value={cat} onChange={setCat} options={[['all', 'All categories'], ...CATEGORIES.map((c) => [c, c])]} />
        <Filters
          label="Lane performance"
          value={perf}
          onChange={setPerf}
          options={[
            ['all', 'All outcomes'],
            ['forecaster', 'Forecaster scored best'],
            ['market', 'Market scored best'],
            ['actuary', 'Actuary scored best'],
            ['miss', 'Forecaster misses'],
            ['void', 'Voided'],
          ]}
        />
      </div>
      {loading && <Loading />}
      {error && <ErrorNote error={error} />}
      {data && (records.length ? <CardGrid records={records} /> : <Empty>Nothing here yet. Resolutions arrive as deadlines pass.</Empty>)}
    </div>
  );
}
