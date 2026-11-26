import { NavLink, Route, Routes, Link } from 'react-router-dom';
import Forecast from './pages/Forecast.jsx';
import Method from './pages/Method.jsx';
import Mule from './pages/Mule.jsx';
import Resolved from './pages/Resolved.jsx';
import Scoreboard from './pages/Scoreboard.jsx';
import Today from './pages/Today.jsx';
import Vault from './pages/Vault.jsx';
import Radiant from './components/Radiant.jsx';

const NAV = [
  ['/', 'Today'],
  ['/vault', 'The Vault'],
  ['/scoreboard', 'Scoreboard'],
  ['/resolved', 'Resolved'],
  ['/mule', 'The Mule'],
  ['/method', 'Method'],
];

export default function App() {
  return (
    <>
      <div className="starfield" aria-hidden="true" />
      <header className="sticky top-0 z-20 border-b border-line/70 bg-void/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 pt-3 sm:px-6 md:py-3">
          <Link to="/" className="flex shrink-0 items-center gap-2.5 no-underline">
            <Radiant size={30} />
            <span className="font-display text-xl font-semibold tracking-wide text-gold-bright">Prime Radiant</span>
          </Link>
          <nav className="ml-auto hidden gap-1 md:flex" aria-label="Main">
            {NAV.map(([to, label]) => (
              <NavItem key={to} to={to} label={label} />
            ))}
          </nav>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 py-2 md:hidden" aria-label="Main">
          {NAV.map(([to, label]) => (
            <NavItem key={to} to={to} label={label} />
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6">
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/vault" element={<Vault />} />
          <Route path="/scoreboard" element={<Scoreboard />} />
          <Route path="/resolved" element={<Resolved />} />
          <Route path="/mule" element={<Mule />} />
          <Route path="/method" element={<Method />} />
          <Route path="/f/:id" element={<Forecast />} />
          <Route path="*" element={<p className="text-muted">No such page. The Plan does not cover it.</p>} />
        </Routes>
      </main>
      <footer className="border-t border-line/60 py-8 text-center text-xs text-faint">
        <p>
          An experiment, not an oracle. Every forecast is locked at publication and scored in public —{' '}
          <Link to="/method" className="text-gold-dim underline-offset-2 hover:underline">
            the rules
          </Link>{' '}
          ·{' '}
          <a href="/api/export" className="text-gold-dim underline-offset-2 hover:underline">
            full record (JSON)
          </a>
        </p>
      </footer>
    </>
  );
}

function NavItem({ to, label }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `shrink-0 rounded-full px-3 py-1.5 text-sm no-underline transition-colors ${
          isActive ? 'bg-gold/12 text-gold-bright ring-1 ring-gold/30' : 'text-muted hover:text-ivory'
        }`
      }
    >
      {label}
    </NavLink>
  );
}
