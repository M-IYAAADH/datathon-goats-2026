import { describe, expect, it } from 'vitest';
import stops from '../../public/data/stops.json';
import legs from '../../public/data/legs.json';
import config from '../../public/data/config.json';
import census from '../../public/data/census.json';
import meta from '../../public/data/meta.json';
import { BundleError, validateBundle } from './load';

// Tests mutate the sample into deliberately invalid shapes, so the raw input is untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = { stops: any; legs: any; config: any; census: any; meta: any };

const sample = (): Raw => structuredClone({ stops, legs, config, census, meta });

function expectError(raw: Raw, file: string, field: string) {
  try {
    validateBundle(raw);
  } catch (e) {
    expect(e).toBeInstanceOf(BundleError);
    expect((e as BundleError).file).toBe(file);
    expect((e as BundleError).field).toBe(field);
    expect((e as BundleError).message).toContain(field ? `${file} ${field}:` : `${file}:`);
    return;
  }
  throw new Error('expected validateBundle to throw');
}

describe('validateBundle', () => {
  it('accepts the sample bundle without changing it', () => {
    const raw = sample();
    const before = JSON.stringify(raw);
    const bundle = validateBundle(raw);
    expect(bundle.stops.length).toBe(stops.length);
    expect(bundle.legs.length).toBe(legs.length);
    expect(bundle.meta.fixture).toBe(true);
    expect(JSON.stringify(raw)).toBe(before);
  });

  it('names a missing field', () => {
    const raw = sample();
    delete raw.legs[3].tripId;
    expectError(raw, 'legs.json', '[3].tripId');
  });

  it('rejects a leg to an unknown stop', () => {
    const raw = sample();
    raw.legs[2].to = 'NOWHERE';
    expectError(raw, 'legs.json', '[2].to');
  });

  it('rejects arrival before departure', () => {
    const raw = sample();
    raw.legs[3].arr = { min: raw.legs[3].dep.min - 10, max: raw.legs[3].dep.max - 10 };
    expectError(raw, 'legs.json', '[3].arr');
  });

  it('rejects an mtcc range and min above max', () => {
    const raw = sample();
    raw.legs[0].dep = { min: 515, max: 520 };
    expectError(raw, 'legs.json', '[0].dep');
    const raw2 = sample();
    const i = raw2.legs.findIndex((l: { source: string }) => l.source === 'inferred');
    raw2.legs[i].dep = { min: raw2.legs[i].dep.max + 1, max: raw2.legs[i].dep.max };
    expectError(raw2, 'legs.json', `[${i}].dep`);
  });

  it('rejects a duplicate leg id', () => {
    const raw = sample();
    raw.legs[4].id = raw.legs[1].id;
    expectError(raw, 'legs.json', '[4].id');
  });

  it('rejects an inferred leg without evidence', () => {
    const raw = sample();
    const i = raw.legs.findIndex((l: { source: string }) => l.source === 'inferred');
    raw.legs[i].evidence = null;
    expectError(raw, 'legs.json', `[${i}].evidence`);
  });

  it('rejects a mismatched buildVersion', () => {
    const raw = sample();
    raw.config.buildVersion = 'other';
    expectError(raw, 'config.json', 'buildVersion');
  });

  it('rejects wrong types', () => {
    const raw = sample();
    raw.stops[2].lat = '4.2';
    expectError(raw, 'stops.json', '[2].lat');
    const raw2 = sample();
    raw2.config.minDevices = '3';
    expectError(raw2, 'config.json', 'minDevices');
    const raw3 = sample();
    raw3.legs[0].days = [0, 7];
    expectError(raw3, 'legs.json', '[0].days[1]');
    const raw4 = sample();
    raw4.legs = {};
    expectError(raw4, 'legs.json', '');
  });
});
