import { useState } from 'react';
import { pct } from '../lib/format.js';
import { LANE_COLOR, LaneName } from './ui.jsx';

const LANES = ['forecaster', 'market', 'actuary'];
const W = 420;
const H = 420;
const M = { t: 16, r: 16, b: 44, l: 48 };
const iw = W - M.l - M.r;
const ih = H - M.t - M.b;
const x = (p) => M.l + p * iw;
const y = (p) => M.t + (1 - p) * ih;

function Marker({ lane, cx, cy, r }) {
  const c = LANE_COLOR[lane];
  const ring = { stroke: 'var(--color-panel)', strokeWidth: 2 };
  if (lane === 'market') return <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} rx={1.5} fill={c} {...ring} />;
  if (lane === 'actuary') return <path d={`M${cx} ${cy - r * 1.25} L${cx + r * 1.25} ${cy} L${cx} ${cy + r * 1.25} L${cx - r * 1.25} ${cy}Z`} fill={c} {...ring} />;
  return <circle cx={cx} cy={cy} r={r} fill={c} {...ring} />;
}

/** Stated probability (x) vs how often YES happened (y). On the diagonal = calibrated. */
export default function CalibrationChart({ lanes }) {
  const [hover, setHover] = useState(null);
  const [table, setTable] = useState(false);
  const series = LANES.map((lane) => ({ lane, points: lanes[lane].calibration.filter((b) => b.n > 0) }));
  const any = series.some((s) => s.points.length);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
        {LANES.map((l) => (
          <LaneName key={l} lane={l} />
        ))}
        <button type="button" onClick={() => setTable((t) => !t)} className="ml-auto rounded-full border border-line px-3 py-1 text-muted hover:text-ivory">
          {table ? 'Show chart' : 'Show table'}
        </button>
      </div>
      {table ? (
        <CalibrationTable lanes={lanes} />
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full max-w-[520px]" role="img" aria-label="Calibration chart: stated probability against observed frequency for each lane">
            {[0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => (
              <g key={t}>
                <line x1={x(0)} x2={x(1)} y1={y(t)} y2={y(t)} stroke="rgba(236,229,210,0.07)" />
                <text x={M.l - 10} y={y(t) + 4} textAnchor="end" className="num" fontSize="11" fill="var(--color-faint)">
                  {Math.round(t * 100)}%
                </text>
                <text x={x(t)} y={H - M.b + 18} textAnchor="middle" className="num" fontSize="11" fill="var(--color-faint)">
                  {Math.round(t * 100)}%
                </text>
              </g>
            ))}
            <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke="var(--color-gold-dim)" strokeDasharray="4 5" strokeWidth="1.5" />
            <text x={x(0.62)} y={y(0.68)} fontSize="11" fill="var(--color-gold-dim)" transform={`rotate(-45 ${x(0.62)} ${y(0.68)})`}>
              perfectly calibrated
            </text>
            <text x={M.l + iw / 2} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--color-muted)">
              Stated probability
            </text>
            <text x={14} y={M.t + ih / 2} textAnchor="middle" fontSize="11" fill="var(--color-muted)" transform={`rotate(-90 14 ${M.t + ih / 2})`}>
              Resolved YES
            </text>
            {series.map(({ lane, points }) => (
              <g key={lane}>
                {points.length > 1 && (
                  <polyline
                    points={points.map((b) => `${x(b.meanProb)},${y(b.observed)}`).join(' ')}
                    fill="none"
                    stroke={LANE_COLOR[lane]}
                    strokeWidth="2"
                    strokeLinejoin="round"
                    opacity={hover && hover.lane !== lane ? 0.25 : 0.9}
                  />
                )}
                {points.map((b) => (
                  <g key={b.lo} opacity={hover && hover.lane !== lane ? 0.3 : 1}>
                    <Marker lane={lane} cx={x(b.meanProb)} cy={y(b.observed)} r={Math.min(9, 4 + Math.sqrt(b.n))} />
                    <circle
                      cx={x(b.meanProb)}
                      cy={y(b.observed)}
                      r={14}
                      fill="transparent"
                      onMouseEnter={() => setHover({ lane, b })}
                      onMouseLeave={() => setHover(null)}
                      onFocus={() => setHover({ lane, b })}
                      onBlur={() => setHover(null)}
                      tabIndex={0}
                    />
                  </g>
                ))}
              </g>
            ))}
          </svg>
          {hover && (
            <div
              className="panel num pointer-events-none absolute z-10 px-3 py-2 text-xs"
              style={{ left: `min(calc(${(x(hover.b.meanProb) / W) * 100}% + 12px), calc(100% - 11rem))`, top: `${(y(hover.b.observed) / H) * 100}%` }}
            >
              <div className="mb-1 font-sans text-muted">
                <LaneName lane={hover.lane} />
              </div>
              <div className="text-ivory">
                Bucket {pct(hover.b.lo)}–{pct(hover.b.hi)}
              </div>
              <div className="text-muted">
                said {pct(hover.b.meanProb)} · happened {pct(hover.b.observed)}
              </div>
              <div className="text-faint">n = {hover.b.n}</div>
            </div>
          )}
          {!any && <p className="mt-2 text-sm text-faint">No resolved forecasts yet — the chart fills as reality reports in.</p>}
        </div>
      )}
    </div>
  );
}

function CalibrationTable({ lanes }) {
  const buckets = lanes.forecaster.calibration;
  return (
    <div className="overflow-x-auto">
      <table className="num w-full min-w-[30rem] text-xs">
        <thead>
          <tr className="text-left text-faint">
            <th className="py-2 font-normal">Bucket</th>
            {LANES.map((l) => (
              <th key={l} className="py-2 font-normal">
                <LaneName lane={l} short /> <span className="text-faint">(n · YES rate)</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {buckets.map((b, i) => (
            <tr key={b.lo} className="border-t border-line/50 text-ivory">
              <td className="py-1.5 text-muted">
                {pct(b.lo)}–{pct(b.hi)}
              </td>
              {LANES.map((l) => {
                const c = lanes[l].calibration[i];
                return <td key={l}>{c.n ? `${c.n} · ${pct(c.observed)}` : <span className="text-faint">—</span>}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
