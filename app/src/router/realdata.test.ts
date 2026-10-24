// Real-data checks T7, T8, T9, T13 (SRS section 8) on the bundle shipped in app/public/data.
import { beforeAll, describe, expect, it } from 'vitest';
import stops from '../../public/data/stops.json';
import legs from '../../public/data/legs.json';
import config from '../../public/data/config.json';
import census from '../../public/data/census.json';
import meta from '../../public/data/meta.json';
import type { Bundle, Journey, Query } from './model';
import { findJourneys, findWaitAlternatives } from './planner';

const bundle = { stops, legs, config, census, meta } as unknown as Bundle;
const q = (origin: string, date: string, extra: Partial<Query> = {}): Query => ({
  origin,
  destination: 'MALE',
  date,
  earliestDep: 0,
  ...extra,
});
const shape = (j: Journey) => j.rides.map((r) => [r.from, r.dep.min, r.to, r.arr.max]);

beforeAll(() => {
  if (!Array.isArray(bundle.legs) || bundle.legs.length === 0 || bundle.meta.fixture !== false) {
    throw new Error(
      'Real data bundle missing: app/public/data must hold the real bundle (meta.fixture false, legs present).',
    );
  }
});

describe('real data', () => {
  it('T7 Mathiveri to Malé, Sun 25 Oct: change at Rasdhoo 10:55 to 11:00 is Safe, 5 min, Malé 14:10', () => {
    const js = findJourneys(bundle, q('MATHIVERI', '2026-10-25'));
    const j = js.find((x) => !x.usesInferred && x.transfers[0]?.stop === 'RASDHOO')!;
    expect(j, 'official journey with a change at Rasdhoo').toBeDefined();
    expect(shape(j)).toEqual([
      ['MATHIVERI', 515, 'RASDHOO', 655],
      ['RASDHOO', 660, 'MALE', 850],
    ]);
    expect(j.transfers[0].assessment).toMatchObject({
      status: 'safe',
      waitMin: [5, 5],
      long: false,
    });
    // A second official 14:10 option changes at Ukulhas onto the same Malé boat.
    const uk = js.find((x) => !x.usesInferred && x.transfers[0]?.stop === 'UKULHAS');
    expect(uk && [uk.arr.max, uk.transfers[0].assessment.status]).toEqual([850, 'safe']);
  });

  it('T8 Thoddoo to Malé, Sun 25 Oct: official 200 min wait at Rasdhoo is long; inferred direct boats exist', () => {
    const [off] = findJourneys(bundle, q('THODDOO', '2026-10-25', { officialOnly: true }));
    expect(shape(off)).toEqual([
      ['THODDOO', 390, 'RASDHOO', 460],
      ['RASDHOO', 660, 'MALE', 850],
    ]);
    expect(off.transfers[0].assessment).toMatchObject({
      status: 'safe',
      waitMin: [200, 200],
      long: true,
    });
    // The data has no earlier boat on from Rasdhoo after the 07:40 arrival.
    expect(findWaitAlternatives(bundle, q('THODDOO', '2026-10-25'), off, 0).alternatives).toEqual(
      [],
    );
    // Direct inferred Thoddoo to Malé, 08:02-08:09 to 09:12-09:40, is offered without officialOnly.
    const all = findJourneys(bundle, q('THODDOO', '2026-10-25'));
    const direct = all.find((x) => x.usesInferred && x.rides.length === 1 && x.dep.min === 482)!;
    expect(direct).toBeDefined();
    expect([direct.dep, direct.arr]).toEqual([
      { min: 482, max: 489 },
      { min: 552, max: 580 },
    ]);
    expect(direct.rides[0].occurrences[0].leg.evidence).toMatchObject({ devices: 8, days: 22 });
  });

  it('T9 Maafushi to Malé, Sat 24 Oct, officialOnly: route 309 07:25 to 09:05 via Gulhi, no transfer', () => {
    const [j] = findJourneys(bundle, q('MAAFUSHI', '2026-10-24', { officialOnly: true }));
    expect(j.rides).toHaveLength(1);
    expect(j.transfers).toEqual([]);
    expect(j.rides[0].occurrences.map((o) => o.leg.to)).toEqual(['GULHI', 'MALE']);
    expect(j.rides[0].occurrences[0].leg.routeId).toBe('309');
    expect([j.dep.min, j.arr.max]).toEqual([445, 545]);
  });

  it('T13 Rasdhoo to Malé, Fri 30 Oct: no 11:00 official departure', () => {
    const js = findJourneys(bundle, q('RASDHOO', '2026-10-30'));
    const off = findJourneys(bundle, q('RASDHOO', '2026-10-30', { officialOnly: true }));
    for (const j of [...js, ...off]) {
      expect(
        j.rides.some((r) => r.source === 'mtcc' && r.from === 'RASDHOO' && r.dep.min === 660),
      ).toBe(false);
    }
  });
});
