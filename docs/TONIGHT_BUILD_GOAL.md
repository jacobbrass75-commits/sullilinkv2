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
6. Keep TitlePro approval intake, action-time confirmation, and saved evidence import as record-only lanes that report zero TitlePro pulls, browser actions, paid actions, and external writes.
7. Add manual contact enrichment pasteback as a record-only lane for RocketReach/public/manual contacts without outreach or RealNex writes.
8. Add saved current-status/provider evidence import as a record-only lane without provider lookups, provider backfills, outreach, or external writes.
9. Preserve the current safety model:
   - no Monday live writes by default
   - no Gmail sends
   - no RealNex writes
   - no unsupervised TitlePro paid pulls
   - no owner/control claims from CSV owner strings alone
10. Keep shareable packet output separate from raw evidence, credentials, cookies, PDFs, and old app dumps.
11. Convert downloaded Monday workflow exports into a reusable local workflow map so future runs can align tasks/subitems to the actual Monday checklist shape.
12. Validate and package the skill itself so future Codex runs can prove `SKILL.md`, `agents/openai.yaml`, references, proof scripts, and safety language stayed aligned, then export an installable local skill package.

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
- `connector-readiness --gmail-json --monday-json` validates the canonical Gmail label/query and saved Monday board-item connector export shape before scheduled connector use.
- Batch owner-cluster preview remains local-only and provisional.
- Batch CSV preview normalizes APNs when present, collapses duplicate APN rows, and preserves source row indexes.
- Digest preview writes `titlepro_approval_queue_preview.json`, plus a workbook `TitlePro Approval` sheet, with approval IDs linked to blocked TitlePro subitems and queue decisions.
- Digest and batch preview write `monday_action_queue.csv`, plus a workbook `Monday Action Queue` sheet, without executing Monday writes or promoting control claims.
- `workflow-map --workflow-dir/--input` parses exported Monday workflow workbooks into `monday_workflow_map.json`, `monday_workflow_stage_map.json`, and a summary without executing Monday writes.
- `sync --mode monday_lookup_dry_run --lookup-file` matches existing Monday export rows by Radar ID without writes.
- `sync --mode monday_lookup_dry_run --connector-json` consumes saved read-only Monday connector JSON, preserves board/item/group IDs, and records zero Monday writes.
- `titlepro-approve --approvals` records broker/admin approval decisions and approved pending pull-request artifacts without executing any TitlePro pull.
- `titlepro-confirm --confirmations` records action-time confirmation against approved pending requests, refreshes the action queue, and records zero TitlePro/browser/write execution.
- `titlepro-import --evidence` consumes already-saved TitlePro profile/document extraction JSON, writes role assertions, and records zero paid/browser/write actions.
- `contact-import --contacts` consumes manual contact enrichment pasteback, writes contact assertions, and records zero RocketReach reveals, outreach actions, RealNex writes, or control/beneficial-owner promotions.
- `status-import --status` consumes saved current-status/provider evidence, writes status assertions, records zero provider lookups/backfills/outreach/external writes, and keeps broker action blocked until day-of-action official recheck.
- `skill-check --skill-dir --package-json --goal-md` validates the Codex skill package, required references, UI metadata, proof-script alignment, and safety language without executing external actions.
- `skill-pack --skill-dir --package-json --goal-md` creates an installable local skill package folder with file hashes and install instructions without executing external actions.
- `source-audit --zip/--source-dir --goal-md` turns SullyLink/retranToReel reference material and the current goal markdown into a compact reuse plan and runner contract without copying old source, credentials, cookies, dependency trees, or raw paid docs.
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
npm run proof:connector-readiness
npm run proof:lookup
npm run proof:monday-connector
npm run proof:titlepro-approval
npm run proof:titlepro-confirm
npm run proof:titlepro-evidence
npm run proof:contact
npm run proof:status
npm run proof:skill
npm run proof:skill-pack
npm run proof:source-audit
npm run proof:workflow-map
npm run app
```

Open the dashboard:

```text
http://localhost:8787
```

## Open Work

- Run the connected Gmail read and Monday board-item read tools against the live mailbox/board, save their JSON, and pass them through `connector-readiness`; the local readiness contract is present.
- Re-run `workflow-map` whenever the downloaded Monday workflow exports are refreshed, then compare the new map before changing generated task/subitem defaults.
- Execute the actual TitlePro browser/order step separately from `titlepro-confirm`, only after a confirmed manual action is selected and explicitly authorized for one request at a time. Approval intake, action-time confirmation, and saved evidence import are present; browser/order execution remains gated.
- Keep RocketReach/contact enrichment as manual pasteback until a separate approved integration exists; `contact-import` is present but does not reveal, scrape, send, or sync contacts.
- Add official-provider live status checks only after source rights and API shape are confirmed; saved status/provider evidence import is present through `status-import`.
- Use `source-audit` before adapting additional SullyLink/retranToReel patterns so broad app code, credentials, and raw artifacts stay out of the Monday-first lane.
