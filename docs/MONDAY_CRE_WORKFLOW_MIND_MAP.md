# Monday CRE Workflow Mind Map

This is the high-level operating model for the Monday-first distressed CRE workflow. It is intentionally specific to the current workflow: PropertyRadar/Gmail intake, Monday action queues, TitlePro evidence, owner/control disambiguation, and broker packet output.

## Mind Map

```mermaid
mindmap
  root((Monday CRE Workflow))
    Intake
      PropertyRadar daily digest
        Saved email text or HTML
        Gmail connector full-body read
        Message ID and thread ID provenance
      PropertyRadar CSV batch
        APN and county identity
        Source row preservation
        Candidate owner clusters
      Monday workflow exports
        Checklist workbook map
        Stage and subitem templates
      Manual pastebacks
        TitlePro evidence JSON
        Current-status evidence
        Contact enrichment
    Local Dry-Run Runner
      Parse
        HTML table first
        Text fallback
        Malformed rows to needs_review
      Dedupe
        Radar ID first
        APN and county for batch
        Duplicate source events retained
      Generate preview artifacts
        monday_action_queue.csv
        titlepro_approval_queue_preview.json
        broker_packets_preview.json
        monday_import_preview.xlsx
      Verify
        JSON integrity
        Workbook integrity
        No local path leaks
        Forbidden action counters zero
    Evidence Lanes
      TitlePro
        Approval queue
        Action-time confirmation
        One serial manual pull
        Download actual PDF into project
        Import role assertions
      SOS and entity trace
        Registered agent is service role
        Manager member signer as candidate lead
        Parent LLC follow-up
      Current status
        Trustee provider status
        Sale date and stage
        Bankruptcy stay hold
        Day-of-action recheck required
      Contacts
        Manual RocketReach pasteback
        No reveal automation
        Broker approval and suppression checks
    Owner Control Disambiguation
      Role separation
        Title owner
        Borrower trustor
        Beneficiary lender
        Trustee
        Registered agent
        Manager member
        Signer
        Broker-confirmed contact
      Promotion gates
        CSV owner string is hint only
        LLC cluster is candidate only
        Service actors are not owners
        Control claim requires evidence chain
      Review outputs
        Role assertion tasks
        Missing evidence blockers
        Confidence labels
    Monday Operating Layer
      Read-only lookup
        Board export
        Connector JSON
        Radar ID duplicate prevention
      Action queue
        Current-status task
        TitlePro decision task
        Owner-control task
        Broker packet task
      Live write gates
        MONDAY_DRY_RUN false
        MONDAY_SYNC_MODE live_write
        ALLOW_MONDAY_WRITES true
        Board ID group ID column map
        Rollback plan
        Broker approval
    Broker Packet
      HTML report
      XLSX packet
      Property images and maps
      Owner/control table
      Evidence and caveats
      Next Monday actions
    Safety Proofs
      npm test
      proof preview
      proof batch
      proof skill
      proof skill-pack
      proof safety-audit
      proof goal-audit
    Subagents
      Parallel allowed
        Skill/doc review
        Test coverage review
        Public-source summary
        Output artifact audit
      Serial only
        TitlePro authenticated pulls
        Paid document actions
        Live Monday writes
        Gmail sends
        RocketReach reveals
```

## Process Flow

```mermaid
flowchart LR
  A[PropertyRadar / Gmail / CSV inputs] --> B[Local dry-run runner]
  B --> C[Parse and normalize]
  C --> D[Dedupe by Radar ID / APN]
  D --> E[Generate preview queues]
  E --> F[Monday action queue]
  E --> G[TitlePro approval queue]
  E --> H[Owner-control review tasks]
  G --> I{Broker approves specific pull?}
  I -- No --> J[Remain blocked]
  I -- Yes --> K[Action-time confirmation]
  K --> L[Serial TitlePro browser action]
  L --> M[Download actual PDF into project folder]
  M --> N[Import TitlePro evidence]
  H --> O[SOS / signer / manager evidence]
  F --> P[Current-status evidence]
  N --> Q[Role assertions]
  O --> Q
  P --> Q
  Q --> R{Evidence chain supports claim?}
  R -- No --> S[Needs review / blocked]
  R -- Yes --> T[Broker packet]
  T --> U[Optional Monday sync]
  U --> V{All live-write gates pass?}
  V -- No --> W[Preview only]
  V -- Yes --> X[Scoped Monday live write]
```

## Artifact Map

| Lane | Primary Files |
| --- | --- |
| Digest preview | `outputs/monday_digest_runs/gmail-preview/` |
| Batch owner clusters | `outputs/monday_digest_runs/batch-owner-clusters/` |
| TitlePro approval | `titlepro_approval_queue_preview.json`, `titlepro_pull_requests_approved.json` |
| TitlePro PDF evidence | `outputs/distressed_cre_research/<run>/documents/<property-slug>/` or `outputs/titlepro_evidence/<YYYY-MM-DD>/<property-slug>/` |
| Monday actions | `monday_action_queue.csv` |
| Broker packet | `broker_owner_control_report.html`, `owner_disambiguation_packet.xlsx` |
| Skill docs | `codex_skills/monday-cre-workflow/skills/` |

## Core Rule

The system can move fast, but only locally until the exact external action is approved. CSV owner strings, LLC clusters, contacts, and service actors are leads for research, not ownership/control conclusions.
