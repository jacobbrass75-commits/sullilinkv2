# Monday CRE Workflow Runbook

## Orient

Start with:

```bash
pwd
git status --short --branch
rg --files | sed -n '1,200p'
find outputs -maxdepth 3 -type f \( -name 'run_manifest.json' -o -name '*packet*.json' -o -name '*queue*.csv' -o -name '*.xlsx' \) 2>/dev/null
```

Look for:

- `broker_packet/`
- `codex-monday-digest/`
- `outputs/monday_digest_runs/`
- `outputs/distressed_cre_research/<run>/`
- Monday workflow exports under `broker_packet/workflows/`

## Intake Paths

### Digest Text Or HTML

Use `parse`, `export`, and `verify`.

For a saved Gmail/PropertyRadar email body, use `preview --input` instead of live mailbox access:

```bash
node src/cli.js preview --input path/to/saved_digest_email.html --label "CRE/PropertyRadar Alerts" --since 2d --mode gmail_preview --out ../outputs/monday_digest_runs/gmail-preview
node src/cli.js verify --run ../outputs/monday_digest_runs/gmail-preview
```

For a read-only Gmail connector result, first use the Gmail connector to search/read the canonical label/query, save the connector output JSON locally, then run:

```bash
node src/cli.js preview --gmail-json path/to/gmail_connector_read.json --label "CRE/PropertyRadar Alerts" --since 2d --mode gmail_connector_preview --out ../outputs/monday_digest_runs/gmail-connector-preview
node src/cli.js verify --run ../outputs/monday_digest_runs/gmail-connector-preview
```

Treat a missing `CRE/PropertyRadar Alerts` Gmail label as a setup gap; do not broaden scheduled Gmail scope without broker/admin approval.

Required evidence for a digest run:

- raw/pasted email text or HTML saved under run input
- Gmail preview provenance when applicable: label/window plus saved input file path
- Gmail connector provenance when applicable: message IDs, thread IDs, connector source profile, and zero Gmail mutations/sends
- `source_emails.json`
- `parsed_rows.json`
- `deduped_leads.json`
- Monday preview JSON
- subitem/task preview JSON
- `monday_action_queue.csv` and workbook `Monday Action Queue` sheet with preview-only write/control flags
- `titlepro_approval_queue_preview.json` and workbook `TitlePro Approval` sheet with approval IDs linked to blocked TitlePro subitems and `paid_action_allowed: false`
- verification report

### CSV/XLSX Batch Export

Use `batch-owner-clusters`. Treat exact owner-string clusters as candidate groups only.

If the export has an APN column, normalize APNs for candidate identity and collapse duplicate target rows with the same APN. Preserve every original source row index on the candidate and add duplicate-APN review notes. If the export has no APN column, keep row/address/owner identity provisional.

Batch runs should also write `monday_action_queue.csv` with current-status, document-decision, and owner-control rows. The queue must preserve APN/county and source row indexes when present, and keep `broker_ready=false` and `control_claim_allowed=false`.

Required gates before promotion:

- APN/county/address identity
- title owner evidence
- borrower/trustor evidence
- SOS/entity evidence
- current foreclosure/status evidence
- broker/admin approval before any external write or outreach-ready claim

### Monday Read-Only Lookup

After a digest run, use a Monday board export to prevent duplicate work by Radar ID:

```bash
node src/cli.js sync --run ../outputs/monday_digest_runs/dev --mode monday_lookup_dry_run --lookup-file path/to/monday_board_export.csv
node src/cli.js verify --run ../outputs/monday_digest_runs/dev
```

The lookup file can be CSV, JSON, or XLSX. Required output is `monday_lookup_results.json`; when a lookup file is supplied, also save `monday_lookup_source_profile.json`.

### Monday Workflow Export Map

When the downloaded Monday workflow/checklist workbooks are available, map them into local reusable artifacts:

```bash
node src/cli.js workflow-map --workflow-dir ../broker_packet/workflows/monday_exports --out ../outputs/monday_digest_runs/workflow-map
node src/cli.js verify --run ../outputs/monday_digest_runs/workflow-map
```

Required output:

- `monday_workflow_map.json`
- `monday_workflow_stage_map.json`
- `monday_workflow_source_profile.json`
- `monday_workflow_summary.md`
- `needs_review.json`
- `run_manifest.json`

The workflow map is a template/contract artifact only. It must preserve workbook/sheet/source-row provenance using basename-only source paths, extract parent tasks and subitems, and leave Monday/external write counts at zero.

For a saved read-only Monday connector result:

```bash
node src/cli.js sync --run ../outputs/monday_digest_runs/dev --mode monday_lookup_dry_run --connector-json path/to/monday_connector_read.json
node src/cli.js verify --run ../outputs/monday_digest_runs/dev
```

Connector JSON lookup also writes `monday_connector_source_profile.json` with board/item counts and basename-only source provenance. Both lookup lanes are read-only and must leave `forbidden_actions.monday_live_writes = 0`.

### Connector Readiness

Before scheduled connector use, save one read-only Gmail connector result and one read-only Monday board-item connector result, then run:

```bash
node src/cli.js connector-readiness --gmail-json path/to/gmail_connector_read.json --monday-json path/to/monday_connector_read.json --label "CRE/PropertyRadar Alerts" --since 2d --out ../outputs/monday_digest_runs/connector-readiness
node src/cli.js verify --run ../outputs/monday_digest_runs/connector-readiness
```

Required output:

- `connector_readiness_report.json`
- `gmail_connector_contract.json`
- `monday_connector_contract.json`
- `connector_readiness_plan.md`
- `run_manifest.json`

The Gmail read must include full message bodies, not snippets only, and must preserve message/thread IDs. The Monday read must include board IDs, item IDs, group IDs, and a Radar ID column value or item-name Radar ID for each lookup item. The readiness runner consumes saved JSON only and must not label/archive/send Gmail, mutate Monday, or execute external writes.

### TitlePro Evidence

Start from `titlepro_approval_queue_preview.json`. If a broker/admin approves a specific pull, record the decision before any browser/order work:

```bash
node src/cli.js titlepro-approve --run ../outputs/monday_digest_runs/dev --approvals path/to/titlepro_approvals.csv
node src/cli.js verify --run ../outputs/monday_digest_runs/dev
```

Approval intake should produce `titlepro_approval_decisions.json`, `titlepro_pull_requests_approved.json`, and `titlepro_approval_source_profile.json`. It must leave `pull_executed = false`, `external_write_executed = false`, and `forbidden_actions.titlepro_pulls = 0`.

Before any actual TitlePro browser/order work, record action-time confirmation for the already-approved request:

```bash
node src/cli.js titlepro-confirm --run ../outputs/monday_digest_runs/dev --confirmations path/to/titlepro_confirmations.csv
node src/cli.js verify --run ../outputs/monday_digest_runs/dev
```

Confirmation intake should produce `titlepro_action_confirmations.json`, `titlepro_confirmed_manual_actions.json`, and `titlepro_action_confirmation_source_profile.json`, then refresh `monday_action_queue.csv` with `action_time_confirmed_pending_serial_titlepro_pull`. It must leave `titlepro_pulls_executed = 0`, `browser_actions_executed = 0`, `paid_actions_executed = 0`, and `external_writes_executed = 0`. `titlepro-confirm` only records the selected manual action; it does not execute it.

For TitlePro evidence that has already been saved or manually extracted:

```bash
node src/cli.js titlepro-import --run ../outputs/monday_digest_runs/dev --evidence path/to/titlepro_evidence.json
node src/cli.js verify --run ../outputs/monday_digest_runs/dev
```

Evidence import should produce `titlepro_evidence_intake.json`, `titlepro_role_assertions_preview.json`, and `titlepro_evidence_source_profile.json`. It must leave paid/browser/write action counts at zero, keep service actors out of control-lead claims, and keep `beneficial_owner_claim_allowed=false` until independent ownership proof exists.

### Manual Contact Enrichment

For RocketReach/public/contact enrichment that was gathered manually outside the runner, import pasteback rows:

```bash
node src/cli.js contact-import --run ../outputs/monday_digest_runs/dev --contacts path/to/contact_enrichment.csv
node src/cli.js verify --run ../outputs/monday_digest_runs/dev
```

Required output:

- `contact_enrichment_intake.json`
- `contact_role_assertions_preview.json`
- `contact_enrichment_source_profile.json`
- refreshed `needs_review.json`

Contact import is not a contact-reveal, outreach, or CRM-sync tool. It must leave `rocketreach_reveals_executed = 0`, `external_lookups_executed = 0`, `realnex_writes_executed = 0`, `outreach_actions_executed = 0`, and keep every contact assertion `contact_use_allowed=false`, `outreach_ready=false`, and `beneficial_owner_claim_allowed=false`.

### Saved Current-Status / Provider Evidence

For trustee/provider/current-status evidence that was gathered manually outside the runner, import pasteback rows:

```bash
node src/cli.js status-import --run ../outputs/monday_digest_runs/dev --status path/to/current_status.json
node src/cli.js verify --run ../outputs/monday_digest_runs/dev
```

Required output:

- `current_status_intake.json`
- `current_status_assertions_preview.json`
- `current_status_source_profile.json`
- refreshed `needs_review.json`

Status import is not a provider lookup, provider backfill, outreach, or external-write tool. It must leave `provider_backfills_executed = 0`, `external_lookups_executed = 0`, `outreach_actions_executed = 0`, `external_writes_executed = 0`, and keep every status assertion `current_status_use_allowed=false`, `current_status_urgency_claim_allowed=false`, `broker_action_ready=false`, `outreach_ready=false`, `provider_backfill_allowed=false`, and `day_of_action_recheck_required=true`.

After a confirmed manual action is selected for serial execution, use the TitlePro skill. Save:

- source URL/report/order id
- property address
- APN/county when visible
- owner string
- document/profile type
- recorder document number and recording date when visible
- capture date
- included/excluded status and exclusion reason

### SullyLink / retranToReel Source Audit

Before adapting more old SullyLink or retranToReel code, generate a source reuse audit:

```bash
node src/cli.js source-audit --zip path/to/retranToReel_codebase.zip --source-dir ../external_references --goal-md ../docs/TONIGHT_BUILD_GOAL.md --out ../outputs/monday_digest_runs/source-audit
node src/cli.js verify --run ../outputs/monday_digest_runs/source-audit
```

Required output:

- `source_reuse_audit.json`
- `source_reuse_recommendations.json`
- `source_risk_scan.json`
- `source_reuse_plan.md`
- `run_manifest.json`

Treat matched files as pattern evidence only. Exclude old `.env` files, cookies, browser sessions, raw PDFs/images, `.git`, `node_modules`, contact dumps, and old app database material from shareable artifacts. If a source audit detects secret-like text, it may record file and pattern counts only; it must not copy values.

## Packet Build

For broker-facing output:

1. Convert evidence into role assertions.
2. Separate service actors from control-eligible actors.
3. Add current sale/status language with as-of dates.
4. Add missing-proof flags instead of overstating.
5. Produce HTML, XLSX, CSV, and Markdown report.
6. Validate workbooks and JSON.
7. Scan shareable output for credentials and local machine paths.

## Minimum Validation

```bash
cd codex-monday-digest
CODEX_PYTHON_BIN=/path/to/python-with-openpyxl PROPERTYRADAR_BATCH_CSV=/path/to/export.csv npm test
```

For share packets:

```bash
for f in broker_packet/**/*.xlsx broker_packet/*.xlsx; do unzip -t "$f" >/dev/null || exit 1; done
for f in broker_packet/supporting/*.json; do node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" "$f" || exit 1; done
rg -n "file:///Users/|/Users/|BEGIN PRIVATE KEY|Authorization:|Password\\s*[:=]" broker_packet README.md || true
```

If a scan hit is a variable name or documentation caveat, note it. If it is a value, sanitize before sharing.
