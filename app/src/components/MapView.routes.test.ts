import { describe, expect, it } from 'vitest';
import stops from '../../public/data/stops.json';
import legs from '../../public/data/legs.json';
import config from '../../public/data/config.json';
import type { Leg, Stop } from '../data/load';
import { buildSegments } from './MapView';

const allStops = stops as Stop[];
const allLegs = legs as Leg[];
const official = allLegs.find((l) => l.source === 'mtcc')!;
const inferred = allLegs.find((l) => l.source === 'inferred')!;

describe('map route lines', () => {
  it('draws no route lines until a journey is shown', () => {
    expect(buildSegments(allStops, allLegs, [], [], config).base).toEqual([]);
  });

  it('draws only the shown legs, official solid and inferred dashed', () => {
    const { base } = buildSegments(allStops, allLegs, [official.id, inferred.id], [], config);
    expect(base.map((s) => s.official).sort()).toEqual([false, true]);
  });

  it('never draws an inferred leg below the disclosure minimum', () => {
    const hidden = { ...inferred, id: 'hidden', evidence: { ...inferred.evidence!, devices: 1 } };
    expect(buildSegments(allStops, [hidden], ['hidden'], [], config).base).toEqual([]);
  });
});
