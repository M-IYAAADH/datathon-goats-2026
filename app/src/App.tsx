import { useEffect, useState } from 'react';
import { Banner } from './components/Banner';
import { Header } from './components/Header';
import { HowItWorks } from './components/HowItWorks';
import { JourneyList } from './components/JourneyList';
import { MapView } from './components/MapView';
import { MobileTabs, type View } from './components/MobileTabs';
import { PlannerForm } from './components/PlannerForm';
import { loadBundle, type Bundle, type Leg, type Stop } from './data/load';
import { findJourneys, type Journey, type JourneyQuery } from './data/planner';
import { useTheme } from './hooks/useTheme';
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

export function App() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [, setQuery] = useState<JourneyQuery | null>(null);
  const [results, setResults] = useState<Journey[] | null>(null);
  const [view, setView] = useState<View>('plan');
  const { theme, toggle } = useTheme();

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
      <Header fixture={ready?.meta.fixture ?? false} theme={theme} onToggleTheme={toggle} />

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
          <p className="load-status" role="status">
            Loading data…
          </p>
        )}
        {state.status === 'error' && (
          <p className="load-error" role="alert">
            Could not load data. {state.message}
          </p>
        )}
      </div>

      <main className="layout">
        <section
          className={`panel panel-plan${view === 'plan' ? '' : ' panel-hidden'}`}
          aria-label="Planner"
        >
          <div className="card region" id="planner-form" aria-label="Planner form">
            {ready ? (
              <PlannerForm stops={ready.stops} onSubmit={handleSubmit} />
            ) : (
              <p className="placeholder">
                {state.status === 'loading'
                  ? 'Planner available once data has loaded.'
                  : 'Planner unavailable.'}
              </p>
            )}
          </div>
          <div className="card region" id="results" aria-label="Results" aria-live="polite">
            <JourneyList journeys={results ?? []} searched={results !== null} />
          </div>
          {ready && (
            <div className="card region">
              <HowItWorks config={ready.config} />
            </div>
          )}
        </section>
        {/* Stays mounted when hidden on mobile so MapLibre is not recreated; hidden
            panels keep their size (visibility, not display) so no resize is needed. */}
        <section
          className={`panel panel-map${view === 'map' ? '' : ' panel-hidden'}`}
          aria-label="Map"
        >
          <div className="card region-map" id="map">
            <MapView
              stops={ready?.stops ?? NO_STOPS}
              legs={ready?.legs ?? NO_LEGS}
              config={ready?.config}
            />
          </div>
        </section>
      </main>

      <MobileTabs view={view} onChange={setView} />
    </div>
  );
}
