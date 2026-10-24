# Methods (one page)

## Data used
- **MTCC 2026 timetables.** Tables extracted from the published MTCC timetable PDFs (data repo `data/processed/ferry/`). Only trips marked routing-eligible are used. Each published trip keeps one `tripId`, so staying on the same boat is not a transfer.
- **FollowMe vessel GPS, August 2025, as aggregates only.** Services inferred from device movements (`data/derived/vessels/corridor_services.json` in the data repo). No device IDs, tracks or individual positions are in this repo or the app bundle.
- **Census 2022, per island.** Population, sex, age bands, disability and elderly-living-alone counts, plus the island coordinates used for stop locations. Source and licence of the extract are not yet confirmed (TODO: team to confirm).

## How inferred services are derived
- **Stops are island shorelines.** A boat stop is the island it touches (`stop_location_mode: island_shoreline`), not a jetty. Jetty-level stops were dropped.
- **"Regular" means repeated across days.** Only services marked regular, i.e. the same island sequence seen on many days, are used.
- **Classes.** `fast` (speedboat) or `slow` (dhoni or supply boat), taken from the data repo's `inferred_class` (`fast_vessel` / `slow_vessel`).
- **Times are ranges.** Departure and arrival are given as the 10th to 90th percentile of observed times, never as one point.
- **Disclosure minimum.** A service is published only with at least 3 distinct devices and 8 days seen. The data repo's own minimum is 3 devices / 5 days; the app is stricter. Stops seen on fewer than 8 days inside a service are treated as passed through.
- **"Not observed" never means "cancelled".** Inferred legs are labelled "inferred service" with device and day counts. The device count is service-level, so it is an upper bound for a single segment.

## Transfer rule and buffers
For an arriving leg `a`, a departing leg `d` and buffer `b`:
- **Safe** if `a.arr.max + b <= d.dep.min`.
- **Possible** if `a.arr.min + b <= d.dep.max`.
- Otherwise **Missed**, and never offered.

`b` is 5 minutes between two official legs and 15 minutes if either leg is inferred. Both are team assumptions, set in `config.json`.

## Long waits
A wait of 120 minutes or more is flagged "Long wait" (`longWaitMin`, provisional). For a long wait the planner searches again from the transfer island for an earlier way on, including inferred private boats. If none exists it says "No alternative found in the data".

## Disruption what-if and shift proposals
Cancelling one dated MTCC leg is simulated on a copy; the baseline is never changed and Reset restores it. Broken connections are modelled connections, not passengers. Shift proposals:
- are made only for transfers that are not already Safe;
- move the feeding MTCC leg in 5-minute steps up to `maxShiftMin` (30), earlier or later, smallest move first;
- keep its travel time (departure and arrival move together);
- are rejected if the shift turns any other modelled connection of that leg into Missed;
- are a recommendation only: "Recommendation for MTCC to approve. Nothing changes automatically." If nothing works: "No safe shift".

## Unconfirmed items
- **Device time zone.** Times are read as Maldives time (UTC+5). The data repo's clock check found 0 corrections, so no shift is applied. Many inferred departures cluster at 01:00–02:40, which is unusual; we flag it rather than correct it.
- **Speed unit** (consistent with knots, unconfirmed).
- **Fares, capacities, boarding cut-offs**: not in the data, not modelled.
- **Timetable validity.** `validFrom` / `validTo` are assumed from the timetable file dates (to 2026-12-31), because the PDFs print no effective dates.
- Inferred validity projects August 2025 patterns onto 2026.

## What the real data shows
Source: integration analysis on a prototype real-data bundle (Rasdhoo–Malé example, Sun 25 Oct 2026). No inferred Rasdhoo→Malé boat departs at or after 10:55 (the latest observed are around 08:32–08:39 and 08:36–08:37, below the 8-day support rule at Rasdhoo). So if the 11:00 MTCC Rasdhoo→Malé is cancelled there is no same-day private recovery in the data; the next inferred departure is 02:32–02:38 the following day. Thoddoo→Malé, by contrast, has a direct inferred service, e.g. 08:02–08:09 → 09:12–09:40 (8 devices, 22 days) and 01:50–01:59 → 02:59–03:25 (10 devices, 30 days), against an MTCC journey with a 200-minute wait at Rasdhoo.
TODO(numbers): confirm against final bundle.
