import { describe, expect, it } from 'vitest';
import stops from '../../public/data/stops.json';
import legs from '../../public/data/legs.json';
import config from '../../public/data/config.json';
import census from '../../public/data/census.json';
import meta from '../../public/data/meta.json';
import { validateBundle } from './load';
import { findJourneys, formatHHMM, parseHHMM } from './planner';

describe('parseHHMM', () => {
  it('parses valid times', () => {
    expect(parseHHMM('00:00')).toBe(0);
    expect(parseHHMM('06:00')).toBe(360);
    expect(parseHHMM('23:59')).toBe(1439);
    expect(parseHHMM('9:05')).toBe(545);
  });

  it('rejects invalid input', () => {
    expect(parseHHMM('')).toBeNull();
    expect(parseHHMM('24:00')).toBeNull();
    expect(parseHHMM('12:60')).toBeNull();
    expect(parseHHMM('abc')).toBeNull();
    expect(parseHHMM('12:5')).toBeNull();
  });
});

describe('formatHHMM', () => {
  it('formats same-day times', () => {
    expect(formatHHMM(0)).toBe('00:00');
    expect(formatHHMM(670)).toBe('11:10');
    expect(formatHHMM(1439)).toBe('23:59');
  });

  it('marks next-day times', () => {
    expect(formatHHMM(1440)).toBe('00:00 +1');
    expect(formatHHMM(1510)).toBe('01:10 +1');
    expect(formatHHMM(2900)).toBe('00:20 +2');
  });

  it('round-trips with parseHHMM', () => {
    expect(parseHHMM(formatHHMM(755))).toBe(755);
  });
});

describe('findJourneys on the sample bundle', () => {
  const bundle = validateBundle({ stops, legs, config, census, meta });

  it('lists journeys Mathiveri to Malé on Sun 25 Oct (U3 done-when)', () => {
    const journeys = findJourneys(bundle, {
      origin: 'MATHIVERI',
      destination: 'MALE',
      date: '2026-10-25',
      earliestDep: 360,
    });
    expect(journeys.length).toBeGreaterThan(0);
    const mtcc = journeys.find((j) => !j.usesInferred);
    expect(mtcc?.dep.min).toBe(515);
    expect(mtcc?.arr.min).toBe(850);
    expect(mtcc?.transfers[0].assessment.status).toBe('safe');
  });
});

describe('officialOnly', () => {
  const sample = validateBundle({ stops, legs, config, census, meta });
  const q = { origin: 'THODDOO', destination: 'MALE', date: '2026-10-25', earliestDep: 0 };

  it('excludes inferred legs when set, keeps them by default', () => {
    expect(findJourneys(sample, q).some((j) => j.usesInferred)).toBe(true);
    const off = findJourneys(sample, { ...q, officialOnly: true });
    expect(off.length).toBeGreaterThan(0);
    expect(off.every((j) => !j.usesInferred)).toBe(true);
  });
});
