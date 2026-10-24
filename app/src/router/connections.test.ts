import { describe, expect, it } from 'vitest';
import { assessTransfer } from './connections';
import type { Config, LegSource, Occurrence } from './model';

const config: Config = {
  timezone: 'Indian/Maldives', bufferOfficialMin: 5, bufferInferredMin: 15, longWaitMin: 120,
  maxTransfers: 2, horizonHours: 48, shiftStepMin: 5, maxShiftMin: 30, minDevices: 3, minDays: 8,
};

// Only the fields assessTransfer reads.
const occ = (source: LegSource, dep: [number, number], arr: [number, number]) =>
  ({ leg: { source }, dep: { min: dep[0], max: dep[1] }, arr: { min: arr[0], max: arr[1] } }) as Occurrence;
const arriving = (source: LegSource, lo: number, hi = lo) => occ(source, [0, 0], [lo, hi]);
const departing = (source: LegSource, lo: number, hi = lo) => occ(source, [lo, hi], [lo + 60, hi + 60]);

describe('assessTransfer', () => {
  it('T1 arrive 10:55, depart 11:00, both MTCC is Safe with the buffer exactly met', () => {
    expect(assessTransfer(arriving('mtcc', 655), departing('mtcc', 660), config)).toEqual({
      status: 'safe', waitMin: [5, 5], long: false, bufferMin: 5,
    });
  });

  it('T2 arrive 10:56, depart 11:00, both MTCC is Missed', () => {
    expect(assessTransfer(arriving('mtcc', 656), departing('mtcc', 660), config).status).toBe('missed');
  });

  it('T3 inferred arrival 10:50 to 11:10, official 11:20 departure is Possible, not Safe', () => {
    const t = assessTransfer(arriving('inferred', 650, 670), departing('mtcc', 680), config);
    expect(t).toMatchObject({ status: 'possible', waitMin: [10, 30], bufferMin: 15 });
  });

  it('T4 official arrival 10:55, inferred departure 11:00 to 11:20 is Possible, not Safe', () => {
    const t = assessTransfer(arriving('mtcc', 655), departing('inferred', 660, 680), config);
    expect(t).toMatchObject({ status: 'possible', waitMin: [5, 25], bufferMin: 15 });
  });

  it('flags a long wait from config.longWaitMin, separately from status', () => {
    expect(assessTransfer(arriving('mtcc', 460), departing('mtcc', 660), config)).toMatchObject({
      status: 'safe', waitMin: [200, 200], long: true,
    });
    expect(assessTransfer(arriving('mtcc', 460), departing('mtcc', 660), { ...config, longWaitMin: 240 }).long).toBe(false);
  });
});
