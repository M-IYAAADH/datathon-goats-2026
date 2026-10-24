import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  AttributionControl,
  GPUInitializationError,
  LngLatBounds,
  Map as MlMap,
  Marker,
  Popup,
  setWorkerUrl,
  type GeoJSONSource,
  type MapOptions,
} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type { Leg, Stop } from '../data/load';
import { readMapColors, useMapColors, type MapColors, type TileTint } from '../hooks/useMapColors';
import { Legend } from './Legend';
import { StopPicker, type PickRole } from './StopPicker';
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
  origin?: string;
  destination?: string;
  // When set, tapping an island offers "Set as origin" and "Set as destination".
  onPickStop?: (stopId: string, role: PickRole) => void;
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
  // Water route from a to b ([lon, lat]) out of routes.geojson; absent means a straight line.
  path?: [number, number][];
};

// Stop-pair water routes keyed by pairKey, oriented from the smaller stop id to the larger.
export type RoutePaths = Map<string, [number, number][]>;

export type MapSegments = {
  base: Segment[];
  highlight: Segment[];
  cancelled: Segment[];
};

const MAP_LABEL = 'Map of island stops and boat connections';

export function pairKey(from: string, to: string): string {
  return from < to ? `${from}|${to}` : `${to}|${from}`;
}

function inferredVisible(leg: Leg, config?: MapConfig): boolean {
  if (leg.source !== 'inferred' || !config) return true;
  const ev = leg.evidence;
  return ev !== null && ev.devices >= config.minDevices && ev.days >= config.minDays;
}

// One line per unordered stop pair and source, so an inferred service on an official pair
// still shows (drawn offset beside the official line). Follows the water route when known.
function dedupe(legs: Leg[], byId: Map<string, Stop>, paths?: RoutePaths): Segment[] {
  const out = new Map<string, Segment>();
  for (const leg of legs) {
    if (leg.from === leg.to) continue;
    const [a, b] =
      leg.from < leg.to
        ? [byId.get(leg.from), byId.get(leg.to)]
        : [byId.get(leg.to), byId.get(leg.from)];
    if (!a || !b) continue;
    const official = leg.source === 'mtcc';
    const pair = pairKey(a.id, b.id);
    const key = `${pair}|${leg.source}`;
    const path = paths?.get(pair);
    if (!out.has(key)) out.set(key, path ? { key, a, b, official, path } : { key, a, b, official });
  }
  return [...out.values()];
}

export function buildSegments(
  stops: Stop[],
  legs: Leg[],
  highlightLegIds: string[] = [],
  cancelledLegIds: string[] = [],
  config?: MapConfig,
  paths?: RoutePaths,
): MapSegments {
  const byId = new Map(stops.map((s) => [s.id, s]));
  const hi = new Set(highlightLegIds);
  const cx = new Set(cancelledLegIds);
  return {
    base: dedupe(
      legs.filter((l) => inferredVisible(l, config)),
      byId,
      paths,
    ),
    highlight: dedupe(
      legs.filter((l) => hi.has(l.id)),
      byId,
      paths,
    ),
    cancelled: dedupe(
      legs.filter((l) => cx.has(l.id)),
      byId,
      paths,
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
        coordinates: s.path ?? [
          [s.a.lon, s.a.lat],
          [s.b.lon, s.b.lat],
        ],
      },
    })),
  };
}

function stopCollection(stops: Stop[], origin?: string, destination?: string): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: stops.map((s) => ({
      type: 'Feature',
      properties: {
        id: s.id,
        hub: s.kind === 'hub',
        role: s.id === origin ? 'origin' : s.id === destination ? 'destination' : '',
      },
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

export type RouteSet = { paths: RoutePaths; attribution: string };

const dist = (p: [number, number], s: Stop) => Math.hypot(p[0] - s.lon, p[1] - s.lat);

// routes.geojson (tools/build_shapes.py --bundle): one LineString per stop pair, properties
// a and b. Paths are re-oriented from the smaller stop id to the larger and their ends snapped
// to the stop positions. Unusable features are skipped, so those pairs draw straight.
export function parseRoutes(raw: unknown, stops: Stop[]): RouteSet | null {
  if (!raw || typeof raw !== 'object') return null;
  const fc = raw as { type?: unknown; features?: unknown; attribution?: unknown };
  if (fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) return null;
  const byId = new Map(stops.map((s) => [s.id, s]));
  const paths: RoutePaths = new Map();
  for (const f of fc.features as ({ properties?: unknown; geometry?: unknown } | null)[]) {
    const props = (f?.properties ?? {}) as { a?: unknown; b?: unknown };
    const g = (f?.geometry ?? {}) as { type?: unknown; coordinates?: unknown };
    if (typeof props.a !== 'string' || typeof props.b !== 'string') continue;
    if (g.type !== 'LineString' || !Array.isArray(g.coordinates)) continue;
    const [lo, hi] = props.a < props.b ? [props.a, props.b] : [props.b, props.a];
    const a = byId.get(lo);
    const b = byId.get(hi);
    const pts = (g.coordinates as unknown[])
      .filter(
        (c): c is [number, number] =>
          Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]),
      )
      .map((c): [number, number] => [c[0], c[1]]);
    if (!a || !b || pts.length < 2) continue;
    const last = pts.length - 1;
    if (dist(pts[0], b) + dist(pts[last], a) < dist(pts[0], a) + dist(pts[last], b)) pts.reverse();
    pts[0] = [a.lon, a.lat];
    pts[last] = [b.lon, b.lat];
    paths.set(pairKey(lo, hi), pts);
  }
  return {
    paths,
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

async function loadRoutes(stops: Stop[]): Promise<RouteSet | null> {
  const file = 'routes.geojson';
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/${file}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed = parseRoutes(await res.json(), stops);
    if (!parsed) throw new Error('not a GeoJSON FeatureCollection');
    return parsed;
  } catch (e) {
    if (warnedOverlays.has(file)) return null;
    warnedOverlays.add(file);
    console.warn(
      `Map: ${file} not loaded, drawing straight lines (${e instanceof Error ? e.message : String(e)})`,
    );
    return null;
  }
}

function landFill(c: MapColors) {
  return ['case', ['==', ['get', 'isStop'], true], c.landStop, c.land] as unknown as string;
}

function stopFill(c: MapColors) {
  return [
    'case',
    ['==', ['get', 'role'], 'origin'],
    c.origin,
    ['==', ['get', 'role'], 'destination'],
    c.destination,
    ['get', 'hub'],
    c.hub,
    c.stop,
  ] as unknown as string;
}

function tilePaint(t: TileTint) {
  return {
    'raster-opacity': t.opacity,
    'raster-hue-rotate': t.hue,
    'raster-saturation': t.saturation,
    'raster-contrast': t.contrast,
    'raster-brightness-min': t.brightnessMin,
    'raster-brightness-max': t.brightnessMax,
  };
}

const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

// OpenStreetMap raster tiles, tinted by the theme tokens, under the local GeoJSON overlays.
// Offline the tiles just fail and the plain water background shows. No glyphs or sprites.
function buildStyle(c: MapColors): Exclude<MapOptions['style'], string | undefined> {
  return {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 19,
        attribution: OSM_ATTRIBUTION,
      },
      atolls: { type: 'geojson', data: EMPTY },
      land: { type: 'geojson', data: EMPTY },
      lines: { type: 'geojson', data: EMPTY },
      highlight: { type: 'geojson', data: EMPTY },
      cancelled: { type: 'geojson', data: EMPTY },
      stops: { type: 'geojson', data: EMPTY },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': c.background } },
      { id: 'basemap', type: 'raster', source: 'osm', paint: tilePaint(c.tile) },
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
          'circle-radius': ['case', ['!=', ['get', 'role'], ''], 8, ['get', 'hub'], 7, 5],
          'circle-color': stopFill(c),
          'circle-stroke-color': c.halo,
          'circle-stroke-width': ['case', ['!=', ['get', 'role'], ''], 2.5, 1.5],
        },
      },
    ],
  };
}

function applyColors(map: MlMap, c: MapColors) {
  const has = (layer: string) => !!map.getLayer(layer);
  if (has('bg')) map.setPaintProperty('bg', 'background-color', c.background);
  if (has('basemap')) {
    const paint = tilePaint(c.tile);
    for (const prop of Object.keys(paint) as (keyof typeof paint)[]) {
      map.setPaintProperty('basemap', prop, paint[prop]);
    }
  }
  if (has('atoll-fill')) map.setPaintProperty('atoll-fill', 'fill-color', c.atoll);
  if (has('atoll-outline')) map.setPaintProperty('atoll-outline', 'line-color', c.atoll);
  if (has('land-fill')) map.setPaintProperty('land-fill', 'fill-color', landFill(c));
  if (has('land-outline')) map.setPaintProperty('land-outline', 'line-color', c.landOutline);
  if (has('lines-official')) map.setPaintProperty('lines-official', 'line-color', c.official);
  if (has('lines-inferred')) map.setPaintProperty('lines-inferred', 'line-color', c.inferred);
  if (has('lines-highlight')) map.setPaintProperty('lines-highlight', 'line-color', c.highlight);
  if (has('lines-cancelled')) map.setPaintProperty('lines-cancelled', 'line-color', c.cancelled);
  if (has('stops')) {
    map.setPaintProperty('stops', 'circle-color', stopFill(c));
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
  origin,
  destination,
  onPickStop,
}: MapViewProps) {
  const [fallback, setFallback] = useState(() => !webglSupported());
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const loadedRef = useRef(false);
  const pickRef = useRef(onPickStop);
  pickRef.current = onPickStop;
  const popupRef = useRef<Popup | null>(null);
  const [picked, setPicked] = useState<{ stop: Stop; el: HTMLElement } | null>(null);
  const colors = useMapColors();
  const colorsRef = useRef(colors);
  colorsRef.current = colors;

  const [routes, setRoutes] = useState<RouteSet | null>(null);
  const segments = useMemo(
    () => buildSegments(stops, legs, highlightLegIds, cancelledLegIds, config, routes?.paths),
    [stops, legs, highlightLegIds, cancelledLegIds, config, routes],
  );
  const dataRef = useRef({ stops, segments, origin, destination });
  dataRef.current = { stops, segments, origin, destination };
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

  // Water routes are keyed by stop id, so they are parsed once the stops are known.
  useEffect(() => {
    if (stops.length === 0) return;
    let live = true;
    void loadRoutes(stops).then((r) => live && setRoutes(r));
    return () => {
      live = false;
    };
  }, [stops]);

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
      const d = dataRef.current;
      applyData(map, d.stops, d.segments, d.origin, d.destination);
      setMapReady(true);
    });
    // Tapping an island opens a popup whose content (StopPicker) is rendered through a portal.
    map.on('click', 'stops', (e) => {
      const id = e.features?.[0]?.properties?.id;
      const stop = dataRef.current.stops.find((s) => s.id === id);
      if (!stop || !pickRef.current) return;
      popupRef.current?.remove();
      const el = document.createElement('div');
      const popup = new Popup({ offset: 12, maxWidth: '260px', closeButton: false })
        .setLngLat([stop.lon, stop.lat])
        .setDOMContent(el)
        .addTo(map);
      popup.on('close', () => {
        if (popupRef.current === popup) popupRef.current = null;
        setPicked((p) => (p?.el === el ? null : p));
      });
      popupRef.current = popup;
      setPicked({ stop, el });
    });
    map.on('mouseenter', 'stops', () => {
      map.getCanvas().style.cursor = pickRef.current ? 'pointer' : '';
    });
    map.on('mouseleave', 'stops', () => {
      map.getCanvas().style.cursor = '';
    });
    const resizer =
      typeof ResizeObserver === 'function' ? new ResizeObserver(() => map.resize()) : null;
    resizer?.observe(containerRef.current);
    return () => {
      resizer?.disconnect();
      popupRef.current?.remove();
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
    if (map && loadedRef.current) applyData(map, stops, segments, origin, destination);
  }, [stops, segments, origin, destination]);

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

  // OpenStreetMap credit (from the tile source) plus the OneMap licence and any other
  // attribution the overlay and route files carry.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const text = [
      ...new Set([land?.attribution, atolls?.attribution, routes?.attribution].filter(Boolean)),
    ].join(' | ');
    const control = new AttributionControl({
      compact: true,
      customAttribution: text || undefined,
    });
    // The credit is long: start collapsed to the (i) button at every width (tap to read it),
    // and on phones put it top-right since the legend is bottom-left.
    const narrow = map.getContainer().clientWidth < 600;
    map.addControl(control, narrow ? 'top-right' : 'bottom-right');
    map
      .getContainer()
      .querySelector('.maplibregl-ctrl-attrib.maplibregl-compact')
      ?.classList.remove('maplibregl-compact-show');
    return () => {
      map.removeControl(control);
    };
  }, [land, atolls, routes, mapReady]);

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

  // Names as HTML labels, since the style has no glyphs for symbol layers. Origin and
  // destination carry "From" / "To" so the choice is not shown by colour alone.
  useEffect(() => {
    const map = mapRef.current;
    if (fallback || !map) return;
    const onRoute = new Set(routeKey ? routeKey.split(',') : []);
    const labels = stops
      .map((s) => {
        const el = document.createElement('span');
        el.className = 'map-label';
        el.textContent = stopLabel(s, origin, destination);
        const marker = new Marker({ element: el, anchor: 'left', offset: [9, 0] })
          .setLngLat([s.lon, s.lat])
          .addTo(map);
        const chosen = s.id === origin || s.id === destination;
        const rank = chosen || onRoute.has(s.id) ? 0 : s.kind === 'hub' ? 1 : 2;
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
  }, [stops, routeKey, origin, destination, fallback, mapReady]);

  return (
    <div className="map-view">
      {fallback ? (
        <SvgMap
          stops={stops}
          segments={segments}
          origin={origin}
          destination={destination}
          onPickStop={onPickStop}
        />
      ) : (
        <div ref={containerRef} className="map-canvas" role="region" aria-label={MAP_LABEL} />
      )}
      {picked &&
        createPortal(
          <StopPicker
            stop={picked.stop}
            onPick={(role) => {
              onPickStop?.(picked.stop.id, role);
              popupRef.current?.remove();
            }}
            onClose={() => popupRef.current?.remove()}
          />,
          picked.el,
        )}
      <Legend />
    </div>
  );
}

function stopLabel(s: Stop, origin?: string, destination?: string): string {
  if (s.id === origin) return `From: ${s.name}`;
  if (s.id === destination) return `To: ${s.name}`;
  return s.name;
}

function applyData(
  map: MlMap,
  stops: Stop[],
  segments: MapSegments,
  origin?: string,
  destination?: string,
) {
  const set = (id: string, data: FeatureCollection) =>
    (map.getSource(id) as GeoJSONSource | undefined)?.setData(data);
  set('lines', lineCollection(segments.base));
  set('highlight', lineCollection(segments.highlight));
  set('cancelled', lineCollection(segments.cancelled));
  set('stops', stopCollection(stops, origin, destination));
}

type SvgMapProps = {
  stops: Stop[];
  segments: MapSegments;
  origin?: string;
  destination?: string;
  onPickStop?: (stopId: string, role: PickRole) => void;
};

const SVG_W = 1000;
const SVG_PAD = 60;

export function SvgMap({ stops, segments, origin, destination, onPickStop }: SvgMapProps) {
  const [pickedId, setPickedId] = useState<string | null>(null);
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

  // Follows the water route when there is one; inferred lines are offset beside official ones.
  const line = (s: Segment, token: string, width: number, dash?: string, offset = 0) => {
    const pts = (
      s.path ?? [
        [s.a.lon, s.a.lat],
        [s.b.lon, s.b.lat],
      ]
    ).map(([lon, lat]) => [proj.x(lon), proj.y(lat)]);
    const [x1, y1] = pts[0];
    const [x2, y2] = pts[pts.length - 1];
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const ox = ((y2 - y1) / len) * offset;
    const oy = (-(x2 - x1) / len) * offset;
    return (
      <polyline
        key={s.key}
        points={pts.map(([x, y]) => `${x + ox},${y + oy}`).join(' ')}
        fill="none"
        style={{ stroke: `var(${token})` }}
        strokeWidth={width}
        strokeDasharray={dash}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  };

  const fill = (s: Stop) =>
    s.id === origin
      ? 'var(--map-origin)'
      : s.id === destination
        ? 'var(--map-destination)'
        : s.kind === 'hub'
          ? 'var(--map-hub)'
          : 'var(--map-stop)';
  const pickedStop = stops.find((s) => s.id === pickedId);

  return (
    <>
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
              className={onPickStop ? 'map-svg-stop clickable' : 'map-svg-stop'}
              onClick={onPickStop ? () => setPickedId(s.id) : undefined}
              {...(onPickStop
                ? {
                    role: 'button',
                    tabIndex: 0,
                    'aria-label': stopLabel(s, origin, destination),
                    onKeyDown: (e: KeyboardEvent<SVGGElement>) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setPickedId(s.id);
                      }
                    },
                  }
                : {})}
            >
              <circle
                cx={proj.x(s.lon)}
                cy={proj.y(s.lat)}
                r={s.id === origin || s.id === destination ? 11 : s.kind === 'hub' ? 9 : 7}
                style={{ fill: fill(s), stroke: 'var(--map-halo)' }}
                strokeWidth={2}
              />
              <text x={proj.x(s.lon) + 13} y={proj.y(s.lat) + 6} className="map-svg-label">
                {stopLabel(s, origin, destination)}
              </text>
            </g>
          ))}
        </g>
      </svg>
      {pickedStop && onPickStop && (
        <div className="map-pick-card">
          <StopPicker
            stop={pickedStop}
            onPick={(role) => {
              onPickStop(pickedStop.id, role);
              setPickedId(null);
            }}
            onClose={() => setPickedId(null)}
          />
        </div>
      )}
    </>
  );
}
