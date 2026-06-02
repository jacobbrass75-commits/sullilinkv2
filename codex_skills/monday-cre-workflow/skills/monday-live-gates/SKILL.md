---
name: monday-cre-live-gates
description: Verify the explicit environment gates required before any live Monday.com write or mutation.
---

# Monday Live Gates

## Use When

Use this lane before any task that could mutate Monday.com boards, groups, items, subitems, comments, or column values.

## Required Gates

All gates must be present before live writes are allowed:

- `MONDAY_DRY_RUN=false`
- `ALLOW_MONDAY_WRITES=true`
- `MONDAY_SYNC_MODE=live_write`
- `MONDAY_LEAD_BOARD_ID`
- `MONDAY_GROUP_NEW_LEAD_RESEARCH_ID`
- `MONDAY_COLUMN_MAP_JSON`
- `MONDAY_ROLLBACK_PLAN` or `MONDAY_ROLLBACK_PLAN_PATH`
- `MONDAY_BROKER_APPROVAL=true`

## Before Live Write

1. Run a local dry-run or read-only lookup first.
2. Verify the board/group/column map against a saved Monday read.
3. Confirm rollback plan is scoped to the exact board and columns.
4. Confirm broker/admin approval is for this run, not a general preference.
5. Run verification after the write attempt.

## Guardrails

- Broad flags alone are not enough.
- Missing column mappings must block the write.
- No TitlePro, Gmail, RealNex, or outreach actions are implied by Monday approval.
- If a live-write precondition is ambiguous, stop at preview artifacts.
