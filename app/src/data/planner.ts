// The UI's one seam to the router (Member A's lane). No routing logic lives here.
import { findJourneys as routerFindJourneys } from '../router/planner';
import type { Bundle, Journey, Query } from '../router/model';

export type {
  Connection,
  Journey,
  Occurrence,
  Query,
  Ride,
  ScenarioResult,
  ShiftProposal,
  ShiftResult,
  Transfer,
  TransferAssessment,
  WaitAlternative,
  WaitAlternativesResult,
} from '../router/model';
export type JourneyQuery = Query;

export function findJourneys(bundle: Bundle, query: Query): Journey[] {
  return routerFindJourneys(bundle, query);
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
