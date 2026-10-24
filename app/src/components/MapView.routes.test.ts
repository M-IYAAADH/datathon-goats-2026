import { describe, expect, it } from 'vitest';
import type { Leg, Stop } from '../data/load';
import { buildSegments, pairKey, parseRoutes } from './MapView';

const stop = (id: string, lon: number, lat: number): Stop =>
  ({ id, name: id, atoll: 'K', lat, lon, censusKey: null, kind: 'island' }) as Stop;

const A = stop('AAA', 73.0, 4.0);
const B = stop('BBB', 73.2, 4.2);
const STOPS = [A, B];

const leg = { id: 'l1', source: 'mtcc', from: 'BBB', to: 'AAA' } as Leg;

function routes(a: string, b: string, coordinates: unknown) {
  return {
    type: 'FeatureCollection',
    attribution: ' OSM ',
    features: [
      { type: 'Feature', properties: { a, b }, geometry: { type: 'LineString', coordinates } },
    ],
  };
}

describe('water routes', () => {
  it('orients each path from the smaller stop id and snaps its ends to the stops', () => {
    // Stored B -> A with slightly-off ends.
    const r = parseRoutes(
      routes('BBB', 'AAA', [
        [73.201, 4.199],
        [73.15, 4.05],
        [73.001, 4.001],
      ]),
      STOPS,
    );
    expect(r?.attribution).toBe('OSM');
    expect(r?.paths.get(pairKey('AAA', 'BBB'))).toEqual([
      [73.0, 4.0],
      [73.15, 4.05],
      [73.2, 4.2],
    ]);
  });

  it('skips features for unknown stops or with too few points', () => {
    const r = parseRoutes(
      routes('AAA', 'ZZZ', [
        [73, 4],
        [74, 5],
      ]),
      STOPS,
    );
    expect(r?.paths.size).toBe(0);
    expect(parseRoutes(routes('AAA', 'BBB', [[73, 4]]), STOPS)?.paths.size).toBe(0);
    expect(parseRoutes({ type: 'Feature' }, STOPS)).toBeNull();
  });

  it('draws segments along the route when one exists, straight otherwise', () => {
    const path: [number, number][] = [
      [73.0, 4.0],
      [73.15, 4.05],
      [73.2, 4.2],
    ];
    const withPath = buildSegments(
      STOPS,
      [leg],
      ['l1'],
      [],
      undefined,
      new Map([['AAA|BBB', path]]),
    );
    expect(withPath.base[0].path).toEqual(path);
    expect(withPath.highlight[0].path).toEqual(path);
    expect(buildSegments(STOPS, [leg]).base[0].path).toBeUndefined();
  });
});
