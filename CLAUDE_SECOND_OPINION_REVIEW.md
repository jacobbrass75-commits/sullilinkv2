# Claude Second Opinion Review Brief

Created: 2026-06-02  
Workspace root: `/Users/yakub/Documents/New project 2`  
Primary repo remote: `git@github.com:jacobbrass75-commits/sullilinkv2.git`  
Current branch: `main` tracking `origin/main`

## What This Project Is

This repo is a Monday.com-first distressed commercial real estate workflow. The goal is not to build a generic CRE platform. The goal is a hyper-specific operating pipeline for the user's existing Monday.com workflow:

1. Ingest daily PropertyRadar distress alerts and batch CSV exports.
2. Dedupe and cluster candidate distressed properties.
3. Create Monday-ready preview artifacts and action queues.
4. Gate TitlePro247 paid/report/document pulls behind explicit approval.
5. Import saved TitlePro/SOS/current-status/contact evidence.
6. Keep legal/entity roles separate: title owner, borrower/trustor, beneficiary/lender, trustee, signer, registered agent, manager/member, likely control lead, broker-confirmed contact.
7. Produce broker-ready review packets only when evidence supports the claim.

Important constraint: owner/LLC strings from CSV or Monday are triage hints only. They must not become "actual owner/control" claims unless TitlePro, SOS/current-status, signer/manager/member, or broker-confirmed evidence supports them.

## Current Git State

Latest pushed commit:

```text
0f95726 Add aggregate safety audit proof
```

Recent commits:

```text
0f95726 Add aggregate safety audit proof
5e63dbf Emit reusable source audit guardrails
1a8493f Verify source reuse contract drift
c7beb29 Bundle SullyLink reuse contract in Monday skill
eb716e4 Add broker packet safety audit proof
```

There are currently uncommitted local changes. Suggested commit message after review:

```text
Harden Monday workflow gates and provenance
```

Changed files:

```text
/Users/yakub/Documents/New project 2/codex-monday-digest/src/batch-owner-clusters.js
/Users/yakub/Documents/New project 2/codex-monday-digest/src/cli.js
/Users/yakub/Documents/New project 2/codex-monday-digest/src/connector-readiness.js
/Users/yakub/Documents/New project 2/codex-monday-digest/src/dedupe-leads.js
/Users/yakub/Documents/New project 2/codex-monday-digest/src/export-workbook.js
/Users/yakub/Documents/New project 2/codex-monday-digest/src/monday-graphql.js
/Users/yakub/Documents/New project 2/codex-monday-digest/src/monday-lookup.js
/Users/yakub/Documents/New project 2/codex-monday-digest/src/monday-workflow-map.js
/Users/yakub/Documents/New project 2/codex-monday-digest/src/parse-digest.js
/Users/yakub/Documents/New project 2/codex-monday-digest/src/run-workflows.js
/Users/yakub/Documents/New project 2/codex-monday-digest/src/runtime.js
/Users/yakub/Documents/New project 2/codex-monday-digest/src/skill-package-check.js
/Users/yakub/Documents/New project 2/codex-monday-digest/src/titlepro-approval-intake.js
/Users/yakub/Documents/New project 2/codex-monday-digest/src/verify-run.js
/Users/yakub/Documents/New project 2/codex-monday-digest/tests/gmail-preview-file.test.js
/Users/yakub/Documents/New project 2/codex-monday-digest/tests/no-unsafe-actions.test.js
/Users/yakub/Documents/New project 2/codex-monday-digest/tests/parse-ken-kahan.test.js
/Users/yakub/Documents/New project 2/codex_skills/monday-cre-workflow/references/runbook.md
/Users/yakub/Documents/New project 2/codex_skills/monday-cre-workflow/references/sullilink-reuse.md
```

Diff stat at handoff:

```text
19 files changed, 261 insertions(+), 46 deletions(-)
```

## Main Code Paths To Review

CLI entrypoint:

```text
/Users/yakub/Documents/New project 2/codex-monday-digest/src/cli.js
```

Runtime utilities, path/provenance helpers, live-write gates:

```text
/Users/yakub/Documents/New project 2/codex-monday-digest/src/runtime.js
```

PropertyRadar digest parser:

```text
/Users/yakub/Documents/New project 2/codex-monday-digest/src/parse-digest.js
```

Batch owner clustering from CSV exports:

```text
/Users/yakub/Documents/New project 2/codex-monday-digest/src/batch-owner-clusters.js
```

Dedupe and lead identity:

```text
/Users/yakub/Documents/New project 2/codex-monday-digest/src/dedupe-leads.js
/Users/yakub/Documents/New project 2/codex-monday-digest/src/normalize-row.js
```

Monday preview/action queue logic:

```text
/Users/yakub/Documents/New project 2/codex-monday-digest/src/monday-action-queue.js
/Users/yakub/Documents/New project 2/codex-monday-digest/src/monday-field-map.js
/Users/yakub/Documents/New project 2/codex-monday-digest/src/subitems.js
```

Monday lookup/live-write safety:

```text
/Users/yakub/Documents/New project 2/codex-monday-digest/src/monday-graphql.js
/Users/yakub/Documents/New project 2/codex-monday-digest/src/monday-lookup.js
```

Monday workflow export mapping:

```text
/Users/yakub/Documents/New project 2/codex-monday-digest/src/monday-workflow-map.js
```

TitlePro gates and evidence import:

```text
/Users/yakub/Documents/New project 2/codex-monday-digest/src/titlepro-approval-queue.js
/Users/yakub/Documents/New project 2/codex-monday-digest/src/titlepro-approval-intake.js
/Users/yakub/Documents/New project 2/codex-monday-digest/src/titlepro-action-confirmation.js
/Users/yakub/Documents/New project 2/codex-monday-digest/src/titlepro-evidence-intake.js
```

Current-status and contact enrichment imports:

```text
/Users/yakub/Documents/New project 2/codex-monday-digest/src/current-status-intake.js
/Users/yakub/Documents/New project 2/codex-monday-digest/src/contact-enrichment-intake.js
```

Workbook/report export:

```text
/Users/yakub/Documents/New project 2/codex-monday-digest/src/export-workbook.js
/Users/yakub/Documents/New project 2/codex-monday-digest/src/broker-packet-preview.js
```

Verification and audit gates:

```text
/Users/yakub/Documents/New project 2/codex-monday-digest/src/verify-run.js
/Users/yakub/Documents/New project 2/codex-monday-digest/src/safety-audit.js
/Users/yakub/Documents/New project 2/codex-monday-digest/src/goal-audit.js
/Users/yakub/Documents/New project 2/codex-monday-digest/src/packet-audit.js
/Users/yakub/Documents/New project 2/codex-monday-digest/src/skill-package-check.js
```

Local browser app:

```text
/Users/yakub/Documents/New project 2/codex-monday-digest/src/server.js
/Users/yakub/Documents/New project 2/codex-monday-digest/public/index.html
/Users/yakub/Documents/New project 2/codex-monday-digest/public/app.js
/Users/yakub/Documents/New project 2/codex-monday-digest/public/styles.css
```

## Tests To Review

All tests:

```text
/Users/yakub/Documents/New project 2/codex-monday-digest/tests
```

Most relevant tests for the current uncommitted changes:

```text
/Users/yakub/Documents/New project 2/codex-monday-digest/tests/no-unsafe-actions.test.js
/Users/yakub/Documents/New project 2/codex-monday-digest/tests/gmail-preview-file.test.js
/Users/yakub/Documents/New project 2/codex-monday-digest/tests/parse-ken-kahan.test.js
/Users/yakub/Documents/New project 2/codex-monday-digest/tests/verify-run.test.js
/Users/yakub/Documents/New project 2/codex-monday-digest/tests/batch-owner-clusters.test.js
/Users/yakub/Documents/New project 2/codex-monday-digest/tests/monday-action-queue.test.js
/Users/yakub/Documents/New project 2/codex-monday-digest/tests/titlepro-approval-queue.test.js
/Users/yakub/Documents/New project 2/codex-monday-digest/tests/titlepro-approval-intake.test.js
/Users/yakub/Documents/New project 2/codex-monday-digest/tests/titlepro-action-confirmation.test.js
/Users/yakub/Documents/New project 2/codex-monday-digest/tests/titlepro-evidence-intake.test.js
/Users/yakub/Documents/New project 2/codex-monday-digest/tests/contact-enrichment-intake.test.js
/Users/yakub/Documents/New project 2/codex-monday-digest/tests/current-status-intake.test.js
/Users/yakub/Documents/New project 2/codex-monday-digest/tests/connector-readiness.test.js
/Users/yakub/Documents/New project 2/codex-monday-digest/tests/goal-audit.test.js
/Users/yakub/Documents/New project 2/codex-monday-digest/tests/safety-audit.test.js
```

## Skill Files

Repo skill:

```text
/Users/yakub/Documents/New project 2/codex_skills/monday-cre-workflow/SKILL.md
/Users/yakub/Documents/New project 2/codex_skills/monday-cre-workflow/agents/openai.yaml
/Users/yakub/Documents/New project 2/codex_skills/monday-cre-workflow/references/runbook.md
/Users/yakub/Documents/New project 2/codex_skills/monday-cre-workflow/references/sullilink-reuse.md
/Users/yakub/Documents/New project 2/codex_skills/monday-cre-workflow/references/source-reuse-contract.json
```

Installed local Codex skill mirror:

```text
/Users/yakub/.codex/skills/monday-cre-workflow/SKILL.md
/Users/yakub/.codex/skills/monday-cre-workflow/agents/openai.yaml
/Users/yakub/.codex/skills/monday-cre-workflow/references/runbook.md
/Users/yakub/.codex/skills/monday-cre-workflow/references/sullilink-reuse.md
/Users/yakub/.codex/skills/monday-cre-workflow/references/source-reuse-contract.json
```

The installed skill was synced from the repo skill before this handoff.

## Important Input Paths

Example PropertyRadar batch export from the user:

```text
/Users/yakub/Downloads/Export-20260526-091844.csv
```

Goal/spec document:

```text
/Users/yakub/Documents/New project 2/docs/TONIGHT_BUILD_GOAL.md
```

Prior SullyLink/retranToReel context docs:

```text
/Users/yakub/Documents/New project 2/docs/SULLILINK_REUSE_AUDIT.md
/Users/yakub/Documents/New project 2/external_references
/Users/yakub/Downloads/retranToReel_codebase 2.zip
```

Fixture inputs:

```text
/Users/yakub/Documents/New project 2/codex-monday-digest/fixtures/ken_kahan_digest_2026-05-30.txt
/Users/yakub/Documents/New project 2/codex-monday-digest/fixtures/southern_california_edge_cases_2026-05-30_excerpt.txt
/Users/yakub/Documents/New project 2/codex-monday-digest/fixtures/gmail_connector_read_sample.json
/Users/yakub/Documents/New project 2/codex-monday-digest/fixtures/monday_connector_items_sample.json
/Users/yakub/Documents/New project 2/codex-monday-digest/fixtures/monday_board_lookup_export_sample.csv
/Users/yakub/Documents/New project 2/codex-monday-digest/fixtures/titlepro_approvals_sample.csv
/Users/yakub/Documents/New project 2/codex-monday-digest/fixtures/titlepro_confirmations_sample.csv
/Users/yakub/Documents/New project 2/codex-monday-digest/fixtures/titlepro_evidence_sample.json
/Users/yakub/Documents/New project 2/codex-monday-digest/fixtures/contact_enrichment_sample.csv
/Users/yakub/Documents/New project 2/codex-monday-digest/fixtures/current_status_sample.json
```

## Important Output Paths

Broker-facing report packet already generated:

```text
/Users/yakub/Documents/New project 2/outputs/distressed_cre_research/2026-06-01T20-35-56_owner-disambiguation-clusters/reports/broker_owner_control_report.html
/Users/yakub/Documents/New project 2/outputs/distressed_cre_research/2026-06-01T20-35-56_owner-disambiguation-clusters/reports/owner_disambiguation_report.md
/Users/yakub/Documents/New project 2/outputs/distressed_cre_research/2026-06-01T20-35-56_owner-disambiguation-clusters/reports/owner_disambiguation_packet.xlsx
/Users/yakub/Documents/New project 2/outputs/distressed_cre_research/2026-06-01T20-35-56_owner-disambiguation-clusters/reports/monday_action_queue.csv
```

Broker report visual assets:

```text
/Users/yakub/Documents/New project 2/outputs/distressed_cre_research/2026-06-01T20-35-56_owner-disambiguation-clusters/reports/assets
```

Broker report work files:

```text
/Users/yakub/Documents/New project 2/outputs/distressed_cre_research/2026-06-01T20-35-56_owner-disambiguation-clusters/work
```

Main Monday digest proof output root:

```text
/Users/yakub/Documents/New project 2/outputs/monday_digest_runs
```

Useful specific proof outputs:

```text
/Users/yakub/Documents/New project 2/outputs/monday_digest_runs/dev
/Users/yakub/Documents/New project 2/outputs/monday_digest_runs/gmail-preview
/Users/yakub/Documents/New project 2/outputs/monday_digest_runs/gmail-connector-preview
/Users/yakub/Documents/New project 2/outputs/monday_digest_runs/connector-readiness
/Users/yakub/Documents/New project 2/outputs/monday_digest_runs/batch-owner-clusters
/Users/yakub/Documents/New project 2/outputs/monday_digest_runs/titlepro-approval
/Users/yakub/Documents/New project 2/outputs/monday_digest_runs/titlepro-confirm
/Users/yakub/Documents/New project 2/outputs/monday_digest_runs/titlepro-evidence
/Users/yakub/Documents/New project 2/outputs/monday_digest_runs/current-status
/Users/yakub/Documents/New project 2/outputs/monday_digest_runs/contact-enrichment
/Users/yakub/Documents/New project 2/outputs/monday_digest_runs/workflow-map
/Users/yakub/Documents/New project 2/outputs/monday_digest_runs/source-audit-real
/Users/yakub/Documents/New project 2/outputs/monday_digest_runs/safety-audit
/Users/yakub/Documents/New project 2/outputs/monday_digest_runs/goal-audit
/Users/yakub/Documents/New project 2/outputs/monday_digest_runs/skill-package-bundle
```

## Key Runtime Commands

Run from:

```text
/Users/yakub/Documents/New project 2/codex-monday-digest
```

Full tests:

```bash
CODEX_PYTHON_BIN=/Users/yakub/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3.12 PROPERTYRADAR_BATCH_CSV=/Users/yakub/Downloads/Export-20260526-091844.csv npm test
```

Batch owner clusters against the user's CSV:

```bash
PROPERTYRADAR_BATCH_CSV=/Users/yakub/Downloads/Export-20260526-091844.csv npm run proof:batch
```

Daily digest local dry run:

```bash
npm run proof:ken
```

Saved Gmail/PropertyRadar preview:

```bash
npm run proof:preview
```

Read-only Gmail connector preview:

```bash
npm run proof:gmail-connector
```

Read-only connector readiness:

```bash
npm run proof:connector-readiness
```

Monday read-only lookup:

```bash
npm run proof:lookup
npm run proof:monday-connector
```

TitlePro approval and confirmation gates:

```bash
npm run proof:titlepro-approval
npm run proof:titlepro-confirm
```

Saved TitlePro evidence import:

```bash
npm run proof:titlepro-evidence
```

Manual contact enrichment pasteback:

```bash
npm run proof:contact
```

Saved current-status/provider evidence import:

```bash
npm run proof:status
```

Skill/package/goal/safety audits:

```bash
npm run proof:skill
npm run proof:skill-pack
npm run proof:source-audit-real
npm run proof:safety-audit
npm run proof:goal-audit
```

Local app:

```bash
npm run app
```

The browser app has been used locally around:

```text
http://127.0.0.1:8787/
http://127.0.0.1:8791/
```

## Verification Already Reported Before This Handoff

The latest full verification run before this review brief reported:

```text
57 tests passed
0 failed
0 skipped
0 todo
0 cancelled
```

Additional proof commands reported passing after the current hardening changes:

```text
npm run proof:source-audit-real
npm run proof:skill
npm run proof:skill-pack
npm run proof:safety-audit
npm run proof:goal-audit
```

Goal audit result reported:

```text
gates=30
missing=0
deferred=0
```

## What Changed In The Current Uncommitted Work

1. Stronger Monday live-write gates.
   - `runtime.js` now requires broad dry-run flags plus board ID, group ID, required column map, rollback plan, and broker approval.
   - `monday-graphql.js` now exposes missing live-write prerequisites in the redacted board-shape output.

2. Safer path/provenance handling.
   - Manifest/source paths are normalized to basenames or run-relative paths in normal artifacts.
   - `verify-run.js` now checks for top-level local path leaks such as `/Users`, `/var/folders`, `/private/var`, `/tmp`, and `/Volumes`.

3. Digest parser hardening.
   - Malformed short HTML rows are now captured in `needs_review.json` as `malformed_html_table_row`.
   - Parser keeps source provenance but avoids leaking full local paths.

4. Safer evidence links.
   - `dedupe-leads.js` now points evidence references at shareable run-local artifacts such as `source_emails.json`.

5. Skill documentation expanded.
   - The Monday workflow skill now documents digest parser contract, APN/source-row dedupe contract, TitlePro queue state machine, Monday live-write gates, status vocabulary, and recording document extraction schema.

## Safety Rules Claude Should Check Carefully

Monday.com:

- Default must remain local dry-run or read-only lookup.
- Live write should remain blocked unless all required env gates exist:
  - `MONDAY_DRY_RUN=false`
  - `ALLOW_MONDAY_WRITES=true`
  - `MONDAY_SYNC_MODE=live_write`
  - `MONDAY_LEAD_BOARD_ID`
  - `MONDAY_GROUP_NEW_LEAD_RESEARCH_ID`
  - `MONDAY_COLUMN_MAP_JSON`
  - `MONDAY_ROLLBACK_PLAN` or `MONDAY_ROLLBACK_PLAN_PATH`
  - `MONDAY_BROKER_APPROVAL=true`

TitlePro:

- Approval queue is not permission to execute paid pulls.
- `titlepro-approve` records approval decisions only.
- `titlepro-confirm` creates manual action/profile artifacts only.
- Browser/order/document work must remain separate and serial/manual unless explicitly approved.

RocketReach/contact enrichment:

- Contact enrichment should be manual pasteback/import only in this repo.
- Contacts cannot become owner/control claims by themselves.
- No outreach, no RealNex write, and no contact reveal/search automation should run from this local pipeline.

Owner/control claims:

- CSV owner strings and APN clusters are candidate evidence only.
- LLC names, registered agents, lawyers, trustees, and lenders must stay role-separated.
- "Likely control lead" or "broker-confirmed contact" should require supporting evidence and stay blocked until broker review.

Shareability:

- Normal digest/batch/proof artifacts should not leak local machine paths, secrets, cookies, raw paid docs, or account credentials.
- Generated reports should be broker-readable but conservative about ownership/control certainty.

## Specific Questions For Claude

1. Are the Monday live-write gates strong enough to prevent accidental board mutations?
2. Are path/provenance sanitization helpers applied consistently across runner outputs?
3. Does the malformed digest HTML handling avoid silently dropping useful rows?
4. Does the owner clustering logic stay conservative enough for CRE brokerage use?
5. Are TitlePro approval/confirmation states clear enough to prevent paid-action mistakes?
6. Are contact enrichment and RocketReach represented as manual inputs rather than automated scraping/search?
7. Does the skill/runbook describe the workflow in a way another agent can run it safely?
8. Are there missing tests for the current hardening work?

## How To Start Reviewing

Recommended first commands:

```bash
cd /Users/yakub/Documents/New\ project\ 2
git status --short --branch
git diff --stat
git diff -- /Users/yakub/Documents/New\ project\ 2/codex-monday-digest/src/runtime.js
git diff -- /Users/yakub/Documents/New\ project\ 2/codex-monday-digest/src/parse-digest.js
git diff -- /Users/yakub/Documents/New\ project\ 2/codex-monday-digest/src/monday-graphql.js
git diff -- /Users/yakub/Documents/New\ project\ 2/codex-monday-digest/src/verify-run.js
```

Recommended proof rerun:

```bash
cd /Users/yakub/Documents/New\ project\ 2/codex-monday-digest
CODEX_PYTHON_BIN=/Users/yakub/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3.12 PROPERTYRADAR_BATCH_CSV=/Users/yakub/Downloads/Export-20260526-091844.csv npm test
npm run proof:skill
npm run proof:skill-pack
npm run proof:safety-audit
npm run proof:goal-audit
```

## Deliverable Status

Current broker-facing packet exists at:

```text
/Users/yakub/Documents/New project 2/outputs/distressed_cre_research/2026-06-01T20-35-56_owner-disambiguation-clusters/reports/broker_owner_control_report.html
```

Current code state is reviewable but not yet committed after the newest hardening pass. If Claude agrees with the direction, the next engineering action is to commit and push the local changes.
