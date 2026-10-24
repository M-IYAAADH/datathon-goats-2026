# SRS: Maldives Island Journey Planner

Maldives Datathon 2026. Theme: "Mapping Mobility through Data: Innovating Transport Insights for a Connected Maldives".
Version 1.0, 24 Oct 2026. Build freeze 15:30. Submission link opens 16:30. Hard deadline 18:00.

## 1. Purpose

A web app that plans multi-leg trips between Maldivian islands over official MTCC ferries and privately run speedboat services inferred from FollowMe GPS data. It does three things a normal timetable cannot:

1. Shows the **waiting time** when a trip has to switch boats on an island, and flags long waits.
2. Suggests an **alternative** (an inferred private speedboat) when the wait is long.
3. Runs a **disruption what-if**: cancel one MTCC leg, see which connections break, see how people recover, and see a timetable shift MTCC could approve.

Demo story (Sunday 25 Oct 2026): Mathiveri to Malé. MTCC Mathiveri to Rasdhoo leaves 08:35 and arrives 10:55. MTCC Rasdhoo to Malé leaves 11:00. Cancel Rasdhoo to Malé. Mathiveri passengers can still reach Rasdhoo, catch an inferred private boat to Malé, and MTCC could shift the Mathiveri to Rasdhoo departure (5-minute steps, max 30 minutes) so the arrival meets the private boat.

## 2. Team, ownership and data flow

| Person | Owns |
|---|---|
| Lead (Iyaadh) | Data build. Produces the real JSON files and drops them into `app/public/data/`. Pitch, docs, integration. |
| Member A | Router: all logic in `app/src/router/` plus tests. No UI. |
| Member B | UI: everything else in `app/src/`. No routing logic. |

**The app is built entirely against the data contract in section 4 with sample data.** The lead replaces the sample files with real ones near 15:00. No code change should be needed. If the real data breaks the app, the loader's validation message says which file and field.

## 3. Architecture

- Vite + React + TypeScript. MapLibre GL JS for the map. No backend, no API keys, no database.
- Static JSON in `app/public/data/`: `stops.json`, `legs.json`, `config.json`, `census.json`, `meta.json`.
- Router is pure TypeScript functions (no React, no DOM). Input: bundle + query. Output: plain objects. Tested with Vitest.
- Time zone is Indian/Maldives (UTC+5, no daylight saving). All times are minutes since midnight of the service date, in Maldives time, never the browser's time zone.
- Hosting: static build (Vercel or Netlify) plus a local `npm run build && npm run preview` backup.

```
app/
  public/data/            five JSON files (sample now, real later)
  src/
    router/               model.ts time.ts connections.ts planner.ts disruption.ts + *.test.ts   (Member A)
    data/load.ts          loadBundle(), validateBundle()                                            (Member B)
    components/           PlannerForm, JourneyTimeline, MapView, DisruptionPanel, Banner, Legend    (Member B)
    App.tsx styles.css                                                                              (Member B)
```

`model.ts` is the shared contract. It is written first (task R1) and neither side changes it without telling the other.

## 4. Data contract

All times are integers: minutes since 00:00 of the service day in Maldives time. Values of 1440 or more mean after midnight (for example 1500 = 01:00 next day).

### 4.1 stops.json
```json
[{ "id": "MATHIVERI", "name": "Mathiveri", "atoll": "Alif Alif", "lat": 3.8, "lon": 72.7,
   "censusKey": "AA-MATHIVERI", "kind": "island" }]
```
`kind`: `island` or `hub`. `censusKey` may be null.

### 4.2 legs.json (one record per boardable segment)
```json
{ "id": "mtcc-301-1", "source": "mtcc", "routeId": "301", "tripId": "301-0835",
  "from": "MATHIVERI", "to": "RASDHOO",
  "dep": { "min": 515, "max": 515 }, "arr": { "min": 655, "max": 655 },
  "days": [0, 3], "validFrom": "2026-01-01", "validTo": "2026-12-31",
  "cls": null,
  "evidence": null }
```
- `source`: `mtcc` (official, exact times, min equals max) or `inferred` (range from observed device movements).
- `days`: weekdays it runs, 0 = Sunday ... 6 = Saturday.
- `tripId`: legs sharing a `tripId` are one published trip and one boat. Staying on the boat across consecutive legs is NOT a transfer.
- `cls`: `fast` (speedboat), `slow` (dhoni or supply), or null for official.
- `evidence` (inferred only): `{ "devices": 6, "days": 11, "weekdayObs": [0,2,3,0,0,2,4], "period": "2025-08", "unconfirmedOriginShare": 0.1 }`.
- Inferred legs shown in the app must have `devices >= config.minDevices` and `days >= config.minDays`; the app hides the rest.
- No device IDs, no tracks, no coordinates of individual devices appear anywhere in the data.

### 4.3 config.json
```json
{ "timezone": "Indian/Maldives", "bufferOfficialMin": 5, "bufferInferredMin": 15,
  "longWaitMin": 120, "maxTransfers": 2, "horizonHours": 48,
  "shiftStepMin": 5, "maxShiftMin": 30, "minDevices": 3, "minDays": 8 }
```
All thresholds are read from here. Nothing is hard-coded in the router.

### 4.4 census.json
```json
{ "AA-MATHIVERI": { "name": "Mathiveri", "population": 0, "male": 0, "female": 0,
  "age0_17": 0, "age18_64": 0, "age65p": 0, "disability": 0, "elderlyAlone": 0 } }
```

### 4.5 meta.json
```json
{ "buildVersion": "2026-10-24T15:00", "fixture": false, "evidencePeriod": "2025-08",
  "timezoneStatus": "unconfirmed", "speedUnitStatus": "unconfirmed",
  "clockCorrections": 0, "timetableYear": 2026 }
```
`fixture: true` means sample data. Every file carries the same `buildVersion`; the loader rejects a mix.

## 5. Functional requirements

Priority: **P0** must work for the demo. **P1** should. **P2** only if time is left.

### 5.1 Data loading
- FR-1 (P0) Load the five files. Validate: required fields present, every `from`/`to` exists in stops, `arr` after `dep`, same `buildVersion` in all files.
- FR-2 (P0) On failure show a clear message naming the file and field. Never a blank page.
- FR-3 (P0) If `meta.fixture` is true show a persistent "SAMPLE DATA" banner.

### 5.2 Journey planning
- FR-4 (P0) User chooses origin, destination, date (default 25 Oct 2026) and earliest departure time.
- FR-5 (P0) The router returns up to 3 distinct itineraries, at most `maxTransfers` transfers, within `horizonHours`, ranked by arrival time at the destination.
- FR-6 (P0) Expand legs into dated occurrences using `days`, `validFrom`, `validTo`. A leg that departs the previous day and arrives after midnight must be found.
- FR-7 (P0) Consecutive legs with the same `tripId` merge into one ride with no transfer.
- FR-8 (P1) Each itinerary may mix official and inferred legs. Inferred legs are never silently presented as official.

### 5.3 Transfer assessment
For a transfer from arrival leg `a` to departure leg `d`, with buffer `b` (5 min if both are `mtcc`, 15 min if either is `inferred`):
- **Safe**: `a.arr.max + b <= d.dep.min`
- **Possible**: `a.arr.min + b <= d.dep.max` (and not safe)
- **Missed**: otherwise. A missed transfer is never offered as a journey.
- Wait time is shown as a range when either leg is inferred, otherwise exact.
- FR-9 (P0) Every transfer shows its wait and its safe/possible label.
- FR-10 (P0) Wait of `longWaitMin` or more (default 120) gets a "Long wait" flag, separate from safe/possible.

### 5.4 Wait alternatives
- FR-11 (P0) For a flagged long wait at island X, search other legs departing X that reach the same final destination earlier. Include inferred legs. Show each as an alternative with the time saved at the destination, as a range if inferred.
- FR-12 (P0) If none exists, say "No alternative found in the data". Do not invent one.

### 5.5 Disruption what-if
- FR-13 (P0) User selects one dated official leg occurrence (for example Rasdhoo to Malé, 25 Oct 11:00) and presses "Cancel this leg".
- FR-14 (P0) The app recomputes and shows before and after: which itineraries disappear, which modelled connections break (counted as connections in the model, not passengers), and the new best route if any.
- FR-15 (P0) Show recovery options: routes using an inferred leg that still work after the cancellation.
- FR-16 (P0) "Reset" restores the baseline exactly.
- FR-17 (P0) Shift proposal: for an official leg feeding a transfer that the cancellation or a long wait made worse, try shifting its times earlier or later in `shiftStepMin` steps up to `maxShiftMin`. A shift is proposed only if (a) it turns the transfer to safe, (b) it keeps the travel time, and (c) it breaks no other modelled connection in the data. Show the shift, the connection it fixes, and the text: **"Recommendation for MTCC to approve. Nothing changes automatically."**
- FR-18 (P0) If no shift passes the checks, say so plainly.
- FR-19 (P1) Cancelling a leg is a simulation. The UI says "Simulated cancellation" and never claims a real cancellation happened.

### 5.6 Map
- FR-20 (P0) Show island stops. Draw official legs as solid lines and inferred legs as dashed lines. Highlight the selected itinerary and the cancelled leg (red).
- FR-21 (P0) The map works with no internet tiles: draw island points and lines over a plain background. If WebGL fails, show an SVG fallback with the same points and lines.
- FR-22 (P2) Census overlay: island population and 65+ share on hover or click; highlight islands that lose connectivity after a cancellation.

### 5.7 Labels and honesty
- FR-23 (P0) A persistent banner states: "Inferred services are estimated from device movements in Aug 2025. Times are ranges. Transfer buffers (5 and 15 minutes) are assumptions. Time zone and speed unit of the source data are unconfirmed."
- FR-24 (P0) Inferred legs say "inferred service" with device and day counts (for example "6 devices, 11 days"). Never "scheduled" and never "cancelled".
- FR-25 (P1) A "How this works" panel lists the rules in section 5.3 and the data sources.

## 6. Router algorithm (guidance for Member A)

1. `expandOccurrences(legs, date, horizon)` returns occurrences with absolute minutes from the start of the query date, using `days` and validity dates, including previous-day trips that run past midnight.
2. `findJourneys(query)`: depth-limited search from origin. From the current stop and time, take each occurrence departing from that stop, check the transfer rule against the previous leg (skip same-`tripId` continuations), recurse until the destination or `maxTransfers`. Collect, dedupe by leg sequence, sort by arrival (use `arr.max`), return 3.
3. `assessTransfer(arrLeg, depLeg, config)` returns `{ status, waitMin: [lo, hi], long }`.
4. `findWaitAlternatives(journey, transferIndex)`.
5. `applyCancellation(bundle, legOccurrenceId)` returns a new bundle view with the occurrence removed. Never mutate the baseline.
6. `compareReachability(baseline, disrupted, query)`.
7. `proposeShifts(...)`: for each shift step, build a modified copy of the arriving leg, re-assess the target transfer, and re-assess every other transfer in the model that involves that leg. Reject on any new Missed.

## 7. Non-functional requirements

- NFR-1 Privacy: no personal data, no device IDs, no tracks, no keys in the repo or the bundle.
- NFR-2 Offline: after the first load the app works without internet (tiles optional).
- NFR-3 Speed: a query returns in under 200 ms on a laptop with the real data.
- NFR-4 Runs from a fresh clone: `npm install && npm run dev`, and `npm run build` succeeds. README lists the exact commands.
- NFR-5 Tests: `npm test` passes. Router logic has unit tests (section 8).
- NFR-6 Accessibility: keyboard-reachable controls, visible focus, text labels in addition to colour (safe, possible, long wait, inferred).
- NFR-7 Mobile: usable at 390 px wide, no horizontal scroll.
- NFR-8 Time: no function reads the browser time zone. Dates are parsed and shown in Maldives time.
- NFR-9 Scalability story: adding a route or an operator means adding rows to `legs.json`. No code change. (Used in the pitch.)

## 8. Acceptance tests (Member A writes these in Vitest, Member B checks them in the UI)

| ID | Scenario | Expected |
|---|---|---|
| T1 | Safe transfer: arrive exact 10:55, depart exact 11:00, both MTCC | Safe (buffer 5, exactly met) |
| T2 | Arrive 10:56, depart 11:00, both MTCC | Missed |
| T3 | Arrive range 10:50 to 11:10 (inferred), depart 11:20 official | Buffer 15: Possible (10:50 + 15 <= 11:20), not Safe (11:10 + 15 = 11:25 > 11:20) |
| T4 | Arrive 10:55 official, depart inferred range 11:00 to 11:20 | Buffer 15: Possible (10:55 + 15 = 11:10 <= 11:20), not Safe |
| T5 | Same `tripId` consecutive legs | One ride, zero transfers |
| T6 | Leg departs 23:30, arrives 01:10 next day | Found by a query on the next day's early hours |
| T7 | Mathiveri to Malé, Sun 25 Oct | Mathiveri 08:35, Rasdhoo 10:55, wait 5 min, Rasdhoo 11:00, Malé 14:10. Transfer is Safe, wait 5 min, no long-wait flag |
| T8 | Thoddoo to Malé, Sun 25 Oct | Thoddoo 06:30, Rasdhoo 07:40, wait, Rasdhoo 11:00, Malé 14:10. Wait about 3 h 20 min. Long wait flag on |
| T9 | Maafushi to Malé, Sat 24 Oct | Route 309 via Gulhi, 07:25 to 09:05 |
| T10 | Cancel Rasdhoo to Malé 11:00 on 25 Oct | Mathiveri to Malé baseline option disappears. Recovery uses an inferred leg if one exists in data |
| T11 | After T10, reset | Results identical to baseline |
| T12 | Shift proposal | Only 5-minute steps up to 30. Rejected if it breaks another connection. Always carries the MTCC approval text |
| T13 | Same query on Fri 30 Oct | Rasdhoo to Malé 11:00 not offered (runs Wed and Sun) |

(T7 and T8 times come from the 2026 MTCC timetable; Member A confirms them against the real data once it is dropped in, and the lead corrects any mismatch.)

## 9. Demo script (5 minutes)

1. (30 s) Problem: islands, ferries, private boats, nobody sees them together.
2. (60 s) Plan Thoddoo to Malé: show the 3 h 20 min wait, long-wait flag, inferred speedboat alternative with range and evidence.
3. (90 s) Plan Mathiveri to Malé on Sunday 25 Oct: safe 5-minute connection at Rasdhoo.
4. (90 s) Cancel Rasdhoo to Malé 11:00: connection breaks, recovery via private boat, shift proposal "for MTCC to approve".
5. (30 s) Honesty and scaling: labels, assumptions, adding a route is data only.
6. Fallback: pre-recorded video and a localhost build.

## 10. Out of scope

Live vessel tracking, booking or payment, fares, capacity, passenger counts, user accounts, weather forecasting, any backend, anything using the randomly generated `MTCC.xlsx` passenger numbers.

## 11. Assumptions and open questions

- 5-minute official buffer is taken from timetables designed with 5-minute connections. 15 minutes onto a private boat is assumed.
- 120-minute long-wait threshold and 30-minute max shift are provisional.
- Device time zone and speed unit are unconfirmed (shown in the banner).
- Fares, boarding cut-offs and capacities are not published and not modelled.
- Whether inferred aggregates may be shown publicly is being asked of the organisers. Until answered, use the app locally and keep the repo private.

## 12. Definition of done (whole app)

`npm install`, `npm test` and `npm run build` pass on a fresh clone; the five demo scenarios (T7, T8, T9, T10, T12) work on real data; banner and labels present; map works with tiles blocked; phone-width layout checked; README, methods note and AI-use record written.
