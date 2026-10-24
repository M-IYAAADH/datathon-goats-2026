# Data dictionary

The app loads five JSON files (plus two GeoJSON map layers, below) from `app/public/data/`. The TypeScript types in `app/src/router/model.ts` are the authoritative contract; this page restates them.

Conventions: times are integer minutes since 00:00 of the service date in Maldives time (UTC+5, no DST); 1440 or more means after midnight. Weekdays are 0 = Sunday … 6 = Saturday. Dates are `"YYYY-MM-DD"`. A `Range` is `{ "min": number, "max": number }`; official legs have `min === max`, inferred legs are ranges.

## stops.json — array of `Stop`
| Field | Type | Meaning |
|---|---|---|
| id | string | Stop ID, e.g. `MALE` |
| name | string | Display name |
| atoll | string | Atoll code |
| lat, lon | number | Island point (from Census) |
| censusKey | string \| null | Key into `census.json`, or null |
| kind | `"island"` \| `"hub"` | Hub = Malé |

## legs.json — array of `Leg` (one per boardable segment)
| Field | Type | Meaning |
|---|---|---|
| id | string | Unique leg ID |
| source | `"mtcc"` \| `"inferred"` | Official or inferred service |
| routeId | string | Published route code (MTCC) or signature ID (inferred) |
| tripId | string | Legs sharing a tripId are one boat; staying aboard is not a transfer |
| from, to | string | Stop IDs |
| dep, arr | Range | Departure and arrival times |
| days | number[] | Weekdays the leg runs |
| validFrom, validTo | string | Validity dates |
| cls | `"fast"` \| `"slow"` \| null | Speedboat / dhoni or supply boat; null for official legs |
| evidence | Evidence \| null | Present for inferred legs, null for official |

`Evidence` (aggregate only, no device IDs or tracks):
| Field | Type | Meaning |
|---|---|---|
| devices | number | Distinct devices (service level) |
| days | number | Days observed |
| weekdayObs | number[7] | Observed days per weekday, index 0 = Sunday |
| period | string | Observation period, e.g. `"2025-08"` |
| unconfirmedOriginShare | number | Share of trips whose origin is unconfirmed |

## config.json — `Config`
| Field | Type | Meaning (sample value on `main`) |
|---|---|---|
| timezone | string | `Indian/Maldives` |
| bufferOfficialMin | number | Buffer between two official legs (5) |
| bufferInferredMin | number | Buffer if either leg is inferred (15) |
| longWaitMin | number | Long-wait threshold (120) |
| maxTransfers | number | Max boat changes per journey (2) |
| horizonHours | number | Search horizon (48) |
| shiftStepMin | number | Shift proposal step (5) |
| maxShiftMin | number | Largest shift tried (30) |
| minDevices | number | Disclosure minimum, devices (3) |
| minDays | number | Disclosure minimum, days (8) |

## census.json — `Census`: object keyed by `Stop.censusKey`, values `CensusEntry`
| Field | Type | Meaning |
|---|---|---|
| name | string | Island name |
| population | number | Total population |
| male, female | number | By sex |
| age0_17, age18_64, age65p | number | By age band |
| disability | number | People with a disability |
| elderlyAlone | number | Elderly living alone |

## meta.json — `Meta`
| Field | Type | Meaning |
|---|---|---|
| buildVersion | string | Build identifier |
| fixture | boolean | true = sample data; the UI shows a "SAMPLE DATA" banner |
| evidencePeriod | string | Period of the inferred evidence, e.g. `"2025-08"` |
| timezoneStatus | string | e.g. `"unconfirmed"` |
| speedUnitStatus | string | e.g. `"unconfirmed"` |
| clockCorrections | number | Clock corrections applied by the data repo (0) |
| timetableYear | number | MTCC timetable year (2026) |
| region | object (extra key, not in `model.ts`) | Study region: `atolls` (string[], e.g. `["AA","ADH","K","MLE","V"]`) and `name` (string) |

## Map layers (GeoJSON, display only; not part of the `Bundle` type)

### islands.geojson — FeatureCollection of island footprints
Source: OneMap (Geomatics Department, Ministry of Infrastructure, Housing and Urban Development), layer `island_20240509`, OneMap Data Usage License; the attribution is in the file's top-level `attribution` key. Geometry: Polygon or MultiPolygon.
| Property | Type | Meaning |
|---|---|---|
| code | string | Island code, e.g. `LD0004` (same format as `Stop.censusKey`) |
| name | string | Island name |
| atoll | string | Atoll code |
| category | string | OneMap category, e.g. `Residential Island` |
| isStop | boolean | true if the island is a stop in `stops.json` |

### atolls.geojson — FeatureCollection of atoll outlines
Source: Government of Maldives / OCHA COD-AB v02 (CC BY-IGO) and OneMap island polygons; attribution in the top-level `attribution` key. Geometry: Polygon. Display outline only, not a legal or reef boundary.
| Property | Type | Meaning |
|---|---|---|
| code | string | Atoll code, e.g. `AA` |
| name | string | Atoll name |
| pcode | string | COD-AB P-code, e.g. `MV008` |
| method | string | How the outline was made (convex hull) |

Extra keys in a file (for example a `buildVersion` in `config.json`) are allowed but not read by the router.
