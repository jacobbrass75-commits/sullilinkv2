---
name: monday-cre-sos-entity-trace
description: Handle CA SOS/entity evidence for LLC ownership-control tracing without confusing registered agents or service companies for owners.
---

# SOS Entity Trace

## Use When

Use this lane when CA SOS/Bizfile or other entity records are used to support ownership/control disambiguation.

## Extract

- Entity legal name.
- Entity number.
- Jurisdiction.
- Status and status date when available.
- Registration/formation date.
- Principal address.
- Mailing address.
- Agent for service of process.
- Manager/member/officer names when available.
- Statement of information filing date.
- Signer name and title.
- Source URL or saved file name.
- Capture date.

## Interpretation

- Registered agent is not the owner by default.
- Attorney or corporate-service company is a service actor by default.
- Manager/member/signer can be a control lead candidate, not final proof.
- Parent LLC or trust layers should be queued for follow-up, not flattened into a claim.

## Guardrails

- Import saved evidence; do not broaden public searches without scope.
- Preserve entity role labels exactly.
- Do not claim actual ownership without TitlePro/title, document, SOS, and broker-supported chain.
- If SOS evidence is missing or stale, mark the owner-control task as blocked.
