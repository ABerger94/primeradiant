import { Link } from 'react-router-dom';
import { brierFmt, countdown, dateFmt } from '../lib/format.js';
import LaneBars from './LaneBars.jsx';
import { CategoryTag, LaneMark, Outcome } from './ui.jsx';

export default function ForecastCard({ record }) {
  const open = record.status === 'open';
  const cd = countdown(record.deadline);
  return (
    <article className="panel group flex flex-col gap-4 p-5 transition-colors hover:border-gold-dim/60">
      <div className="flex items-center justify-between gap-3">
        <CategoryTag category={record.category} />
        <span className="num text-[0.7rem] text-faint">{record.public_id}</span>
      </div>
      <h3 className="font-display text-[1.35rem] font-semibold leading-snug text-ivory">
        <Link to={`/f/${record.public_id}`} className="no-underline after:absolute after:inset-0 group-hover:text-gold-bright">
          {record.question}
        </Link>
      </h3>
      <LaneBars record={record} />
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-3 text-xs">
        {open ? (
          <>
            <span className="text-muted">Resolves {dateFmt(record.deadline)}</span>
            <span className={`num ${record.awaiting_resolution ? 'text-gold' : cd.soon ? 'text-gold-bright' : 'text-muted'}`}>
              {record.awaiting_resolution ? 'Awaiting resolution' : cd.text}
            </span>
          </>
        ) : (
          <>
            <Outcome status={record.status} />
            {record.scores ? (
              <span className="num flex gap-3 text-muted">
                {['forecaster', 'market', 'actuary'].map((l) =>
                  record.scores[l] === null ? null : (
                    <span key={l} className="inline-flex items-center gap-1" title={`${l} Brier`}>
                      <LaneMark lane={l} size={8} /> {brierFmt(record.scores[l])}
                    </span>
                  ),
                )}
              </span>
            ) : (
              <span className="text-faint">Not scored</span>
            )}
          </>
        )}
      </div>
    </article>
  );
}

export function CardGrid({ records }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {records.map((r) => (
        <div key={r.id} className="relative flex">
          <ForecastCard record={r} />
        </div>
      ))}
    </div>
  );
}
