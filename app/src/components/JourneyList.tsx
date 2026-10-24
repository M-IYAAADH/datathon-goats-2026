import type { TimeRange } from '../data/load';
import { formatHHMM, type Journey } from '../data/planner';
import './JourneyList.css';

type Props = { journeys: Journey[]; searched: boolean };

const ARROW = '→';
const DASH = '–';

function formatRange(r: TimeRange): string {
  return r.min === r.max ? formatHHMM(r.min) : `${formatHHMM(r.min)}${DASH}${formatHHMM(r.max)}`;
}

function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function formatDuration(j: Journey): string {
  const lo = Math.max(0, j.arr.min - j.dep.max);
  const hi = Math.max(lo, j.arr.max - j.dep.min);
  return lo === hi ? formatMinutes(hi) : `${formatMinutes(lo)}${DASH}${formatMinutes(hi)}`;
}

function formatTransfers(n: number): string {
  if (n === 0) return 'Direct';
  return n === 1 ? '1 transfer' : `${n} transfers`;
}

function EmptyIcon() {
  return (
    <svg
      className="journey-empty-icon"
      viewBox="0 0 24 24"
      width="32"
      height="32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 18c2 0 2-1.5 4.5-1.5S10 18 12 18s2.5-1.5 4.5-1.5S19 18 21 18" />
      <path d="M5 14l1-5h12l1 5" />
      <path d="M12 9V4" />
    </svg>
  );
}

export function JourneyList({ journeys, searched }: Props) {
  if (!searched) {
    return (
      <div className="journey-empty">
        <EmptyIcon />
        <p>Choose an origin and destination to plan a journey.</p>
      </div>
    );
  }

  if (journeys.length === 0) {
    return (
      <div className="journey-empty" role="status">
        <p>No journey found.</p>
      </div>
    );
  }

  return (
    <ol className="journey-list" aria-label="Journey options">
      {journeys.map((j, i) => (
        <li key={j.id} className="journey-card card">
          <div className="journey-head">
            <p className="journey-times">
              {formatRange(j.dep)} {ARROW} {formatRange(j.arr)}
            </p>
            {i === 0 && <span className="pill">Earliest arrival</span>}
          </div>
          <p className="journey-meta">
            {formatDuration(j)} · {formatTransfers(j.transfers.length)}
          </p>
          <ul className="journey-legs" aria-label="Legs">
            {j.rides.map((leg) => (
              <li key={leg.tripId + leg.from} className="journey-leg">
                <span>
                  {leg.from} {ARROW} {leg.to}
                </span>
                {leg.source === 'mtcc' ? (
                  <span className="pill pill-info">Official</span>
                ) : (
                  <span className="pill pill-inferred">Inferred service</span>
                )}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
