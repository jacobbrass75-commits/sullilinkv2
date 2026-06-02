---
name: monday-cre-current-status
description: Import trustee/provider/current foreclosure status evidence while keeping day-of-action recheck requirements explicit.
---

# Current Status

## Use When

Use this lane when a NOD/NTS, auction, trustee sale, postponement, bankruptcy/stay, or provider status must be represented in the Monday workflow.

## Command

Run from `codex-monday-digest/`.

```bash
node src/cli.js status-import --run ../outputs/monday_digest_runs/dev --status path/to/current_status.json
node src/cli.js verify --run ../outputs/monday_digest_runs/dev
```

## Extract

- Provider/trustee source.
- Sale date and sale time.
- Sale location.
- Trustee sale number.
- Stage/status.
- Opening bid, unpaid balance, or estimated debt when available.
- Postponement reason when available.
- Bankruptcy/stay indicator.
- Source URL or saved file.
- Capture date and as-of date.

## Guardrails

- `day_of_action_recheck_required=true` stays true.
- Recorded NTS does not prove current active sale status.
- Status import does not call provider systems or backfill providers.
- Keep `broker_action_ready=false` unless current status is independently confirmed and broker-approved.
- No outreach, Gmail, Monday write, or RealNex write is triggered by status import.
