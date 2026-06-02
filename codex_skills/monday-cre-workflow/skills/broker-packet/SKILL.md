---
name: monday-cre-broker-packet
description: Produce broker-readable distressed CRE packets with conservative ownership-control claims, evidence links, photos/maps, and Monday next actions.
---

# Broker Packet

## Use When

Use this lane when the output needs to be usable by a broker: HTML, Markdown, XLSX, queue CSV, or a compact review packet.

## Include

- Executive summary.
- Top candidate ranking.
- Property facts: address, APN, city, type, size, estimate, distress signal.
- Visuals when available: property image, map, aerial or street-level screenshot.
- Ownership/control role table.
- TitlePro/SOS/current-status evidence summary.
- Contact enrichment status, if manually supplied.
- Missing evidence and next Monday action.
- Confidence and blockers.

## Evidence Language

Use conservative labels:

- `confirmed_title_owner`
- `candidate_owner_cluster`
- `possible_control_lead`
- `service_actor_only`
- `broker_confirmed_contact`
- `blocked_missing_evidence`

## Guardrails

- Do not hide uncertainty in prose.
- Do not call lawyers, registered agents, trustees, or lenders actual owners without evidence.
- Do not expose credentials, cookies, raw paid docs, or machine-local paths in shareable artifacts.
- Keep Monday import/action queue rows aligned to the real workflow stages.
