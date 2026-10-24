// Disruption what-if, SRS 5.5. Every function returns new values; the baseline is never mutated.
import { assessTransfer } from './connections';
import type { Bundle, Connection, Occurrence, Query, ScenarioResult } from './model';
import { findJourneys, isVisible, sameRide } from './planner';
import { expandOccurrences } from './time';

/** The occurrence set with one dated occurrence removed (a simulated cancellation). */
export function applyCancellation(occurrences: readonly Occurrence[], occurrenceId: string): Occurrence[] {
  return occurrences.filter((o) => o.id !== occurrenceId);
}

/**
 * Modelled connections: for every arrival, the next non-missed departure on each
 * onward route from that island. Counts connections in the model, not passengers.
 */
export function modelledConnections(bundle: Bundle, occurrences: readonly Occurrence[]): Connection[] {
  const visible = occurrences.filter((o) => isVisible(o.leg, bundle.config));
  const out: Connection[] = [];
  for (const a of visible) {
    const next = new Map<string, Connection>();
    for (const d of visible) {
      if (d.leg.from !== a.leg.to || sameRide(a, d)) continue;
      const assessment = assessTransfer(a, d, bundle.config);
      const key = `${d.leg.routeId}>${d.leg.to}`;
      const cur = next.get(key);
      if (assessment.status !== 'missed' && (!cur || d.dep.min < cur.departing.dep.min)) {
        next.set(key, { stop: a.leg.to, arriving: a, departing: d, assessment });
      }
    }
    out.push(...next.values());
  }
  return out;
}

/** Before/after of cancelling one occurrence for `query`. Reset = drop this result. */
export function compareReachability(bundle: Bundle, query: Query, cancelledOccurrenceId: string): ScenarioResult {
  const baseline = expandOccurrences(bundle.legs, query.date, bundle.config.horizonHours);
  const disrupted = applyCancellation(baseline, cancelledOccurrenceId);
  const before = findJourneys(bundle, query, baseline);
  const after = findJourneys(bundle, query, disrupted);
  const afterIds = new Set(after.map((j) => j.id));
  return {
    cancelledOccurrenceId,
    query,
    before,
    after,
    lostJourneys: before.filter((j) => !afterIds.has(j.id)),
    brokenConnections: modelledConnections(bundle, baseline).filter(
      (c) => c.arriving.id === cancelledOccurrenceId || c.departing.id === cancelledOccurrenceId,
    ),
    recovery: after.filter((j) => j.usesInferred),
    newBest: after[0] ?? null,
  };
}
