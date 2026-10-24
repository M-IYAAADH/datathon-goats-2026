import { describe, expect, it } from 'vitest';
import {
  applyCancellation,
  compareReachability,
  MTCC_APPROVAL_NOTE,
  modelledConnections,
  proposeShifts,
} from './disruption';
import { fixture } from './fixture';
import type { Bundle, Leg, Query } from './model';
import { findJourneys } from './planner';
import { expandOccurrences } from './time';

const query: Query = {
  origin: 'MATHIVERI',
  destination: 'MALE',
  date: '2026-10-25',
  earliestDep: 0,
};
const CANCEL = 'mtcc-302-1@2026-10-25';

describe('compareReachability', () => {
  it('T10 cancel Rasdhoo to Malé 11:00 on 25 Oct: baseline option disappears, recovery uses an inferred leg', () => {
    const r = compareReachability(fixture, query, CANCEL);
    const lostTrips = r.lostJourneys.map((j) => j.rides.map((x) => x.tripId));
    expect(lostTrips).toContainEqual(['301-0835', '302-1100']);
    expect(r.after.flatMap((j) => j.rides.map((x) => x.tripId))).not.toContain('302-1100');
    expect(r.brokenConnections.map((c) => [c.arriving.id, c.departing.id])).toContainEqual([
      'mtcc-301-1@2026-10-25',
      CANCEL,
    ]);
    expect(r.recovery.length).toBeGreaterThan(0);
    expect(r.recovery.every((j) => j.usesInferred)).toBe(true);
    expect(r.newBest).toBe(r.after[0]);
  });

  it('T11 after T10, reset gives results identical to baseline and the bundle is untouched', () => {
    const snapshot = JSON.stringify(fixture);
    const baseline = findJourneys(fixture, query);
    compareReachability(fixture, query, CANCEL);
    expect(findJourneys(fixture, query)).toEqual(baseline);
    expect(JSON.stringify(fixture)).toBe(snapshot);
  });
});

describe('modelledConnections', () => {
  it('picks the earliest catchable boat on each onward route', () => {
    const second: Leg = {
      ...fixture.legs[1],
      id: 'mtcc-302-2',
      tripId: '302-1200',
      dep: { min: 720, max: 720 },
      arr: { min: 910, max: 910 },
    };
    const bundle = { ...fixture, legs: [...fixture.legs, second] };
    const conns = modelledConnections(bundle, expandOccurrences(bundle.legs, '2026-10-25', 48));
    const fromMathiveri = conns.filter(
      (c) => c.arriving.id === 'mtcc-301-1@2026-10-25' && c.departing.leg.routeId === '302',
    );
    expect(fromMathiveri.map((c) => c.departing.id)).toEqual(['mtcc-302-1@2026-10-25']);
  });
});

describe('proposeShifts', () => {
  // Private boat leaves 11:00 to 11:30: the 10:55 arrival plus the 15 min buffer only makes it Possible.
  const tight = (extra: Leg[] = []): Bundle => ({
    ...fixture,
    legs: [
      ...fixture.legs.map((l) =>
        l.id === 'inf-ras-mle-1110' ? { ...l, dep: { min: 660, max: 690 } } : l,
      ),
      ...extra,
    ],
  });
  const setup = (bundle: Bundle) => {
    const occs = applyCancellation(expandOccurrences(bundle.legs, '2026-10-25', 48), CANCEL);
    const target = modelledConnections(bundle, occs).find(
      (c) => c.arriving.id === 'mtcc-301-1@2026-10-25' && c.departing.leg.id === 'inf-ras-mle-1110',
    )!;
    return { occs, target };
  };

  it('T12 an already-Safe transfer gets no proposal', () => {
    const occs = expandOccurrences(fixture.legs, '2026-10-25', 48);
    const target = modelledConnections(fixture, occs).find(
      (c) => c.arriving.id === 'mtcc-301-1@2026-10-25' && c.departing.id === CANCEL,
    )!;
    expect(target.assessment.status).toBe('safe');
    expect(proposeShifts(fixture, occs, target)).toEqual({ proposals: [], rejected: [] });
  });

  it('T12 proposes the smallest 5-minute step that makes the transfer Safe, with the MTCC approval text', () => {
    const bundle = tight();
    const { occs, target } = setup(bundle);
    expect(target.assessment.status).toBe('possible');
    const r = proposeShifts(bundle, occs, target);
    expect(r.proposals[0]).toMatchObject({
      shiftMin: -10,
      newDep: { min: 505 },
      newArr: { min: 645 },
      note: MTCC_APPROVAL_NOTE,
    });
    expect(
      r.proposals.every(
        (p) => p.shiftMin % 5 === 0 && Math.abs(p.shiftMin) <= 30 && p.note === MTCC_APPROVAL_NOTE,
      ),
    ).toBe(true);
  });

  it('T12 rejects a shift that breaks another connection, and then reports no safe shift', () => {
    const feeder: Leg = {
      ...fixture.legs[0],
      id: 'feeder',
      tripId: 'feeder',
      routeId: 'f',
      from: 'RASDHOO',
      to: 'MATHIVERI',
      dep: { min: 450, max: 450 },
      arr: { min: 505, max: 505 },
    };
    const bundle = tight([feeder]);
    const { occs, target } = setup(bundle);
    const r = proposeShifts(bundle, occs, target);
    expect(r.proposals).toEqual([]);
    expect(r.rejected.map((x) => x.shiftMin)).toEqual([-10, -15, -20, -25, -30]);
    expect(r.rejected[0].breaks[0].arriving.leg.id).toBe('feeder');
  });

  it('T12 moves the whole trip, so a connection into an earlier segment of the same boat can reject the shift', () => {
    // Trip 301 becomes Mathiveri 08:35 -> Ukulhas 09:40, Ukulhas 09:45 -> Rasdhoo 10:55; a feeder reaches Mathiveri 08:25.
    const [first, ...rest] = tight().legs;
    const seg1: Leg = { ...first, id: 'mtcc-301-0', to: 'UKULHAS', arr: { min: 580, max: 580 } };
    const seg2: Leg = { ...first, from: 'UKULHAS', dep: { min: 585, max: 585 } };
    const feeder: Leg = {
      ...first,
      id: 'feeder',
      tripId: 'feeder',
      routeId: 'f',
      from: 'RASDHOO',
      to: 'MATHIVERI',
      dep: { min: 450, max: 450 },
      arr: { min: 505, max: 505 },
    };
    const ukulhas = { ...fixture.stops[0], id: 'UKULHAS', name: 'Ukulhas' };
    const bundle: Bundle = {
      ...fixture,
      stops: [...fixture.stops, ukulhas],
      legs: [seg1, seg2, ...rest, feeder],
    };
    const occs = applyCancellation(expandOccurrences(bundle.legs, '2026-10-25', 48), CANCEL);
    const target = modelledConnections(bundle, occs).find(
      (c) => c.arriving.id === 'mtcc-301-1@2026-10-25' && c.departing.leg.id === 'inf-ras-mle-1110',
    )!;
    // Feeder 08:25 + 5 min buffer = 08:30 <= 08:35 departure: Safe now, Missed once the trip moves 10 min earlier.
    const r = proposeShifts(bundle, occs, target);
    expect(r.proposals).toEqual([]);
    expect(r.rejected[0]).toMatchObject({ shiftMin: -10 });
    expect(r.rejected[0].breaks.map((c) => c.departing.id)).toEqual(['mtcc-301-0@2026-10-25']);
  });
});
