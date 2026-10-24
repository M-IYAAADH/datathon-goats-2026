# Maldives Island Journey Planner (Datathon 2026)

An inter-island journey planner for the Maldives. It plans multi-leg trips over official MTCC ferries (2026 timetables) and private speedboat services inferred from FollowMe GPS aggregates (August 2025). It shows the wait when you change boats, flags long waits, suggests an earlier inferred private boat where the data has one, and runs a disruption what-if: cancel one MTCC leg (simulated), see the broken connections and any recovery, and get a timetable-shift proposal that is a recommendation for MTCC to approve.

- Spec: `SRS.md`. Method: `docs/methods.md`. AI use: `docs/ai_use.md`. Data fields: `docs/data_dictionary.md`. Declaration: `docs/team_lead_declaration.md`.
- Everything runs in the browser from five static JSON files. There is no backend, booking, fares, live tracking or accounts.

## Requirements

- Node.js 22.12+ recommended, with npm. Tests and build also pass on Node 20.20.0 (npm 10.8.2) with engine warnings: on Node 20, `npm install` prints two `EBADENGINE` warnings, for `@mapbox/jsonlint-lines-primitives` (wants `>= 22`) and `vitest@5.0.5` (wants `^22.12`). `app/package.json` has no `engines` field.

## Run it (from a fresh clone)

```
git clone https://github.com/M-IYAAADH/datathon-goats-2026
cd datathon-goats-2026/app
npm install
npm test          # Vitest: router and data-loader tests
npm run dev       # Vite dev server, open the printed http://localhost URL
npm run build     # type check (tsc), then production build into app/dist
npm run preview   # serve app/dist locally
```

Also available: `npm run lint` (ESLint) and `npm run format:check` (Prettier).

## Layout

```
app/public/data/   the five data files the app loads (see below)
app/src/router/    pure TypeScript routing logic and its tests (no React, no DOM)
app/src/data/      bundle loader and validation
app/src/components React UI: planner form, journey list/timeline, map, disruption panel
docs/              methods, AI use, data dictionary, team lead declaration
prototype/         old single-file prototype, reference only, not built
tools/             build_shapes.py (map shape helper)
```

## Data in `app/public/data`

| File          | Contents                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------- |
| `stops.json`  | Islands/hubs: id, name, atoll, lat/lon (island point), census key                                 |
| `legs.json`   | One record per boardable segment, official (`mtcc`) and inferred                                  |
| `config.json` | Every threshold the router uses (buffers, long-wait, transfers, shift limits, disclosure minimum) |
| `census.json` | Census 2022 counts per island, keyed by stop `censusKey`                                          |
| `meta.json`   | Build version, `fixture` flag, evidence period, time-zone/speed-unit status                       |

Field definitions: `docs/data_dictionary.md`. Times are integer minutes since 00:00 Maldives time (UTC+5); values of 1440 or more are after midnight.

Which bundle is in the repo: the real bundle (`meta.json` `"fixture": false`) comes in through the data PRs. It is built by `scripts/build_app_data.py` in the data repo (see below) with build version `2026-10-24T17:00+05:00`. If `meta.json` ever has `"fixture": true`, the files are hand-made sample data and the app shows a "SAMPLE DATA" banner.

The bundle is limited to the central study region: atolls AA, ADh, K, V and Greater Malé. Alongside the five JSON files it adds two map layers:

- `islands.geojson`: island footprints from OneMap (OneMap Data Usage License).
- `atolls.geojson`: convex hulls of the COD-AB v02 / OneMap island polygons. Display only; not a legal or reef boundary.

Region bundle (`buildVersion` `2026-10-24T17:00+05:00`, `fixture: false`): 34 stops (AA 8, ADh 10, K 9, Greater Malé 2, V 5), 120 legs (89 MTCC, 31 inferred), 34 Census entries. `islands.geojson` has 379 OneMap island polygons, 34 of them flagged `isStop`; `atolls.geojson` has 5 atoll hulls. The region cut removed only whole MTCC routes outside the region; routes 301–310 are kept complete. For reference, the nationwide bundle before the cut had 143 stops and 342 legs (311 MTCC, 31 inferred).

## How the data is regenerated

The bundle is produced by a script in the data repository, not in this repo:

- Data repo: https://github.com/M-IYAAADH/datathon-2026 (vessel outputs on branch `data/organise-ready-not-ready`).
- Script: `scripts/build_app_data.py`, documented in `docs/app_data_build.md`, on branch `app/build-app-data` of the data repo.
- It reads only the shareable inputs in the data repo (extracted MTCC timetable tables, disclosure-filtered vessel aggregates such as `data/derived/vessels/corridor_services.json`, and the per-island Census extract) and writes the bundle files into `app/public/data/`. It does not need private data.

Command, run from a checkout of the data repo on branch `app/build-app-data`:

```
python3 scripts/build_app_data.py --out <path-to-this-repo>/app/public/data --build-version 2026-10-24T17:00+05:00
```

## What is not reproducible from the public repos

- The raw FollowMe device GPS (per-device tracks and identifiers) is private and is not in any repo. The steps that turn raw tracks into inferred services cannot be re-run from public files.
- Per-segment device counts need the raw data. They are not available.

What is provided instead: shareable aggregates. Each inferred service carries its distinct-device count and days-seen count, and only services at or above the disclosure minimum are published (the app hides anything below `minDevices` / `minDays` in `config.json`, currently 3 devices and 8 days). The device count shown on an inferred segment is the service-level count, an upper bound for that segment.

## Limits

- Inferred services are estimated from device movements in August 2025 and projected onto 2026. "Not observed" never means "cancelled".
- Times of inferred services are ranges, not schedules. The 5 and 15 minute transfer buffers and the 120 minute long-wait threshold are assumptions.
- The device time zone and speed unit of the source data are unconfirmed. Fares, capacities, boarding cut-offs and timetable validity dates are not known; validity is assumed from file dates.
- Cancellations are simulated. Shift proposals are recommendations for MTCC to approve; nothing changes automatically.
- Broken-connection counts are modelled connections, not passengers.
- Coverage follows the data: stops that could not be matched to a Census island are left out of the bundle.

See `docs/methods.md` for details.
