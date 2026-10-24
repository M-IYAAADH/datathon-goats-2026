# AI use record

We used AI tools for planning, code, the data pipeline and review. A team member read every output and ran the tests before it was kept. The evidence for each row is in git: AI-assisted commits carry a `Co-Authored-By` trailer naming the tool.

| Tool | What it did | Human checks |
|---|---|---|
| Claude / Claude Code (Anthropic) | **Data repo:** the ferry-timetable PDF extraction pipeline; the FollowMe GPS cleaning and vessel-service inference pipeline; the data catalogue, status board and audits; `scripts/build_app_data.py` and its tests. All 5 commits on `data/organise-ready-not-ready` carry a Claude trailer. **App repo:** router code in `app/src/router/` and its tests; the data loader; UI components (planner form, journey list and timeline, map with island and atoll outlines, disruption panel, the restyle); merge-conflict resolution; and the docs (README, methods, data dictionary, this record, the declaration draft). 52 commits carry a Claude trailer. | `npm test`, `npm run build`, lint and format run before every merge to `main`. Data-build tests (`pytest tests/test_app_data.py`) run on every bundle. Numbers in the docs were checked against the bundle files. Results were checked in a headless browser on real data, and a team member reviewed each branch before merging. |
| Codex / ChatGPT (OpenAI) | A prompt for the ferry-stop ↔ Census island crosswalk (not delivered as code). Building the submission slide deck in `docs/submission/` from a written prompt that lists the only numbers allowed. | Every number on the slides was checked against the repo files. The screenshots are real captures of the running app. |
| Gemini (Google) | Early data audits of harbours, maritime terminals and health facilities, archived in the data repo under `data/archive/*_gemini_audited/` and not used. It produced jetty and OpenStreetMap identifiers that did not exist. | The invented jetty and OSM identifiers were rejected. We dropped jetty-level stops and use island-level stops, matched to Census islands by exact name plus a hand-checked alias table (never substring matching). |

## Data-cleaning pipeline
- The ferry extraction, the FollowMe cleaning and the vessel-service inference pipelines in the data repo were written with Claude Code and reviewed by the team lead.
- Thresholds and decisions were set by people and recorded in `config/*.json` and the data repo's docs. Examples:
  - the disclosure minimum of 3 devices and 8 days;
  - reading device times as Maldives time with no clock shift;
  - island-level stops;
  - 2026 timetables only.
- Reviewed decisions on stop aliases and calendar annotations are kept as CSVs in `data/manual/ferry/`.

## Rules we followed
- AI output is a draft. Nothing was merged without a person reading it and running the tests.
- Raw FollowMe GPS and per-device outputs stayed on the team lead's machine, in the git-ignored `data/private/`. Device IDs were pseudonymised with a local secret key, and only aggregates (device counts, days seen, time ranges) were committed. No API keys are in either repo.
- Numbers in the submission come from files and commands, not from AI answers.
