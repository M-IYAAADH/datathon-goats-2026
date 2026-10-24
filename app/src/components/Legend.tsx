import { useEffect, useState } from 'react';
import './Legend.css';

type LegendItem = { label: string; token: string; width: number; dash?: string };

const ITEMS: LegendItem[] = [
  { label: 'Official ferry (solid)', token: '--map-official', width: 2.5 },
  { label: 'Inferred service (dashed)', token: '--map-inferred', width: 2.5, dash: '6 4' },
  { label: 'Selected journey', token: '--map-highlight', width: 5 },
  { label: 'Cancelled (simulated)', token: '--map-cancelled', width: 4, dash: '3 3' },
];

const DESKTOP = '(min-width: 768px)';

function isDesktop(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(DESKTOP).matches;
}

export function Legend() {
  const [open, setOpen] = useState(isDesktop);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(DESKTOP);
    const onChange = () => setOpen(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return (
    <details className="map-legend" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <b>Legend</b>
      </summary>
      <ul aria-label="Map legend">
        {ITEMS.map((item) => (
          <li key={item.label}>
            <svg width="20" height="10" aria-hidden="true" focusable="false">
              <line
                x1="1"
                y1="5"
                x2="19"
                y2="5"
                style={{ stroke: `var(${item.token})` }}
                strokeWidth={item.width}
                strokeDasharray={item.dash}
              />
            </svg>
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
