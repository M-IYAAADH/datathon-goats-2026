# TODO: Island Journey Planner

Read `SRS.md` first (10 minutes). The data contract in section 4 is what you build against.

**Deadlines (Maldives time, Sat 24 Oct):** 14:50 first working screen on sample data. 15:00 lead drops in real data. 15:30 build freeze (after that only fixes). 16:30 submission opens. 18:00 hard deadline.

## How to take a task (30 seconds)

1. `git pull --rebase` first.
2. Pick a task with status `[ ]` whose "Needs" tasks are done. Take the one at the top of your lane first.
3. In this file change `[ ]` to `[~]` and write your name and the time, e.g. `[~] Sara 14:35`. Commit and push **only that change** right away (`git commit -am "take U2" && git push`) so nobody else takes it.
4. Do the work. Only edit the files listed on the task. If you need to change someone else's file, message them.
5. When the "Done when" check passes: change to `[x] Sara 14:58`, commit your work and this file together, `git pull --rebase`, push.
6. Pick the next task. One task at a time.

Status marks: `[ ]` open, `[~]` in progress, `[x]` done, `[!]` blocked (write why).
Merge conflicts in this file: keep both people's lines.

## Lanes

- **Member A (Router):** R-tasks. Pure TypeScript in `app/src/router/`. No React.
- **Member B (UI):** U-tasks. Everything else in `app/src/`. No routing logic. Call the router functions only.
- **Lead (Iyaadh):** D-tasks (data) and S-tasks (docs and submission). Helps anyone who is blocked.
- **Either member** may take a X-task (shared) when their lane is waiting.

If you finish your lane, take any open task. Ask in the group chat before taking someone else's lane task that is `[~]`.

---

## 0. Setup (do first, 15 minutes)

| Status | ID | Task | Files | Done when |
|---|---|---|---|---|
| [x] 14:45 | X0 | Scaffold Vite + React + TypeScript app, add `maplibre-gl` and `vitest`, scripts `dev`, `build`, `test`, `preview` | `app/package.json`, `app/tsconfig.json`, `app/vite.config.ts`, `app/index.html`, `app/src/main.tsx` | `npm install && npm run dev` shows a blank page, `npm test` runs |
| [ ] | R1 | Types: write `app/src/router/model.ts` from SRS section 4 (`Stop`, `Leg`, `Config`, `Census`, `Meta`, `Bundle`, `Occurrence`, `Journey`, `TransferAssessment`, `ScenarioResult`) | `app/src/router/model.ts` | Compiles. Post "model.ts is in" in the group chat. UI starts using it |
| [x] Member B 15:37 | X1 | Sample data: five JSON files in the exact contract shape with `meta.fixture: true`. Include the demo islands (Mathiveri, Bodufolhudhoo, Ukulhas, Rasdhoo, Thoddoo, Maafushi, Gulhi, Malé), the official legs from SRS T7, T8, T9, and two clearly fake inferred legs (Rasdhoo to Malé 11:10 to 11:30 and 12:20 to 12:50, `cls: "fast"`) | `app/public/data/*.json` | Files validate against `model.ts`. T7, T8, T9 scenarios are possible with them |

## 1. Router lane (Member A)

| Status | ID | Task | Files | Needs | Done when |
|---|---|---|---|---|---|
| [ ] | R2 | Time and calendar: parse "YYYY-MM-DD" and minutes in Maldives time (UTC+5, never the browser zone). `expandOccurrences()` using `days`, `validFrom`, `validTo`; include previous-day trips that run past midnight | `router/time.ts`, `router/time.test.ts` | R1 | Test T6 passes. T13 weekday rule passes |
| [ ] | R3 | `assessTransfer()` with Safe / Possible / Missed and buffers 5 (official to official) and 15 (any inferred). Long-wait flag from `longWaitMin` | `router/connections.ts`, `router/connections.test.ts` | R1 | Tests T1, T2, T3, T4 pass |
| [ ] | R4 | `findJourneys()`: depth-limited search, up to 3 itineraries, max 2 transfers, 48 h horizon, same-`tripId` legs merged into one ride | `router/planner.ts`, `router/planner.test.ts` | R2, R3, X1 | Tests T5, T7, T9, T13 pass on sample data |
| [ ] | R5 | `findWaitAlternatives()`: for a long wait, find other legs from the transfer island that reach the final stop earlier; saving as a range if inferred; "none found" if none | `router/planner.ts` (alternatives section) | R4 | Test T8 shows the 3 h 20 min wait flagged with an alternative from the sample inferred legs |
| [ ] | R6 | `applyCancellation()` and `compareReachability()`: remove one dated occurrence without mutating the baseline; report affected itineraries and broken modelled connections | `router/disruption.ts`, `router/disruption.test.ts` | R4 | Tests T10, T11 pass |
| [ ] | R7 | `proposeShifts()`: 5-minute steps up to `maxShiftMin`; keep travel time; reject any shift that makes another modelled connection Missed; attach the "Recommendation for MTCC to approve. Nothing changes automatically." text; return "no safe shift" if none | `router/disruption.ts` (shifts section) | R6 | Test T12 passes, including a case that is rejected |
| [ ] | R8 | Run all tests against the **real data** once the lead has dropped it in. Fix mismatches in T7, T8, T9 expected times (tell the lead if the data is wrong, not the code) | `router/*.test.ts` | D-drop | `npm test` green on real data |
| [ ] | R9 (P2) | Performance check: query under 200 ms on real data; add an index by departure stop if slower | `router/planner.ts` | R8 | Measured and noted here |

## 2. UI lane (Member B)

| Status | ID | Task | Files | Needs | Done when |
|---|---|---|---|---|---|
| [x] Member B 15:45 | U1 | Data loader: `loadBundle()` fetches the five files; `validateBundle()` checks required fields, stop references, `arr` after `dep`, one `buildVersion` across files. Clear error message naming file and field | `src/data/load.ts` | R1, X1 | Breaking a field in a JSON shows the message, not a blank page |
| [x] Member B 15:36 | U2 | Layout and banners: header, left panel (form/results), right panel (map). Persistent honesty banner (SRS FR-23). "SAMPLE DATA" banner when `meta.fixture` is true | `src/App.tsx`, `src/components/Banner.tsx`, `src/styles.css` | X0, U1 | Both banners visible; layout holds at 390 px wide |
| [!] Member B: form built with a stub findJourneys (src/data/planner.ts); Done-when needs R4 | U3 | Planner form: origin, destination, date (default Sun 25 Oct 2026), earliest departure; "Plan" button calls `findJourneys` | `src/components/PlannerForm.tsx` | U2, R4 | Entering Mathiveri to Malé lists journeys |
| [ ] | U4 | Journey timeline: legs as rows with times (exact or range), wait bars between legs, labels Safe / Possible / Long wait (text and colour), official vs inferred, evidence text ("6 devices, 11 days"). Alternatives block under a long wait | `src/components/JourneyTimeline.tsx` | U3, R5 | Thoddoo to Malé shows the long wait and an alternative |
| [x] Member B 15:40 | U5 | Map: MapLibre with island points and lines, works with tiles blocked (plain background), SVG fallback if WebGL fails. Solid official, dashed inferred, selected journey highlighted | `src/components/MapView.tsx` | U2 | Map works with network offline; selecting a journey highlights it |
| [ ] | U6 | Disruption panel: pick a dated official leg, "Cancel this leg (simulated)", before/after list, broken connections, recovery options, shift proposal card with the MTCC approval text, "Reset" button. Cancelled leg shown red on the map | `src/components/DisruptionPanel.tsx` | U4, U5, R6, R7 | Demo step 4 works end to end, Reset restores baseline |
| [ ] | U7 | Polish: keyboard focus, labels not colour-only, empty states ("No journey found", "No alternative found in the data", "No safe shift"), "How this works" panel (FR-25) | all components | U6 | Tab through the whole demo flow with keyboard only |
| [ ] | U8 (P2) | Census overlay on map: population and 65+ share on click; highlight islands that lose connection after a cancellation | `src/components/MapView.tsx`, `src/components/CensusCard.tsx` | U6 | Click an island shows numbers from `census.json` |

### UI revamp (Member B, plan in docs/ui-revamp-plan.md)

| Status | ID | Task | Files |
|---|---|---|---|
| [x] Member B 15:54 | UR0 | Foundation: theme tokens (light/dark), base, ui primitives, per-component CSS split | src/styles/*, component .css |
| [x] Member B 15:57 | UR-A | Shell: header with theme toggle, banners, mobile Plan/Map tabs | App.tsx/.css, Header, Banner, MobileTabs, hooks/useTheme.ts |
| [x] Member B 15:57 | UR-B | Planner form restyle and JourneyList | PlannerForm, JourneyList |
| [x] Member B 15:57 | UR-C | Map theming, legend, keyboard-reachable stops | MapView, Legend |
| [x] Member B 16:07 | UR-D | ESLint/Prettier tooling and How this works panel (FR-25) | package.json, eslint.config.js, .prettierrc, HowItWorks |

## 3. Data and docs lane (Lead)

| Status | ID | Task | Needs | Done when |
|---|---|---|---|---|
| [ ] | D-drop | Replace sample files in `app/public/data/` with real ones (`meta.fixture: false`). Announce in group chat | data build | App loads with no code change, or the loader names the broken field |
| [ ] | D-gate | 14:50 evidence gate: does the data support a private recovery near the Rasdhoo 10:55 arrival? If not, keep the sample inferred legs but mark them "Illustrative" in the data and the UI | D-drop | Yes/no written here: ______ |
| [ ] | S1 | README with exact run commands | X0 | Fresh clone runs |
| [ ] | S2 | One-page methods note including AI use (Claude, Codex/ChatGPT, Gemini; human checks; rejected invented jetty IDs) | | File in `docs/` |
| [ ] | S3 | Team lead declaration | | File in `docs/` |
| [ ] | S4 | 8-slide PDF | | PDF in `docs/submission/` |
| [ ] | S5 | Demo rehearsal and backup recording | R8, U6 | Two full run-throughs under 5 minutes |
| [ ] | S6 | Submission: repo link when the link opens (16:30), before 18:00 | all | Submitted |

## 4. Shared (either member)

| Status | ID | Task | Done when |
|---|---|---|---|
| [ ] | X2 | Deploy preview (Vercel or Netlify) and local `npm run build && npm run preview` backup | Link works on a phone |
| [ ] | X3 | Cross-check: run T7, T8, T9, T10, T12 in the UI against the SRS table and note any difference here | All five match or differences are listed |

---

## Suggested start

- **Member A:** X0 (if B has not started it), R1, then R2 and R3 in parallel with B's UI, then R4.
- **Member B:** pull after R1, then X1 (sample data) together with U1, then U2 and U5.
- Both: by 14:50 something must show on screen from sample data, even if only a list of journeys.

## Blocked or notes (add lines here)

- All npm commands run inside `app/` (`cd app`). The old single-file Leaflet prototype now lives in `prototype/index.html` for reference only; do not build on it. `tools/` holds the lead's data-build scripts.
- Vitest runs `src/**/*.test.ts` in Node (no DOM) and passes when there are no test files yet.
- X1 sample data notes (for Lead and Member A):
  - Only `meta.json` has `buildVersion`. `stops.json` and `legs.json` are bare arrays, so the U1 "same buildVersion in all files" check has nothing to compare. Decide whether the contract should change.
  - The sample inferred Rasdhoo to Malé boats (dep 11:10–11:30, 12:20–12:50) reach Malé before the MTCC 14:10. A router ranking by `arr.max` lists the inferred option first for T7 and T8.
  - T12: after cancelling Rasdhoo to Malé 11:00, the Mathiveri 10:55 arrival is already Safe onto the 11:10 inferred boat (10:55 + 15). With sample data, no shift is proposed. Demo step 4 needs a later or tighter inferred departure to show a shift.
  - Route 308 (Thoddoo) and the 309 weekdays are made up. Kaafu census keys use a `K-` prefix.
- U5: map shows a dashed, offset inferred line next to the official line on a pair both serve (Rasdhoo to Malé). Not yet checked visually in a browser or with WebGL off. Stop clicks work with a mouse only (keyboard comes in U7).
- U1: the contract types live in `app/src/data/load.ts` until R1 lands. Member A: when you write `router/model.ts`, match these shapes (or tell Member B), and load.ts will re-export from model.ts.
