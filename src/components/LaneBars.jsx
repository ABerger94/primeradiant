import { brierFmt, pct } from '../lib/format.js';
import { LANE_COLOR, LaneName } from './ui.jsx';

const LANES = ['forecaster', 'market', 'actuary'];
const FIELD = { forecaster: 'forecaster_prob', market: 'market_prob', actuary: 'actuary_prob' };

/** The three lanes side by side: one thin gauge per lane, value in text ink. */
export default function LaneBars({ record, showScores = false }) {
  const outcome = record.outcome;
  return (
    <div className="space-y-2">
      {LANES.map((lane) => {
        const p = record[FIELD[lane]];
        const score = record.scores?.[lane];
        return (
          <div key={lane} className="grid grid-cols-[6.2rem_1fr_3rem] items-center gap-3 text-xs sm:grid-cols-[7.5rem_1fr_3rem]">
            <span className="text-muted">
              <LaneName lane={lane} short />
            </span>
            <div className="relative h-2 rounded-full bg-white/[0.05]" role="img" aria-label={`${lane} ${pct(p)}`}>
              {p === null ? (
                <div className="absolute inset-0 rounded-full border border-dashed border-faint/40" title="No matching Polymarket market" />
              ) : (
                <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `max(${p * 100}%, 3px)`, background: LANE_COLOR[lane] }} />
              )}
              <div className="absolute inset-y-[-3px] left-1/2 w-px bg-white/15" aria-hidden />
              {outcome !== null && outcome !== undefined && (
                <div
                  className="absolute top-1/2 h-3.5 w-0.5 -translate-y-1/2 rounded bg-ivory"
                  style={{ left: outcome ? 'calc(100% - 2px)' : 0 }}
                  title={`Outcome: ${outcome ? 'YES' : 'NO'}`}
                  aria-hidden
                />
              )}
            </div>
            <span className="num text-right text-ivory">
              {p === null ? <span className="text-faint">n/a</span> : pct(p)}
            </span>
            {showScores && score !== undefined && (
              <span className="num col-span-3 -mt-1 text-right text-[0.65rem] text-faint">{score === null ? '' : `Brier ${brierFmt(score)}`}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
