---
name: monday-cre-batch-owner-cluster-intake
description: Run PropertyRadar batch CSV/XLSX exports into APN-aware owner-cluster candidates and Monday review queues.
---

# Batch Owner Cluster Intake

## Use When

Use this lane when the user provides a large PropertyRadar CSV/XLSX export and wants the runner to find candidate owner clusters across the database.

## Command

Run from `codex-monday-digest/`.

```bash
PROPERTYRADAR_BATCH_CSV=path/to/propertyradar_export.csv npm run proof:batch
```

## Required Outputs

- `candidate_properties.json`
- `owner_cluster_candidates.json`
- `document_pull_tasks.json`
- `current_status_tasks.json`
- `role_assertion_tasks.json`
- `monday_batch_preview.json`
- `monday_action_queue.csv`
- `needs_review.json`
- `run_manifest.json`
- `verification_report.md`

## Identity Rules

- Use `normalized_apn + county/region` as durable identity when present.
- Preserve every source row index after APN collapse.
- Use Radar ID before address/city when APN is missing.
- Treat owner name as the weakest identity key.

## Guardrails

- Owner-string clusters are candidate-only.
- Same address with multiple APNs needs review.
- Same APN with conflicting owner strings needs review.
- Do not create broker-ready ownership/control claims from batch rows.
- Keep `broker_ready=false` and `control_claim_allowed=false`.
