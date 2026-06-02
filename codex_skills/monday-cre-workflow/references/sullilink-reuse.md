# SullyLink / retranToReel Reuse Map

Use these patterns when adapting the user's older foreclosure app code into the Monday-first workflow. Do not bulk-copy old app files.

## Reviewed Sources

- `external_references/sullilink/src/import-export/propertyradar-alerts.js`
- `external_references/sullilink/src/sellers/*.js`
- `external_references/sullilink/src/entities/cluster.js`
- `external_references/retranToReel_zip_20260601/retranToReel/CODEBASE_GUIDE.md`
- `external_references/retranToReel_zip_20260601/retranToReel/daily_update.py`
- `external_references/retranToReel_zip_20260601/retranToReel/dedupe_spreadsheet.py`
- `external_references/retranToReel_zip_20260601/retranToReel/retran_scraper.py`
- `external_references/retranToReel_zip_20260601/retranToReel/recDocReader/reader.py`

## Reuse

- **Digest parsing:** support both HTML tables and text rows. Preserve duplicates as source events; dedupe by stable Radar ID.
- **Idempotency:** track processed source/message/run identifiers; never create duplicate Monday items for one Radar ID.
- **Dedupe:** normalize APNs when present and collapse duplicate APN rows into one candidate while preserving source row indexes. Otherwise use Radar ID first, then address/city/owner only as weaker candidate keys.
- **Worker shape:** queue one expensive/authenticated TitlePro action at a time. Public-source enrichment can run in parallel.
- **Status vocabulary:** queued/processing/success/date mismatch/search failed/skipped maps well to TitlePro and document-extraction subitems.
- **Document extraction schema:** retain fields for doc type, recording number/date, auction date/time/location, opening bid, unpaid balance, grantor, grantee, trustee, beneficiary, loan number, APN, property address, county, and raw text.
- **Priority workers:** current status and recording-doc extraction come before AI summaries, building research, contact enrichment, and outreach.
- **Evidence-first output:** save raw source files locally, then generate compact broker-facing summaries with source dates and confidence.

## Runner Contract

Use `source-audit` to generate `source_reuse_contract.json` before adapting more old app behavior. The contract should map each old pattern to current runner surfaces and proof scripts:

- **Daily digest parser:** `parse`, `preview --input`, `preview --gmail-json`; proofs `proof:ken`, `proof:preview`, `proof:gmail-connector`; blocked Gmail mutations, Gmail sends, Monday writes, and TitlePro pulls.
- **APN dedupe:** `batch-owner-clusters`; proof `proof:batch`; blocked control claims, Monday writes, and provider backfills.
- **Daily import loop:** `connector-readiness`, `preview --gmail-json`, `sync --connector-json`; proofs `proof:connector-readiness`, `proof:gmail-connector`, `proof:monday-connector`; blocked scheduled live reads before readiness, Gmail mutations, and Monday writes.
- **TitlePro serial worker:** `titlepro-approve`, `titlepro-confirm`, `titlepro-import`; proofs `proof:titlepro-approval`, `proof:titlepro-confirm`, `proof:titlepro-evidence`; blocked TitlePro pulls, browser actions, paid actions, and external writes.
- **Recording document schema:** `titlepro-import`, `status-import`; proofs `proof:titlepro-evidence`, `proof:status`; blocked beneficial-owner claims, outreach-ready claims, and provider backfills.
- **Owner/entity clustering:** `batch-owner-clusters`; proof `proof:batch`; blocked control claims, beneficial-owner claims, and broker-ready claims.
- **Contact enrichment:** `contact-import`; proof `proof:contact`; blocked RocketReach reveals, outreach sends, RealNex writes, and beneficial-owner claims.

## Do Not Reuse Blindly

- Hardcoded credentials, `.env` values, cookies, browser sessions, raw PDFs, and old service passwords.
- Broad database/platform rewrites before the Monday lane proves daily value.
- Unsupervised TitlePro paid pulls or duplicate document orders.
- Any scraper flow until source rights, login method, rate limits, and output terms are confirmed.
- Claims that a registered agent, lawyer, trustee, title company, or lender is the actual owner/control lead without independent evidence.

## Migration Order

1. Keep the existing `codex-monday-digest` local dry-run path green.
2. Add parser/dedupe improvements behind tests.
3. Add approval/task queues for TitlePro and official-provider checks.
4. Add read-only connector lookups.
5. Add limited live Monday writes only after board/column/rollback/broker approval gates pass.
6. Consider broader CRE Brain/SullyLink database integration only after the Monday workflow is reliable.
