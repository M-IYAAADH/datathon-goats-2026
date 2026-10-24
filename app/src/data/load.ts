import type {
  Bundle,
  Census,
  CensusEntry,
  Config,
  Evidence,
  Leg,
  Meta,
  Range,
  Stop,
} from '../router/model';

// The data contract lives in router/model.ts (R1); the loader re-exports it for the UI.
export type { Bundle, Census, CensusEntry, Config, Evidence, Leg, Meta, Stop };
export type TimeRange = Range;

export const BUNDLE_FILES = [
  'stops.json',
  'legs.json',
  'config.json',
  'census.json',
  'meta.json',
] as const;

export type BundleFile = (typeof BUNDLE_FILES)[number];

export class BundleError extends Error {
  readonly file: string;
  readonly field: string;
  readonly reason: string;

  constructor(file: string, field: string, reason: string) {
    super(field ? `${file} ${field}: ${reason}` : `${file}: ${reason}`);
    this.name = 'BundleError';
    this.file = file;
    this.field = field;
    this.reason = reason;
  }
}

type Obj = Record<string, unknown>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const CONFIG_NUMBERS = [
  'bufferOfficialMin',
  'bufferInferredMin',
  'longWaitMin',
  'maxTransfers',
  'horizonHours',
  'shiftStepMin',
  'maxShiftMin',
  'minDevices',
  'minDays',
] as const;

const CENSUS_NUMBERS = [
  'population',
  'male',
  'female',
  'age0_17',
  'age18_64',
  'age65p',
  'disability',
  'elderlyAlone',
] as const;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function join(path: string, key: string): string {
  return path ? `${path}.${key}` : key;
}

// Small helpers that throw a BundleError naming the file and the field path.
function checker(file: string) {
  const fail = (field: string, reason: string): never => {
    throw new BundleError(file, field, reason);
  };
  const obj = (v: unknown, path: string): Obj => (isObj(v) ? v : fail(path, 'expected an object'));
  const str = (o: Obj, key: string, path: string): string => {
    const v = o[key];
    if (v === undefined) fail(join(path, key), 'missing');
    return typeof v === 'string' ? v : fail(join(path, key), 'expected a string');
  };
  const nonEmpty = (o: Obj, key: string, path: string): string => {
    const v = str(o, key, path);
    return v.length > 0 ? v : fail(join(path, key), 'expected a non-empty string');
  };
  const num = (o: Obj, key: string, path: string): number => {
    const v = o[key];
    if (v === undefined) fail(join(path, key), 'missing');
    return typeof v === 'number' && Number.isFinite(v)
      ? v
      : fail(join(path, key), 'expected a number');
  };
  const int = (o: Obj, key: string, path: string): number => {
    const v = num(o, key, path);
    return Number.isInteger(v) ? v : fail(join(path, key), 'expected a whole number');
  };
  const bool = (o: Obj, key: string, path: string): boolean => {
    const v = o[key];
    if (v === undefined) fail(join(path, key), 'missing');
    return typeof v === 'boolean' ? v : fail(join(path, key), 'expected true or false');
  };
  const oneOf = <T>(o: Obj, key: string, path: string, allowed: readonly T[]): T => {
    const v = o[key] as T;
    if (allowed.includes(v)) return v;
    const list = allowed.map((a) => (a === null ? 'null' : `'${String(a)}'`)).join(', ');
    return fail(
      join(path, key),
      o[key] === undefined ? `missing (expected one of ${list})` : `expected one of ${list}`,
    );
  };
  return { fail, obj, str, nonEmpty, num, int, bool, oneOf };
}

function validateStops(raw: unknown): Stop[] {
  const c = checker('stops.json');
  if (!Array.isArray(raw)) c.fail('', 'expected an array of stops');
  const stops = raw as unknown[];
  const seen = new Set<string>();
  stops.forEach((item, i) => {
    const p = `[${i}]`;
    const s = c.obj(item, p);
    const id = c.nonEmpty(s, 'id', p);
    if (seen.has(id)) c.fail(`${p}.id`, `duplicate stop id '${id}'`);
    seen.add(id);
    c.str(s, 'name', p);
    c.str(s, 'atoll', p);
    const lat = c.num(s, 'lat', p);
    if (lat < -90 || lat > 90) c.fail(`${p}.lat`, 'expected a latitude between -90 and 90');
    const lon = c.num(s, 'lon', p);
    if (lon < -180 || lon > 180) c.fail(`${p}.lon`, 'expected a longitude between -180 and 180');
    if (!('censusKey' in s)) c.fail(`${p}.censusKey`, 'missing (use null if there is none)');
    if (s.censusKey !== null && typeof s.censusKey !== 'string') {
      c.fail(`${p}.censusKey`, 'expected a string or null');
    }
    c.oneOf(s, 'kind', p, ['island', 'hub'] as const);
  });
  return stops as Stop[];
}

function validateRange(
  c: ReturnType<typeof checker>,
  o: Obj,
  key: string,
  path: string,
): TimeRange {
  const p = join(path, key);
  if (o[key] === undefined) c.fail(p, 'missing');
  const r = c.obj(o[key], p);
  const min = c.int(r, 'min', p);
  const max = c.int(r, 'max', p);
  if (min < 0) c.fail(`${p}.min`, 'expected minutes of 0 or more');
  if (min > max) c.fail(p, 'min is greater than max');
  return { min, max };
}

function validateEvidence(c: ReturnType<typeof checker>, v: unknown, p: string): void {
  const e = c.obj(v, p);
  c.int(e, 'devices', p);
  c.int(e, 'days', p);
  const w = e.weekdayObs;
  if (w === undefined) c.fail(`${p}.weekdayObs`, 'missing');
  if (
    !Array.isArray(w) ||
    w.length !== 7 ||
    !w.every((n) => typeof n === 'number' && Number.isFinite(n))
  ) {
    c.fail(`${p}.weekdayObs`, 'expected an array of 7 numbers (Sunday to Saturday)');
  }
  c.str(e, 'period', p);
  c.num(e, 'unconfirmedOriginShare', p);
}

function validateLegs(raw: unknown, stopIds: Set<string>): Leg[] {
  const c = checker('legs.json');
  if (!Array.isArray(raw)) c.fail('', 'expected an array of legs');
  const legs = raw as unknown[];
  const seen = new Set<string>();
  legs.forEach((item, i) => {
    const p = `[${i}]`;
    const l = c.obj(item, p);
    const id = c.nonEmpty(l, 'id', p);
    if (seen.has(id)) c.fail(`${p}.id`, `duplicate leg id '${id}'`);
    seen.add(id);
    const source = c.oneOf(l, 'source', p, ['mtcc', 'inferred'] as const);
    c.str(l, 'routeId', p);
    c.str(l, 'tripId', p);
    const from = c.nonEmpty(l, 'from', p);
    if (!stopIds.has(from)) c.fail(`${p}.from`, `unknown stop '${from}' (not in stops.json)`);
    const to = c.nonEmpty(l, 'to', p);
    if (!stopIds.has(to)) c.fail(`${p}.to`, `unknown stop '${to}' (not in stops.json)`);
    if (from === to) c.fail(`${p}.to`, 'same stop as from');

    const dep = validateRange(c, l, 'dep', p);
    const arr = validateRange(c, l, 'arr', p);
    if (arr.min < dep.min || arr.max < dep.max) c.fail(`${p}.arr`, 'arrival is before departure');
    if (source === 'mtcc') {
      if (dep.min !== dep.max)
        c.fail(`${p}.dep`, 'official (mtcc) times must have min equal to max');
      if (arr.min !== arr.max)
        c.fail(`${p}.arr`, 'official (mtcc) times must have min equal to max');
    }

    const days = l.days;
    if (days === undefined) c.fail(`${p}.days`, 'missing');
    if (!Array.isArray(days))
      c.fail(`${p}.days`, 'expected an array of weekdays (0 = Sunday to 6 = Saturday)');
    (days as unknown[]).forEach((d, j) => {
      if (typeof d !== 'number' || !Number.isInteger(d) || d < 0 || d > 6) {
        c.fail(`${p}.days[${j}]`, 'expected a weekday from 0 (Sunday) to 6 (Saturday)');
      }
    });

    const validFrom = c.str(l, 'validFrom', p);
    if (!DATE_RE.test(validFrom)) c.fail(`${p}.validFrom`, 'expected a date as YYYY-MM-DD');
    const validTo = c.str(l, 'validTo', p);
    if (!DATE_RE.test(validTo)) c.fail(`${p}.validTo`, 'expected a date as YYYY-MM-DD');
    if (validTo < validFrom) c.fail(`${p}.validTo`, 'is before validFrom');

    if (!('cls' in l)) c.fail(`${p}.cls`, "missing (expected 'fast', 'slow' or null)");
    c.oneOf(l, 'cls', p, ['fast', 'slow', null] as const);

    if (source === 'inferred') {
      if (l.evidence === undefined || l.evidence === null)
        c.fail(`${p}.evidence`, 'missing (required for inferred legs)');
      validateEvidence(c, l.evidence, `${p}.evidence`);
    } else if (l.evidence !== undefined && l.evidence !== null) {
      validateEvidence(c, l.evidence, `${p}.evidence`);
    }
  });
  return legs as Leg[];
}

function validateConfig(raw: unknown): Config {
  const c = checker('config.json');
  const o = c.obj(raw, '');
  c.str(o, 'timezone', '');
  for (const key of CONFIG_NUMBERS) c.num(o, key, '');
  // The shift and occurrence loops step by these, so 0 would never end.
  for (const key of ['shiftStepMin', 'maxShiftMin', 'horizonHours'] as const) {
    if ((o[key] as number) <= 0) c.fail(key, 'expected a number above 0');
  }
  return o as unknown as Config;
}

function validateCensus(raw: unknown): Census {
  const c = checker('census.json');
  const o = c.obj(raw, '');
  for (const [key, value] of Object.entries(o)) {
    if (key === 'buildVersion' && typeof value === 'string') continue;
    const e = c.obj(value, key);
    c.str(e, 'name', key);
    for (const n of CENSUS_NUMBERS) c.num(e, n, key);
  }
  return o as Census;
}

function validateMeta(raw: unknown): Meta {
  const c = checker('meta.json');
  const o = c.obj(raw, '');
  c.nonEmpty(o, 'buildVersion', '');
  c.bool(o, 'fixture', '');
  c.str(o, 'evidencePeriod', '');
  c.str(o, 'timezoneStatus', '');
  c.str(o, 'speedUnitStatus', '');
  c.num(o, 'clockCorrections', '');
  c.int(o, 'timetableYear', '');
  return o as unknown as Meta;
}

function checkBuildVersion(
  file: string,
  raw: unknown,
  expected: string,
  stringOnly: boolean,
): void {
  if (!isObj(raw) || !('buildVersion' in raw)) return;
  const v = raw.buildVersion;
  if (stringOnly && typeof v !== 'string') return;
  if (v !== expected) {
    throw new BundleError(
      file,
      'buildVersion',
      `'${String(v)}' does not match meta.json buildVersion '${expected}'`,
    );
  }
}

export function validateBundle(raw: {
  stops: unknown;
  legs: unknown;
  config: unknown;
  census: unknown;
  meta: unknown;
}): Bundle {
  const meta = validateMeta(raw.meta);
  // stops.json and legs.json are bare arrays in the contract, so they cannot carry a buildVersion.
  checkBuildVersion('config.json', raw.config, meta.buildVersion, false);
  checkBuildVersion('census.json', raw.census, meta.buildVersion, true);
  const config = validateConfig(raw.config);
  const census = validateCensus(raw.census);
  const stops = validateStops(raw.stops);
  const legs = validateLegs(raw.legs, new Set(stops.map((s) => s.id)));
  return { stops, legs, config, census, meta };
}

async function fetchFile(base: string, file: BundleFile): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${base}data/${file}`);
  } catch (e) {
    throw new BundleError(
      file,
      '',
      `could not fetch (${e instanceof Error ? e.message : String(e)})`,
    );
  }
  if (!res.ok) throw new BundleError(file, '', `HTTP ${res.status}`);
  try {
    return await res.json();
  } catch {
    // The Vite dev server answers a missing file with index.html, which fails here.
    throw new BundleError(file, '', 'not valid JSON (the file may be missing)');
  }
}

export async function loadBundle(base = import.meta.env.BASE_URL): Promise<Bundle> {
  const [stops, legs, config, census, meta] = await Promise.all(
    BUNDLE_FILES.map((file) => fetchFile(base, file)),
  );
  return validateBundle({ stops, legs, config, census, meta });
}
