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

Required evidence for a digest run:

- raw/pasted email text or HTML saved under run input
- `source_emails.json`
- `parsed_rows.json`
- `deduped_leads.json`
- Monday preview JSON
- subitem/task preview JSON
- verification report

### CSV/XLSX Batch Export

Use `batch-owner-clusters`. Treat exact owner-string clusters as candidate groups only.

Required gates before promotion:

- APN/county/address identity
- title owner evidence
- borrower/trustor evidence
- SOS/entity evidence
- current foreclosure/status evidence
- broker/admin approval before any external write or outreach-ready claim

### TitlePro Evidence

Use the TitlePro skill. Save:

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
