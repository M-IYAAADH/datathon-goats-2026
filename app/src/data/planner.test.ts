import { describe, expect, it } from 'vitest';
import { formatHHMM, parseHHMM } from './planner';

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
