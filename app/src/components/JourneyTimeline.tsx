import { Fragment, useMemo } from 'react';
import type { Bundle } from '../data/load';
import {
  findWaitAlternatives,
  formatHHMM,
  type Journey,
  type Query,
  type Ride,
  type Transfer,
  type WaitAlternative,
} from '../data/planner';
import './JourneyTimeline.css';

type Props = { journey: Journey; bundle: Bundle; query: Query };

const DASH = '–';
/** Wait bars stop growing at this many minutes so one long wait cannot dwarf the layout. */
const BAR_CAP_MIN = 240;

type TimeSpan = { min: number; max: number };

export function formatRange(r: TimeSpan): string {
  return r.min === r.max ? formatHHMM(r.min) : `${formatHHMM(r.min)}${DASH}${formatHHMM(r.max)}`;
}

export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function formatMinuteRange([lo, hi]: [number, number]): string {
  return lo === hi ? formatMinutes(hi) : `${lo}${DASH}${hi} min`;
}

function evidenceText(ride: Ride): string | null {
  const evs = ride.occurrences.flatMap((o) => (o.leg.evidence ? [o.leg.evidence] : []));
  if (evs.length === 0) return null;
  const devices = Math.min(...evs.map((e) => e.devices));
  const days = Math.min(...evs.map((e) => e.days));
  return `${devices} devices, ${days} days`;
}

function RideRow({ ride, name }: { ride: Ride; name: (id: string) => string }) {
  const official = ride.source === 'mtcc';
  const evidence = official ? null : evidenceText(ride);
  const routeId = ride.occurrences[0]?.leg.routeId ?? '';
  const cls = ride.occurrences[0]?.leg.cls ?? null;
  const intermediate = ride.occurrences.slice(0, -1).map((o) => name(o.leg.to));
  return (
    <li className={`tl-ride leg${official ? '' : ' inferred'}`}>
      <div className="tl-ride-head">
        <span className={`mode pill ${official ? 'pill-info' : 'pill-inferred'}`}>
          {official ? 'Official MTCC ferry' : 'Inferred service'}
        </span>
        {official ? (
          <span className="tl-ride-id">
            Route {routeId} · Trip {ride.tripId}
          </span>
        ) : (
          <span className="tl-ride-id" title={`Route ${routeId} · Trip ${ride.tripId}`}>
            Private speedboat (inferred){cls ? ` · ${cls}` : ''}
          </span>
        )}
      </div>
      <div className="tl-stops">
        <p className="tl-stop">
          <span className="tl-stop-name">{name(ride.from)}</span>
          <span className="tl-time">Departs {formatRange(ride.dep)}</span>
        </p>
        <p className="tl-stop">
          <span className="tl-stop-name">{name(ride.to)}</span>
          <span className="tl-time">Arrives {formatRange(ride.arr)}</span>
        </p>
      </div>
      {intermediate.length > 0 && (
        <p className="tl-note">Stays aboard at {intermediate.join(', ')}</p>
      )}
      {evidence && <p className="tl-note">Evidence: {evidence}</p>}
    </li>
  );
}

function Alternatives({
  bundle,
  query,
  journey,
  transferIndex,
  name,
}: {
  bundle: Bundle;
  query: Query;
  journey: Journey;
  transferIndex: number;
  name: (id: string) => string;
}) {
  const result = useMemo(
    () => findWaitAlternatives(bundle, query, journey, transferIndex),
    [bundle, query, journey, transferIndex],
  );
  const alts: WaitAlternative[] = result.alternatives;
  return (
    <div className="tl-alts">
      <p className="tl-alts-title">Alternatives from {name(result.stop)}</p>
      {alts.length === 0 ? (
        <p className="tl-alts-none">No alternative found in the data</p>
      ) : (
        <ul className="tl-alts-list">
          {alts.map((a) => {
            const [lo, hi] = a.savingMin;
            const sources = Array.from(
              new Set(a.journey.rides.map((r) => (r.source === 'mtcc' ? 'Official' : 'Inferred'))),
            );
            return (
              <li key={a.journey.id} className="tl-alt">
                <p className="tl-alt-times">
                  Departs {name(result.stop)} {formatRange(a.journey.dep)}, arrives{' '}
                  {name(a.journey.destination)} {formatRange(a.journey.arr)}
                </p>
                <p className="tl-alt-meta">
                  <span className="pill">
                    {lo === hi ? `Saves ${lo} min` : `Saves ${lo}${DASH}${hi} min`}
                  </span>
                  {sources.map((s) => (
                    <span
                      key={s}
                      className={`pill ${s === 'Official' ? 'pill-info' : 'pill-inferred'}`}
                    >
                      {s === 'Official' ? 'Official MTCC ferry' : 'Inferred service'}
                    </span>
                  ))}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function WaitRow({
  transfer,
  journey,
  bundle,
  query,
  index,
  name,
}: {
  transfer: Transfer;
  journey: Journey;
  bundle: Bundle;
  query: Query;
  index: number;
  name: (id: string) => string;
}) {
  const a = transfer.assessment;
  const barPct = Math.min(100, Math.round((a.waitMin[1] / BAR_CAP_MIN) * 100));
  return (
    <li className={`tl-wait xfer${a.long ? ' long' : ''}`}>
      <div className="tl-wait-head">
        <span className="tl-wait-label">
          Wait at {name(transfer.stop)}: {formatMinuteRange(a.waitMin)}
        </span>
        <span className={`pill ${a.status === 'safe' ? 'pill-safe' : 'pill-possible'}`}>
          {a.status === 'safe' ? 'Safe' : 'Possible'}
        </span>
        {a.long && <span className="pill pill-longwait">Long wait</span>}
      </div>
      <div className="tl-bar" aria-hidden="true">
        <div
          className={`tl-bar-fill${a.long ? ' tl-bar-long' : ''}`}
          style={{ width: `${barPct}%` }}
        />
      </div>
      {a.long && (
        <Alternatives
          bundle={bundle}
          query={query}
          journey={journey}
          transferIndex={index}
          name={name}
        />
      )}
    </li>
  );
}

export function JourneyTimeline({ journey, bundle, query }: Props) {
  const names = useMemo(() => new Map(bundle.stops.map((s) => [s.id, s.name])), [bundle.stops]);
  const name = (id: string) => names.get(id) ?? id;
  return (
    <ol className="tl" aria-label="Journey timeline">
      {journey.rides.map((ride, i) => {
        const t = journey.transfers[i];
        return (
          <Fragment key={ride.tripId + ride.from + i}>
            <RideRow ride={ride} name={name} />
            {t && (
              <WaitRow
                transfer={t}
                journey={journey}
                bundle={bundle}
                query={query}
                index={i}
                name={name}
              />
            )}
          </Fragment>
        );
      })}
    </ol>
  );
}
