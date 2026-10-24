import { useEffect, useState } from 'react';
import { Banner } from './components/Banner';
import { MapView, type Leg, type MapConfig, type Stop } from './components/MapView';

// TODO(U1): replace with loadBundle() from src/data/load.ts
type MetaLite = { fixture: boolean };

type MetaState =
  | { status: 'loading' }
  | { status: 'ready'; meta: MetaLite }
  | { status: 'error'; message: string };

const HONESTY_TEXT =
  'Inferred services are estimated from device movements in Aug 2025. Times are ranges. ' +
  'Transfer buffers (5 and 15 minutes) are assumptions. ' +
  'Time zone and speed unit of the source data are unconfirmed.';

async function fetchMeta(): Promise<MetaLite> {
  const url = `${import.meta.env.BASE_URL}data/meta.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`meta.json: HTTP ${res.status}`);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error('meta.json: not valid JSON (the file may be missing)');
  }
  if (typeof body !== 'object' || body === null || typeof (body as MetaLite).fixture !== 'boolean') {
    throw new Error('meta.json: field "fixture" is missing or not a boolean');
  }
  return { fixture: (body as MetaLite).fixture };
}

type MapData = { stops: Stop[]; legs: Leg[]; config: MapConfig };

type MapDataState =
  | { status: 'loading' }
  | { status: 'ready'; data: MapData }
  | { status: 'error'; message: string };

async function fetchJson(file: string): Promise<unknown> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${file}`);
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  try {
    return await res.json();
  } catch {
    throw new Error(`${file}: not valid JSON (the file may be missing)`);
  }
}

// TODO(U1): replace with loadBundle() from src/data/load.ts
async function fetchMapData(): Promise<MapData> {
  const [stops, legs, config] = await Promise.all([
    fetchJson('stops.json'),
    fetchJson('legs.json'),
    fetchJson('config.json'),
  ]);
  if (!Array.isArray(stops)) throw new Error('stops.json: expected an array of stops');
  if (!Array.isArray(legs)) throw new Error('legs.json: expected an array of legs');
  const c = config as Partial<MapConfig> | null;
  if (typeof c?.minDevices !== 'number' || typeof c.minDays !== 'number') {
    throw new Error('config.json: field "minDevices" or "minDays" is missing or not a number');
  }
  return {
    stops: stops as Stop[],
    legs: legs as Leg[],
    config: { minDevices: c.minDevices, minDays: c.minDays },
  };
}

const NO_STOPS: Stop[] = [];
const NO_LEGS: Leg[] = [];

export function App() {
  const [meta, setMeta] = useState<MetaState>({ status: 'loading' });
  const [mapData, setMapData] = useState<MapDataState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    fetchMeta().then(
      (m) => active && setMeta({ status: 'ready', meta: m }),
      (e: unknown) =>
        active && setMeta({ status: 'error', message: e instanceof Error ? e.message : String(e) }),
    );
    fetchMapData().then(
      (d) => active && setMapData({ status: 'ready', data: d }),
      (e: unknown) =>
        active &&
        setMapData({ status: 'error', message: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      active = false;
    };
  }, []);

  const ready = mapData.status === 'ready' ? mapData.data : null;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Maldives Island Journey Planner</h1>
      </header>

      <div className="banners">
        {meta.status === 'ready' && meta.meta.fixture && (
          <Banner kind="warning" label="SAMPLE DATA">
            This app is running on sample data, not the real data bundle.
          </Banner>
        )}
        <Banner kind="info" label="About this data">
          {HONESTY_TEXT}
        </Banner>
        {(meta.status === 'loading' || mapData.status === 'loading') && (
          <p className="load-status" role="status">Loading data…</p>
        )}
        {meta.status === 'error' && (
          <p className="load-error" role="alert">
            Could not load data. {meta.message}
          </p>
        )}
        {mapData.status === 'error' && (
          <p className="load-error" role="alert">
            Could not load data. {mapData.message}
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
