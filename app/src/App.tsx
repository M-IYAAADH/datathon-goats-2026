import { useEffect, useState } from 'react';
import { Banner } from './components/Banner';
import { MapView } from './components/MapView';
import { loadBundle, type Bundle, type Leg, type Stop } from './data/load';

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

export function App() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

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
            <p className="placeholder">Planner form goes here.</p>
          </div>
          <div className="region region-results" id="results" aria-label="Results" aria-live="polite">
            <p className="placeholder">Results will appear here.</p>
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
