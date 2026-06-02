function safeEvidenceSegment(lead) {
  const value = lead.radar_id || lead.dedupe_key || "unknown-lead";
  return String(value).replace(/[^a-z0-9_-]+/gi, "-");
}

function requestedDocTypeForLead(lead) {
  if (lead.hard_hold) return "current_status_notice_or_trustee_document";
  return "screening_decision_then_profile_or_recorded_notice";
}

function titleProReasonForLead(lead) {
  if (lead.hard_hold) {
    return "Digest language indicates a current-status hard hold; decide whether TitlePro evidence is needed after current-status QA.";
  }
  return "Digest lead has no APN/title/current-status evidence yet; screen before requesting any TitlePro profile or recorded document.";
}

function buildTitleProApprovalQueue(leads, runId) {
  return leads.map((lead, index) => {
    const approvalId = `titlepro_${runId}_${String(index + 1).padStart(3, "0")}`;
    return {
      lead_key: lead.dedupe_key,
      radar_id: lead.radar_id || null,
      apn: lead.apn || null,
      county: lead.county || null,
      address: lead.street || null,
      city: lead.city || null,
      requested_doc_type: requestedDocTypeForLead(lead),
      reason: titleProReasonForLead(lead),
      status: "not_requested_screening_required",
      approval_required: true,
      approval_id: approvalId,
      cost_ceiling: null,
      existing_evidence_path: `evidence/${safeEvidenceSegment(lead)}/titlepro`,
      paid_action_allowed: false
    };
  });
}

module.exports = {
  buildTitleProApprovalQueue
};
