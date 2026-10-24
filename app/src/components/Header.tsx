import type { Theme } from '../hooks/useTheme';
import './Header.css';

type HeaderProps = {
  fixture: boolean;
  theme: Theme;
  onToggleTheme: () => void;
};

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Header({ fixture, theme, onToggleTheme }: HeaderProps) {
  const toDark = theme === 'light';
  return (
    <header className="app-header">
      <div className="app-header-titles">
        <h1 className="app-title">Maldives Island Journey Planner</h1>
        <p className="app-subtitle">Ferries and inferred speedboats, together</p>
      </div>
      {fixture ? (
        <span className="badge sample">SAMPLE DATA</span>
      ) : (
        <span className="badge">Real data · Aug 2025 evidence</span>
      )}
      <span className="app-header-spacer" />
      <button
        type="button"
        className="btn btn-ghost btn-icon"
        aria-label={toDark ? 'Switch to dark theme' : 'Switch to light theme'}
        onClick={onToggleTheme}
      >
        {toDark ? <MoonIcon /> : <SunIcon />}
      </button>
    </header>
  );
}
