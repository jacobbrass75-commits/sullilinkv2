# SulliLink V2 Broker Packet

This repo contains the current shareable Monday.com distressed CRE owner-control packet.

Open first:

- `broker_packet/broker_owner_control_report.html` - broker-facing visual report.
- `broker_packet/owner_disambiguation_packet.xlsx` - workbook with owner clusters, evidence summaries, and Monday import tabs.
- `broker_packet/monday_action_queue.csv` - clean action queue for Monday.com updates.
- `broker_packet/owner_disambiguation_report.md` - text version of the findings.

Workflow context:

- `broker_packet/workflows/` contains the exported Monday.com workflow boards and combined workflow workbook.
- `codex-monday-digest/` contains the lightweight local runner/prototype for parsing PropertyRadar digest inputs and producing Monday-ready preview outputs.

Not included:

- Local credentials and `.env` files.
- Raw TitlePro paid documents, OCR renders, cookies, and session dumps.
- Large external reference repos and old raw run folders.

RocketReach note: automated RocketReach contact reveal was blocked in the Codex environment, so any RocketReach enrichment should be done manually and then pasted/exported back into the workflow.
