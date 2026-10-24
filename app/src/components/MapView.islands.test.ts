import { describe, expect, it } from 'vitest';
import { overlaps, parseOverlay, polygonCentroid, routeStopIds } from './MapView';

describe('map overlays', () => {
  it('parses a polygon FeatureCollection and keeps its attribution', () => {
    const o = parseOverlay({
      type: 'FeatureCollection',
      attribution: ' OneMap ',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 0],
              ],
            ],
          },
        },
        { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [0, 0] } },
      ],
    });
    expect(o?.data.features).toHaveLength(1);
    expect(o?.attribution).toBe('OneMap');
  });

  it('rejects non-collections (e.g. index.html fallback parsed as junk)', () => {
    expect(parseOverlay(null)).toBeNull();
    expect(parseOverlay({ type: 'Feature' })).toBeNull();
  });

  it('computes a square centroid', () => {
    const c = polygonCentroid({
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 2],
          [0, 0],
        ],
      ],
    });
    expect(c).toEqual([1, 1]);
  });

  it('detects label box overlap', () => {
    expect(overlaps({ x0: 0, y0: 0, x1: 10, y1: 10 }, { x0: 5, y0: 5, x1: 20, y1: 20 })).toBe(true);
    expect(overlaps({ x0: 0, y0: 0, x1: 10, y1: 10 }, { x0: 30, y0: 0, x1: 40, y1: 10 })).toBe(
      false,
    );
  });

  it('collects stops on highlighted legs', () => {
    const legs = [
      { id: 'a', from: 'X', to: 'Y' },
      { id: 'b', from: 'Y', to: 'Z' },
    ] as Parameters<typeof routeStopIds>[0];
    expect(routeStopIds(legs, ['b'])).toEqual(['Y', 'Z']);
  });
});
