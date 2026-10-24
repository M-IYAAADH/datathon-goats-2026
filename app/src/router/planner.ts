// Journey search, SRS section 6 steps 1 and 2.
import { assessTransfer } from './connections';
import type {
  Bundle, Config, Journey, Leg, Occurrence, Query, Ride, Transfer, WaitAlternative, WaitAlternativesResult,
} from './model';
import { expandOccurrences } from './time';

const MAX_RESULTS = 3;

/** Inferred legs below config.minDevices / minDays are hidden everywhere. */
export function isVisible(leg: Leg, config: Config): boolean {
  return leg.source === 'mtcc' || (!!leg.evidence && leg.evidence.devices >= config.minDevices && leg.evidence.days >= config.minDays);
}

/** Visible occurrences grouped by departure stop. */
export function byDepartureStop(occurrences: readonly Occurrence[], config: Config): Map<string, Occurrence[]> {
  const out = new Map<string, Occurrence[]>();
  for (const o of occurrences) {
    if (!isVisible(o.leg, config)) continue;
    const list = out.get(o.leg.from);
    if (list) list.push(o);
    else out.set(o.leg.from, [o]);
  }
  return out;
}

export const sameRide = (a: Occurrence, b: Occurrence) => a.leg.tripId === b.leg.tripId && a.serviceDate === b.serviceDate;

/** Group a chain of occurrences into rides and assess each change of boat. */
export function buildJourney(occs: Occurrence[], config: Config): Journey {
  const groups: Occurrence[][] = [];
  for (const o of occs) {
    const last = groups[groups.length - 1];
    if (last && sameRide(last[last.length - 1], o)) last.push(o);
    else groups.push([o]);
  }
  const rides: Ride[] = groups.map((g) => ({
    tripId: g[0].leg.tripId,
    source: g[0].leg.source,
    occurrences: g,
    from: g[0].leg.from,
    to: g[g.length - 1].leg.to,
    dep: g[0].dep,
    arr: g[g.length - 1].arr,
  }));
  const transfers: Transfer[] = rides.slice(1).map((r, i) => ({
    stop: r.from,
    fromRide: i,
    toRide: i + 1,
    assessment: assessTransfer(rides[i].occurrences[rides[i].occurrences.length - 1], r.occurrences[0], config),
  }));
  return {
    id: occs.map((o) => o.id).join('>'),
    origin: rides[0].from,
    destination: rides[rides.length - 1].to,
    rides,
    transfers,
    dep: rides[0].dep,
    arr: rides[rides.length - 1].arr,
    usesInferred: occs.some((o) => o.leg.source === 'inferred'),
  };
}

/**
 * Up to 3 journeys from query.origin to query.destination, earliest arrival
 * (arr.max) first, at most config.maxTransfers changes of boat, no Missed transfer.
 * `occurrences` lets callers (disruption what-ifs) pass a modified set.
 * `after`: an arriving occurrence the search continues from; its first change of boat
 * is checked and counted like any other transfer.
 */
export function findJourneys(
  bundle: Bundle,
  query: Query,
  occurrences = expandOccurrences(bundle.legs, query.date, bundle.config.horizonHours),
  after?: Occurrence,
): Journey[] {
  const { config } = bundle;
  const byFrom = byDepartureStop(occurrences, config);

  const found = new Map<string, Journey>();
  const path: Occurrence[] = [];
  const visited = new Set<string>([query.origin]);

  // shortcut: exhaustive depth-limited search, fine for timetable-sized data; add pruning by best arrival if R9 finds it slow.
  const walk = (stop: string, transfers: number) => {
    const prev = path[path.length - 1] ?? after;
    for (const d of byFrom.get(stop) ?? []) {
      if (visited.has(d.leg.to)) continue;
      let t = transfers;
      if (!prev) {
        if (d.dep.min < query.earliestDep) continue;
      } else if (!sameRide(prev, d)) {
        if (++t > config.maxTransfers || assessTransfer(prev, d, config).status === 'missed') continue;
      } else if (d.dep.min < prev.arr.min) continue;

      path.push(d);
      if (d.leg.to === query.destination) {
        const j = buildJourney(path, config);
        found.set(j.id, j);
      } else {
        visited.add(d.leg.to);
        walk(d.leg.to, t);
        visited.delete(d.leg.to);
      }
      path.pop();
    }
  };
  walk(query.origin, 0);

  return [...found.values()]
    .sort((a, b) => a.arr.max - b.arr.max || b.dep.min - a.dep.min || a.transfers.length - b.transfers.length)
    .slice(0, MAX_RESULTS);
}

// ---------- Wait alternatives (SRS 5.4) ----------

/**
 * Other ways on from the island of `journey.transfers[transferIndex]` that reach
 * the destination certainly earlier. Empty alternatives = "No alternative found in the data".
 */
export function findWaitAlternatives(
  bundle: Bundle,
  query: Query,
  journey: Journey,
  transferIndex: number,
  occurrences = expandOccurrences(bundle.legs, query.date, bundle.config.horizonHours),
): WaitAlternativesResult {
  const t = journey.transfers[transferIndex];
  const before = journey.rides[t.fromRide].occurrences;
  const arriving = before[before.length - 1];
  // Transfers before this one are already used up; the change at t.stop counts too.
  const budget = { ...bundle, config: { ...bundle.config, maxTransfers: bundle.config.maxTransfers - transferIndex } };
  const onward = findJourneys(budget, { ...query, origin: t.stop }, occurrences, arriving);
  const alternatives = onward
    .map((alt): WaitAlternative => ({
      journey: alt,
      savingMin: [journey.arr.min - alt.arr.max, journey.arr.max - alt.arr.min],
    }))
    .filter((a) => a.savingMin[0] > 0);
  return { journeyId: journey.id, transferIndex, stop: t.stop, alternatives };
}
