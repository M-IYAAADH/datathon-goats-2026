import { describe, expect, it } from 'vitest';
import type { Leg } from './model';
import { addDays, expandOccurrences, formatClock, parseClock, weekday } from './time';

const leg = (over: Partial<Leg>): Leg => ({
  id: 'x',
  source: 'mtcc',
  routeId: 'r',
  tripId: 't',
  from: 'A',
  to: 'B',
  dep: { min: 0, max: 0 },
  arr: { min: 0, max: 0 },
  days: [0, 1, 2, 3, 4, 5, 6],
  validFrom: '2026-01-01',
  validTo: '2026-12-31',
  cls: null,
  evidence: null,
  ...over,
});

describe('calendar', () => {
  it('weekdays use 0 = Sunday', () => {
    expect(weekday('2026-10-24')).toBe(6); // Saturday
    expect(weekday('2026-10-25')).toBe(0); // Sunday
    expect(weekday('2026-10-30')).toBe(5); // Friday
  });
  it('addDays crosses month and year ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
  it('rejects bad dates and times', () => {
    expect(() => weekday('2026-02-30')).toThrow();
    expect(() => weekday('25/10/2026')).toThrow();
    expect(() => parseClock('8:75')).toThrow();
  });
  it('parses and formats clock minutes', () => {
    expect(parseClock('08:35')).toBe(515);
    expect(formatClock(515)).toBe('08:35');
    expect(formatClock(1500)).toBe('01:00+1');
  });
});

describe('expandOccurrences', () => {
  it('T6 leg departing 23:30 and arriving 01:10 is found on the next day', () => {
    const night = leg({
      id: 'night',
      dep: { min: 1410, max: 1410 },
      arr: { min: 1510, max: 1510 },
    });
    const occ = expandOccurrences([night], '2026-10-25', 48).find(
      (o) => o.serviceDate === '2026-10-24',
    );
    expect(occ).toMatchObject({ id: 'night@2026-10-24', dep: { min: -30 }, arr: { min: 70 } });
  });

  it('T13 weekday rule: a Wed/Sun leg is not offered on Fri 30 Oct', () => {
    const rasMle = leg({
      id: 'ras-mle',
      days: [0, 3],
      dep: { min: 660, max: 660 },
      arr: { min: 850, max: 850 },
    });
    expect(expandOccurrences([rasMle], '2026-10-30', 48)).toEqual([]);
    expect(expandOccurrences([rasMle], '2026-10-25', 48).map((o) => o.id)).toEqual([
      'ras-mle@2026-10-25',
    ]);
  });

  it('respects validFrom / validTo and the horizon', () => {
    const daily = leg({
      id: 'd',
      dep: { min: 600, max: 600 },
      arr: { min: 660, max: 660 },
      validTo: '2026-10-25',
    });
    expect(expandOccurrences([daily], '2026-10-24', 48).map((o) => o.serviceDate)).toEqual([
      '2026-10-24',
      '2026-10-25',
    ]);
    expect(
      expandOccurrences([leg({ ...daily, validTo: '2026-12-31' })], '2026-10-24', 24),
    ).toHaveLength(1);
  });
});
