import { useMemo } from 'react';
import type { Bundle } from '../data/load';
import type { Journey, Query } from '../data/planner';
import { JourneyTimeline, formatMinutes, formatRange } from './JourneyTimeline';
import './JourneyList.css';

type Props = {
  journeys: Journey[];
  searched: boolean;
  bundle: Bundle;
  query: Query | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
};

const ARROW = '→';
const DASH = '–';

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

export function JourneyList({ journeys, searched, bundle, query, selectedId, onSelect }: Props) {
  const names = useMemo(() => new Map(bundle.stops.map((s) => [s.id, s.name])), [bundle.stops]);
  const name = (id: string) => names.get(id) ?? id;

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
      {journeys.map((j, i) => {
        const selected = j.id === selectedId;
        const longWait = j.transfers.some((t) => t.assessment.long);
        const panelId = `journey-detail-${i}`;
        return (
          <li key={j.id} className={`journey-card card${selected ? ' journey-selected' : ''}`}>
            <button
              type="button"
              className="journey-select"
              aria-pressed={selected}
              aria-expanded={selected}
              aria-controls={panelId}
              onClick={() => onSelect(j.id)}
            >
              <span className="journey-head">
                <span className="journey-times">
                  {formatRange(j.dep)} {ARROW} {formatRange(j.arr)}
                </span>
                <span className="journey-badges">
                  {i === 0 && <span className="pill">Earliest arrival</span>}
                  {longWait && <span className="pill pill-longwait">Long wait</span>}
                  {j.usesInferred && (
                    <span className="pill pill-inferred">Uses inferred service</span>
                  )}
                </span>
              </span>
              <span className="journey-meta">
                {formatDuration(j)} · {formatTransfers(j.transfers.length)}
              </span>
              <span className="journey-legs">
                {j.rides.map((ride, ri) => (
                  <span key={ride.tripId + ride.from + ri} className="journey-leg">
                    <span>
                      {name(ride.from)} {ARROW} {name(ride.to)}
                    </span>
                    {ride.source === 'mtcc' ? (
                      <span className="pill pill-info">Official</span>
                    ) : (
                      <span className="pill pill-inferred">Inferred service</span>
                    )}
                  </span>
                ))}
              </span>
            </button>
            <div id={panelId} className="journey-detail" hidden={!selected}>
              {selected && query && <JourneyTimeline journey={j} bundle={bundle} query={query} />}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
