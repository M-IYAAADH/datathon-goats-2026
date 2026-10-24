// Calendar and clock helpers. Dates are Maldives calendar dates ("YYYY-MM-DD");
// all arithmetic is done in UTC on the date alone, so the browser zone never matters.
import type { Leg, Occurrence } from './model';

const DAY = 1440;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Days since 1970-01-01 for a "YYYY-MM-DD" date. Throws on a bad date. */
export function dayNumber(date: string): number {
  const m = DATE_RE.exec(date);
  const ms = m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN;
  if (!m || new Date(ms).toISOString().slice(0, 10) !== date)
    throw new Error(`Invalid date "${date}", expected YYYY-MM-DD`);
  return ms / 86_400_000;
}

export function addDays(date: string, n: number): string {
  return new Date((dayNumber(date) + n) * 86_400_000).toISOString().slice(0, 10);
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekday(date: string): number {
  return (dayNumber(date) + 4) % 7; // 1970-01-01 was a Thursday
}

/** "08:35" -> 515. Throws on a bad time. */
export function parseClock(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m || +m[2] > 59) throw new Error(`Invalid time "${hhmm}", expected HH:MM`);
  return +m[1] * 60 + +m[2];
}

/** 515 -> "08:35". Minutes past 24 h wrap, with "+1" per extra day (1500 -> "01:00+1"). */
export function formatClock(min: number): string {
  const d = Math.floor(min / DAY);
  const m = min - d * DAY;
  const s = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return d === 0 ? s : `${s}${d > 0 ? '+' : ''}${d}`;
}

function runsOn(leg: Leg, serviceDate: string): boolean {
  // ISO dates compare correctly as strings.
  return (
    leg.validFrom <= serviceDate &&
    serviceDate <= leg.validTo &&
    leg.days.includes(weekday(serviceDate))
  );
}

/**
 * Dated occurrences of `legs` from 00:00 of `date` for `horizonHours`, with times
 * in minutes from 00:00 of `date`. Includes previous-day runs still under way after
 * midnight, so a 23:30 to 01:10 leg shows up on the next day's query.
 */
export function expandOccurrences(
  legs: readonly Leg[],
  date: string,
  horizonHours: number,
): Occurrence[] {
  const end = horizonHours * 60;
  const out: Occurrence[] = [];
  for (let i = -1; i * DAY < end; i++) {
    const serviceDate = addDays(date, i);
    const off = i * DAY;
    for (const leg of legs) {
      if (!runsOn(leg, serviceDate)) continue;
      const dep = { min: leg.dep.min + off, max: leg.dep.max + off };
      const arr = { min: leg.arr.min + off, max: leg.arr.max + off };
      if (arr.max < 0 || dep.min >= end) continue;
      out.push({ id: `${leg.id}@${serviceDate}`, leg, serviceDate, dep, arr });
    }
  }
  return out.sort((a, b) => a.dep.min - b.dep.min);
}
