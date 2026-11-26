import { CATEGORIES } from '../../lib/categories.js';
import { LaneName, PageTitle } from '../components/ui.jsx';

export default function Method() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle eyebrow="The rules, in public" title="Method">
        An AI asked to "predict the future" writes horoscopes unless it is forced to be scored. These are the rules that force it.
      </PageTitle>
      <div className="prose-method">
        <div className="panel border-gold/30 p-5">
          <p className="!opacity-100">
            <strong className="text-gold-bright">The one rule:</strong> every forecast is locked at publication, timestamped, uneditable, and scored in
            public — wins and losses both.
          </p>
        </div>

        <h2>This is an experiment, not an oracle</h2>
        <p>
          The claim here is "this is a scored record", never "the AI sees the future." If the record says the AI is no better than a coin, a base
          rate or a betting market, the scoreboard says so.
        </p>

        <h2>Scope: systems, never individuals</h2>
        <ul>
          <li>Forecasts cover systems and populations: elections, policy, markets, conflicts, technology milestones, climate and disasters, public health.</li>
          <li>Never an individual's personal outcome. Never a named person's death or health.</li>
          <li>Every question is a yes/no question with a deadline between 1 week and 6 months out, resolution criteria written before the outcome is knowable, and a named public source that settles it.</li>
          <li>3–5 new forecasts a day, deadlines spread so resolutions land steadily. If fewer candidates pass every gate, fewer publish — the bar does not lower to hit volume.</li>
        </ul>
        <p>Categories: {CATEGORIES.join(' · ')}.</p>
        <p>
          <strong className="text-ivory">Public Health</strong> is held to extra rules: population-level measures only (case counts, WHO and CDC
          declarations, regulatory decisions, surveillance thresholds), from public-health authorities. Any category whose recent resolutions void
          more than 20% of the time is paused from drafting until question quality recovers.
        </p>

        <h2>Three lanes</h2>
        <ul>
          <li>
            <LaneName lane="forecaster" /> — Gemini. It must work in a fixed order: state the reference class and its base rate; list what is
            different this time, for and against; only then give a probability. A forecast that skips the base rate does not publish. It never
            sees the market price.
          </li>
          <li>
            <LaneName lane="market" /> — Polymarket. Where a live market asks the same question (same event, threshold and deadline), its YES
            price is snapshotted at the moment the forecast locks. The Market only ever scores questions it shares with the Forecaster.
          </li>
          <li>
            <LaneName lane="actuary" /> — base rates only, computed in code. For proportion base rates, the probability is the historical share
            of YES cases. For event-rate base rates, it is the chance of at least one event in the window, <code>1 − e^(−rate × days / 365)</code>.
            Clamped to 1%–99%. No news, no narrative: the control group.
          </li>
        </ul>
        <p>Every base rate must cite where its frequency came from. A base rate that can't be sourced doesn't publish.</p>

        <h2>The lock</h2>
        <ul>
          <li>Publication is the lock. The question, criteria, source, base rate, reasoning and all three probabilities are written once.</li>
          <li>The database itself refuses edits and deletions to forecasts, resolutions, notes and Mule entries.</li>
          <li>Each forecast's locked fields are hashed (<code>sha256</code>), and each hash is chained to the previous forecast's, so altering, inserting or removing any record breaks every hash after it.</li>
          <li>Corrections are new, visibly dated notes attached to the record. The record itself never changes.</li>
          <li>Ids are never reused.</li>
        </ul>

        <h2>Resolution</h2>
        <ul>
          <li>Open forecasts are checked against their named source after the deadline, and a few are checked early in case they have already resolved YES.</li>
          <li>Only high-confidence verdicts with an evidence link apply automatically. Anything uncertain — and every void — waits for a human review.</li>
          <li>Every resolution publishes its evidence link and explanation, so the call can be argued with.</li>
        </ul>

        <h2>The void policy</h2>
        <p>
          A forecast is voided only when it became unanswerable in a way its criteria did not cover — for example, the event was cancelled, or the
          resolution source stopped publishing. Voids are displayed, never hidden, and never scored.
        </p>

        <h2>Scoring</h2>
        <ul>
          <li>
            <strong className="text-ivory">Brier score</strong>, per lane per forecast: <code>(probability − outcome)²</code>, outcome 1 for YES and 0
            for NO. Lower is better. A permanent 50% guess scores <code>0.250</code>; perfect foresight scores <code>0</code>.
          </li>
          <li>
            <strong className="text-ivory">Calibration</strong>: forecasts bucketed by stated probability (0–10%, …, 90–100%); each bucket shows how
            often YES actually happened.
          </li>
          <li>
            <strong className="text-ivory">Head-to-head</strong>: Forecaster vs Market and Forecaster vs Actuary, on shared questions only. Standings
            never mix shared and unshared questions. Skill is <code>1 − Brier(A) / Brier(B)</code>.
          </li>
          <li>
            <strong className="text-ivory">Verdict gate</strong>: no lane and no head-to-head earns a verdict until it has 30 resolved forecasts. Until
            then, standings are labeled PROVISIONAL.
          </li>
          <li>All scores recompute from the locked records on every request. No hand-entered numbers anywhere.</li>
        </ul>

        <h2>The Mule</h2>
        <p>
          Every day the pipeline also looks for major events that no forecast touched. They're published on The Mule page with a post-mortem, as
          a record of what the lanes were not looking at.
        </p>

        <h2>Check it yourself</h2>
        <p>
          The full record — every forecast exactly as hashed, every resolution, every note — is at <a href="/api/export" className="text-gold hover:underline"><code>/api/export</code></a>.
          Recompute every hash and score from it; the repository's <code>npm run verify -- &lt;export URL&gt;</code> does exactly that.
        </p>

        <h2>Known limits</h2>
        <ul>
          <li>Polymarket covers only some questions, so the Market lane's sample is smaller and reaches its verdict gate later.</li>
          <li>Some questions resolve messily. The named-source rule and the void policy exist for that.</li>
          <li>Base rates are proposed by the model with a cited source; the pipeline checks the source exists, but cannot check every number. The citation is published so it can be checked.</li>
          <li>Gemini's free tier caps daily volume.</li>
        </ul>
      </div>
    </div>
  );
}
