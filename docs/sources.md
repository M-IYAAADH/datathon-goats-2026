# Sources

Every dataset, map layer and main software library the app uses, with its licence or terms where known. The app bundle in `app/public/data/` is built from these by `scripts/build_app_data.py` in the data repo (https://github.com/M-IYAAADH/datathon-2026, branch `app/build-app-data`). Bundle build version: `2026-10-24T17:00+05:00`.

## Data

| # | Source | What we used | Period / version | Licence or terms | Where it is in the project |
|---|---|---|---|---|---|
| 1 | **MTCC published ferry timetables** (PDF) | Official ferry trips and legs. Only the 2026 tables are routed: `CFN-All-ferry-Schedule-1-August-2026.pdf`, `Zone-6-CFN-Ferry-Schedule-2026.pdf`, `28.03.2026-Thaa-Laamu-Speed.pdf`. Older tables were extracted for reference but are never routed. | 2026 timetables. Most PDFs print no effective date, so dates come from the file names. | Published by MTCC. No licence is printed on the documents. | Data repo `data/processed/ferry/`; method in `docs/ferry_extraction_report.md`. App: `legs.json` (`source: "mtcc"`). |
| 2 | **FollowMe vessel GPS data** (daily CSV files) | Inferred private speedboat services, as aggregates only: device counts, days seen, time ranges. | August 2025 (`evidencePeriod: 2025-08`). | Supplied by the datathon organisers. Raw data and per-device outputs are private and not in any repo. | Data repo `data/derived/vessels/` (aggregates). App: `legs.json` (`source: "inferred"`). |
| 3 | **Census 2022, per-island extract** | Island names, island codes (LD####), reference coordinates, and population counts by sex, age band, disability and elderly living alone. | Reference year 2022, usual residence. | Supplied for the datathon. The extract states no publisher or licence, so none is claimed. | Data repo `per_island/` (209 files). App: `stops.json`, `census.json`. |
| 4 | **OneMap island footprints**: Geomatics Department, Ministry of Infrastructure, Housing and Urban Development (Maldives), layer `island_20240509` | Island shapes drawn on the map. 379 polygons in the study region. | Layer dated 2024-05-09; retrieved 2026-10-24. | OneMap Data Usage License, https://readme.onemap.mv/pdf/Data%20Usage%20License.pdf | Data repo `data/reference/followme/onemap_study_islands.geojson`. App: `islands.geojson`. |
| 5 | **Maldives administrative boundaries, OCHA COD-AB v02** (Government of Maldives / OCHA, via HDX) | Atoll outlines on the map, drawn as convex hulls for display only; not a legal or reef boundary. 5 atolls: Alif Alif, Alif Dhaal, Kaafu, Vaavu, Greater Malé. | Valid on 2024-10-22; reviewed 2025-10-30. | CC BY-IGO. https://data.humdata.org/dataset/cod-ab-mdv | Data repo `data/reference/followme/study_area.geojson`. App: `atolls.geojson`. |
| 6 | **OpenStreetMap** | Water route paths between stop pairs (OSM ferry routes plus open-water paths that avoid OSM coastlines). Also the optional basemap tiles. | Retrieved October 2026. | © OpenStreetMap contributors, ODbL, https://www.openstreetmap.org/copyright. Tiles from tile.openstreetmap.org under the OSM tile usage policy. | App: `routes.geojson`, built by `tools/build_shapes.py --bundle`. Basemap loaded live in the browser and optional. |

## Software

| Library | Use | Licence |
|---|---|---|
| React 18, React DOM | User interface | MIT |
| MapLibre GL JS 6 | Map rendering | BSD-3-Clause |
| Vite, TypeScript, Vitest | Build, types, tests | MIT, Apache-2.0, MIT |
| Inter (Google Fonts) | Typeface | SIL Open Font License 1.1 |
| Python 3.12 (data repo), with pytest and DuckDB in the pipelines | Data extraction, cleaning and bundle build | PSF, MIT, MIT |

## AI tools
Claude / Claude Code (Anthropic), Codex / ChatGPT (OpenAI) and Gemini (Google). See [`docs/ai_use.md`](ai_use.md) for what each did and how it was checked.

## On-screen attribution
The map shows the OneMap, COD-AB and OpenStreetMap credits in its attribution control (the (i) button).
