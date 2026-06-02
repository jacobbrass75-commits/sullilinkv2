# Tonight Build Goal: Repeatable Monday CRE Workflow

## Goal

Turn the one-off distressed CRE research run into a repeatable Monday-first workflow that Codex can run again with less hand-holding.

The workflow should take PropertyRadar daily digest rows or batch CSV exports, dedupe and prioritize them, create safe verification tasks, route TitlePro evidence only after approval, and produce broker-facing packet artifacts that fit the existing Monday.com workflow.

## What Changes Tonight

1. Codify the process as a Codex skill: `monday-cre-workflow`.
2. Keep `codex-monday-digest` as the first runnable automation surface.
3. Add digest parsing improvements from SullyLink-style logic, especially HTML table support.
4. Preserve the current safety model:
   - no Monday live writes by default
   - no Gmail sends
   - no RealNex writes
   - no unsupervised TitlePro paid pulls
   - no owner/control claims from CSV owner strings alone
5. Keep shareable packet output separate from raw evidence, credentials, cookies, PDFs, and old app dumps.

## Reused SullyLink / retranToReel Patterns

The reference zip `retranToReel_codebase 2.zip` was extracted only into ignored local context. Useful patterns:

- `daily_update.py`: daily import loop, skip existing APNs, log imported/skipped counts.
- `dedupe_spreadsheet.py`: APN normalization and compare-against-existing workflow.
- `retran_scraper.py`: source scrape as a controlled explicit command, not always-on magic.
- `recDocReader/reader.py`: recording document extraction schema for NOD/NTS/DOT facts.
- `CODEBASE_GUIDE.md`: one-at-a-time TitlePro worker, email importer, status fields, and background queue shape.
- `external_references/sullilink/src/import-export/propertyradar-alerts.js`: PropertyRadar HTML/text digest parsing and source-event preservation.

Do not reuse hardcoded credentials, `.env` files, cookies, old raw PDFs, broad database migrations, or unsupervised browser automation.

## Build Target

Immediate target:

```text
PropertyRadar digest or CSV
  -> codex-monday-digest local preview
  -> dedupe / owner-cluster candidate tasks
  -> TitlePro approval queue when evidence is missing
  -> owner/control role assertions
  -> broker packet + Monday action queue
  -> optional read-only Monday lookup
```

Later target after the Monday lane proves value:

```text
CRE Brain / SullyLink database
  -> evidence source of truth
  -> Monday as task/status UI
  -> RealNex/contact enrichment as separate approved lanes
```

## Acceptance Gates

- `npm test` passes in `codex-monday-digest`.
- Digest parser handles both saved text and HTML PropertyRadar tables.
- Batch owner-cluster preview remains local-only and provisional.
- Shareable packet files have no credentials, cookies, local absolute paths, or paid raw docs.
- Every broker-facing owner/control claim has evidence and confidence language.
- TitlePro actions remain serialized and approval-gated.
- Monday live write remains blocked unless explicit board/column/rollback/broker gates are satisfied.

## Current Commands

```bash
cd codex-monday-digest
CODEX_PYTHON_BIN=/path/to/python-with-openpyxl PROPERTYRADAR_BATCH_CSV=/path/to/propertyradar_export.csv npm test
npm run app
```

Open the dashboard:

```text
http://localhost:8787
```

## Open Work

- Add Gmail connector preview once manual digest parsing is stable.
- Add Monday read-only lookup for existing items by Radar ID.
- Add a formal TitlePro approval queue/export from the runner.
- Add APN-aware batch dedupe when the source CSV includes APN columns.
- Add official-provider status checks only after source rights and API shape are confirmed.
