# CLAUDE.md

Maldives Island Journey Planner (Datathon 2026). Plans multi-leg island trips over official MTCC ferries plus private speedboats inferred from GPS data, flags long transfer waits, and runs a "cancel a leg" what-if.

- `SRS.md` is the spec. Section 4 (data contract) and section 5.3 (transfer rules) are authoritative; read them before touching router or data code.
- `TODO.md` is the shared task board. Check it before starting work and follow its take/finish protocol (mark `[~]`, then `[x]`).

## Commands

All npm commands run from `app/`:

```
cd app
npm install
npm run dev       # Vite dev server
npm test          # Vitest, runs src/**/*.test.ts in Node
npm run build     # tsc type check, then vite build
npm run preview   # serve the production build
npm run lint      # ESLint (typescript-eslint, react-hooks, jsx-a11y)
npm run format    # Prettier (format:check to verify)
```

Run `npm test`, `npm run build`, `npm run lint` and `npm run format:check` before calling any change done. TypeScript is pinned to 6.0 because typescript-eslint does not support TS 7 yet.

UI conventions are in `docs/ui-revamp-plan.md`: colours and spacing come only from tokens in `src/styles/tokens.css` (light and dark), shared controls from `src/styles/ui.css`, each component imports its own CSS file, CSS is mobile first (`min-width: 768px` for desktop), and status is never shown by colour alone.

## Layout

```
app/                      Vite + React 18 + TypeScript app, MapLibre GL for the map
  public/data/            stops.json legs.json config.json census.json meta.json
  src/router/             pure TS routing logic + *.test.ts   (Member A)
  src/data/load.ts        loadBundle(), validateBundle()       (Member B)
  src/components/         React UI                             (Member B)
prototype/index.html      old single-file Leaflet prototype. Reference only; not built, don't extend it
tools/                    lead's Python data-build scripts (build_shapes.py); osm_cache/ is gitignored
```

## Rules that are easy to break

- **Ownership.** `src/router/` must stay pure TypeScript: no React, no DOM, no fetch. UI code calls router functions and never reimplements routing logic. `src/router/model.ts` is the shared contract; don't change it without flagging that both lanes are affected.
- **Time.** Times are integer minutes since 00:00 of the service date in Maldives time (UTC+5, no DST). Values of 1440 or more are after midnight. Never use the browser time zone: no `new Date()` local getters, no `toLocaleString` without `timeZone`. Weekdays use 0 = Sunday.
- **No hard-coded thresholds.** Buffers (5/15 min), long wait (120), max transfers, horizon, shift step and max shift, minDevices and minDays all come from `config.json`.
- **Transfers.** Safe: `a.arr.max + b <= d.dep.min`. Possible: `a.arr.min + b <= d.dep.max`. Otherwise Missed, and a Missed transfer is never offered. Consecutive legs with the same `tripId` are one ride, not a transfer.
- **Never mutate the baseline bundle.** Cancellations and shifts return new views, and Reset must restore results exactly.
- **Data must not need code changes.** The lead swaps sample JSON for real JSON near 15:00. Build only against the contract shape. On bad data the loader must name the file and the field, never leave a blank page.
- **Honesty labels (required UI text).** Inferred legs say "inferred service" with device and day counts, and are never called "scheduled" or "cancelled". Cancellation is labelled "Simulated cancellation". Shift proposals carry "Recommendation for MTCC to approve. Nothing changes automatically." When nothing is found, say so ("No alternative found in the data", "No safe shift"); never invent a result. Hide inferred legs below `minDevices` / `minDays`. Show the "SAMPLE DATA" banner when `meta.fixture` is true.
- **Privacy.** No device IDs, tracks, individual coordinates or API keys in the repo or the bundle. The repo is public on purpose: it's a public datathon and the data is supplied by the organisers.
- **Map** must work offline: points and lines over a plain background, with an SVG fallback if WebGL fails. Official legs are solid lines, inferred legs dashed, the cancelled leg red.
- **Accessibility and mobile.** Status uses text as well as colour. Controls are keyboard-reachable. Layout works at 390 px wide with no horizontal scroll.

## Tests

The acceptance tests are T1 to T13 in SRS section 8. Name router tests after them (for example `it('T7 Mathiveri to Malé ...')`) so the TODO "Done when" checks can be traced. The T7, T8 and T9 times may shift once real data lands; if they do, report a data mismatch to the lead rather than bending the code.

## Out of scope

Live tracking, booking, fares, capacity, passenger counts, accounts, any backend, and the passenger numbers in `MTCC.xlsx` (they are randomly generated).
