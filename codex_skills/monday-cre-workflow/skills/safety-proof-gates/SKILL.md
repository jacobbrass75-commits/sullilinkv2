---
name: monday-cre-safety-proof-gates
description: Map Monday CRE workflow lanes to proof scripts, forbidden-action counters, skill/package checks, and shareability audits.
---

# Safety Proof Gates

## Use When

Use this lane before commit, handoff, sharing, or live-write consideration.

## Core Proofs

Run from `codex-monday-digest/`.

```bash
npm test
npm run proof:skill
npm run proof:skill-pack
npm run proof:safety-audit
npm run proof:goal-audit
```

## Lane Proofs

- Daily digest: `npm run proof:ken`, `npm run proof:preview`, `npm run proof:gmail-connector`
- Connector readiness: `npm run proof:connector-readiness`
- Monday lookup: `npm run proof:lookup`, `npm run proof:monday-connector`
- Workflow map: `npm run proof:workflow-map`
- Batch clusters: `npm run proof:batch`
- TitlePro queue/evidence: `npm run proof:titlepro-approval`, `npm run proof:titlepro-confirm`, `npm run proof:titlepro-evidence`
- Contacts/status: `npm run proof:contact`, `npm run proof:status`
- Broker packet: `npm run proof:packet-audit`
- Source reuse: `npm run proof:source-audit-real`

## Guardrails

- Forbidden-action counters must stay zero unless the user approves a specific external action.
- Skill package text must contain no secrets or machine-local paths.
- Broker artifacts must not expose credentials, cookies, raw paid docs, or unsupported ownership claims.
- Source reuse means copy patterns only, not old app source, cookies, credentials, or databases.
