const { leadTypeForChange } = require("./priority");

const REQUIRED_GATE_COLUMNS = [
  "Official Provider Status",
  "Niche Research Status",
  "Relationship Context Status",
  "Suppression Status",
  "Outreach Readiness",
  "Broker Packet Status",
  "Evidence Link",
  "Allowed Action",
  "Blocked Action",
  "Blocked Action Detail",
  "Hard Hold",
  "Hard Hold Reason",
  "Stale After"
];

function columnsForLead(lead) {
  return {
    "Radar ID": lead.radar_id,
    "Lead Source": "PropertyRadar",
    "Lead Type": leadTypeForChange(lead.what_changed || ""),
    "What Changed": lead.what_changed,
    "Stage": lead.stage,
    "Intake Priority": lead.priority,
    "Address": lead.street,
    "City": lead.city,
    "Zip": lead.zip,
    "State": lead.state,
    "Property Type": lead.property_type,
    "Sq Ft": lead.sq_ft,
    "Est. Value": lead.est_value,
    "Current Status": lead.current_status,
    "Owner Confidence": lead.owner_confidence,
    "LLC Disambiguation": lead.llc_disambiguation,
    "TitlePro Status": "Not needed until screened",
    "Official Provider Status": lead.official_provider_status,
    "Niche Research Status": lead.niche_research_status,
    "Relationship Context Status": lead.relationship_context_status,
    "Suppression Status": lead.suppression_status,
    "Outreach Readiness": lead.outreach_readiness,
    "Broker Packet Status": lead.broker_packet_status,
    "Evidence Link": lead.evidence_link,
    "Allowed Action": lead.allowed_action,
    "Blocked Action": lead.blocked_action,
    "Blocked Action Detail": lead.blocked_action_detail,
    "Hard Hold": lead.hard_hold ? "Yes" : "No",
    "Hard Hold Reason": lead.hard_hold_reason,
    "Stale After": lead.stale_after,
    "Next Action": lead.next_action,
    "Due Date": "next business day"
  };
}

function mutationPreviewForLead(lead, mode = "local_dry_run") {
  const columns = columnsForLead(lead);
  return {
    mode,
    board_id: null,
    group_id: null,
    operation: lead.action === "exception" ? "skip" : "create_item",
    mutation: lead.action === "exception" ? "none" : "create_item",
    dedupe_key: lead.dedupe_key,
    existing_item_id: null,
    item_name: lead.item_name,
    columns,
    column_values_encoded: JSON.stringify({
      radar_id: lead.radar_id,
      stage: { label: lead.stage },
      outreach_readiness: { label: lead.outreach_readiness }
    }),
    blocked_reason: mode === "live_write" ? null : "Preview only; Monday writes disabled by dry-run gates."
  };
}

function lookupPlaceholderForLead(lead) {
  return {
    dedupe_key: lead.dedupe_key,
    radar_id: lead.radar_id,
    lookup_mode: "not_run",
    result: "not_run",
    existing_item_id: null,
    error: null
  };
}

module.exports = {
  REQUIRED_GATE_COLUMNS,
  columnsForLead,
  mutationPreviewForLead,
  lookupPlaceholderForLead
};
