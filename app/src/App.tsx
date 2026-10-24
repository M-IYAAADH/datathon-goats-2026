import { useEffect, useState } from 'react';
import { Banner } from './components/Banner';
import { MapView } from './components/MapView';
import { PlannerForm } from './components/PlannerForm';
import { loadBundle, type Bundle, type Leg, type Stop, type TimeRange } from './data/load';
import { findJourneys, formatHHMM, type Journey, type JourneyQuery } from './data/planner';
import './App.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; bundle: Bundle }
  | { status: 'error'; message: string };

const HONESTY_TEXT =
  'Inferred services are estimated from device movements in Aug 2025. Times are ranges. ' +
  'Transfer buffers (5 and 15 minutes) are assumptions. ' +
  'Time zone and speed unit of the source data are unconfirmed.';

const NO_STOPS: Stop[] = [];
const NO_LEGS: Leg[] = [];

function formatRange(r: TimeRange): string {
  return r.min === r.max ? formatHHMM(r.min) : `${formatHHMM(r.min)}–${formatHHMM(r.max)}`;
}

export function App() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [, setQuery] = useState<JourneyQuery | null>(null);
  const [results, setResults] = useState<Journey[] | null>(null);

  useEffect(() => {
    let active = true;
    loadBundle().then(
      (bundle) => active && setState({ status: 'ready', bundle }),
      (e: unknown) =>
        active &&
        setState({ status: 'error', message: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      active = false;
    };
  }, []);

  const ready = state.status === 'ready' ? state.bundle : null;

  function handleSubmit(q: JourneyQuery) {
    if (!ready) return;
    setQuery(q);
    setResults(findJourneys(ready, q));
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Maldives Island Journey Planner</h1>
      </header>

      <div className="banners">
        {ready?.meta.fixture && (
          <Banner kind="warning" label="SAMPLE DATA">
            This app is running on sample data, not the real data bundle.
          </Banner>
        )}
        <Banner kind="info" label="About this data">
          {HONESTY_TEXT}
        </Banner>
        {state.status === 'loading' && (
          <p className="load-status" role="status">Loading data…</p>
        )}
        {state.status === 'error' && (
          <p className="load-error" role="alert">
            Could not load data. {state.message}
          </p>
        )}
      </div>

      <main className="layout">
        <section className="panel panel-left" aria-label="Planner">
          <div className="region region-form" id="planner-form" aria-label="Planner form">
            {ready ? (
              <PlannerForm stops={ready.stops} onSubmit={handleSubmit} />
            ) : (
              <p className="placeholder">
                {state.status === 'loading' ? 'Planner available once data has loaded.' : 'Planner unavailable.'}
              </p>
            )}
          </div>
          <div className="region region-results" id="results" aria-label="Results" aria-live="polite">
            {results === null ? (
              <p className="placeholder">Results will appear here.</p>
            ) : results.length === 0 ? (
              <>
                <p>No journey found.</p>
                <p className="placeholder">(Router not connected yet: waiting for R4.)</p>
              </>
            ) : (
              <ul className="journey-list">
                {results.map((j) => (
                  <li key={j.id}>
                    {formatRange(j.departMin)} → {formatRange(j.arriveMin)},{' '}
                    {j.transfers} {j.transfers === 1 ? 'transfer' : 'transfers'}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
        <section className="panel panel-right" aria-label="Map">
          <div className="region region-map" id="map">
            <MapView
              stops={ready?.stops ?? NO_STOPS}
              legs={ready?.legs ?? NO_LEGS}
              config={ready?.config}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
