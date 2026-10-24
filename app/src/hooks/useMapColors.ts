import { useEffect, useState } from 'react';

// MapLibre raster paint values for the OpenStreetMap tiles (hue in degrees, others -1..1 or 0..1).
export type TileTint = {
  opacity: number;
  hue: number;
  saturation: number;
  contrast: number;
  brightnessMin: number;
  brightnessMax: number;
};

export type MapColors = {
  background: string;
  official: string;
  inferred: string;
  highlight: string;
  cancelled: string;
  stop: string;
  hub: string;
  halo: string;
  land: string;
  landStop: string;
  landOutline: string;
  atoll: string;
  origin: string;
  destination: string;
  tile: TileTint;
};

type ColorKey = Exclude<keyof MapColors, 'tile'>;

// Used only when a --map-* custom property is empty (tests, no stylesheet loaded).
const FALLBACK: MapColors = {
  background: '#d7ebf0',
  official: '#1d5fbf',
  inferred: '#0f8a7e',
  highlight: '#e69500',
  cancelled: '#d0302a',
  stop: '#0f1f24',
  hub: '#0b6e78',
  halo: '#ffffff',
  land: '#efe6cf',
  landStop: '#e3d3a8',
  landOutline: '#b9a77a',
  atoll: '#5f8f9a',
  origin: '#111827',
  destination: '#7c3aed',
  tile: {
    opacity: 0.6,
    hue: 0,
    saturation: -0.55,
    contrast: -0.1,
    brightnessMin: 0.08,
    brightnessMax: 1,
  },
};

const VARS: Record<ColorKey, string> = {
  background: '--map-water',
  official: '--map-official',
  inferred: '--map-inferred',
  highlight: '--map-highlight',
  cancelled: '--map-cancelled',
  stop: '--map-stop',
  hub: '--map-hub',
  halo: '--map-halo',
  land: '--map-land',
  landStop: '--map-land-stop',
  landOutline: '--map-land-outline',
  atoll: '--map-atoll',
  origin: '--map-origin',
  destination: '--map-destination',
};

const TILE_VARS: Record<keyof TileTint, string> = {
  opacity: '--map-tile-opacity',
  hue: '--map-tile-hue',
  saturation: '--map-tile-saturation',
  contrast: '--map-tile-contrast',
  brightnessMin: '--map-tile-brightness-min',
  brightnessMax: '--map-tile-brightness-max',
};

export function readMapColors(): MapColors {
  if (typeof document === 'undefined') return FALLBACK;
  const style = getComputedStyle(document.documentElement);
  const out = { ...FALLBACK, tile: { ...FALLBACK.tile } };
  for (const key of Object.keys(VARS) as ColorKey[]) {
    const value = style.getPropertyValue(VARS[key]).trim();
    if (value) out[key] = value;
  }
  for (const key of Object.keys(TILE_VARS) as (keyof TileTint)[]) {
    const value = parseFloat(style.getPropertyValue(TILE_VARS[key]));
    if (Number.isFinite(value)) out.tile[key] = value;
  }
  return out;
}

function sameColors(a: MapColors, b: MapColors): boolean {
  return (
    (Object.keys(VARS) as ColorKey[]).every((k) => a[k] === b[k]) &&
    (Object.keys(TILE_VARS) as (keyof TileTint)[]).every((k) => a.tile[k] === b.tile[k])
  );
}

// Re-reads the tokens when data-theme changes on <html> or the OS colour scheme flips.
export function useMapColors(): MapColors {
  const [colors, setColors] = useState(readMapColors);

  useEffect(() => {
    const update = () => {
      const next = readMapColors();
      setColors((prev) => (sameColors(prev, next) ? prev : next));
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    const media =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;
    media?.addEventListener('change', update);
    return () => {
      observer.disconnect();
      media?.removeEventListener('change', update);
    };
  }, []);

  return colors;
}
