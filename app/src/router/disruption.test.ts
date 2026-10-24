import { describe, expect, it } from 'vitest';
import { compareReachability } from './disruption';
import { fixture } from './fixture';
import type { Query } from './model';
import { findJourneys } from './planner';

const query: Query = { origin: 'MATHIVERI', destination: 'MALE', date: '2026-10-25', earliestDep: 0 };
const CANCEL = 'mtcc-302-1@2026-10-25';

describe('compareReachability', () => {
  it('T10 cancel Rasdhoo to Malé 11:00 on 25 Oct: baseline option disappears, recovery uses an inferred leg', () => {
    const r = compareReachability(fixture, query, CANCEL);
    const lostTrips = r.lostJourneys.map((j) => j.rides.map((x) => x.tripId));
    expect(lostTrips).toContainEqual(['301-0835', '302-1100']);
    expect(r.after.flatMap((j) => j.rides.map((x) => x.tripId))).not.toContain('302-1100');
    expect(r.brokenConnections.map((c) => [c.arriving.id, c.departing.id])).toContainEqual(['mtcc-301-1@2026-10-25', CANCEL]);
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
