import './Legend.css';
// Kept in sync with the CSS variables in styles.css; MapLibre paint can't read CSS vars.
export const MAP_COLORS = {
  background: '#dbeaf5',
  official: '#2563eb',
  inferred: '#0d9488',
  highlight: '#f59e0b',
  cancelled: '#dc2626',
  stop: '#111827',
  hub: '#0f5ea8',
} as const;

type LegendItem = { label: string; color: string; width: number; dash?: string };

const ITEMS: LegendItem[] = [
  { label: 'Official ferry (solid)', color: MAP_COLORS.official, width: 2.5 },
  { label: 'Inferred service (dashed)', color: MAP_COLORS.inferred, width: 2.5, dash: '6 4' },
  { label: 'Selected journey', color: MAP_COLORS.highlight, width: 5 },
  { label: 'Cancelled (simulated)', color: MAP_COLORS.cancelled, width: 4, dash: '3 3' },
];

export function Legend() {
  return (
    <ul className="map-legend" aria-label="Map legend">
      {ITEMS.map((item) => (
        <li key={item.label}>
          <svg width="28" height="10" aria-hidden="true" focusable="false">
            <line
              x1="1"
              y1="5"
              x2="27"
              y2="5"
              stroke={item.color}
              strokeWidth={item.width}
              strokeDasharray={item.dash}
            />
          </svg>
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}
