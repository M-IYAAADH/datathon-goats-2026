import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { findJourneys, formatHHMM } from '../data/planner';
import type {
  Connection,
  Journey,
  Occurrence,
  Query,
  ScenarioResult,
  ShiftResult,
} from '../data/planner';
import type { Bundle } from '../router/model';
import { applyCancellation, compareReachability, proposeShifts } from '../router/disruption';
import { expandOccurrences, weekday } from '../router/time';
import './DisruptionPanel.css';

export type Scenario = { cancelled: Occurrence; result: ScenarioResult };

type Props = {
  bundle: Bundle;
  /** Last planned query; null before any search. */
  query: Query | null;
  /** Called with null on Reset. */
  onScenarioChange: (s: Scenario | null) => void;
  /** Id of the after-cancellation journey drawn on the map. */
  shownRouteId: string | null;
  onShowRoute: (journeyId: string) => void;
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type TargetShift = { key: string; connection: Connection; result: ShiftResult };

function formatDate(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${WEEKDAYS[weekday(date)]} ${d} ${MONTHS[m - 1]}`;
}

function fmtRange(r: { min: number; max: number }): string {
  return r.min === r.max ? formatHHMM(r.min) : `${formatHHMM(r.min)}–${formatHHMM(r.max)}`;
}

function occIds(j: Journey): string[] {
  return j.rides.flatMap((r) => r.occurrences.map((o) => o.id));
}

export function DisruptionPanel({
  bundle,
  query,
  onScenarioChange,
  shownRouteId,
  onShowRoute,
}: Props) {
  const headingId = useId();
  const selectId = useId();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const callbackRef = useRef(onScenarioChange);
  callbackRef.current = onScenarioChange;

  const stopName = useMemo(() => {
    const map = new Map(bundle.stops.map((s) => [s.id, s.name]));
    return (id: string) => map.get(id) ?? id;
  }, [bundle.stops]);

  // New search: drop any scenario so the map and lists return to the baseline.
  useEffect(() => {
    setScenario(null);
    setSelectedId(null);
    callbackRef.current(null);
  }, [query]);

  const options = useMemo(() => {
    if (!query) return [];
    const baselineIds = new Set(findJourneys(bundle, query).flatMap((j) => occIds(j)));
    return expandOccurrences(bundle.legs, query.date, bundle.config.horizonHours)
      .filter((o) => o.leg.source === 'mtcc' && o.serviceDate === query.date)
      .map((o) => ({ occ: o, used: baselineIds.has(o.id) }))
      .sort((a, b) => Number(b.used) - Number(a.used) || a.occ.dep.min - b.occ.dep.min);
  }, [bundle, query]);

  const effective = options.find((o) => o.occ.id === selectedId) ?? options[0] ?? null;

  const legLabel = (o: Occurrence): string =>
    `${stopName(o.leg.from)} → ${stopName(o.leg.to)}, ${formatHHMM(o.dep.min)}–${formatHHMM(o.arr.min)}`;

  const shifts = useMemo<TargetShift[]>(() => {
    if (!scenario || !query) return [];
    const occs = applyCancellation(
      expandOccurrences(bundle.legs, query.date, bundle.config.horizonHours),
      scenario.cancelled.id,
    );
    const out: TargetShift[] = [];
    const seen = new Set<string>();
    for (const j of scenario.result.recovery) {
      for (const t of j.transfers) {
        if (t.assessment.status === 'safe' || j.rides[t.fromRide].source !== 'mtcc') continue;
        const arriving = j.rides[t.fromRide].occurrences.at(-1);
        const departing = j.rides[t.toRide].occurrences[0];
        if (!arriving || !departing) continue;
        const key = `${arriving.id}>${departing.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const connection: Connection = {
          stop: t.stop,
          arriving,
          departing,
          assessment: t.assessment,
        };
        out.push({ key, connection, result: proposeShifts(bundle, occs, connection) });
      }
    }
    return out;
  }, [bundle, query, scenario]);

  function cancel() {
    if (!query || !effective) return;
    const result = compareReachability(bundle, query, effective.occ.id);
    const next = { cancelled: effective.occ, result };
    setScenario(next);
    onScenarioChange(next);
  }

  function reset() {
    setScenario(null);
    onScenarioChange(null);
  }

  function journeyLine(j: Journey) {
    const via = [j.origin, ...j.rides.map((r) => r.to)].map(stopName).join(' → ');
    return (
      <>
        <span className="dp-times">
          {fmtRange(j.dep)} → {fmtRange(j.arr)}
        </span>
        <span className="dp-via">{via}</span>
        <span className={`pill ${j.usesInferred ? 'pill-inferred' : 'pill-info'}`}>
          {j.usesInferred ? 'Includes inferred' : 'Official'}
        </span>
      </>
    );
  }

  const header = (
    <div className="dp-head">
      <h2 id={headingId} className="dp-title">
        Disruption what-if
      </h2>
      {scenario && <span className="pill pill-danger">Simulated cancellation</span>}
    </div>
  );

  if (!query) {
    return (
      <section className="disruption-panel card" aria-labelledby={headingId}>
        {header}
        <p className="dp-muted">Plan a journey first, then simulate a cancellation.</p>
      </section>
    );
  }

  const result = scenario?.result ?? null;
  const maxShift = bundle.config.maxShiftMin;

  return (
    <section className="disruption-panel card" aria-labelledby={headingId}>
      {header}
      <p className="dp-muted">
        Simulation only. Nothing here is a real cancellation or a real timetable change.
      </p>

      {options.length === 0 ? (
        <p className="dp-muted">No official services found on this date.</p>
      ) : (
        <div className="dp-controls">
          <div className="field">
            <label className="field-label" htmlFor={selectId}>
              Official leg to cancel
            </label>
            <select
              id={selectId}
              className="select"
              value={effective?.occ.id ?? ''}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {options.map(({ occ, used }) => (
                <option key={occ.id} value={occ.id}>
                  {legLabel(occ)} ({formatDate(occ.serviceDate)}){used ? ' *' : ''}
                </option>
              ))}
            </select>
            <span className="dp-hint">* used by a journey for your search</span>
          </div>
          <div className="dp-actions">
            <button type="button" className="btn btn-primary" onClick={cancel}>
              Cancel this leg (simulated)
            </button>
            <button type="button" className="btn" onClick={reset} disabled={!scenario}>
              Reset
            </button>
          </div>
        </div>
      )}

      {scenario && result && (
        <div className="dp-results">
          <p className="dp-cancelled">
            {legLabel(scenario.cancelled)}{' '}
            <span className="pill pill-danger">Cancelled (simulated)</span>
          </p>

          <div className="dp-block">
            <h3 className="dp-sub">Alternative routes after the cancellation</h3>
            {result.after.length === 0 ? (
              <p className="dp-muted">No route found after the cancellation.</p>
            ) : (
              <ul className="dp-list">
                {result.after.map((j) => {
                  const shown = j.id === shownRouteId;
                  return (
                    <li key={j.id}>
                      <button
                        type="button"
                        className={`dp-item dp-route${shown ? ' dp-route-shown' : ''}`}
                        aria-pressed={shown}
                        onClick={() => onShowRoute(j.id)}
                      >
                        {journeyLine(j)}
                        <span className="dp-hint">{shown ? 'On the map' : 'Show on map'}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="dp-block">
            <h3 className="dp-sub">Before and after</h3>
            <div className="cards">
              <div className="card">
                <div className="k">Baseline</div>
                <div className="v">{result.before.length}</div>
                <div className="s">journeys</div>
              </div>
              <div className="card">
                <div className="k">After</div>
                <div className="v">{result.after.length}</div>
                <div className="s">journeys</div>
              </div>
              <div className="card">
                <div className="k">Journeys that disappear</div>
                <div className="v">{result.lostJourneys.length}</div>
              </div>
              <div className="card">
                <div className="k">Connections that break</div>
                <div className="v">{result.brokenConnections.length}</div>
                <div className="s">modelled, not passengers</div>
              </div>
            </div>
            <h4 className="dp-sub2">Journeys that disappear</h4>
            {result.lostJourneys.length === 0 ? (
              <p className="dp-muted">None.</p>
            ) : (
              <ul className="dp-list">
                {result.lostJourneys.map((j) => (
                  <li key={j.id} className="dp-item">
                    {journeyLine(j)}
                  </li>
                ))}
              </ul>
            )}
            <h4 className="dp-sub2">
              Modelled connections that break: {result.brokenConnections.length}
            </h4>
            {result.brokenConnections.length > 0 && (
              <ul className="dp-list">
                {result.brokenConnections.map((c) => (
                  <li key={`${c.arriving.id}>${c.departing.id}`} className="dp-item">
                    <strong>{stopName(c.stop)}</strong>
                    <span>
                      {stopName(c.arriving.leg.from)} → {stopName(c.arriving.leg.to)}, arr{' '}
                      {fmtRange(c.arriving.arr)} · next boat to {stopName(c.departing.leg.to)} dep{' '}
                      {fmtRange(c.departing.dep)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="dp-hint">Counted as connections in the model, not passengers.</p>
            <h4 className="dp-sub2">New best route</h4>
            {result.newBest ? (
              <ul className="dp-list">
                <li className="dp-item">{journeyLine(result.newBest)}</li>
              </ul>
            ) : (
              <p>No route found after the cancellation.</p>
            )}
          </div>

          <div className="dp-block">
            <h3 className="dp-sub">Recovery options</h3>
            {result.recovery.length === 0 ? (
              <p className="dp-muted">
                No recovery option using an inferred service found in the data.
              </p>
            ) : (
              <ul className="dp-list">
                {result.recovery.map((j) => (
                  <li key={j.id} className="dp-item dp-recovery">
                    <div className="dp-row">{journeyLine(j)}</div>
                    {j.rides.flatMap((r) =>
                      r.occurrences.flatMap((o) =>
                        o.leg.evidence
                          ? [
                              <div key={o.id} className="dp-row">
                                <span className="pill pill-inferred">Inferred service</span>
                                <span className="dp-hint">
                                  {o.leg.evidence.devices} devices, {o.leg.evidence.days} days
                                </span>
                              </div>,
                            ]
                          : [],
                      ),
                    )}
                    {j.transfers.map((t) => (
                      <div key={`${t.fromRide}-${t.toRide}`} className="dp-row">
                        <span>Transfer at {stopName(t.stop)}</span>
                        <span
                          className={`pill ${t.assessment.status === 'safe' ? 'pill-safe' : 'pill-possible'}`}
                        >
                          {t.assessment.status === 'safe' ? 'Safe' : 'Possible'}
                        </span>
                        {t.assessment.long && <span className="pill pill-longwait">Long wait</span>}
                      </div>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="dp-block">
            <h3 className="dp-sub">Proposed shift</h3>
            {shifts.length === 0 ? (
              <p className="dp-muted">No shift needed: recovery connections are already Safe.</p>
            ) : (
              shifts.map((s) => (
                <div key={s.key} className="dp-shift-group">
                  {s.result.proposals.length === 0 && (
                    <p className="dp-muted">No safe shift found within ±{maxShift} min.</p>
                  )}
                  {s.result.proposals.map((p) => (
                    <div key={p.shiftMin} className="dp-shift">
                      <p>
                        <strong>
                          Move {legLabel(s.connection.arriving)}{' '}
                          {p.shiftMin < 0 ? 'earlier' : 'later'} by {Math.abs(p.shiftMin)} min:
                        </strong>{' '}
                        departs {fmtRange(p.newDep)}, arrives {fmtRange(p.newArr)}
                      </p>
                      <p>
                        Makes the transfer at {stopName(p.fixes.stop)} onto the inferred{' '}
                        {formatHHMM(p.fixes.departing.dep.min)}–
                        {formatHHMM(p.fixes.departing.arr.max)} boat Safe.
                      </p>
                      <p className="dp-note">{p.note}</p>
                    </div>
                  ))}
                  {s.result.rejected.length > 0 && (
                    <ul className="dp-rejected">
                      {s.result.rejected.map((r) => (
                        <li key={r.shiftMin}>
                          {r.shiftMin < 0 ? '−' : '+'}
                          {Math.abs(r.shiftMin)} min rejected: would break {r.breaks.length}{' '}
                          connection(s)
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </section>
  );
}
