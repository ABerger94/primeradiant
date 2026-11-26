import { LANE_LABELS } from '../../lib/categories.js';

export const LANE_COLOR = {
  forecaster: 'var(--color-lane-forecaster)',
  market: 'var(--color-lane-market)',
  actuary: 'var(--color-lane-actuary)',
};

// Shape is the second encoding of lane identity — colour is never the only cue.
export function LaneMark({ lane, size = 10 }) {
  const c = LANE_COLOR[lane];
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 10 10" aria-hidden="true" className="shrink-0">
      {lane === 'forecaster' && <circle cx="5" cy="5" r="4.2" fill={c} />}
      {lane === 'market' && <rect x="1" y="1" width="8" height="8" rx="1.2" fill={c} />}
      {lane === 'actuary' && <path d="M5 0.4 9.6 5 5 9.6 0.4 5Z" fill={c} />}
    </svg>
  );
}

export function LaneName({ lane, short }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <LaneMark lane={lane} />
      <span>{short ? LANE_LABELS[lane].replace('The ', '') : LANE_LABELS[lane]}</span>
    </span>
  );
}

export function Provisional({ n, gate = 30 }) {
  return (
    <span
      className="num inline-flex items-center gap-1 rounded-full border border-gold-dim/60 px-2 py-0.5 text-[0.62rem] uppercase tracking-[0.14em] text-gold-dim"
      title={`No verdict until ${gate} resolved forecasts`}
    >
      Provisional{n !== undefined ? ` · ${n}/${gate}` : ''}
    </span>
  );
}

export function CategoryTag({ category }) {
  return <span className="eyebrow !text-muted">{category}</span>;
}

// Outcomes are not green/red: YES is a filled diamond, NO a hollow one.
export function Outcome({ status }) {
  if (status === 'resolved-yes')
    return (
      <span className="num inline-flex items-center gap-1.5 text-sm text-gold-bright">
        <span aria-hidden>◆</span> YES
      </span>
    );
  if (status === 'resolved-no')
    return (
      <span className="num inline-flex items-center gap-1.5 text-sm text-ivory">
        <span aria-hidden>◇</span> NO
      </span>
    );
  if (status === 'void')
    return <span className="num text-sm text-faint line-through decoration-faint/60">VOID</span>;
  return <span className="num text-sm text-muted">OPEN</span>;
}

export function Loading() {
  return <p className="num animate-pulse text-sm text-faint">Reading the record…</p>;
}

export function ErrorNote({ error }) {
  return <p className="text-sm text-muted">The record could not be read ({String(error?.message || error)}).</p>;
}

export function PageTitle({ eyebrow, title, children }) {
  return (
    <div className="mb-8">
      {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
      <h1 className="font-display text-4xl font-semibold leading-tight text-gold-bright sm:text-5xl">{title}</h1>
      {children && <div className="mt-3 max-w-2xl text-muted">{children}</div>}
    </div>
  );
}

export function Empty({ children }) {
  return <div className="panel px-5 py-10 text-center text-sm text-muted">{children}</div>;
}
