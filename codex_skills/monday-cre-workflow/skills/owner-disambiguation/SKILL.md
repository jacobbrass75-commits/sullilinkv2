---
name: monday-cre-owner-disambiguation
description: Disambiguate title owner, LLC/entity owner strings, borrowers, lenders, trustees, signers, managers, and likely control leads for distressed CRE.
---

# Owner Disambiguation

## Use When

Use this lane when the task is to decide who owns or controls distressed properties beyond raw LLC/title-owner strings.

## Role Ledger

Keep these roles separate in every artifact:

- Title owner
- Vesting entity
- Borrower/trustor
- Beneficiary/lender
- Trustee
- Foreclosure trustee or title company
- Registered agent
- Manager/member
- Officer/signer
- Attorney or service contact
- Likely control lead
- Broker-confirmed contact

## Promotion Rules

- CSV owner string: triage hint only.
- Exact LLC name cluster: candidate group only.
- Registered agent/lawyer/trustee/lender/title company: service role only.
- Signer/manager/member: possible control lead, still needs corroboration.
- Broker-confirmed contact: usable contact only after broker approval and suppression checks.
- Beneficial-owner/control claim: requires independent evidence chain.

## Evidence Targets

- APN/county/address identity.
- TitlePro title owner and transaction history.
- Deed, DOT, assignment, substitution, NOD, NTS, or signature page.
- SOS statement of information or equivalent entity record.
- Current foreclosure/trustee status.
- Broker/admin review notes.

## Guardrails

- Do not merge same-address/multi-APN rows into one control claim.
- Do not merge same-APN/conflicting-owner rows without review.
- Preserve evidence source and capture date.
- Mark uncertainty explicitly rather than filling gaps with inferred ownership.
