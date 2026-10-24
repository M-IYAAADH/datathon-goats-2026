import { describe, expect, it } from 'vitest';
import { fixture } from './fixture';
import type { Journey, Query } from './model';
import { findJourneys, findWaitAlternatives } from './planner';

const q = (origin: string, date: string, earliestDep = 0): Query => ({ origin, destination: 'MALE', date, earliestDep });
const official = (js: Journey[]) => js.find((j) => !j.usesInferred);

describe('findJourneys', () => {
  it('T5 and T9 Maafushi to Malé, Sat 24 Oct: route 309 via Gulhi 07:25 to 09:05 is one ride, zero transfers', () => {
    const [j] = findJourneys(fixture, q('MAAFUSHI', '2026-10-24'));
    expect(j.rides).toHaveLength(1);
    expect(j.transfers).toEqual([]);
    expect(j.rides[0].occurrences.map((o) => o.leg.to)).toEqual(['GULHI', 'MALE']);
    expect([j.dep.min, j.arr.max]).toEqual([445, 545]);
  });

  it('T7 Mathiveri to Malé, Sun 25 Oct: 08:35, Rasdhoo 10:55, Safe 5 min wait, 11:00, Malé 14:10', () => {
    const js = findJourneys(fixture, q('MATHIVERI', '2026-10-25'));
    const j = official(js)!;
    expect(j.rides.map((r) => [r.from, r.dep.min, r.to, r.arr.min])).toEqual([
      ['MATHIVERI', 515, 'RASDHOO', 655],
      ['RASDHOO', 660, 'MALE', 850],
    ]);
    expect(j.transfers[0].assessment).toMatchObject({ status: 'safe', waitMin: [5, 5], long: false });
    expect(js.length).toBeLessThanOrEqual(3);
    expect(js.map((x) => x.arr.max)).toEqual([...js.map((x) => x.arr.max)].sort((a, b) => a - b));
  });

  it('T8 Thoddoo to Malé, Sun 25 Oct: 3 h 20 min wait at Rasdhoo is flagged long; hidden inferred leg is never used', () => {
    const js = findJourneys(fixture, q('THODDOO', '2026-10-25'));
    const j = official(js)!;
    expect([j.dep.min, j.arr.max]).toEqual([390, 850]);
    expect(j.transfers[0].assessment).toMatchObject({ status: 'safe', waitMin: [200, 200], long: true });
    expect(js.flatMap((x) => x.rides.map((r) => r.tripId))).not.toContain('inf-hidden');
  });

  it('officialOnly drops every inferred leg; default keeps them', () => {
    const all = findJourneys(fixture, q('MATHIVERI', '2026-10-25'));
    expect(all.some((j) => j.usesInferred)).toBe(true);
    const off = findJourneys(fixture, { ...q('MATHIVERI', '2026-10-25'), officialOnly: true });
    expect(off.length).toBeGreaterThan(0);
    expect(off.every((j) => !j.usesInferred)).toBe(true);
    expect(off.map((j) => j.rides.map((r) => r.tripId))).toEqual([['301-0835', '302-1100']]);
  });

  it('T13 same query on Fri 30 Oct: Rasdhoo to Malé 11:00 not offered', () => {
    const js = findJourneys(fixture, q('MATHIVERI', '2026-10-30'));
    expect(js.flatMap((j) => j.rides.map((r) => r.tripId))).not.toContain('302-1100');
  });

  it('respects earliest departure', () => {
    expect(findJourneys(fixture, q('MAAFUSHI', '2026-10-24', 450))).toEqual([]);
  });
});

describe('findWaitAlternatives', () => {
  it('T8 the 3 h 20 min wait at Rasdhoo gets an inferred alternative with a saving range', () => {
    const query = q('THODDOO', '2026-10-25');
    const j = official(findJourneys(fixture, query))!;
    const r = findWaitAlternatives(fixture, query, j, 0);
    expect(r.stop).toBe('RASDHOO');
    expect(r.alternatives.map((a) => [a.journey.rides[0].tripId, a.savingMin])).toEqual([['inf-ras-mle-1110', [60, 90]]]);
  });

  it('boats that leave too soon after the arrival do not crowd out a catchable alternative', () => {
    const query = q('THODDOO', '2026-10-25');
    const tooSoon = [1, 2, 3].map((n) => ({
      ...fixture.legs.find((l) => l.id === 'inf-ras-mle-1110')!,
      id: `too-soon-${n}`, tripId: `too-soon-${n}`, dep: { min: 465, max: 470 }, arr: { min: 500, max: 520 },
    }));
    const bundle = { ...fixture, legs: [...fixture.legs, ...tooSoon] };
    const j = official(findJourneys(bundle, query))!;
    expect(findWaitAlternatives(bundle, query, j, 0).alternatives.map((a) => a.journey.rides[0].tripId)).toEqual(['inf-ras-mle-1110']);
  });

  it('alternatives stay within maxTransfers', () => {
    const query = q('THODDOO', '2026-10-25');
    const bundle = { ...fixture, config: { ...fixture.config, maxTransfers: 0 } };
    const j = official(findJourneys(fixture, query))!;
    expect(findWaitAlternatives(bundle, query, j, 0).alternatives).toEqual([]);
  });

  it('returns no alternatives when nothing reaches the destination earlier', () => {
    const query = q('THODDOO', '2026-10-25');
    const legs = fixture.legs.filter((l) => l.source === 'mtcc');
    const bundle = { ...fixture, legs };
    const j = findJourneys(bundle, query)[0];
    expect(findWaitAlternatives(bundle, query, j, 0).alternatives).toEqual([]);
  });
});
