import { useEffect, useState } from 'react';

export type MapColors = {
  background: string;
  official: string;
  inferred: string;
  highlight: string;
  cancelled: string;
  stop: string;
  hub: string;
  halo: string;
};

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
};

const VARS: Record<keyof MapColors, string> = {
  background: '--map-water',
  official: '--map-official',
  inferred: '--map-inferred',
  highlight: '--map-highlight',
  cancelled: '--map-cancelled',
  stop: '--map-stop',
  hub: '--map-hub',
  halo: '--map-halo',
};

export function readMapColors(): MapColors {
  if (typeof document === 'undefined') return FALLBACK;
  const style = getComputedStyle(document.documentElement);
  const out = { ...FALLBACK };
  for (const key of Object.keys(VARS) as (keyof MapColors)[]) {
    const value = style.getPropertyValue(VARS[key]).trim();
    if (value) out[key] = value;
  }
  return out;
}

function sameColors(a: MapColors, b: MapColors): boolean {
  return (Object.keys(VARS) as (keyof MapColors)[]).every((k) => a[k] === b[k]);
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
