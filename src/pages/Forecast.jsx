import { Link, useParams } from 'react-router-dom';
import LaneBars from '../components/LaneBars.jsx';
import { CategoryTag, ErrorNote, LaneName, Loading, Outcome } from '../components/ui.jsx';
import { useApi } from '../lib/api.js';
import { brierFmt, countdown, dateFmt, dateTimeFmt, pct } from '../lib/format.js';

export default function Forecast() {
  const { id } = useParams();
  const { data, error, loading } = useApi(`/api/forecast?id=${encodeURIComponent(id)}`);
  if (loading) return <Loading />;
  if (error) return <ErrorNote error={error} />;
  const r = data.record;
  const br = r.base_rate || {};
  const d = r.reasoning_detail || {};
  const cd = countdown(r.deadline);

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <Link to="/vault" className="text-xs text-muted no-underline hover:text-ivory">← The Vault</Link>
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <CategoryTag category={r.category} />
          <span className="num text-xs text-faint">{r.public_id}</span>
        </div>
        <h1 className="font-display text-3xl font-semibold leading-tight text-gold-bright sm:text-4xl">{r.question}</h1>
        <div className="num mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
          <span>Locked {dateTimeFmt(r.created_at)}</span>
          <span>Deadline {dateFmt(r.deadline)}</span>
          <span>{r.status === 'open' ? (r.awaiting_resolution ? 'Awaiting resolution' : cd.text) : <Outcome status={r.status} />}</span>
        </div>
      </div>

      <section className="panel p-5">
        <p className="eyebrow mb-3">The three lanes, at lock</p>
        <LaneBars record={r} showScores={!!r.scores} />
        {r.market && (
          <p className="mt-4 text-xs text-faint">
            Market: Polymarket “{r.market.question}”, YES snapshotted {dateTimeFmt(r.market.snapshot_at)} ·{' '}
            <a href={r.market.url} target="_blank" rel="noreferrer" className="text-gold-dim hover:underline">market</a>
          </p>
        )}
        {!r.market && <p className="mt-4 text-xs text-faint">No Polymarket market asked this exact question, so the Market lane does not score it.</p>}
      </section>

      {r.status !== 'open' && (
        <section className="panel border-gold/30 p-5">
          <p className="eyebrow mb-2">Resolution · {dateTimeFmt(r.resolved_at)} · {r.resolution_method}</p>
          <div className="mb-2"><Outcome status={r.status} /></div>
          <p className="text-sm leading-relaxed text-ivory">{r.resolution_explanation}</p>
          <a href={r.evidence} target="_blank" rel="noreferrer" className="mt-2 inline-block break-all text-xs text-gold hover:underline">
            Evidence: {r.evidence}
          </a>
        </section>
      )}

      <section className="panel space-y-4 p-5">
        <div>
          <p className="eyebrow mb-1">Resolves YES if</p>
          <p className="text-sm leading-relaxed text-ivory">{r.resolution_criteria}</p>
        </div>
        <div>
          <p className="eyebrow mb-1">Resolution source</p>
          <a href={r.resolution_source.url} target="_blank" rel="noreferrer" className="text-sm text-gold hover:underline">
            {r.resolution_source.name}
          </a>
        </div>
      </section>

      <section className="panel space-y-5 p-5">
        <div>
          <p className="eyebrow mb-2">Step 1–2 · Reference class & base rate</p>
          <p className="text-sm text-ivory">{br.reference_class}</p>
          <p className="num mt-1 text-xs text-muted">
            {br.kind === 'annual_rate' ? `${br.value} qualifying events / year` : `${pct(br.value)} of past cases`} · {br.evidence}
          </p>
          <p className="mt-1 text-xs text-faint">
            Source:{' '}
            <a href={br.source_url} target="_blank" rel="noreferrer" className="text-gold-dim hover:underline">{br.source}</a>
            {' '}→ <LaneName lane="actuary" short /> prices it at <span className="num text-ivory">{pct(r.actuary_prob)}</span>
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="eyebrow mb-2">Step 3 · Reasons higher</p>
            <ul className="space-y-1.5 text-sm text-ivory/90">{(d.for || []).map((x, i) => <li key={i}>↑ {x}</li>)}</ul>
          </div>
          <div>
            <p className="eyebrow mb-2">Step 3 · Reasons lower</p>
            <ul className="space-y-1.5 text-sm text-ivory/90">{(d.against || []).map((x, i) => <li key={i}>↓ {x}</li>)}</ul>
          </div>
        </div>
        <div>
          <p className="eyebrow mb-2">Step 4 · <LaneName lane="forecaster" short /> · {pct(r.forecaster_prob)}</p>
          <p className="text-sm leading-relaxed text-ivory">{r.reasoning}</p>
        </div>
        {r.sources?.length > 0 && (
          <div>
            <p className="eyebrow mb-2">Sources</p>
            <ul className="space-y-1 text-xs">
              {r.sources.map((s, i) => (
                <li key={i}><a href={s.url} target="_blank" rel="noreferrer" className="break-all text-gold-dim hover:underline">{s.title || s.url}</a></li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {r.notes.length > 0 && (
        <section className="panel p-5">
          <p className="eyebrow mb-2">Correction notes</p>
          {r.notes.map((n, i) => (
            <p key={i} className="text-sm text-ivory"><span className="num text-xs text-faint">{dateTimeFmt(n.created_at)}</span> — {n.body}</p>
          ))}
        </section>
      )}

      <section className="num space-y-1 break-all text-[0.65rem] text-faint">
        <p>model {r.model}{r.scores ? ` · Brier F ${brierFmt(r.scores.forecaster)} / M ${brierFmt(r.scores.market)} / A ${brierFmt(r.scores.actuary)}` : ''}</p>
        <p>lock {r.lock_hash}</p>
        <p>chain {r.chain_hash}</p>
      </section>
    </article>
  );
}
