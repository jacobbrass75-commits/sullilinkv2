function recommendationForLead(lead) {
  if (lead.hard_hold) return "current_status_qa";
  if (lead.priority === "High") return "research_fast";
  if (lead.priority === "Medium-High") return "research_fast";
  return "owner_llc_qa";
}

function buildBrokerPackets(leads) {
  return leads.map((lead) => ({
    lead_key: lead.dedupe_key,
    packet_type: "research_approval_only",
    recommendation: recommendationForLead(lead),
    allowed_action: "Research approval only",
    blocked_action: "No outreach, no paid pull, no owner/control claim until gates clear",
    evidence_id_by_claim: {
      intake_property: lead.source_events.map((event) => event.evidence_id),
      current_status: "requires_current_status_verification",
      owner_control: "no_control_claim_from_digest_or_csv"
    },
    decision_needed_today: false,
    stale_after: lead.stale_after,
    approval_id: null
  }));
}

module.exports = {
  buildBrokerPackets,
  recommendationForLead
};
