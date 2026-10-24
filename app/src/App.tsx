import { useEffect, useMemo, useState } from 'react';
import { Banner } from './components/Banner';
import { DisruptionPanel, type Scenario } from './components/DisruptionPanel';
import { Header } from './components/Header';
import { HowItWorks } from './components/HowItWorks';
import { JourneyList } from './components/JourneyList';
import { formatRange, type AltRoute } from './components/JourneyTimeline';
import { MapView, type BoatMarker } from './components/MapView';
import { PlannerForm } from './components/PlannerForm';
import { loadBundle, type Bundle, type Leg, type Stop } from './data/load';
import { findJourneys, type Journey, type JourneyQuery, type Ride } from './data/planner';
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
const NO_JOURNEYS: Journey[] = [];
const NO_IDS: string[] = [];
const NO_RIDES: Ride[] = [];

type Tab = 'plan' | 'disruption' | 'about';

const TABS: { id: Tab; label: string }[] = [
  { id: 'plan', label: 'Journey planner' },
  { id: 'disruption', label: 'Disruption' },
  { id: 'about', label: 'About the data' },
];

export function App() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [query, setQuery] = useState<JourneyQuery | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [results, setResults] = useState<Journey[] | null>(null);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [alt, setAlt] = useState<AltRoute | null>(null);
  // Route picked from the disruption panel's alternatives; null = the default below.
  const [scenarioRouteId, setScenarioRouteId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('plan');
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
    setAlt(null);
    const found = findJourneys(ready, q);
    setResults(found);
    setSelectedId(found[0]?.id ?? null);
  }

  function selectJourney(id: string) {
    setSelectedId(id);
    setAlt(null);
  }

  function changeScenario(s: Scenario | null) {
    setScenario(s);
    setScenarioRouteId(null);
  }

  // After a simulated cancellation: the alternative picked in the panel, else the
  // private-boat recovery, else the new best route.
  const scenarioJourney = useMemo(() => {
    if (!scenario) return null;
    const r = scenario.result;
    return r.after.find((j) => j.id === scenarioRouteId) ?? r.recovery[0] ?? r.newBest;
  }, [scenario, scenarioRouteId]);

  // The map draws only this route: the disruption route, a chosen wait alternative, else the selection.
  const shownRides = useMemo(() => {
    if (scenario) return scenarioJourney?.rides ?? NO_RIDES;
    return alt?.rides ?? results?.find((j) => j.id === selectedId)?.rides ?? NO_RIDES;
  }, [results, selectedId, scenario, scenarioJourney, alt]);

  const highlightLegIds = useMemo(
    () => shownRides.flatMap((r) => r.occurrences.map((o) => o.leg.id)),
    [shownRides],
  );

  const boats = useMemo<BoatMarker[]>(
    () =>
      shownRides.map((r) => ({
        stopId: r.from,
        label: `${r.source === 'mtcc' ? 'MTCC' : 'Inferred'} ${formatRange(r.dep)}`,
        official: r.source === 'mtcc',
      })),
    [shownRides],
  );

  const cancelledLegIds = useMemo(
    () => (scenario ? [scenario.cancelled.leg.id] : NO_IDS),
    [scenario],
  );

  return (
    <div className="app">
      <Header fixture={ready?.meta.fixture ?? false} theme={theme} onToggleTheme={toggle} />

      <main className="layout">
        <aside id="panel" aria-label="Planner">
          <div className="tabs" role="tablist" aria-label="Sections">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`tabpanel-${t.id}`}
                className={tab === t.id ? 'active' : undefined}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="tabbody">
            {ready?.meta.fixture && (
              <Banner kind="warning" label="SAMPLE DATA">
                This app is running on sample data, not the real data bundle.
              </Banner>
            )}
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
            {/* All tab panels stay mounted (hidden) so form, results and scenario state survive tab switches. */}
            <div
              role="tabpanel"
              id="tabpanel-plan"
              aria-labelledby="tab-plan"
              hidden={tab !== 'plan'}
            >
              <div className="region" id="planner-form" aria-label="Planner form">
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
              <div className="region" id="results" aria-label="Results" aria-live="polite">
                {ready ? (
                  <JourneyList
                    journeys={results ?? NO_JOURNEYS}
                    searched={results !== null}
                    bundle={ready}
                    query={query}
                    selectedId={selectedId}
                    onSelect={selectJourney}
                    shownAlt={alt?.key ?? null}
                    onShowAlt={setAlt}
                  />
                ) : (
                  <p className="placeholder">Results appear here after you plan a journey.</p>
                )}
              </div>
            </div>
            <div
              role="tabpanel"
              id="tabpanel-disruption"
              aria-labelledby="tab-disruption"
              hidden={tab !== 'disruption'}
            >
              {ready ? (
                <DisruptionPanel
                  bundle={ready}
                  query={query}
                  onScenarioChange={changeScenario}
                  shownRouteId={scenarioJourney?.id ?? null}
                  onShowRoute={setScenarioRouteId}
                />
              ) : (
                <p className="placeholder">Available once data has loaded.</p>
              )}
            </div>
            <div
              role="tabpanel"
              id="tabpanel-about"
              aria-labelledby="tab-about"
              hidden={tab !== 'about'}
            >
              <Banner kind="info" label="About this data">
                {HONESTY_TEXT}
              </Banner>
              {ready && <HowItWorks config={ready.config} />}
            </div>
          </div>
        </aside>
        <section className="mapcell" aria-label="Map">
          <div className="region-map" id="map">
            <MapView
              stops={ready?.stops ?? NO_STOPS}
              legs={ready?.legs ?? NO_LEGS}
              config={ready?.config}
              highlightLegIds={highlightLegIds}
              boats={boats}
              cancelledLegIds={cancelledLegIds}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
