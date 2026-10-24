import './MobileTabs.css';

export type View = 'plan' | 'map';

type MobileTabsProps = {
  view: View;
  onChange: (v: View) => void;
};

function PlanIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        d="M5 6h14M5 12h14M5 18h9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MobileTabs({ view, onChange }: MobileTabsProps) {
  return (
    <nav className="mobile-tabs" aria-label="View">
      <button
        type="button"
        className="mobile-tab"
        aria-pressed={view === 'plan'}
        onClick={() => onChange('plan')}
      >
        <PlanIcon />
        <span>Plan</span>
      </button>
      <button
        type="button"
        className="mobile-tab"
        aria-pressed={view === 'map'}
        onClick={() => onChange('map')}
      >
        <MapIcon />
        <span>Map</span>
      </button>
    </nav>
  );
}
