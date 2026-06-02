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

Required evidence for a digest run:

- raw/pasted email text or HTML saved under run input
- Gmail preview provenance when applicable: label/window plus saved input file path
- `source_emails.json`
- `parsed_rows.json`
- `deduped_leads.json`
- Monday preview JSON
- subitem/task preview JSON
- `titlepro_approval_queue_preview.json` and workbook `TitlePro Approval` sheet with approval IDs linked to blocked TitlePro subitems and `paid_action_allowed: false`
- verification report

### CSV/XLSX Batch Export

Use `batch-owner-clusters`. Treat exact owner-string clusters as candidate groups only.

If the export has an APN column, normalize APNs for candidate identity and collapse duplicate target rows with the same APN. Preserve every original source row index on the candidate and add duplicate-APN review notes. If the export has no APN column, keep row/address/owner identity provisional.

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

The lookup file can be CSV, JSON, or XLSX. Required output is `monday_lookup_results.json`; when a lookup file is supplied, also save `monday_lookup_source_profile.json`. This lane is read-only and must leave `forbidden_actions.monday_live_writes = 0`.

### TitlePro Evidence

Start from `titlepro_approval_queue_preview.json`. If a broker/admin approves a specific pull, record the decision before any browser/order work:

```bash
node src/cli.js titlepro-approve --run ../outputs/monday_digest_runs/dev --approvals path/to/titlepro_approvals.csv
node src/cli.js verify --run ../outputs/monday_digest_runs/dev
```

Approval intake should produce `titlepro_approval_decisions.json`, `titlepro_pull_requests_approved.json`, and `titlepro_approval_source_profile.json`. It must leave `pull_executed = false`, `external_write_executed = false`, and `forbidden_actions.titlepro_pulls = 0`.

After action-time confirmation, use the TitlePro skill. Save:

- source URL/report/order id
- property address
- APN/county when visible
- owner string
- document/profile type
- recorder document number and recording date when visible
- capture date
- included/excluded status and exclusion reason

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
