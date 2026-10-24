import { describe, expect, it } from 'vitest';
import stops from '../../public/data/stops.json';
import legs from '../../public/data/legs.json';
import config from '../../public/data/config.json';
import census from '../../public/data/census.json';
import meta from '../../public/data/meta.json';
import { validateBundle } from './load';
import { applyCancellation, compareReachability, proposeShifts } from '../router/disruption';
import { expandOccurrences } from '../router/time';

// Demo step 4 on the sample bundle: cancel Rasdhoo to Malé 11:00, recover, propose a shift.
describe('demo disruption on sample data', () => {
  const bundle = validateBundle({ stops, legs, config, census, meta });
  const query = { origin: 'MATHIVERI', destination: 'MALE', date: '2026-10-25', earliestDep: 360 };
  const cancelled = 'mtcc-301-4@2026-10-25';

  it('recovers via an inferred boat and proposes an MTCC shift', () => {
    const result = compareReachability(bundle, query, cancelled);
    expect(result.lostJourneys.length).toBeGreaterThan(0);
    const rec = result.recovery[0];
    expect(rec).toBeDefined();
    const t = rec.transfers[0];
    expect(t.assessment.status).toBe('possible');
    const arriving = rec.rides[t.fromRide].occurrences.at(-1)!;
    const departing = rec.rides[t.toRide].occurrences[0];
    const occs = applyCancellation(
      expandOccurrences(bundle.legs, query.date, bundle.config.horizonHours),
      cancelled,
    );
    const shifts = proposeShifts(bundle, occs, {
      stop: t.stop,
      arriving,
      departing,
      assessment: t.assessment,
    });
    expect(shifts.proposals[0]?.shiftMin).toBe(-5);
  });
});
