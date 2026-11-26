import { Link } from 'react-router-dom';
import { CardGrid } from '../components/ForecastCard.jsx';
import Radiant from '../components/Radiant.jsx';
import { Empty, ErrorNote, Loading, Provisional } from '../components/ui.jsx';
import { useApi } from '../lib/api.js';
import { dateFmt } from '../lib/format.js';

export default function Today() {
  const { data, error, loading } = useApi('/api/today');
  return (
    <div className="space-y-12">
      <section className="relative overflow-hidden rounded-2xl border border-line/70 px-5 py-10 sm:px-10 sm:py-14">
        <div className="pointer-events-none absolute -right-16 -top-16 opacity-25 sm:right-4 sm:top-1/2 sm:-translate-y-1/2 sm:opacity-40">
          <Radiant size={300} spin />
        </div>
        <p className="eyebrow mb-4">Psychohistory, scored</p>
        <h1 className="max-w-2xl font-display text-4xl font-semibold leading-[1.08] text-gold-bright sm:text-6xl">
          Forecasts about systems, locked in public, scored without mercy.
        </h1>
        <p className="mt-5 max-w-xl text-muted">
          An AI forecaster, the prediction market and a base-rate actuary price the same questions. Every forecast is timestamped and uneditable;
          wins and losses are kept side by side.
        </p>
        {loading && <div className="mt-8"><Loading /></div>}
        {data && (
          <div className="mt-8 max-w-2xl rounded-xl border border-gold/25 bg-gold/[0.04] px-5 py-4">
            <p className="eyebrow mb-1.5">Current standing</p>
            <p className="font-display text-2xl leading-snug text-ivory sm:text-[1.7rem]">{data.headline.text}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted">
              {data.headline.provisional && <Provisional n={data.headline.n} />}
              <span className="num">
                {data.counts.total} locked · {data.counts.open} open
              </span>
              <Link to="/scoreboard" className="text-gold underline-offset-2 hover:underline">
                Scoreboard →
              </Link>
            </div>
          </div>
        )}
      </section>

      {error && <ErrorNote error={error} />}
      {data && (
        <>
          <Section
            eyebrow={data.isToday ? 'Locked today' : data.latestDay ? `Latest batch · ${dateFmt(data.latestDay)}` : 'Locked today'}
            title="New forecasts"
          >
            {data.newest.length ? <CardGrid records={data.newest} /> : <Empty>No forecasts locked yet. The first batch publishes on the next pipeline run.</Empty>}
          </Section>
          <Section eyebrow="Within 7 days" title="Resolving this week">
            {data.resolvingSoon.length ? <CardGrid records={data.resolvingSoon} /> : <Empty>Nothing is due this week.</Empty>}
          </Section>
          {data.recentlyResolved.length > 0 && (
            <Section eyebrow="Past 7 days" title="Just resolved">
              <CardGrid records={data.recentlyResolved} />
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Section({ eyebrow, title, children }) {
  return (
    <section>
      <p className="eyebrow mb-1">{eyebrow}</p>
      <h2 className="mb-5 font-display text-3xl font-semibold text-ivory">{title}</h2>
      {children}
    </section>
  );
}
