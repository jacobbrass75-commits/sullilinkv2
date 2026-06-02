const fs = require("fs");
const path = require("path");
const { hash16, sha256File } = require("./runtime");

function readTitleProEvidenceFile(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const profiles = extractArray(raw, "profiles").map((record, index) => normalizeEvidenceRecord(record, {
    source_type: "profile",
    source_row_index: index + 1
  }));
  const documents = extractArray(raw, "documents").map((record, index) => normalizeEvidenceRecord(record, {
    source_type: "document",
    source_row_index: index + 1
  }));
  const directEvidence = extractDirectEvidence(raw).map((record, index) => normalizeEvidenceRecord(record, {
    source_type: record.source_type || record.evidence_type || "evidence",
    source_row_index: index + 1
  }));
  const records = [...profiles, ...documents, ...directEvidence].filter((record) => record.titlepro_order_id || record.property_address || record.apn);
  return {
    source_path: path.basename(filePath),
    source_path_scope: "basename_only",
    source_sha256: sha256File(filePath),
    source_format: path.extname(filePath).toLowerCase().replace(/^\./, "") || "json",
    as_of: raw.as_of || null,
    record_count: records.length,
    profile_count: records.filter((record) => record.source_type === "profile").length,
    document_count: records.filter((record) => record.source_type === "document").length,
    records,
    titlepro_pulls_executed: 0,
    paid_actions_executed: 0,
    external_writes_executed: 0
  };
}

function extractArray(raw, key) {
  return Array.isArray(raw?.[key]) ? raw[key] : [];
}

function extractDirectEvidence(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.evidence)) return raw.evidence;
  if (Array.isArray(raw?.items)) return raw.items;
  return [];
}

function normalizeEvidenceRecord(record, defaults = {}) {
  const evidenceId = `titlepro:${record.titlepro_order_id || record.recorder_document_number || hash16(JSON.stringify(record))}`;
  return {
    evidence_id: evidenceId,
    source_type: defaults.source_type,
    source_row_index: defaults.source_row_index,
    titlepro_order_id: stringOrNull(record.titlepro_order_id),
    titlepro_url: stringOrNull(record.titlepro_url),
    recorder_document_number: stringOrNull(record.recorder_document_number),
    recorded_at: stringOrNull(record.recorded_at),
    county: stringOrNull(record.county),
    document_type: stringOrNull(record.document_type),
    property_address: stringOrNull(record.property_address),
    normalized_address_key: normalizeAddress(record.property_address),
    apn: stringOrNull(record.apn),
    radar_id: stringOrNull(record.radar_id),
    title_owner: stringOrNull(record.title_owner),
    borrower: stringOrNull(record.borrower || record.new_borrower),
    trustor: stringOrNull(record.trustor || record.original_trustor || record.amended_trustor),
    beneficiary: stringOrNull(record.beneficiary),
    lender: stringOrNull(record.lender),
    trustee: stringOrNull(record.trustee),
    grantor: stringOrNull(record.grantor),
    grantee: stringOrNull(record.grantee),
    signer: stringOrNull(record.signer || record.named_individual_in_assumption_chain || record.individual_party),
    signer_capacity: stringOrNull(record.signer_capacity),
    sale_date: stringOrNull(record.sale_date),
    unpaid_balance_estimate: record.unpaid_balance_estimate ?? null,
    key_facts: Array.isArray(record.key_profile_facts) ? record.key_profile_facts.map(String) : [],
    owner_disambiguation_note: stringOrNull(record.owner_disambiguation_note),
    manual_document_targets: Array.isArray(record.manual_document_targets) ? record.manual_document_targets.map(String) : [],
    saved_evidence: Array.isArray(record.saved_evidence) ? record.saved_evidence.map(safeEvidencePath) : [],
    titlepro_pulls_executed: false,
    paid_action_executed: false,
    external_write_executed: false
  };
}

function matchTitleProEvidenceToLeads(records, leads) {
  const normalizedLeads = leads.map((lead) => ({
    lead,
    radar_id: String(lead.radar_id || "").toUpperCase(),
    address_key: normalizeAddress([lead.street, lead.city, lead.state, lead.zip].filter(Boolean).join(" "))
  }));
  return records.map((record) => {
    const recordRadar = String(record.radar_id || "").toUpperCase();
    const match = normalizedLeads.find((candidate) => recordRadar && candidate.radar_id === recordRadar)
      || normalizedLeads.find((candidate) => record.normalized_address_key && candidate.address_key && record.normalized_address_key.includes(candidate.address_key))
      || normalizedLeads.find((candidate) => record.normalized_address_key && candidate.address_key && candidate.address_key.includes(record.normalized_address_key));
    return {
      ...record,
      lead_key: match?.lead?.dedupe_key || null,
      matched_radar_id: match?.lead?.radar_id || null,
      match_status: match ? "matched" : "unmatched_review"
    };
  });
}

function buildTitleProRoleAssertions(records) {
  const assertions = [];
  for (const record of records) {
    addAssertion(assertions, record, "title_owner", record.title_owner, {
      role_category: "title_owner",
      title_owner_claim_allowed: Boolean(record.title_owner),
      control_lead_claim_allowed: false,
      basis: "TitlePro profile/document owner field"
    });
    addAssertion(assertions, record, "borrower", record.borrower, {
      role_category: "borrower_or_obligor",
      basis: "Recorded document borrower/new borrower field"
    });
    addAssertion(assertions, record, "trustor", record.trustor, {
      role_category: "borrower_or_obligor",
      basis: "Recorded document trustor field"
    });
    addAssertion(assertions, record, "beneficiary", record.beneficiary || record.lender, {
      role_category: "creditor_or_lender",
      service_actor: true,
      basis: "Recorded document beneficiary/lender field"
    });
    addAssertion(assertions, record, "trustee", record.trustee, {
      role_category: "foreclosure_service_actor",
      service_actor: true,
      basis: "Recorded document trustee field"
    });
    addAssertion(assertions, record, "grantor", record.grantor, {
      role_category: "deed_party",
      basis: "Recorded deed grantor field"
    });
    addAssertion(assertions, record, "grantee", record.grantee, {
      role_category: "deed_party",
      basis: "Recorded deed grantee field"
    });
    addAssertion(assertions, record, "recorded_signer", record.signer, {
      role_category: "recorded_signer_control_lead",
      control_lead_claim_allowed: Boolean(record.signer),
      basis: record.signer_capacity ? `Recorded signature capacity: ${record.signer_capacity}` : "Recorded document signer/name field"
    });
  }
  return assertions;
}

function addAssertion(assertions, record, role, actor, options = {}) {
  if (!actor) return;
  const serviceActor = Boolean(options.service_actor);
  assertions.push({
    assertion_id: `${record.evidence_id}:${role}:${hash16(actor)}`,
    evidence_id: record.evidence_id,
    lead_key: record.lead_key,
    radar_id: record.matched_radar_id || record.radar_id || null,
    match_status: record.match_status,
    source_type: record.source_type,
    titlepro_order_id: record.titlepro_order_id,
    recorder_document_number: record.recorder_document_number,
    property_address: record.property_address,
    apn: record.apn,
    role,
    role_category: options.role_category || role,
    actor,
    basis: options.basis || "Saved TitlePro evidence",
    confidence: confidenceForRole(role, serviceActor),
    service_actor: serviceActor,
    title_owner_claim_allowed: Boolean(options.title_owner_claim_allowed),
    control_lead_claim_allowed: Boolean(options.control_lead_claim_allowed),
    beneficial_owner_claim_allowed: false,
    outreach_ready: false,
    broker_packet_note: `${actor} is evidence-backed for ${role}; do not treat this as private beneficial ownership without independent proof.`
  });
}

function confidenceForRole(role, serviceActor) {
  if (serviceActor) return "Evidence-backed service/creditor role; exclude from owner-control lead.";
  if (role === "recorded_signer") return "Recorded signer/control lead; not proof of beneficial ownership.";
  if (role === "title_owner") return "Evidence-backed title owner; not proof of beneficial owner economics.";
  return "Evidence-backed recorded-document role; review before broker-facing promotion.";
}

function buildTitleProNeedsReview(records) {
  const needs = [];
  for (const record of records) {
    if (record.match_status !== "matched") {
      needs.push({
        evidence_id: record.evidence_id,
        titlepro_order_id: record.titlepro_order_id,
        reason: "titlepro_evidence_not_matched_to_run_lead",
        severity: "warning",
        summary: "Saved TitlePro evidence did not match a current run lead by Radar ID or normalized address."
      });
    }
    if (record.manual_document_targets.length) {
      needs.push({
        evidence_id: record.evidence_id,
        titlepro_order_id: record.titlepro_order_id,
        reason: "manual_titlepro_document_targets_remaining",
        severity: "info",
        summary: record.manual_document_targets.join("; ")
      });
    }
  }
  return needs;
}

function normalizeAddress(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b(street|st|avenue|ave|boulevard|blvd|road|rd|drive|dr|california|ca|usa)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeEvidencePath(value) {
  const text = String(value || "");
  if (!text) return null;
  if (text.startsWith("/") || text.startsWith("file://")) return `redacted_local_path:${hash16(text)}`;
  return text;
}

function stringOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

module.exports = {
  readTitleProEvidenceFile,
  matchTitleProEvidenceToLeads,
  buildTitleProRoleAssertions,
  buildTitleProNeedsReview,
  normalizeAddress
};
