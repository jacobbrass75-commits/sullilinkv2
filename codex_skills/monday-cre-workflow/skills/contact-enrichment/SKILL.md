---
name: monday-cre-contact-enrichment
description: Import manual RocketReach/public/contact pasteback without turning contacts into ownership-control claims or outreach-ready leads.
---

# Contact Enrichment

## Use When

Use this lane when a user supplies contact enrichment from RocketReach, public records, LinkedIn, broker notes, or another manual source.

## Command

Run from `codex-monday-digest/`.

```bash
node src/cli.js contact-import --run ../outputs/monday_digest_runs/dev --contacts path/to/contact_enrichment.csv
node src/cli.js verify --run ../outputs/monday_digest_runs/dev
```

## Required Fields

- Lead/property identity key.
- Contact name.
- Contact role.
- Company/entity association.
- Source type.
- Source URL or saved file.
- Source timestamp.
- Suppression status when available.
- Broker approval status.

## Guardrails

- Manual pasteback only until a separate approved integration exists.
- No RocketReach reveal/search automation in this runner.
- No outreach, Gmail send, RealNex write, or CRM sync.
- Contact data cannot create beneficial-owner or control claims by itself.
- Keep `contact_use_allowed=false` and `outreach_ready=false` until broker approval and suppression checks exist.
