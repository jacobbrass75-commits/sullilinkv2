---
name: monday-cre-daily-intake
description: Run PropertyRadar daily digest, Gmail preview, Gmail connector preview, and CSV batch intake into local Monday-ready dry-run artifacts.
---

# Daily Intake

## Use When

Use this lane when the task is to feed PropertyRadar/Gmail digest text, saved email HTML, read-only Gmail connector JSON, or PropertyRadar CSV/XLSX exports into the local runner.

## Inputs

- Saved PropertyRadar digest text or HTML.
- Read-only Gmail connector result with full message bodies, message IDs, and thread IDs.
- PropertyRadar CSV/XLSX export for batch clustering.
- Optional Monday workflow map or lookup export for duplicate prevention.

## Commands

Run from `codex-monday-digest/`.

```bash
node src/cli.js parse --input fixtures/ken_kahan_digest_2026-05-30.txt --mode local_dry_run --out ../outputs/monday_digest_runs/dev
node src/cli.js export --run ../outputs/monday_digest_runs/dev --xlsx ../outputs/monday_digest_runs/dev/monday_import_preview.xlsx
node src/cli.js verify --run ../outputs/monday_digest_runs/dev
```

```bash
node src/cli.js preview --input path/to/saved_digest_email.html --label "CRE/PropertyRadar Alerts" --since 2d --mode gmail_preview --out ../outputs/monday_digest_runs/gmail-preview
node src/cli.js verify --run ../outputs/monday_digest_runs/gmail-preview
```

```bash
node src/cli.js preview --gmail-json path/to/gmail_connector_read.json --label "CRE/PropertyRadar Alerts" --since 2d --mode gmail_connector_preview --out ../outputs/monday_digest_runs/gmail-connector-preview
node src/cli.js verify --run ../outputs/monday_digest_runs/gmail-connector-preview
```

```bash
PROPERTYRADAR_BATCH_CSV=path/to/propertyradar_export.csv npm run proof:batch
```

## Required Outputs

- `source_emails.json`
- `parsed_rows.json`
- `deduped_leads.json`
- `needs_review.json`
- `monday_action_queue.csv`
- `titlepro_approval_queue_preview.json`
- `broker_packets_preview.json` when available
- `monday_import_preview.xlsx` when exported
- `run_manifest.json`
- `verification_report.md`

## Guardrails

- Local dry-run only unless live-write gates are explicitly satisfied.
- Preserve duplicates as source events before dedupe.
- Flag malformed digest rows in `needs_review.json`.
- Keep machine-local source paths out of shareable artifacts.
- Do not send Gmail, write Monday, order TitlePro documents, or claim control from CSV owner strings.
