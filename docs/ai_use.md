# AI use record

We used AI tools for planning, code, data-pipeline work and review. A team member reviewed every output before it was kept. Where we are not sure which tool did a piece of work, it is marked TODO for the team to fill in.

| Tool | What it did | Human checks |
|---|---|---|
| Claude / Claude Code (Anthropic) | Integration and build planning; router code in `app/src/router/` and its tests; a prototype transform from the data repo into the app bundle (`scripts/build_app_data.py` in the data repo); these docs (README, methods, data dictionary, AI-use record, declaration draft). TODO: team to confirm which UI components were AI-assisted. | Tests (`npm test`) and build (`npm run build`) run before merge; numbers in the docs checked against repo files; team review of each PR. |
| Codex / ChatGPT (OpenAI) | A prompt for the ferry-stop to Census island crosswalk (not delivered as code). TODO: team to list any other Codex/ChatGPT use (e.g. data-cleaning pipeline steps, code review). | TODO: team to describe. |
| Gemini (Google) | Early data audits (archived, deprecated). It produced jetty and OpenStreetMap identifiers that did not exist. | The invented jetty/OSM identifiers were rejected. We dropped jetty-level stops and use island-level stops matched to Census islands by exact name plus a hand-checked alias table. |

## Data-cleaning pipeline
TODO: team to state which tool(s) helped write the data-repo cleaning and vessel-inference pipeline, and which parts were written by hand.

## Rules we followed
- AI output is a draft. Nothing was merged without a person reading it and running the tests.
- No private data (raw GPS, device IDs, IMEIs) or keys were pasted into any AI tool. TODO: team lead to confirm.
- Numbers in the submission come from files and commands, not from AI answers.
