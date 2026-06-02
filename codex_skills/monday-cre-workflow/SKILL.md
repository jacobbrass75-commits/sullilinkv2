---
name: monday-cre-workflow
description: Repeatable Monday.com distressed-CRE workflow for PropertyRadar daily digests, batch owner clusters, TitlePro evidence requests, LLC/control disambiguation, broker packets, and Monday action queues. Use when Codex is asked to run, build, improve, or explain the Monday-first CRE process, especially when converting PropertyRadar/Gmail/CSV/TitlePro evidence into broker-ready workflow artifacts.
---

# Monday CRE Workflow

## Scope

This skill coordinates the Monday-first distressed CRE workflow. It does not replace the lower-level source skills:

- Use `distressed-cre-research` for property research, current-status checks, ownership/control evidence, bankruptcy/stay checks, and broker packet standards.
- Use `titlepro247` for TitlePro browser/report/PDF handling and paid-action guardrails.
- Use this skill to connect intake, dedupe, verification tasks, evidence status, broker packet output, and Monday-ready artifacts.

## Core Loop

1. Inspect current repo state and prior outputs first. Prefer existing run manifests, packet JSON, and evidence summaries over rerunning paid/authenticated work.
2. Identify the intake mode:
   - PropertyRadar daily digest text/HTML.
   - PropertyRadar CSV/XLSX batch export.
   - Existing TitlePro/report evidence.
   - Human/manual RocketReach or contact enrichment pasteback.
3. Run local previews before external writes. Default to `local_dry_run`; do not write Monday, send Gmail, sync RealNex, or order TitlePro docs unless the user explicitly approves that exact action.
4. Preserve role separation in every output: title owner, borrower/trustor, beneficiary/lender, trustee, registered agent, manager/member, signer, likely control lead, and broker-confirmed contact.
5. Treat owner strings and CSV clustering as triage hints only. They cannot create broker-ready control claims without APN/title/SOS/document/current-status evidence.
6. Produce artifacts that fit the Monday workflow: preview workbook/JSON, current-status tasks, role-assertion tasks, TitlePro approval tasks, broker packet, and `monday_action_queue.csv`.
7. Verify before delivery: tests, JSON parse, workbook zip integrity, no local paths/secrets in shareable artifacts, no unsupported control claims.

## Repo Commands

For the current repo shape, the runner lives in `codex-monday-digest/`.

```bash
cd /path/to/repo/codex-monday-digest
npm test
npm run app
```

Manual digest preview:

```bash
node src/cli.js parse --input fixtures/ken_kahan_digest_2026-05-30.txt --mode local_dry_run --out ../outputs/monday_digest_runs/dev
node src/cli.js export --run ../outputs/monday_digest_runs/dev --xlsx ../outputs/monday_digest_runs/dev/monday_import_preview.xlsx
node src/cli.js verify --run ../outputs/monday_digest_runs/dev
```

Saved Gmail/PropertyRadar preview:

```bash
node src/cli.js preview --input path/to/saved_digest_email.html --label "CRE/PropertyRadar Alerts" --since 2d --mode gmail_preview --out ../outputs/monday_digest_runs/gmail-preview
node src/cli.js verify --run ../outputs/monday_digest_runs/gmail-preview
```

`gmail_preview` records the Gmail label/window as provenance but still reads only the saved local file. It does not access Gmail, write Monday, send email, or trigger TitlePro.

Gmail connector read preview:

```bash
node src/cli.js preview --gmail-json path/to/gmail_connector_read.json --label "CRE/PropertyRadar Alerts" --since 2d --mode gmail_connector_preview --out ../outputs/monday_digest_runs/gmail-connector-preview
node src/cli.js verify --run ../outputs/monday_digest_runs/gmail-connector-preview
```

Use the Gmail connector read/search tools outside the runner to create the JSON file. The runner consumes that read-only result, preserves Gmail message/thread IDs, writes `gmail_connector_source_profile.json`, and must leave Gmail mutations/sends at zero. If the canonical label is missing, stop at setup/readiness and do not broaden the query without approval.

Digest and `gmail_preview` runs should include `titlepro_approval_queue_preview.json` and, when exported, a workbook `TitlePro Approval` sheet. Treat it as a decision queue only: approval IDs may be linked to blocked subitems, but `paid_action_allowed` must remain `false` until the user explicitly approves a scoped TitlePro pull.

Digest and batch runs should include `monday_action_queue.csv` and, when exported, a workbook `Monday Action Queue` sheet. Treat it as a preview/import queue: it must preserve lead/property identity, task status, approval fields, and keep `monday_write_executed`, `external_write_executed`, `broker_ready`, and `control_claim_allowed` false.

Batch owner-cluster preview:

```bash
PROPERTYRADAR_BATCH_CSV=/path/to/propertyradar_export.csv npm run proof:batch
```

Read-only Monday export lookup:

```bash
node src/cli.js sync --run ../outputs/monday_digest_runs/dev --mode monday_lookup_dry_run --lookup-file path/to/monday_board_export.csv
node src/cli.js verify --run ../outputs/monday_digest_runs/dev
```

`monday_lookup_dry_run` reads a Monday board export CSV/JSON/XLSX and matches existing items by Radar ID. It must not call live write mutations.

Read-only Monday connector result lookup:

```bash
node src/cli.js sync --run ../outputs/monday_digest_runs/dev --mode monday_lookup_dry_run --connector-json path/to/monday_connector_read.json
node src/cli.js verify --run ../outputs/monday_digest_runs/dev
```

Use the Monday connector read/list tools outside the runner to create the JSON file. The runner consumes the saved result, preserves item/board/group IDs in `monday_lookup_results.json`, writes `monday_connector_source_profile.json`, and must leave Monday/external writes at zero.

Connector readiness before scheduled use:

```bash
node src/cli.js connector-readiness --gmail-json path/to/gmail_connector_read.json --monday-json path/to/monday_connector_read.json --label "CRE/PropertyRadar Alerts" --since 2d --out ../outputs/monday_digest_runs/connector-readiness
node src/cli.js verify --run ../outputs/monday_digest_runs/connector-readiness
```

`connector-readiness` validates the saved read-only Gmail and Monday connector JSON together. It must prove the canonical Gmail label/query, full PropertyRadar email bodies, Monday board/item/group ID preservation, Radar ID availability, basename-only source provenance, and zero Gmail/Monday/external writes.

TitlePro approval intake after broker/admin approval:

```bash
node src/cli.js titlepro-approve --run ../outputs/monday_digest_runs/dev --approvals path/to/titlepro_approvals.csv
node src/cli.js verify --run ../outputs/monday_digest_runs/dev
```

`titlepro-approve` writes approval decision and approved pending pull-request artifacts only. It does not open TitlePro, order reports, download paid documents, or execute browser actions.

Saved TitlePro evidence import:

```bash
node src/cli.js titlepro-import --run ../outputs/monday_digest_runs/dev --evidence path/to/titlepro_evidence.json
node src/cli.js verify --run ../outputs/monday_digest_runs/dev
```

`titlepro-import` consumes already-saved TitlePro profile/document extraction JSON and writes `titlepro_evidence_intake.json`, `titlepro_role_assertions_preview.json`, and `titlepro_evidence_source_profile.json`. It must not open TitlePro, order documents, execute paid pulls, or promote beneficial-owner/outreach-ready claims. Role assertions must keep title owner, borrower/trustor, lender/beneficiary, trustee, signer, and deed-party roles separate.

SullyLink/retranToReel source bundle audit:

```bash
node src/cli.js source-audit --zip path/to/retranToReel_codebase.zip --source-dir ../external_references --goal-md ../docs/TONIGHT_BUILD_GOAL.md --out ../outputs/monday_digest_runs/source-audit
node src/cli.js verify --run ../outputs/monday_digest_runs/source-audit
```

`source-audit` turns the old zip/extracted reference directory and the current goal markdown into a compact reuse plan. It must copy patterns only, never old source files, credentials, cookies, raw paid docs, or dependency trees.

If Python workbook export fails because `openpyxl` is missing, set `CODEX_PYTHON_BIN` to a Python that has the workspace spreadsheet dependencies.

## TitlePro Lane

TitlePro is an evidence layer after screening, not a broad lead source.

- Set/keep `TitlePro Status = Not needed until screened` for low-context leads.
- Move to `Needs approval` only for a scoped missing proof: profile, deed, DOT, NOD, NTS, assignment, SOS, trustee status, or signature page.
- Paid/order actions require explicit approval for property, APN/county when known, doc/profile type, reason, and cost ceiling.
- Approval intake can mark a request as approved-pending, but the actual browser/order step still requires separate action-time confirmation.
- Prefer existing TitlePro orders/reports over duplicate pulls.
- Mark wrong-property or duplicate evidence as excluded; do not delete it.

## Outputs

Shareable packet output should normally include:

- `broker_owner_control_report.html`
- `owner_disambiguation_packet.xlsx`
- `monday_action_queue.csv`
- `owner_disambiguation_report.md`
- compact supporting JSON/manifests

Raw paid docs, browser sessions, `.env`, cookies, and bulky evidence folders stay local unless the user explicitly asks for a private archive.

## References

- Read `references/runbook.md` when executing the workflow end to end.
- Read `references/sullilink-reuse.md` when importing or adapting logic from SullyLink/retranToReel code.
