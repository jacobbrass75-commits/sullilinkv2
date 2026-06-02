---
name: monday-cre-titlepro-evidence
description: Manage TitlePro approval queues, action-time confirmation, serial manual pulls, and saved TitlePro evidence import.
---

# TitlePro Evidence

## Use When

Use this lane when a lead needs TitlePro profile/document evidence or when already-saved TitlePro evidence must be imported into the Monday workflow.

## Related Skill

Use the standalone `titlepro247` skill for authenticated TitlePro browser/report/PDF operation. This lane only controls the Monday-runner queue and evidence contract.

## PDF Evidence Storage

When the confirmed manual TitlePro action opens a PDF/document order, save the actual downloaded PDF into the project before summarizing or importing evidence. Preferred project-relative locations:

```text
outputs/distressed_cre_research/<run>/documents/<property-slug>/
outputs/titlepro_evidence/<YYYY-MM-DD>/<property-slug>/
```

Use filenames like:

```text
<property-slug>__D123456789__doc_<recorder-docnum>__YYYY-MM-DD.pdf
```

Screenshots can support OCR, page-level excerpts, and viewer-state proof, but they are not the primary evidence when the original PDF can be downloaded. Evidence imports should reference the project-relative PDF path plus TitlePro order id, recorder document number, recording date, document type, capture date, and included/excluded status.

## Queue Commands

Run from `codex-monday-digest/`.

```bash
node src/cli.js titlepro-approve --run ../outputs/monday_digest_runs/dev --approvals path/to/titlepro_approvals.csv
node src/cli.js verify --run ../outputs/monday_digest_runs/dev
```

```bash
node src/cli.js titlepro-confirm --run ../outputs/monday_digest_runs/dev --confirmations path/to/titlepro_confirmations.csv
node src/cli.js verify --run ../outputs/monday_digest_runs/dev
```

```bash
node src/cli.js titlepro-import --run ../outputs/monday_digest_runs/dev --evidence path/to/titlepro_evidence.json
node src/cli.js verify --run ../outputs/monday_digest_runs/dev
```

## State Machine

- `not_requested_screening_required`
- `approved_pending_manual_titlepro_pull`
- `action_time_confirmed_pending_serial_titlepro_pull`
- `pending_scrape`
- `processing`
- `success`
- `duplicate_order_reuse`
- `wrong_property_excluded`
- `date_mismatch_review`
- `no_recording_date`
- `search_failed`
- `upload_failed`
- `skipped`

## Guardrails

- Approval intake does not execute TitlePro.
- Confirmation intake does not execute TitlePro.
- Process one confirmed TitlePro action per browser execution.
- Prefer existing order reuse over duplicate ordering.
- Save the actual TitlePro PDF into the project evidence folder when a PDF/document order is available.
- Keep title owner, borrower/trustor, beneficiary/lender, trustee, signer, and service actors separate.
- Never promote TitlePro contact/service-party names to beneficial owner without independent proof.
