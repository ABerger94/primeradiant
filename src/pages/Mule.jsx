import { Link } from 'react-router-dom';
import { Empty, ErrorNote, Loading, PageTitle } from '../components/ui.jsx';
import { useApi } from '../lib/api.js';
import { dateFmt } from '../lib/format.js';
import { publicId } from '../../lib/categories.js';

export default function Mule() {
  const { data, error, loading } = useApi('/api/mule');
  return (
    <div>
      <PageTitle eyebrow="Outside every model" title="The Mule">
        Psychohistory works on populations, and it has a blind spot: the event nobody was modelling. These are the major developments no lane had a
        single forecast touching — each with a short post-mortem on what the lanes were assuming when reality declined to cooperate.
      </PageTitle>
      {loading && <Loading />}
      {error && <ErrorNote error={error} />}
      {data &&
        (data.entries.length ? (
          <div className="space-y-5">
            {data.entries.map((m) => (
              <article key={m.id} className="panel p-5 sm:p-7">
                <p className="eyebrow mb-1">{dateFmt(m.event_date)}</p>
                <h2 className="font-display text-2xl font-semibold text-ivory">{m.title}</h2>
                <p className="mt-2 text-sm text-muted">{m.summary}</p>
                <div className="mt-4 border-l-2 border-gold/40 pl-4">
                  <p className="eyebrow mb-1">Post-mortem</p>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-ivory">{m.postmortem}</p>
                </div>
                <div className="mt-4 flex flex-wrap gap-3 text-xs">
                  <a href={m.evidence_url} target="_blank" rel="noreferrer" className="text-gold hover:underline">Source</a>
                  {m.related_forecast_ids.map((id) => (
                    <Link key={id} to={`/f/${publicId(id)}`} className="num text-gold-dim hover:underline">{publicId(id)}</Link>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty>No Mule yet. When one arrives, it goes here — not under the rug.</Empty>
        ))}
    </div>
  );
}
