// Router test bundle built from the SRS section 8 scenarios. Test-only; the app loads public/data.
import type { Bundle, Leg } from './model';

const mtcc = (id: string, routeId: string, tripId: string, from: string, to: string, dep: number, arr: number, days: number[]): Leg => ({
  id, source: 'mtcc', routeId, tripId, from, to,
  dep: { min: dep, max: dep }, arr: { min: arr, max: arr },
  days, validFrom: '2026-01-01', validTo: '2026-12-31', cls: null, evidence: null,
});

const inferred = (id: string, from: string, to: string, dep: [number, number], arr: [number, number], devices = 6, days = 11): Leg => ({
  id, source: 'inferred', routeId: `inf-${from}-${to}`, tripId: id, from, to,
  dep: { min: dep[0], max: dep[1] }, arr: { min: arr[0], max: arr[1] },
  days: [0, 1, 2, 3, 4, 5, 6], validFrom: '2026-01-01', validTo: '2026-12-31', cls: 'fast',
  evidence: { devices, days, weekdayObs: [2, 2, 1, 2, 1, 1, 2], period: '2025-08', unconfirmedOriginShare: 0.1 },
});

const stop = (id: string, name: string, atoll: string, lat: number, lon: number) =>
  ({ id, name, atoll, lat, lon, censusKey: null, kind: id === 'MALE' ? 'hub' : 'island' }) as const;

export const fixture: Bundle = {
  stops: [
    stop('MATHIVERI', 'Mathiveri', 'Alif Alif', 4.19, 72.75),
    stop('RASDHOO', 'Rasdhoo', 'Alif Alif', 4.26, 72.99),
    stop('THODDOO', 'Thoddoo', 'Alif Alif', 4.44, 72.96),
    stop('MAAFUSHI', 'Maafushi', 'Kaafu', 3.94, 73.49),
    stop('GULHI', 'Gulhi', 'Kaafu', 3.99, 73.51),
    stop('MALE', 'Malé', 'Kaafu', 4.18, 73.51),
  ],
  legs: [
    mtcc('mtcc-301-1', '301', '301-0835', 'MATHIVERI', 'RASDHOO', 515, 655, [0, 3]),
    mtcc('mtcc-302-1', '302', '302-1100', 'RASDHOO', 'MALE', 660, 850, [0, 3]),
    mtcc('mtcc-303-1', '303', '303-0630', 'THODDOO', 'RASDHOO', 390, 460, [0, 3]),
    mtcc('mtcc-309-1', '309', '309-0725', 'MAAFUSHI', 'GULHI', 445, 470, [6]),
    mtcc('mtcc-309-2', '309', '309-0725', 'GULHI', 'MALE', 475, 545, [6]),
    inferred('inf-ras-mle-1110', 'RASDHOO', 'MALE', [670, 690], [760, 790]),
    inferred('inf-ras-mle-1220', 'RASDHOO', 'MALE', [740, 770], [830, 860]),
    inferred('inf-hidden', 'THODDOO', 'MALE', [400, 410], [480, 500], 2, 3), // below minDevices: must never appear
  ],
  config: {
    timezone: 'Indian/Maldives', bufferOfficialMin: 5, bufferInferredMin: 15, longWaitMin: 120,
    maxTransfers: 2, horizonHours: 48, shiftStepMin: 5, maxShiftMin: 30, minDevices: 3, minDays: 8,
  },
  census: {},
  meta: {
    buildVersion: 'fixture', fixture: true, evidencePeriod: '2025-08', timezoneStatus: 'unconfirmed',
    speedUnitStatus: 'unconfirmed', clockCorrections: 0, timetableYear: 2026,
  },
};
