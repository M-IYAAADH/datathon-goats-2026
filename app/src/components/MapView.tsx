import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  AttributionControl,
  GPUInitializationError,
  LngLatBounds,
  Map as MlMap,
  Marker,
  setWorkerUrl,
  type GeoJSONSource,
  type MapOptions,
} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type { Leg, Stop } from '../data/load';
import { readMapColors, useMapColors, type MapColors } from '../hooks/useMapColors';
import { Legend } from './Legend';
import './MapView.css';

// Vite pre-bundles maplibre-gl, which breaks its default worker lookup (next to its own
// module); point it at the worker file explicitly so GeoJSON sources load.
setWorkerUrl(workerUrl);

export type MapConfig = { minDevices: number; minDays: number };

type MapViewProps = {
  stops: Stop[];
  legs: Leg[];
  highlightLegIds?: string[];
  cancelledLegIds?: string[];
  config?: MapConfig;
  onStopClick?: (stopId: string) => void;
};

// Below this zoom only hubs and stops on the selected journey are labelled.
export const LABEL_ALL_ZOOM = 10;

export type LabelBox = { x0: number; y0: number; x1: number; y1: number };

export function overlaps(a: LabelBox, b: LabelBox, gap = 2): boolean {
  return a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.y0 < b.y1 + gap && b.y0 < a.y1 + gap;
}

export function routeStopIds(legs: Leg[], highlightLegIds: string[]): string[] {
  const hi = new Set(highlightLegIds);
  const ids = new Set<string>();
  for (const l of legs) {
    if (!hi.has(l.id)) continue;
    ids.add(l.from);
    ids.add(l.to);
  }
  return [...ids].sort();
}

export type Segment = {
  key: string;
  a: Stop;
  b: Stop;
  official: boolean;
};

export type MapSegments = {
  base: Segment[];
  highlight: Segment[];
  cancelled: Segment[];
};

const MAP_LABEL = 'Map of island stops and boat connections';

function pairKey(from: string, to: string): string {
  return from < to ? `${from}|${to}` : `${to}|${from}`;
}

function inferredVisible(leg: Leg, config?: MapConfig): boolean {
  if (leg.source !== 'inferred' || !config) return true;
  const ev = leg.evidence;
  return ev !== null && ev.devices >= config.minDevices && ev.days >= config.minDays;
}

// One straight line per unordered stop pair and source, so an inferred service on an
// official pair still shows (drawn offset beside the official line).
function dedupe(legs: Leg[], byId: Map<string, Stop>): Segment[] {
  const out = new Map<string, Segment>();
  for (const leg of legs) {
    if (leg.from === leg.to) continue;
    const [a, b] =
      leg.from < leg.to
        ? [byId.get(leg.from), byId.get(leg.to)]
        : [byId.get(leg.to), byId.get(leg.from)];
    if (!a || !b) continue;
    const official = leg.source === 'mtcc';
    const key = `${pairKey(a.id, b.id)}|${leg.source}`;
    if (!out.has(key)) out.set(key, { key, a, b, official });
  }
  return [...out.values()];
}

export function buildSegments(
  stops: Stop[],
  legs: Leg[],
  highlightLegIds: string[] = [],
  cancelledLegIds: string[] = [],
  config?: MapConfig,
): MapSegments {
  const byId = new Map(stops.map((s) => [s.id, s]));
  const hi = new Set(highlightLegIds);
  const cx = new Set(cancelledLegIds);
  return {
    base: dedupe(
      legs.filter((l) => inferredVisible(l, config)),
      byId,
    ),
    highlight: dedupe(
      legs.filter((l) => hi.has(l.id)),
      byId,
    ),
    cancelled: dedupe(
      legs.filter((l) => cx.has(l.id)),
      byId,
    ),
  };
}

function webglSupported(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

type FeatureCollection = {
  type: 'FeatureCollection';
  features: {
    type: 'Feature';
    properties: Record<string, string | boolean>;
    geometry:
      | { type: 'LineString'; coordinates: [number, number][] }
      | { type: 'Point'; coordinates: [number, number] };
  }[];
};

function lineCollection(segments: Segment[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: segments.map((s) => ({
      type: 'Feature',
      properties: { official: s.official },
      geometry: {
        type: 'LineString',
        coordinates: [
          [s.a.lon, s.a.lat],
          [s.b.lon, s.b.lat],
        ],
      },
    })),
  };
}

function stopCollection(stops: Stop[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: stops.map((s) => ({
      type: 'Feature',
      properties: { id: s.id, hub: s.kind === 'hub' },
      geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
    })),
  };
}

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

// Static polygon overlays (OneMap island outlines, atoll hulls) served from public/data.
type Ring = [number, number][];
type PolyGeometry =
  { type: 'Polygon'; coordinates: Ring[] } | { type: 'MultiPolygon'; coordinates: Ring[][] };
export type PolygonCollection = {
  type: 'FeatureCollection';
  features: {
    type: 'Feature';
    properties: Record<string, unknown> | null;
    geometry: PolyGeometry;
  }[];
};
export type Overlay = { data: PolygonCollection; attribution: string };

// Keeps Polygon/MultiPolygon features; returns null for anything that is not a
// FeatureCollection so a bad file degrades to "no overlay".
export function parseOverlay(raw: unknown): Overlay | null {
  if (!raw || typeof raw !== 'object') return null;
  const fc = raw as { type?: unknown; features?: unknown; attribution?: unknown };
  if (fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) return null;
  const features = fc.features.filter((f): f is PolygonCollection['features'][number] => {
    const g = (f as { geometry?: { type?: unknown; coordinates?: unknown } } | null)?.geometry;
    return (
      !!g && (g.type === 'Polygon' || g.type === 'MultiPolygon') && Array.isArray(g.coordinates)
    );
  });
  return {
    data: { type: 'FeatureCollection', features },
    attribution: typeof fc.attribution === 'string' ? fc.attribution.trim() : '',
  };
}

// Area-weighted centroid of the largest outer ring (good enough for a convex hull label).
export function polygonCentroid(geometry: PolyGeometry): [number, number] | null {
  const rings =
    geometry.type === 'Polygon' ? [geometry.coordinates[0]] : geometry.coordinates.map((p) => p[0]);
  let best: { a: number; x: number; y: number } | null = null;
  for (const ring of rings) {
    if (!ring || ring.length < 3) continue;
    let a = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < ring.length; i++) {
      const [x0, y0] = ring[i];
      const [x1, y1] = ring[(i + 1) % ring.length];
      const k = x0 * y1 - x1 * y0;
      a += k;
      cx += (x0 + x1) * k;
      cy += (y0 + y1) * k;
    }
    if (a === 0) continue;
    const cand = { a: Math.abs(a), x: cx / (3 * a), y: cy / (3 * a) };
    if (!best || cand.a > best.a) best = cand;
  }
  return best ? [best.x, best.y] : null;
}

// One warning per file per page load (React StrictMode runs effects twice in dev).
const warnedOverlays = new Set<string>();

async function loadOverlay(file: string): Promise<Overlay | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/${file}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed = parseOverlay(await res.json());
    if (!parsed) throw new Error('not a GeoJSON FeatureCollection');
    return parsed;
  } catch (e) {
    if (warnedOverlays.has(file)) return null;
    warnedOverlays.add(file);
    console.warn(
      `Map: ${file} not loaded, drawing without it (${e instanceof Error ? e.message : String(e)})`,
    );
    return null;
  }
}

function landFill(c: MapColors) {
  return ['case', ['==', ['get', 'isStop'], true], c.landStop, c.land] as unknown as string;
}

// No tiles, no glyphs, no sprites: only local GeoJSON overlays are fetched.
function buildStyle(c: MapColors): Exclude<MapOptions['style'], string | undefined> {
  return {
    version: 8,
    sources: {
      atolls: { type: 'geojson', data: EMPTY },
      land: { type: 'geojson', data: EMPTY },
      lines: { type: 'geojson', data: EMPTY },
      highlight: { type: 'geojson', data: EMPTY },
      cancelled: { type: 'geojson', data: EMPTY },
      stops: { type: 'geojson', data: EMPTY },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': c.background } },
      {
        id: 'atoll-fill',
        type: 'fill',
        source: 'atolls',
        paint: { 'fill-color': c.atoll, 'fill-opacity': 0.06 },
      },
      {
        id: 'atoll-outline',
        type: 'line',
        source: 'atolls',
        paint: {
          'line-color': c.atoll,
          'line-width': 1.2,
          'line-opacity': 0.7,
          'line-dasharray': [4, 3],
        },
      },
      {
        id: 'land-fill',
        type: 'fill',
        source: 'land',
        paint: { 'fill-color': landFill(c) },
      },
      {
        id: 'land-outline',
        type: 'line',
        source: 'land',
        paint: { 'line-color': c.landOutline, 'line-width': 0.6 },
      },
      {
        id: 'lines-official',
        type: 'line',
        source: 'lines',
        filter: ['==', ['get', 'official'], true],
        paint: { 'line-color': c.official, 'line-width': 2.5 },
      },
      {
        id: 'lines-inferred',
        type: 'line',
        source: 'lines',
        filter: ['==', ['get', 'official'], false],
        paint: {
          'line-color': c.inferred,
          'line-width': 2.5,
          'line-dasharray': [3, 2],
          'line-offset': 4,
        },
      },
      {
        id: 'lines-highlight',
        type: 'line',
        source: 'highlight',
        layout: { 'line-cap': 'round' },
        paint: { 'line-color': c.highlight, 'line-width': 6 },
      },
      {
        id: 'lines-cancelled',
        type: 'line',
        source: 'cancelled',
        paint: { 'line-color': c.cancelled, 'line-width': 4, 'line-dasharray': [1.5, 1] },
      },
      {
        id: 'stops',
        type: 'circle',
        source: 'stops',
        paint: {
          'circle-radius': ['case', ['get', 'hub'], 7, 5],
          'circle-color': ['case', ['get', 'hub'], c.hub, c.stop],
          'circle-stroke-color': c.halo,
          'circle-stroke-width': 1.5,
        },
      },
    ],
  };
}

function applyColors(map: MlMap, c: MapColors) {
  const has = (layer: string) => !!map.getLayer(layer);
  if (has('bg')) map.setPaintProperty('bg', 'background-color', c.background);
  if (has('atoll-fill')) map.setPaintProperty('atoll-fill', 'fill-color', c.atoll);
  if (has('atoll-outline')) map.setPaintProperty('atoll-outline', 'line-color', c.atoll);
  if (has('land-fill')) map.setPaintProperty('land-fill', 'fill-color', landFill(c));
  if (has('land-outline')) map.setPaintProperty('land-outline', 'line-color', c.landOutline);
  if (has('lines-official')) map.setPaintProperty('lines-official', 'line-color', c.official);
  if (has('lines-inferred')) map.setPaintProperty('lines-inferred', 'line-color', c.inferred);
  if (has('lines-highlight')) map.setPaintProperty('lines-highlight', 'line-color', c.highlight);
  if (has('lines-cancelled')) map.setPaintProperty('lines-cancelled', 'line-color', c.cancelled);
  if (has('stops')) {
    map.setPaintProperty('stops', 'circle-color', ['case', ['get', 'hub'], c.hub, c.stop]);
    map.setPaintProperty('stops', 'circle-stroke-color', c.halo);
  }
}

function fitToStops(map: MlMap, stops: Stop[]) {
  if (stops.length === 0) return;
  const bounds = new LngLatBounds();
  for (const s of stops) bounds.extend([s.lon, s.lat]);
  // Narrow screens: less padding, but keep room on the right for the name labels.
  const narrow = map.getContainer().clientWidth < 600;
  const padding = narrow
    ? { top: 40, bottom: 56, left: 32, right: 64 }
    : { top: 48, bottom: 64, left: 48, right: 96 };
  map.fitBounds(bounds, { padding, maxZoom: 11, duration: 0 });
}

export function MapView({
  stops,
  legs,
  highlightLegIds,
  cancelledLegIds,
  config,
  onStopClick,
}: MapViewProps) {
  const [fallback, setFallback] = useState(() => !webglSupported());
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const loadedRef = useRef(false);
  const clickRef = useRef(onStopClick);
  clickRef.current = onStopClick;
  const colors = useMapColors();
  const colorsRef = useRef(colors);
  colorsRef.current = colors;

  const segments = useMemo(
    () => buildSegments(stops, legs, highlightLegIds, cancelledLegIds, config),
    [stops, legs, highlightLegIds, cancelledLegIds, config],
  );
  const dataRef = useRef({ stops, segments });
  dataRef.current = { stops, segments };
  const [land, setLand] = useState<Overlay | null>(null);
  const [atolls, setAtolls] = useState<Overlay | null>(null);
  const [mapReady, setMapReady] = useState(false);
  // Stops on the selected journey (highlighted legs), in a stable string key for effects.
  const routeKey = useMemo(
    () => routeStopIds(legs, highlightLegIds ?? []).join(','),
    [legs, highlightLegIds],
  );

  useEffect(() => {
    let live = true;
    void loadOverlay('islands.geojson').then((o) => live && setLand(o));
    void loadOverlay('atolls.geojson').then((o) => live && setAtolls(o));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (fallback || !containerRef.current) return;
    let map: MlMap;
    try {
      map = new MlMap({
        container: containerRef.current,
        style: buildStyle(readMapColors()),
        attributionControl: false,
        center: [73.2, 4.2],
        zoom: 7,
      });
    } catch {
      setFallback(true);
      return;
    }
    mapRef.current = map;
    map.on('error', (e) => {
      if (e.error instanceof GPUInitializationError) setFallback(true);
    });
    map.on('load', () => {
      loadedRef.current = true;
      applyColors(map, colorsRef.current);
      applyData(map, dataRef.current.stops, dataRef.current.segments);
      setMapReady(true);
    });
    map.on('click', 'stops', (e) => {
      const id = e.features?.[0]?.properties?.id;
      if (typeof id === 'string') clickRef.current?.(id);
    });
    map.on('mouseenter', 'stops', () => {
      map.getCanvas().style.cursor = clickRef.current ? 'pointer' : '';
    });
    map.on('mouseleave', 'stops', () => {
      map.getCanvas().style.cursor = '';
    });
    const resizer =
      typeof ResizeObserver === 'function' ? new ResizeObserver(() => map.resize()) : null;
    resizer?.observe(containerRef.current);
    return () => {
      resizer?.disconnect();
      loadedRef.current = false;
      setMapReady(false);
      mapRef.current = null;
      map.remove();
    };
  }, [fallback]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && loadedRef.current) applyColors(map, colors);
  }, [colors]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && loadedRef.current) applyData(map, stops, segments);
  }, [stops, segments]);

  // Fit to the selected journey when there is one, otherwise to all stops.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const onRoute = new Set(routeKey ? routeKey.split(',') : []);
    const routeStops = stops.filter((s) => onRoute.has(s.id));
    fitToStops(map, routeStops.length >= 2 ? routeStops : stops);
  }, [stops, routeKey, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    (map.getSource('land') as GeoJSONSource | undefined)?.setData(land?.data ?? EMPTY);
    (map.getSource('atolls') as GeoJSONSource | undefined)?.setData(atolls?.data ?? EMPTY);
  }, [land, atolls, mapReady]);

  // OneMap licence credit (and any other attribution the overlay files carry).
  useEffect(() => {
    const map = mapRef.current;
    const text = [...new Set([land?.attribution, atolls?.attribution].filter(Boolean))].join(' | ');
    if (!map || !mapReady || !text) return;
    const control = new AttributionControl({ compact: true, customAttribution: text });
    // The credit is long: on phones put it top-right (the legend is bottom-left) and
    // start collapsed to the (i) button; tap to read it.
    const narrow = map.getContainer().clientWidth < 600;
    map.addControl(control, narrow ? 'top-right' : 'bottom-right');
    if (narrow) {
      map
        .getContainer()
        .querySelector('.maplibregl-ctrl-attrib.maplibregl-compact')
        ?.classList.remove('maplibregl-compact-show');
    }
    return () => {
      map.removeControl(control);
    };
  }, [land, atolls, mapReady]);

  // Atoll names: one quiet HTML label per atoll at its hull centroid.
  useEffect(() => {
    const map = mapRef.current;
    if (fallback || !map || !atolls) return;
    const markers = atolls.data.features.flatMap((f) => {
      const name = f.properties?.name;
      const at = polygonCentroid(f.geometry);
      if (typeof name !== 'string' || !at) return [];
      const el = document.createElement('span');
      el.className = 'map-atoll-label';
      el.textContent = name;
      return [new Marker({ element: el, anchor: 'center' }).setLngLat(at).addTo(map)];
    });
    return () => markers.forEach((m) => m.remove());
  }, [atolls, fallback, mapReady]);

  // Names as HTML labels, since the style has no glyphs for symbol layers.
  useEffect(() => {
    const map = mapRef.current;
    if (fallback || !map) return;
    const onRoute = new Set(routeKey ? routeKey.split(',') : []);
    const labels = stops
      .map((s) => {
        const el = document.createElement('span');
        el.className = 'map-label';
        el.textContent = s.name;
        const marker = new Marker({ element: el, anchor: 'left', offset: [9, 0] })
          .setLngLat([s.lon, s.lat])
          .addTo(map);
        const rank = onRoute.has(s.id) ? 0 : s.kind === 'hub' ? 1 : 2;
        return { s, el, marker, rank };
      })
      .sort((a, b) => a.rank - b.rank);
    const place = () => {
      const showAll = map.getZoom() >= LABEL_ALL_ZOOM;
      const placed: LabelBox[] = [];
      for (const { s, el, rank } of labels) {
        let show = rank < 2 || showAll;
        if (show) {
          const p = map.project([s.lon, s.lat]);
          const box = {
            x0: p.x + 9,
            y0: p.y - el.offsetHeight / 2,
            x1: p.x + 9 + el.offsetWidth,
            y1: p.y + el.offsetHeight / 2,
          };
          show = !placed.some((b) => overlaps(b, box));
          if (show) placed.push(box);
        }
        el.style.visibility = show ? '' : 'hidden';
      }
    };
    place();
    map.on('moveend', place);
    return () => {
      map.off('moveend', place);
      labels.forEach((l) => l.marker.remove());
    };
  }, [stops, routeKey, fallback, mapReady]);

  return (
    <div className="map-view">
      {fallback ? (
        <SvgMap stops={stops} segments={segments} onStopClick={onStopClick} />
      ) : (
        <>
          <div ref={containerRef} className="map-canvas" role="region" aria-label={MAP_LABEL} />
          {onStopClick && (
            <ul className="visually-hidden" aria-label="Select a stop">
              {stops.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => onStopClick(s.id)}>
                    {s.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <Legend />
    </div>
  );
}

function applyData(map: MlMap, stops: Stop[], segments: MapSegments) {
  const set = (id: string, data: FeatureCollection) =>
    (map.getSource(id) as GeoJSONSource | undefined)?.setData(data);
  set('lines', lineCollection(segments.base));
  set('highlight', lineCollection(segments.highlight));
  set('cancelled', lineCollection(segments.cancelled));
  set('stops', stopCollection(stops));
}

type SvgMapProps = {
  stops: Stop[];
  segments: MapSegments;
  onStopClick?: (stopId: string) => void;
};

const SVG_W = 1000;
const SVG_PAD = 60;

export function SvgMap({ stops, segments, onStopClick }: SvgMapProps) {
  const proj = useMemo(() => {
    if (stops.length === 0) return null;
    const lats = stops.map((s) => s.lat);
    const lons = stops.map((s) => s.lon);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
    const spanX = Math.max((maxLon - minLon) * kx, 1e-6);
    const spanY = Math.max(maxLat - minLat, 1e-6);
    const scale = (SVG_W - 2 * SVG_PAD) / Math.max(spanX, spanY);
    const w = spanX * scale + 2 * SVG_PAD;
    const h = Math.max(spanY * scale + 2 * SVG_PAD, 240);
    const offY = (h - spanY * scale) / 2;
    return {
      w,
      h,
      x: (lon: number) => SVG_PAD + (lon - minLon) * kx * scale,
      y: (lat: number) => offY + (maxLat - lat) * scale,
    };
  }, [stops]);

  if (!proj) {
    return (
      <svg className="map-svg" viewBox="0 0 1000 400" role="img" aria-labelledby="map-svg-title">
        <title id="map-svg-title">{`${MAP_LABEL} (no stops loaded)`}</title>
        <rect width="1000" height="400" className="map-svg-bg" />
      </svg>
    );
  }

  const line = (s: Segment, token: string, width: number, dash?: string, offset = 0) => {
    const x1 = proj.x(s.a.lon);
    const y1 = proj.y(s.a.lat);
    const x2 = proj.x(s.b.lon);
    const y2 = proj.y(s.b.lat);
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const ox = ((y2 - y1) / len) * offset;
    const oy = (-(x2 - x1) / len) * offset;
    return (
      <line
        key={s.key}
        x1={x1 + ox}
        y1={y1 + oy}
        x2={x2 + ox}
        y2={y2 + oy}
        style={{ stroke: `var(${token})` }}
        strokeWidth={width}
        strokeDasharray={dash}
        strokeLinecap="round"
      />
    );
  };

  return (
    <svg
      className="map-svg"
      viewBox={`0 0 ${proj.w} ${proj.h}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-labelledby="map-svg-title"
    >
      <title id="map-svg-title">{`${MAP_LABEL} (simplified view, WebGL unavailable)`}</title>
      <rect width={proj.w} height={proj.h} className="map-svg-bg" />
      <g>
        {segments.base.map((s) =>
          s.official ? line(s, '--map-official', 3) : line(s, '--map-inferred', 3, '10 7', 6),
        )}
      </g>
      <g>{segments.highlight.map((s) => line(s, '--map-highlight', 8))}</g>
      <g>{segments.cancelled.map((s) => line(s, '--map-cancelled', 5, '6 5'))}</g>
      <g>
        {stops.map((s) => (
          <g
            key={s.id}
            className={onStopClick ? 'map-svg-stop clickable' : 'map-svg-stop'}
            onClick={onStopClick ? () => onStopClick(s.id) : undefined}
            {...(onStopClick
              ? {
                  role: 'button',
                  tabIndex: 0,
                  'aria-label': s.name,
                  onKeyDown: (e: KeyboardEvent<SVGGElement>) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onStopClick(s.id);
                    }
                  },
                }
              : {})}
          >
            <circle
              cx={proj.x(s.lon)}
              cy={proj.y(s.lat)}
              r={s.kind === 'hub' ? 9 : 7}
              style={{
                fill: s.kind === 'hub' ? 'var(--map-hub)' : 'var(--map-stop)',
                stroke: 'var(--map-halo)',
              }}
              strokeWidth={2}
            />
            <text x={proj.x(s.lon) + 13} y={proj.y(s.lat) + 6} className="map-svg-label">
              {s.name}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
