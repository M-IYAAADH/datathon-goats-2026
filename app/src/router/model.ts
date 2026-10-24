// Shared data contract (SRS section 4) and router result types.
// Both lanes depend on this file. Do not change it without telling the other member.
//
// Time: every time is an integer number of minutes since 00:00 of a service date,
// in Maldives time (UTC+5, no DST). Values of 1440 or more are after midnight.
// Weekdays: 0 = Sunday ... 6 = Saturday. Dates are "YYYY-MM-DD" strings.

// ---------- Bundle files ----------

/** A min/max time pair. Official legs have min === max; inferred legs are ranges. */
export interface Range {
  min: number;
  max: number;
}

export type StopKind = 'island' | 'hub';

/** stops.json is Stop[] */
export interface Stop {
  id: string;
  name: string;
  atoll: string;
  lat: number;
  lon: number;
  /** Key into census.json, or null if the stop has no census record. */
  censusKey: string | null;
  kind: StopKind;
}

export type LegSource = 'mtcc' | 'inferred';

/** fast = speedboat, slow = dhoni or supply boat, null = official leg. */
export type LegClass = 'fast' | 'slow' | null;

/** Aggregate evidence for an inferred leg. No device IDs or tracks. */
export interface Evidence {
  devices: number;
  days: number;
  /** Observed days per weekday, index 0 = Sunday. Length 7. */
  weekdayObs: number[];
  /** Observation period, e.g. "2025-08". */
  period: string;
  unconfirmedOriginShare: number;
}

/** legs.json is Leg[]: one record per boardable segment. */
export interface Leg {
  id: string;
  source: LegSource;
  routeId: string;
  /** Legs sharing a tripId are one boat; staying aboard is not a transfer. */
  tripId: string;
  from: string;
  to: string;
  dep: Range;
  arr: Range;
  /** Weekdays the leg runs, 0 = Sunday. */
  days: number[];
  validFrom: string;
  validTo: string;
  cls: LegClass;
  /** Present for inferred legs, null for official ones. */
  evidence: Evidence | null;
}

/** config.json. Every router threshold comes from here. */
export interface Config {
  timezone: string;
  bufferOfficialMin: number;
  bufferInferredMin: number;
  longWaitMin: number;
  maxTransfers: number;
  horizonHours: number;
  shiftStepMin: number;
  maxShiftMin: number;
  minDevices: number;
  minDays: number;
}

export interface CensusEntry {
  name: string;
  population: number;
  male: number;
  female: number;
  age0_17: number;
  age18_64: number;
  age65p: number;
  disability: number;
  elderlyAlone: number;
}

/** census.json, keyed by Stop.censusKey. */
export type Census = Record<string, CensusEntry>;

/** meta.json */
export interface Meta {
  buildVersion: string;
  /** true means sample data: the UI shows the "SAMPLE DATA" banner. */
  fixture: boolean;
  evidencePeriod: string;
  timezoneStatus: string;
  speedUnitStatus: string;
  clockCorrections: number;
  timetableYear: number;
}

/** The five files loaded together. Treat as read-only; the router never mutates it. */
export interface Bundle {
  stops: Stop[];
  legs: Leg[];
  config: Config;
  census: Census;
  meta: Meta;
}

// ---------- Router inputs ----------

export interface Query {
  origin: string;
  destination: string;
  /** Query date, "YYYY-MM-DD" in Maldives time. */
  date: string;
  /** Earliest departure, minutes since 00:00 of `date`. */
  earliestDep: number;
}

// ---------- Router outputs ----------

/**
 * One dated run of a leg. `dep` and `arr` are absolute minutes from 00:00 of
 * the query date, so a trip from the previous service date has negative or
 * small values, and one from the next date has values of 1440 or more.
 */
export interface Occurrence {
  /** `${leg.id}@${serviceDate}`, unique and stable across recomputes. */
  id: string;
  leg: Leg;
  /** The service date the leg's own times are relative to. */
  serviceDate: string;
  dep: Range;
  arr: Range;
}

export type TransferStatus = 'safe' | 'possible' | 'missed';

/** Result of assessTransfer() (SRS 5.3). */
export interface TransferAssessment {
  status: TransferStatus;
  /** [lo, hi] wait in minutes. lo === hi when both legs are official. */
  waitMin: [number, number];
  /** Wait of config.longWaitMin or more. Separate from status. */
  long: boolean;
  /** Buffer used: bufferOfficialMin or bufferInferredMin. */
  bufferMin: number;
}

/** Consecutive occurrences on the same tripId: one boat, no transfer inside. */
export interface Ride {
  tripId: string;
  source: LegSource;
  occurrences: Occurrence[];
  from: string;
  to: string;
  dep: Range;
  arr: Range;
}

/** A change of boat at `stop` between rides[i] and rides[i + 1]. */
export interface Transfer {
  stop: string;
  fromRide: number;
  toRide: number;
  assessment: TransferAssessment;
}

export interface Journey {
  /** Occurrence ids joined, used to dedupe. */
  id: string;
  origin: string;
  destination: string;
  rides: Ride[];
  /** transfers.length === rides.length - 1. Never contains a 'missed' transfer. */
  transfers: Transfer[];
  dep: Range;
  arr: Range;
  /** true if any ride uses an inferred leg. */
  usesInferred: boolean;
}

/** An earlier way on from a long-wait transfer island (SRS 5.4). */
export interface WaitAlternative {
  /** The route from the transfer island to the final destination. */
  journey: Journey;
  /** Minutes saved at the destination: [lo, hi], a range if inferred. */
  savingMin: [number, number];
}

export interface WaitAlternativesResult {
  journeyId: string;
  transferIndex: number;
  stop: string;
  /** Empty means "No alternative found in the data". */
  alternatives: WaitAlternative[];
}

/** A modelled connection (two occurrences that form a non-missed transfer). */
export interface Connection {
  stop: string;
  arriving: Occurrence;
  departing: Occurrence;
  assessment: TransferAssessment;
}

/** Before/after of a simulated cancellation (SRS 5.5). */
export interface ScenarioResult {
  /** The cancelled occurrence id. */
  cancelledOccurrenceId: string;
  query: Query;
  before: Journey[];
  after: Journey[];
  /** Baseline journeys that are gone after the cancellation. */
  lostJourneys: Journey[];
  /** Modelled connections that used the cancelled occurrence (connections, not passengers). */
  brokenConnections: Connection[];
  /** Journeys in `after` that use an inferred leg. */
  recovery: Journey[];
  /** Best journey after the cancellation, or null if none. */
  newBest: Journey | null;
}

export interface ShiftProposal {
  /** The official occurrence whose times are shifted. */
  occurrenceId: string;
  /** Minutes, negative = earlier. Always a multiple of config.shiftStepMin. */
  shiftMin: number;
  newDep: Range;
  newArr: Range;
  /** The connection the shift turns Safe. */
  fixes: Connection;
  /** Always "Recommendation for MTCC to approve. Nothing changes automatically." */
  note: string;
}

export interface ShiftResult {
  /** Empty means "No safe shift". */
  proposals: ShiftProposal[];
  /** Shifts tried and rejected because they made another connection Missed. */
  rejected: { shiftMin: number; breaks: Connection[] }[];
}
