const fs = require("fs");
const path = require("path");
const { parseCsv } = require("./csv-utils");
const { hash16, sha256File } = require("./runtime");
const { normalizeAddress } = require("./titlepro-evidence-intake");

const LEAD_KEY_HEADERS = ["lead_key", "Lead Key"];
const RADAR_ID_HEADERS = ["radar_id", "Radar ID", "PropertyRadar ID"];
const ADDRESS_HEADERS = ["address", "property_address", "Property Address", "Address"];
const OWNER_HEADERS = ["owner_entity", "Owner Entity", "owner", "Owner", "entity"];
const CONTACT_NAME_HEADERS = ["contact_name", "Contact Name", "name", "Name"];
const CONTACT_TITLE_HEADERS = ["contact_title", "Contact Title", "title", "Title"];
const COMPANY_HEADERS = ["company", "Company"];
const RELATIONSHIP_HEADERS = ["relationship_to_owner", "Relationship To Owner", "relationship", "Role"];
const SOURCE_TYPE_HEADERS = ["source_type", "Source Type", "source", "Source", "enrichment_source", "Enrichment Source"];
const SOURCE_URL_HEADERS = ["source_url", "Source URL", "url", "URL"];
const EMAIL_HEADERS = ["email", "Email"];
const PHONE_HEADERS = ["phone", "Phone", "mobile", "Mobile"];
const LINKEDIN_HEADERS = ["linkedin_url", "LinkedIn URL", "linkedin", "LinkedIn"];
const CONFIDENCE_HEADERS = ["confidence", "Confidence"];
const FOUND_BY_HEADERS = ["found_by", "Found By", "operator", "Operator"];
const FOUND_AT_HEADERS = ["found_at", "Found At", "as_of", "As Of"];
const NOTES_HEADERS = ["notes", "Notes"];

function readContactEnrichmentFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  let rows;
  if (extension === ".json") {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    rows = Array.isArray(parsed) ? parsed : parsed.contacts || parsed.items || parsed.records || [];
  } else {
    const csvRows = parseCsv(fs.readFileSync(filePath, "utf8"));
    const headers = csvRows[0] || [];
    rows = csvRows.slice(1).filter((row) => row.length > 1 || row[0]).map((row) => rowObject(headers, row));
  }
  const records = rows.map(normalizeContactRow).filter((record) => record.contact_name || record.owner_entity || record.email || record.phone);
  return {
    source_path: path.basename(filePath),
    source_path_scope: "basename_only",
    source_sha256: sha256File(filePath),
    source_format: extension.replace(/^\./, "") || "csv",
    record_count: records.length,
    rocketreach_record_count: records.filter((record) => /rocketreach/i.test(record.source_type || "")).length,
    manual_record_count: records.filter((record) => !/rocketreach/i.test(record.source_type || "")).length,
    records,
    rocketreach_reveals_executed: 0,
    external_lookups_executed: 0,
    realnex_writes_executed: 0,
    outreach_actions_executed: 0,
    external_writes_executed: 0
  };
}

function rowObject(headers, row) {
  const result = {};
  headers.forEach((header, index) => {
    result[header] = row[index] === undefined ? "" : row[index];
  });
  return result;
}

function normalizeContactRow(row, index) {
  const contactName = valueFromHeaders(row, CONTACT_NAME_HEADERS);
  const ownerEntity = valueFromHeaders(row, OWNER_HEADERS);
  const sourceType = valueFromHeaders(row, SOURCE_TYPE_HEADERS) || "manual_pasteback";
  const sourceUrl = valueFromHeaders(row, SOURCE_URL_HEADERS);
  const email = valueFromHeaders(row, EMAIL_HEADERS);
  const phone = valueFromHeaders(row, PHONE_HEADERS);
  const linkedinUrl = valueFromHeaders(row, LINKEDIN_HEADERS);
  const relationship = valueFromHeaders(row, RELATIONSHIP_HEADERS);
  return {
    contact_enrichment_id: `contact:${hash16(JSON.stringify(row))}`,
    source_row_index: index + 1,
    lead_key: valueFromHeaders(row, LEAD_KEY_HEADERS) || null,
    radar_id: uppercaseOrNull(valueFromHeaders(row, RADAR_ID_HEADERS)),
    property_address: valueFromHeaders(row, ADDRESS_HEADERS) || null,
    normalized_address_key: normalizeAddress(valueFromHeaders(row, ADDRESS_HEADERS)),
    owner_entity: ownerEntity || null,
    contact_name: contactName || null,
    contact_title: valueFromHeaders(row, CONTACT_TITLE_HEADERS) || null,
    company: valueFromHeaders(row, COMPANY_HEADERS) || ownerEntity || null,
    relationship_to_owner: relationship || null,
    source_type: sourceType,
    source_url: safeSourceUrl(sourceUrl),
    source_url_scope: sourceUrl && isLocalPath(sourceUrl) ? "redacted_local_path" : "external_or_public_url",
    email: email || null,
    phone: phone || null,
    linkedin_url: linkedinUrl || null,
    confidence: valueFromHeaders(row, CONFIDENCE_HEADERS) || "manual_unverified",
    found_by: valueFromHeaders(row, FOUND_BY_HEADERS) || null,
    found_at: valueFromHeaders(row, FOUND_AT_HEADERS) || null,
    notes: valueFromHeaders(row, NOTES_HEADERS) || null,
    service_actor: isServiceActor(relationship || ownerEntity || sourceType),
    rocketreach_reveal_executed: false,
    external_lookup_executed: false,
    realnex_write_executed: false,
    outreach_executed: false,
    external_write_executed: false
  };
}

function matchContactEnrichmentToLeads(records, leads) {
  const normalizedLeads = leads.map((lead) => ({
    lead,
    lead_key: String(lead.dedupe_key || ""),
    radar_id: String(lead.radar_id || "").toUpperCase(),
    address_key: normalizeAddress([lead.street, lead.city, lead.state, lead.zip].filter(Boolean).join(" "))
  }));
  return records.map((record) => {
    const match = normalizedLeads.find((candidate) => record.lead_key && candidate.lead_key === record.lead_key)
      || normalizedLeads.find((candidate) => record.radar_id && candidate.radar_id === record.radar_id)
      || normalizedLeads.find((candidate) => record.normalized_address_key && candidate.address_key && record.normalized_address_key.includes(candidate.address_key))
      || normalizedLeads.find((candidate) => record.normalized_address_key && candidate.address_key && candidate.address_key.includes(record.normalized_address_key));
    return {
      ...record,
      lead_key: match?.lead?.dedupe_key || record.lead_key || null,
      matched_radar_id: match?.lead?.radar_id || null,
      match_status: match ? "matched" : "unmatched_review"
    };
  });
}

function buildContactRoleAssertions(records) {
  return records.filter((record) => record.contact_name || record.owner_entity).map((record) => {
    const actor = record.contact_name || record.owner_entity;
    return {
      contact_assertion_id: `${record.contact_enrichment_id}:contact:${hash16(actor)}`,
      contact_enrichment_id: record.contact_enrichment_id,
      lead_key: record.lead_key,
      radar_id: record.matched_radar_id || record.radar_id || null,
      match_status: record.match_status,
      owner_entity: record.owner_entity,
      contact_name: record.contact_name,
      contact_title: record.contact_title,
      company: record.company,
      relationship_to_owner: record.relationship_to_owner,
      source_type: record.source_type,
      source_url: safeSourceUrl(record.source_url),
      has_email: Boolean(record.email),
      has_phone: Boolean(record.phone),
      has_linkedin: Boolean(record.linkedin_url),
      confidence: record.confidence,
      service_actor: record.service_actor,
      role_category: record.service_actor ? "service_or_creditor_contact" : "manual_contact_candidate",
      contact_use_allowed: false,
      outreach_ready: false,
      realnex_write_allowed: false,
      control_lead_claim_allowed: false,
      beneficial_owner_claim_allowed: false,
      broker_approval_required: true,
      basis: "Manual contact enrichment pasteback; verify relationship and suppression before use.",
      broker_packet_note: `${actor} is a manually supplied contact candidate. Do not treat as beneficial ownership proof or outreach-ready without broker approval.`
    };
  });
}

function buildContactNeedsReview(records) {
  const needs = [];
  for (const record of records) {
    if (record.match_status !== "matched") {
      needs.push({
        contact_enrichment_id: record.contact_enrichment_id,
        reason: "contact_not_matched_to_run_lead",
        severity: "warning",
        summary: "Manual contact enrichment row did not match a current run lead by lead key, Radar ID, or normalized address."
      });
    }
    if (!record.email && !record.phone && !record.linkedin_url) {
      needs.push({
        contact_enrichment_id: record.contact_enrichment_id,
        reason: "contact_method_missing",
        severity: "info",
        summary: "Contact row has no email, phone, or LinkedIn URL."
      });
    }
    needs.push({
      contact_enrichment_id: record.contact_enrichment_id,
      reason: "manual_contact_requires_broker_approval",
      severity: "info",
      summary: "Imported contact is not outreach-ready and must be approved before use."
    });
  }
  return needs;
}

function valueFromHeaders(row, aliases) {
  const wanted = new Set(aliases.map(normalizeHeader));
  const key = Object.keys(row).find((header) => wanted.has(normalizeHeader(header)));
  const value = key ? row[key] : null;
  return value === undefined || value === null ? "" : String(value).trim();
}

function normalizeHeader(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function uppercaseOrNull(value) {
  const text = String(value || "").trim();
  return text ? text.toUpperCase() : null;
}

function isServiceActor(value) {
  return /\b(trustee|lender|beneficiary|bank|attorney|lawyer|servicer|broker|agent)\b/i.test(String(value || ""));
}

function isLocalPath(value) {
  return String(value || "").startsWith("/") || String(value || "").startsWith("file://");
}

function safeSourceUrl(value) {
  if (!value) return null;
  if (isLocalPath(value)) return `redacted_local_path:${hash16(value)}`;
  return value;
}

module.exports = {
  readContactEnrichmentFile,
  matchContactEnrichmentToLeads,
  buildContactRoleAssertions,
  buildContactNeedsReview
};
