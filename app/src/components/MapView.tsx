import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
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

// Plain background only: no tiles, no glyphs, no sprites, so nothing is fetched.
function buildStyle(c: MapColors): Exclude<MapOptions['style'], string | undefined> {
  return {
    version: 8,
    sources: {
      lines: { type: 'geojson', data: EMPTY },
      highlight: { type: 'geojson', data: EMPTY },
      cancelled: { type: 'geojson', data: EMPTY },
      stops: { type: 'geojson', data: EMPTY },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': c.background } },
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
  map.fitBounds(bounds, { padding: 48, maxZoom: 11, duration: 0 });
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
      fitToStops(map, dataRef.current.stops);
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

  useEffect(() => {
    const map = mapRef.current;
    if (map && loadedRef.current) fitToStops(map, stops);
  }, [stops]);

  // Names as HTML labels, since the style has no glyphs for symbol layers.
  useEffect(() => {
    const map = mapRef.current;
    if (fallback || !map) return;
    const markers = stops.map((s) => {
      const el = document.createElement('span');
      el.className = 'map-label';
      el.textContent = s.name;
      return new Marker({ element: el, anchor: 'left', offset: [9, 0] })
        .setLngLat([s.lon, s.lat])
        .addTo(map);
    });
    return () => markers.forEach((m) => m.remove());
  }, [stops, fallback]);

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
