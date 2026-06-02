---
name: monday-cre-workflow-map
description: Convert downloaded Monday.com workflow/checklist exports into local stage maps and task templates for the distressed CRE process.
---

# Monday Workflow Map

## Use When

Use this lane when Monday workflow/checklist boards have been exported to local XLSX files and the runner needs a local template map.

## Inputs

- Downloaded workflow XLSX files from the user's Monday workspace.
- Existing `broker_packet/workflows/monday_exports/` folder when available.

## Command

Run from `codex-monday-digest/`.

```bash
node src/cli.js workflow-map --workflow-dir ../broker_packet/workflows/monday_exports --out ../outputs/monday_digest_runs/workflow-map
node src/cli.js verify --run ../outputs/monday_digest_runs/workflow-map
```

## Required Outputs

- `monday_workflow_map.json`
- `monday_workflow_stage_map.json`
- `monday_workflow_source_profile.json`
- `monday_workflow_summary.md`
- `needs_review.json`
- `run_manifest.json`

## Guardrails

- Treat exports as templates, not live Monday state.
- Preserve workbook, sheet, and source-row provenance with basename-only paths.
- Keep Monday write counts at zero.
- Align generated subitems to the actual checklist language when possible.
