# Tonight Build Goal: Repeatable Monday CRE Workflow

## Goal

Turn the one-off distressed CRE research run into a repeatable Monday-first workflow that Codex can run again with less hand-holding.

The workflow should take PropertyRadar daily digest rows or batch CSV exports, dedupe and prioritize them, create safe verification tasks, route TitlePro evidence only after approval, and produce broker-facing packet artifacts that fit the existing Monday.com workflow.

## What Changes Tonight

1. Codify the process as a Codex skill: `monday-cre-workflow`.
2. Keep `codex-monday-digest` as the first runnable automation surface.
3. Add digest parsing improvements from SullyLink-style logic, especially HTML table support.
4. Add saved-Gmail preview support: a pasted/exported email file can run through the digest pipeline in `gmail_preview` mode while preserving label/window provenance.
5. Add a preview-only TitlePro approval queue so missing-evidence decisions become Monday-operational without enabling paid pulls.
6. Preserve the current safety model:
   - no Monday live writes by default
   - no Gmail sends
   - no RealNex writes
   - no unsupervised TitlePro paid pulls
   - no owner/control claims from CSV owner strings alone
7. Keep shareable packet output separate from raw evidence, credentials, cookies, PDFs, and old app dumps.

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
  -> optional read-only Monday lookup from board export
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
- Gmail connector preview consumes saved read-only connector JSON, preserves Gmail message/thread IDs, and records zero Gmail mutations/sends.
- Batch owner-cluster preview remains local-only and provisional.
- Batch CSV preview normalizes APNs when present, collapses duplicate APN rows, and preserves source row indexes.
- Digest preview writes `titlepro_approval_queue_preview.json`, plus a workbook `TitlePro Approval` sheet, with approval IDs linked to blocked TitlePro subitems and queue decisions.
- Digest and batch preview write `monday_action_queue.csv`, plus a workbook `Monday Action Queue` sheet, without executing Monday writes or promoting control claims.
- `sync --mode monday_lookup_dry_run --lookup-file` matches existing Monday export rows by Radar ID without writes.
- `sync --mode monday_lookup_dry_run --connector-json` consumes saved read-only Monday connector JSON, preserves board/item/group IDs, and records zero Monday writes.
- `titlepro-approve --approvals` records broker/admin approval decisions and approved pending pull-request artifacts without executing any TitlePro pull.
- `titlepro-import --evidence` consumes already-saved TitlePro profile/document extraction JSON, writes role assertions, and records zero paid/browser/write actions.
- `source-audit --zip/--source-dir --goal-md` turns SullyLink/retranToReel reference material and the current goal markdown into a compact reuse plan without copying old source, credentials, cookies, dependency trees, or raw paid docs.
- Shareable packet files have no credentials, cookies, local absolute paths, or paid raw docs.
- Every broker-facing owner/control claim has evidence and confidence language.
- TitlePro actions remain serialized and approval-gated.
- Monday live write remains blocked unless explicit board/column/rollback/broker gates are satisfied.

## Current Commands

```bash
cd codex-monday-digest
CODEX_PYTHON_BIN=/path/to/python-with-openpyxl PROPERTYRADAR_BATCH_CSV=/path/to/propertyradar_export.csv npm test
npm run proof:preview
npm run proof:gmail-connector
npm run proof:lookup
npm run proof:monday-connector
npm run proof:titlepro-approval
npm run proof:titlepro-evidence
npm run proof:source-audit
npm run app
```

Open the dashboard:

```text
http://localhost:8787
```

## Open Work

- Configure the canonical Gmail label/query (`CRE/PropertyRadar Alerts`) in the connected mailbox before scheduled connector use.
- Configure the live Monday connector read/export step that saves board items into the `--connector-json` shape; local connector-result matching is present.
- Add action-time TitlePro pull execution after an approved request is re-confirmed for property, APN/county when known, doc/profile type, reason, and cost ceiling. Saved TitlePro evidence intake is present; browser/order execution remains gated.
- Add official-provider status checks only after source rights and API shape are confirmed.
- Use `source-audit` before adapting additional SullyLink/retranToReel patterns so broad app code, credentials, and raw artifacts stay out of the Monday-first lane.
