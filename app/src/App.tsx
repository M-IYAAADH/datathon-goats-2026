import { useEffect, useState } from 'react';
import { Banner } from './components/Banner';

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

export function App() {
  const [meta, setMeta] = useState<MetaState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    fetchMeta().then(
      (m) => active && setMeta({ status: 'ready', meta: m }),
      (e: unknown) =>
        active && setMeta({ status: 'error', message: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      active = false;
    };
  }, []);

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
        {meta.status === 'loading' && (
          <p className="load-status" role="status">Loading data…</p>
        )}
        {meta.status === 'error' && (
          <p className="load-error" role="alert">
            Could not load data. {meta.message}
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
            <p className="placeholder">Map goes here.</p>
          </div>
        </section>
      </main>
    </div>
  );
}
