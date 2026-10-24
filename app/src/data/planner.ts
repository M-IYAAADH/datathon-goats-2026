import type { Bundle, Leg, TimeRange } from './load';

// TODO(R4): replace with types and findJourneys from router/planner.ts
export type JourneyQuery = {
  origin: string;
  destination: string;
  date: string; // YYYY-MM-DD
  earliestMin: number; // minutes since midnight, Maldives time
};

export type Journey = {
  id: string;
  legs: Leg[];
  departMin: TimeRange;
  arriveMin: TimeRange;
  transfers: number;
};

// Stub: the UI lane holds no routing logic. Always returns no journeys.
export function findJourneys(_bundle: Bundle, _query: JourneyQuery): Journey[] {
  return [];
}

export function parseHHMM(text: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function formatHHMM(min: number): string {
  const total = Math.round(min);
  const day = Math.floor(total / 1440);
  const rem = total - day * 1440;
  const hh = String(Math.floor(rem / 60)).padStart(2, '0');
  const mm = String(rem % 60).padStart(2, '0');
  return day > 0 ? `${hh}:${mm} +${day}` : `${hh}:${mm}`;
}
