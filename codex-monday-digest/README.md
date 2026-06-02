# codex-monday-digest

Focused local runner for the Monday.com distressed-CRE workflow.

This tool turns saved PropertyRadar digest text into Monday-ready preview artifacts. It now also includes a browser dashboard so the team does not need to work inside Monday.com or run daily terminal commands.

The digest parser supports saved plain text and the HTML table shape commonly preserved by Gmail/PropertyRadar exports.

It does not write to Monday, send Gmail, pull TitlePro, write RealNex, backfill providers, or promote owner/control claims in the default path.

For Gmail-sourced alerts, save or paste the email body to a local text/HTML file and use `preview --input`. This records the Gmail label/window as provenance without reading Gmail or mutating external systems.

For connector-sourced alerts, use the Gmail connector read tools to search/read messages, save the read-only result JSON locally, and run `preview --gmail-json ... --mode gmail_connector_preview`. The runner never calls Gmail directly and never labels, archives, drafts, or sends.

For Monday connector lookups, use the Monday connector read tools to fetch the target board/items, save the read-only result JSON locally, and run `sync --connector-json ... --mode monday_lookup_dry_run`. The runner consumes that JSON only; it does not call Monday or execute mutations.

## Team Dashboard

Start the shared browser app:

```text
npm run app
```

Then open:

```text
http://localhost:8787
```

For teammates on the same trusted network, start it with the default LAN bind and give them the Mac's local network address:

```text
HOST=0.0.0.0 PORT=8787 npm run app
```

Example team URL:

```text
http://<this-mac-local-ip>:8787
```

The dashboard supports:

- paste or upload a PropertyRadar digest text file
- build a digest review run
- upload or use the default PropertyRadar CSV for owner clusters
- review lead rows, source-event preservation, default tasks, hard holds, TitlePro approval holds, owner clusters, and verification status
- download `monday_import_preview.xlsx`, `monday_action_queue.csv`, and the JSON/verification artifacts

Run folders are saved under:

```text
../outputs/monday_digest_runs/
```

Keep the dashboard on a trusted office/VPN network because this first version has no login screen.

To use a server-side default CSV instead of uploading one, start the app with:

```text
PROPERTYRADAR_BATCH_CSV=/path/to/propertyradar_export.csv npm run app
```

## Commands

```text
codex-monday-digest parse --input EMAIL_OR_TEXT_FILE --mode local_dry_run --out RUN_FOLDER
codex-monday-digest preview --input SAVED_EMAIL_FILE --label "CRE/PropertyRadar Alerts" --since 2d --mode gmail_preview --out RUN_FOLDER
codex-monday-digest preview --gmail-json GMAIL_CONNECTOR_READ.json --label "CRE/PropertyRadar Alerts" --since 2d --mode gmail_connector_preview --out RUN_FOLDER
codex-monday-digest export --run RUN_FOLDER --xlsx RUN_FOLDER/monday_import_preview.xlsx
codex-monday-digest verify --run RUN_FOLDER
codex-monday-digest batch-owner-clusters --input PROPERTYRADAR_CSV --mode local_dry_run --out RUN_FOLDER
codex-monday-digest workflow-map --workflow-dir MONDAY_EXPORT_DIR --out RUN_FOLDER
codex-monday-digest workflow-map --input MONDAY_WORKFLOW_EXPORT.xlsx --out RUN_FOLDER
codex-monday-digest connector-readiness --gmail-json GMAIL_CONNECTOR_READ.json --monday-json MONDAY_CONNECTOR_READ.json --label "CRE/PropertyRadar Alerts" --since 2d --out RUN_FOLDER
codex-monday-digest sync --run RUN_FOLDER --mode monday_lookup_dry_run --lookup-file MONDAY_EXPORT.csv
codex-monday-digest sync --run RUN_FOLDER --mode monday_lookup_dry_run --connector-json MONDAY_CONNECTOR_READ.json
codex-monday-digest titlepro-approve --run RUN_FOLDER --approvals APPROVALS.csv|json
codex-monday-digest titlepro-confirm --run RUN_FOLDER --confirmations CONFIRMATIONS.csv|json
codex-monday-digest titlepro-import --run RUN_FOLDER --evidence TITLEPRO_EVIDENCE.json
codex-monday-digest contact-import --run RUN_FOLDER --contacts CONTACTS.csv|json
codex-monday-digest status-import --run RUN_FOLDER --status CURRENT_STATUS.csv|json
codex-monday-digest skill-check --skill-dir SKILL_DIR --package-json PACKAGE.json --goal-md GOAL.md --out RUN_FOLDER
codex-monday-digest source-audit --zip SOURCE.zip --source-dir EXTERNAL_REFERENCE_DIR --goal-md GOAL.md --out RUN_FOLDER
codex-monday-digest sync --run RUN_FOLDER --mode live_write
```

`local_dry_run` and `monday_lookup_dry_run` need no credentials. The lookup mode reads a Monday board export CSV/JSON/XLSX or saved read-only connector JSON, matches existing items by Radar ID, and writes `monday_lookup_results.json` without changing Monday. `live_write` is intentionally blocked unless the later Monday approval and environment gates are satisfied.

`connector-readiness` validates the saved read-only Gmail and Monday connector JSON before scheduled use. It proves the canonical Gmail label/query, full PropertyRadar email bodies, Monday board/item/group IDs, Radar ID columns, basename-only provenance, and zero Gmail/Monday/external writes.

`titlepro-approve` reads a broker/admin approval CSV or JSON and writes `titlepro_approval_decisions.json`, `titlepro_pull_requests_approved.json`, and `titlepro_approval_source_profile.json`. It is intake only: approved rows become pending manual TitlePro pull requests, but `pull_executed` stays `false` and no paid TitlePro action is performed.

`titlepro-confirm` reads an action-time confirmation CSV or JSON against already approved pending pull requests. It writes `titlepro_action_confirmations.json`, `titlepro_confirmed_manual_actions.json`, and `titlepro_action_confirmation_source_profile.json`, refreshes `monday_action_queue.csv`, and still executes no TitlePro pull or browser action.

`titlepro-import` reads already-saved TitlePro profile/document extraction JSON and writes `titlepro_evidence_intake.json`, `titlepro_role_assertions_preview.json`, and `titlepro_evidence_source_profile.json`. It does not open TitlePro, order documents, or execute paid pulls; role assertions preserve title owner, borrower/trustor, lender/beneficiary, trustee, signer, and deed-party separation.

`contact-import` reads manual contact enrichment pasteback CSV/JSON, including RocketReach/public/manual rows supplied outside the runner. It writes `contact_enrichment_intake.json`, `contact_role_assertions_preview.json`, and `contact_enrichment_source_profile.json`. It does not search RocketReach, reveal contacts, send outreach, or write RealNex; imported contacts stay `outreach_ready=false` and require broker approval.

`status-import` reads saved current-status/provider evidence CSV/JSON supplied outside the runner. It writes `current_status_intake.json`, `current_status_assertions_preview.json`, and `current_status_source_profile.json`, then appends `needs_review.json`. It does not call trustee/provider sites, backfill providers, send outreach, or write external systems; imported status facts stay blocked until an official day-of-action recheck.

`skill-check` validates the repo skill package against the current runner and goal markdown. It writes `skill_package_report.json` and `skill_package_summary.md`, checking `SKILL.md`, `agents/openai.yaml`, required references, proof-script alignment, safety language, and basename-only provenance.

`source-audit` reads a SullyLink/retranToReel source zip and/or ignored extracted reference directory, plus the current goal markdown, and writes a compact reuse plan and `source_reuse_contract.json`. It reports which old patterns should be copied conceptually, maps digest parsing/APN dedupe/TitlePro worker/contact/status patterns to current runner commands and proof scripts, records excluded risk paths, and records zero external actions. It never copies old source files, credentials, cookies, raw paid docs, or dependency trees into the shareable repo.

`workflow-map` reads the downloaded Monday workflow export workbooks and writes `monday_workflow_map.json`, `monday_workflow_stage_map.json`, `monday_workflow_source_profile.json`, and `monday_workflow_summary.md`. It is local-only: it extracts the board/checklist template shape for future runs and records zero Monday writes or external actions.

## Local Proofs

From this folder:

```text
npm test
npm run proof:ken
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
npm run proof:source-audit
npm run proof:workflow-map
npm run proof:edge
npm run proof:batch
```

The batch owner-cluster lane treats CSV owner strings as candidate grouping clues only. If a CSV includes an APN column, rows with the same normalized APN collapse into one candidate and retain all source row indexes; if APN is missing, row/address keys remain provisional. Every output stays blocked until APN/county/Radar ID, title evidence, SOS role evidence, current-status evidence, and approval gates are added.

Digest and `gmail_preview` runs also write `titlepro_approval_queue_preview.json` and include the same rows in the workbook's `TitlePro Approval` sheet. This is an operations queue for deciding whether TitlePro evidence is needed; every row is approval-required and has `paid_action_allowed: false`.

`gmail_connector_preview` additionally writes `gmail_connector_source_profile.json` with connector source hash, message counts, parsed row counts, and `gmail_mutations_executed=0` / `gmail_sends_executed=0`. Configure and verify the canonical `CRE/PropertyRadar Alerts` label/query before scheduled use.

`connector-readiness` writes `connector_readiness_report.json`, `gmail_connector_contract.json`, `monday_connector_contract.json`, and `connector_readiness_plan.md`. Run it after saving read-only Gmail and Monday connector results and before relying on scheduled connector reads.

After a scoped approval is supplied, run `titlepro-approve` to create the separate decision and pending-pull artifacts. These artifacts make the approval reviewable in the dashboard/workbook, but the actual TitlePro browser/order step still requires separate action-time confirmation.

After action-time confirmation is supplied, run `titlepro-confirm` to produce confirmed manual action artifacts. The generated status is `action_time_confirmed_pending_serial_titlepro_pull`, with `titlepro_pulls_executed=false`, `browser_action_executed=false`, and `external_write_executed=false`.

After TitlePro evidence has already been saved or manually extracted, run `titlepro-import` to attach the facts to the run. The generated role assertions keep `beneficial_owner_claim_allowed=false`, `outreach_ready=false`, and exclude service actors such as trustees/lenders from control-lead claims.

After manual RocketReach/public contact enrichment is pasted back, run `contact-import` to attach the contacts to the run. The generated assertions keep `contact_use_allowed=false`, `outreach_ready=false`, `realnex_write_allowed=false`, and `beneficial_owner_claim_allowed=false` until broker approval and suppression checks exist.

After saved current-status/provider evidence is pasted back, run `status-import` to attach it to the run. The generated assertions keep `current_status_use_allowed=false`, `current_status_urgency_claim_allowed=false`, `broker_action_ready=false`, `outreach_ready=false`, and `provider_backfill_allowed=false`; every row carries `day_of_action_recheck_required=true`.

Every digest and batch run writes `monday_action_queue.csv` and a workbook `Monday Action Queue` sheet. This queue is for Monday import/review only: rows keep `monday_write_executed=false`, `external_write_executed=false`, `broker_ready=false`, and `control_claim_allowed=false`.

`sync --connector-json ... --mode monday_lookup_dry_run` writes `monday_connector_source_profile.json` with board/item counts, matched/duplicate/not-found counts, basename-only source provenance, and zero Monday/external writes. Use this for saved read-only connector results; use `--lookup-file` for CSV/XLSX board exports.

`source-audit` writes `source_reuse_audit.json`, `source_reuse_recommendations.json`, `source_reuse_contract.json`, `source_risk_scan.json`, and `source_reuse_plan.md`. Use it before importing more SullyLink code so the next change is tied to the Monday workflow and does not accidentally promote old credentials, raw evidence, or broad app rewrites.

`workflow-map` writes a reusable local contract from the exported Monday workflow workbooks. Use it when the Monday board/checklist shape needs to be reloaded or compared without opening Monday.com.

`skill-check` writes a local proof that `codex_skills/monday-cre-workflow` is still a replicable Codex skill package. Use it after changing `SKILL.md`, bundled references, proof scripts, or the build goal.
