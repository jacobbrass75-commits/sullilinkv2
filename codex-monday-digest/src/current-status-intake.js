const fs = require("fs");
const path = require("path");
const { parseCsv } = require("./csv-utils");
const { hash16, sha256File } = require("./runtime");
const { normalizeAddress } = require("./titlepro-evidence-intake");

const LEAD_KEY_HEADERS = ["lead_key", "Lead Key"];
const RADAR_ID_HEADERS = ["radar_id", "Radar ID", "PropertyRadar ID"];
const ADDRESS_HEADERS = ["address", "property_address", "Property Address", "Address"];
const SUBJECT_HEADERS = ["subject", "Subject"];
const PROVIDER_HEADERS = ["provider", "Provider", "source_type", "Source Type", "trustee", "Trustee"];
const CASE_HEADERS = ["case_or_file", "Case/File", "case", "Case", "trustee_sale_number", "Trustee Sale Number", "ts_number", "TS Number"];
const STATUS_HEADERS = ["status", "current_status", "Current Status", "public_status", "Public Status"];
const SALE_DATE_HEADERS = ["sale_date", "Sale Date", "auction_date", "Auction Date"];
const STATUS_AS_OF_HEADERS = ["status_as_of", "Status As Of", "as_of", "As Of"];
const INTERPRETATION_HEADERS = ["interpretation", "packet_interpretation", "Packet Interpretation"];
const CONFIDENCE_HEADERS = ["confidence", "Confidence"];
const SOURCE_URL_HEADERS = ["source_url", "Source URL", "source_urls", "Source URLs", "url", "URL"];
const EVIDENCE_HEADERS = ["saved_evidence", "Saved Evidence", "evidence", "Evidence"];
const NEXT_ACTION_HEADERS = ["next_action", "Next Action"];
const NOTES_HEADERS = ["notes", "Notes"];

function readCurrentStatusFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const rawText = fs.readFileSync(filePath, "utf8");
  let raw = null;
  let rows;
  if (extension === ".json") {
    raw = JSON.parse(rawText);
    rows = extractStatusRows(raw);
  } else {
    const csvRows = parseCsv(rawText);
    const headers = csvRows[0] || [];
    rows = csvRows.slice(1).filter((row) => row.length > 1 || row[0]).map((row) => rowObject(headers, row));
  }
  const records = rows.map((row, index) => normalizeStatusRow(row, {
    source_row_index: index + 1,
    default_as_of: raw?.as_of || null
  })).filter((record) => record.subject || record.case_or_file || record.public_status || record.radar_id || record.property_address);
  return {
    source_path: path.basename(filePath),
    source_path_scope: "basename_only",
    source_sha256: sha256File(filePath),
    source_format: extension.replace(/^\./, "") || "csv",
    as_of: raw?.as_of || null,
    record_count: records.length,
    records,
    provider_backfills_executed: 0,
    external_lookups_executed: 0,
    outreach_actions_executed: 0,
    external_writes_executed: 0
  };
}

function extractStatusRows(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.checks)) return raw.checks;
  if (Array.isArray(raw?.statuses)) return raw.statuses;
  if (Array.isArray(raw?.records)) return raw.records;
  if (Array.isArray(raw?.items)) return raw.items;
  return [];
}

function rowObject(headers, row) {
  const result = {};
  headers.forEach((header, index) => {
    result[header] = row[index] === undefined ? "" : row[index];
  });
  return result;
}

function normalizeStatusRow(row, defaults = {}) {
  const sourceUrls = arrayFromValue(valueFromHeaders(row, SOURCE_URL_HEADERS) || row.source_urls).map(safeEvidencePath);
  const savedEvidence = arrayFromValue(valueFromHeaders(row, EVIDENCE_HEADERS) || row.saved_evidence).map(safeEvidencePath);
  const propertyAddress = valueFromHeaders(row, ADDRESS_HEADERS) || extractAddressFromSubject(valueFromHeaders(row, SUBJECT_HEADERS));
  const publicStatus = valueFromHeaders(row, STATUS_HEADERS);
  return {
    current_status_id: `status:${hash16(JSON.stringify(row))}`,
    source_row_index: defaults.source_row_index,
    lead_key: valueFromHeaders(row, LEAD_KEY_HEADERS) || null,
    radar_id: uppercaseOrNull(valueFromHeaders(row, RADAR_ID_HEADERS)),
    subject: valueFromHeaders(row, SUBJECT_HEADERS) || null,
    property_address: propertyAddress || null,
    normalized_address_key: normalizeAddress(propertyAddress),
    provider: valueFromHeaders(row, PROVIDER_HEADERS) || inferProvider(valueFromHeaders(row, SUBJECT_HEADERS), valueFromHeaders(row, CASE_HEADERS), sourceUrls),
    case_or_file: valueFromHeaders(row, CASE_HEADERS) || null,
    public_status: publicStatus || null,
    status_summary: summarizeStatus(publicStatus),
    sale_date: valueFromHeaders(row, SALE_DATE_HEADERS) || extractDate(publicStatus),
    status_as_of: valueFromHeaders(row, STATUS_AS_OF_HEADERS) || defaults.default_as_of || null,
    packet_interpretation: valueFromHeaders(row, INTERPRETATION_HEADERS) || null,
    confidence: valueFromHeaders(row, CONFIDENCE_HEADERS) || "saved_status_unverified_for_day_of_action",
    source_urls: sourceUrls,
    saved_evidence: savedEvidence,
    next_action: valueFromHeaders(row, NEXT_ACTION_HEADERS) || null,
    notes: valueFromHeaders(row, NOTES_HEADERS) || null,
    provider_backfill_executed: false,
    external_lookup_executed: false,
    outreach_executed: false,
    external_write_executed: false
  };
}

function matchCurrentStatusToLeads(records, leads) {
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

function buildCurrentStatusAssertions(records) {
  return records.map((record) => ({
    current_status_assertion_id: `${record.current_status_id}:current_status`,
    current_status_id: record.current_status_id,
    lead_key: record.lead_key,
    radar_id: record.matched_radar_id || record.radar_id || null,
    match_status: record.match_status,
    provider: record.provider,
    case_or_file: record.case_or_file,
    property_address: record.property_address,
    public_status: record.public_status,
    status_summary: record.status_summary,
    sale_date: record.sale_date,
    status_as_of: record.status_as_of,
    confidence: record.confidence,
    source_url_count: record.source_urls.length,
    saved_evidence_count: record.saved_evidence.length,
    current_status_use_allowed: false,
    current_status_urgency_claim_allowed: false,
    broker_action_ready: false,
    outreach_ready: false,
    provider_backfill_allowed: false,
    day_of_action_recheck_required: true,
    basis: "Saved current-status/provider evidence import; verify day-of-action status before broker action.",
    next_action: record.next_action || "Recheck official trustee/provider status before broker outreach or action."
  }));
}

function buildCurrentStatusNeedsReview(records) {
  const needs = [];
  for (const record of records) {
    if (record.match_status !== "matched") {
      needs.push({
        current_status_id: record.current_status_id,
        reason: "current_status_not_matched_to_run_lead",
        severity: "warning",
        summary: "Saved current-status evidence did not match a current run lead by lead key, Radar ID, or normalized address."
      });
    }
    if (!record.status_as_of) {
      needs.push({
        current_status_id: record.current_status_id,
        reason: "current_status_as_of_missing",
        severity: "warning",
        summary: "Saved current-status evidence needs an as-of date before broker-facing use."
      });
    }
    needs.push({
      current_status_id: record.current_status_id,
      reason: "day_of_action_status_recheck_required",
      severity: "info",
      summary: "Current status imports remain blocked until official day-of-action status is rechecked."
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

function arrayFromValue(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (!value) return [];
  return String(value).split(/\s*\|\s*|\s*;\s*/).map((item) => item.trim()).filter(Boolean);
}

function safeEvidencePath(value) {
  const text = String(value || "");
  if (!text) return null;
  if (text.startsWith("/") || text.startsWith("file://")) return `redacted_local_path:${hash16(text)}`;
  return text;
}

function extractAddressFromSubject(value) {
  const text = String(value || "");
  const slashPart = text.split("/").find((part) => /\d+\s+[A-Za-z0-9]/.test(part));
  return slashPart ? slashPart.trim() : null;
}

function inferProvider(subject, caseOrFile, urls) {
  const text = `${subject || ""} ${caseOrFile || ""} ${(urls || []).join(" ")}`.toLowerCase();
  if (text.includes("firstam") || text.includes("first american")) return "First American";
  if (text.includes("beacon")) return "Beacon Default";
  if (text.includes("mkconsultants") || text.includes("assured")) return "MK/Assured";
  if (text.includes("bkalerts") || text.includes("bankruptcy")) return "Bankruptcy/public docket";
  return "saved_status_source";
}

function summarizeStatus(value) {
  const text = String(value || "");
  if (!text) return null;
  if (/sold|result/i.test(text)) return "sale_result_reported";
  if (/active|sale date|auction/i.test(text)) return "active_or_sale_date_reported";
  if (/postpon/i.test(text)) return "postponement_reported";
  if (/dismiss|bankruptcy|stay|appeal/i.test(text)) return "bankruptcy_or_stay_review";
  return "saved_status_review";
}

function extractDate(value) {
  const match = String(value || "").match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  return match ? match[1] : null;
}

module.exports = {
  readCurrentStatusFile,
  matchCurrentStatusToLeads,
  buildCurrentStatusAssertions,
  buildCurrentStatusNeedsReview
};
