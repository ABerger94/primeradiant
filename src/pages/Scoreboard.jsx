import CalibrationChart from '../components/CalibrationChart.jsx';
import { ErrorNote, LaneName, Loading, PageTitle, Provisional } from '../components/ui.jsx';
import { useApi } from '../lib/api.js';
import { brierFmt } from '../lib/format.js';

const LANES = ['forecaster', 'market', 'actuary'];
const BLURB = {
  forecaster: 'Gemini, base rate first, then the news.',
  market: 'Polymarket, snapshotted at the lock. Shared questions only.',
  actuary: 'The reference-class frequency, cold. The control group.',
};

export default function Scoreboard() {
  const { data, error, loading } = useApi('/api/scoreboard');
  return (
    <div>
      <PageTitle eyebrow="Lane standings" title="Scoreboard">
        Average Brier score over resolved forecasts — lower is better; <span className="num text-ivory">0.250</span> is what a permanent 50% guesser
        earns. No lane gets a verdict before {data?.gate ?? 30} resolutions.
      </PageTitle>
      {loading && <Loading />}
      {error && <ErrorNote error={error} />}
      {data && (
        <div className="space-y-10">
          <div className="grid gap-4 md:grid-cols-3">
            {LANES.map((l) => (
              <Standing key={l} s={data.lanes[l]} gate={data.gate} />
            ))}
          </div>

          <section className="panel p-5 sm:p-7">
            <p className="eyebrow mb-1">Head-to-head · shared questions only</p>
            <h2 className="mb-5 font-display text-3xl font-semibold text-ivory">Can the machine beat the market?</h2>
            <div className="grid gap-6 md:grid-cols-2">
              <H2H h={data.headToHead.forecasterVsMarket} gate={data.gate} question="Forecaster vs Market" />
              <H2H h={data.headToHead.forecasterVsActuary} gate={data.gate} question="Forecaster vs Actuary" note="If the Forecaster can't beat the Actuary, the AI is decoration." />
            </div>
          </section>

          <section className="panel p-5 sm:p-7">
            <p className="eyebrow mb-1">Calibration</p>
            <h2 className="mb-2 font-display text-3xl font-semibold text-ivory">Did 70% mean 70%?</h2>
            <p className="mb-5 max-w-2xl text-sm text-muted">
              Forecasts bucketed by stated probability; each point is how often that bucket actually resolved YES. Marker size grows with the bucket's
              count. A calibrated lane hugs the diagonal.
            </p>
            <CalibrationChart lanes={data.lanes} />
          </section>

          <p className="num text-xs text-faint">
            {data.totals.forecasts} locked · {data.totals.open} open · {data.totals.resolved} scored · {data.totals.void} void — recomputed from the
            locked records on every request.
          </p>
        </div>
      )}
    </div>
  );
}

function Standing({ s, gate }) {
  return (
    <div className="panel flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between gap-2 text-sm text-ivory">
        <LaneName lane={s.lane} />
        {s.verdict === 'PROVISIONAL' ? <Provisional n={s.resolved} gate={gate} /> : <span className="eyebrow !text-gold">Verdict</span>}
      </div>
      <div>
        <span className="num text-5xl text-gold-bright">{brierFmt(s.brier)}</span>
        <span className="ml-2 text-xs text-faint">avg Brier</span>
      </div>
      <p className="num text-xs text-muted">
        {s.resolved} resolved of {s.priced} priced
      </p>
      <p className="text-xs text-faint">{BLURB[s.lane]}</p>
    </div>
  );
}

function H2H({ h, gate, question, note }) {
  const lead = h.delta === null ? null : h.delta < 0 ? h.a : h.delta > 0 ? h.b : 'level';
  return (
    <div className="rounded-xl border border-line/70 p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-sm text-ivory">{question}</span>
        {h.verdict === 'PROVISIONAL' ? <Provisional n={h.shared} gate={gate} /> : <span className="eyebrow !text-gold">Verdict</span>}
      </div>
      {h.shared === 0 ? (
        <p className="text-sm text-faint">No shared resolutions yet.</p>
      ) : (
        <>
          <div className="num grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-muted"><LaneName lane={h.a} short /></div>
              <div className="text-2xl text-ivory">{brierFmt(h.brierA)}</div>
            </div>
            <div>
              <div className="text-muted"><LaneName lane={h.b} short /></div>
              <div className="text-2xl text-ivory">{brierFmt(h.brierB)}</div>
            </div>
          </div>
          <p className="mt-3 text-sm text-ivory">
            {lead === 'level' ? 'Level' : <>Lead: <LaneName lane={lead} short /> by <span className="num">{Math.abs(h.delta).toFixed(3)}</span></>}
            <span className="text-faint"> · {h.shared} shared</span>
          </p>
          <p className="num mt-1 text-xs text-muted">
            Question-by-question: {h.aWins}–{h.bWins}
            {h.ties ? ` (${h.ties} tied)` : ''} · skill {h.skill === null ? '—' : `${(h.skill * 100).toFixed(1)}%`}
          </p>
        </>
      )}
      {note && <p className="mt-3 text-xs text-faint">{note}</p>}
    </div>
  );
}
