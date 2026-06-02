---
name: monday-cre-subagent-orchestration
description: Split Monday-first distressed CRE workflow work across subagents without conflicting writes, duplicate TitlePro pulls, or unsafe external actions.
---

# Subagent Orchestration

## Use When

Use this lane when the user explicitly asks for subagents, parallel agents, or faster delegated work.

## Good Parallel Tasks

- Review skill docs for missing guardrails.
- Inspect tests for coverage gaps.
- Summarize existing output artifacts.
- Research independent public facts from saved evidence.
- Validate one generated packet or one proof run.

## Keep Local Or Serial

- Authenticated TitlePro browser actions.
- Paid report/document ordering.
- Live Monday writes.
- Gmail sends or mailbox mutations.
- RocketReach reveal/search operations.
- Any task that could create duplicate external actions.

## Delegation Rules

- Give each worker a disjoint file or output scope.
- Tell workers not to revert unrelated edits.
- Delegate sidecar checks while the main thread handles the critical path.
- Ask explorers specific questions; ask workers for bounded patches.
- Review uploaded changes before committing.

## Guardrails

- Subagents do not bypass user approval requirements.
- Subagents do not make control/owner claims from weak evidence.
- Subagents should return file paths changed, proof commands run, and unresolved risks.
