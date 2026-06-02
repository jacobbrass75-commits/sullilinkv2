const fs = require("fs");
const path = require("path");
const { parseCsv } = require("./csv-utils");
const { nowIso, sha256File } = require("./runtime");

const REQUEST_ID_HEADERS = ["request_id", "Request ID", "TitlePro Request ID"];
const APPROVAL_ID_HEADERS = ["approval_id", "Approval ID", "TitlePro Approval ID"];
const LEAD_KEY_HEADERS = ["lead_key", "Lead Key"];
const RADAR_ID_HEADERS = ["radar_id", "Radar ID"];
const DOC_TYPE_HEADERS = ["requested_doc_type", "Requested Doc Type", "doc_type", "Document Type", "TitlePro Request"];
const REASON_HEADERS = ["reason", "Reason", "approval_reason", "Approval Reason"];
const COST_HEADERS = ["cost_ceiling", "Cost Ceiling", "max_cost", "Max Cost"];
const CONFIRMED_BY_HEADERS = ["confirmed_by", "Confirmed By", "operator", "Operator"];
const CONFIRMED_AT_HEADERS = ["confirmed_at", "Confirmed At"];
const CONFIRM_HEADERS = ["confirm_action", "Confirm Action", "confirmed", "Confirmed", "action_time_confirmed", "Action Time Confirmed"];
const APN_HEADERS = ["apn", "APN"];
const COUNTY_HEADERS = ["county", "County"];
const ADDRESS_HEADERS = ["address", "Address", "property_address", "Property Address"];
const CITY_HEADERS = ["city", "City"];
const NOTES_HEADERS = ["notes", "Notes"];

function normalizeHeader(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function valueFromHeaders(row, aliases) {
  const wanted = new Set(aliases.map(normalizeHeader));
  const key = Object.keys(row).find((header) => wanted.has(normalizeHeader(header)));
  const value = key ? row[key] : null;
  return value === undefined || value === null ? "" : String(value).trim();
}

function rowObject(headers, row) {
  const result = {};
  headers.forEach((header, index) => {
    result[header] = row[index] === undefined ? "" : row[index];
  });
  return result;
}

function parseCostCeiling(value) {
  const cleaned = String(value || "").replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseConfirm(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["true", "yes", "y", "confirmed", "confirm", "approved"].includes(normalized);
}

function readTitleProConfirmationFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  let rows;
  if (extension === ".json") {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    rows = Array.isArray(parsed) ? parsed : parsed.confirmations || parsed.titlepro_confirmations || [];
  } else {
    const csvRows = parseCsv(fs.readFileSync(filePath, "utf8"));
    const headers = csvRows[0] || [];
    rows = csvRows.slice(1).filter((row) => row.length > 1 || row[0]).map((row) => rowObject(headers, row));
  }
  const confirmations = rows.map(normalizeConfirmationRow);
  return {
    source_path: path.basename(filePath),
    source_path_scope: "basename_only",
    source_sha256: sha256File(filePath),
    source_format: extension.replace(/^\./, "") || "csv",
    confirmations
  };
}

function normalizeConfirmationRow(row, index) {
  return {
    source_row_index: index + 1,
    request_id: valueFromHeaders(row, REQUEST_ID_HEADERS) || null,
    approval_id: valueFromHeaders(row, APPROVAL_ID_HEADERS) || null,
    lead_key: valueFromHeaders(row, LEAD_KEY_HEADERS) || null,
    radar_id: valueFromHeaders(row, RADAR_ID_HEADERS) || null,
    requested_doc_type: valueFromHeaders(row, DOC_TYPE_HEADERS) || null,
    reason: valueFromHeaders(row, REASON_HEADERS) || null,
    cost_ceiling: parseCostCeiling(valueFromHeaders(row, COST_HEADERS)),
    confirmed_by: valueFromHeaders(row, CONFIRMED_BY_HEADERS) || null,
    confirmed_at: valueFromHeaders(row, CONFIRMED_AT_HEADERS) || null,
    confirm_action: parseConfirm(valueFromHeaders(row, CONFIRM_HEADERS)),
    apn: valueFromHeaders(row, APN_HEADERS) || null,
    county: valueFromHeaders(row, COUNTY_HEADERS) || null,
    address: valueFromHeaders(row, ADDRESS_HEADERS) || null,
    city: valueFromHeaders(row, CITY_HEADERS) || null,
    notes: valueFromHeaders(row, NOTES_HEADERS) || null
  };
}

function applyTitleProActionConfirmations(approvedPullRequests, confirmations, options = {}) {
  const at = options.at || nowIso();
  const approved = approvedPullRequests || [];
  const confirmationRows = [];
  const confirmedActions = [];
  for (const confirmation of confirmations || []) {
    const request = findApprovedRequest(approved, confirmation);
    const validationErrors = validateConfirmation(confirmation, request);
    const confirmationRow = {
      ...confirmation,
      matched_request_id: request?.request_id || null,
      matched_approval_id: request?.approval_id || null,
      matched_lead_key: request?.lead_key || null,
      matched_radar_id: request?.radar_id || null,
      validation_errors: validationErrors,
      action_time_confirmed: validationErrors.length === 0,
      paid_action_allowed: validationErrors.length === 0,
      titlepro_pulls_executed: false,
      browser_action_executed: false,
      external_write_executed: false,
      recorded_at: at
    };
    confirmationRows.push(confirmationRow);
    if (confirmationRow.action_time_confirmed) {
      confirmedActions.push(buildConfirmedAction(request, confirmationRow, at));
    }
  }
  return { confirmationRows, confirmedActions };
}

function findApprovedRequest(approvedPullRequests, confirmation) {
  return (approvedPullRequests || []).find((row) => {
    return (confirmation.request_id && row.request_id === confirmation.request_id)
      || (confirmation.approval_id && row.approval_id === confirmation.approval_id)
      || (confirmation.lead_key && row.lead_key === confirmation.lead_key)
      || (confirmation.radar_id && row.radar_id === confirmation.radar_id);
  }) || null;
}

function validateConfirmation(confirmation, request) {
  const errors = [];
  if (!request) errors.push("no_matching_approved_titlepro_pull_request");
  if (!confirmation.confirm_action) errors.push("missing_action_time_confirmation");
  if (!confirmation.confirmed_by) errors.push("missing_confirmed_by");
  if (!confirmation.requested_doc_type) errors.push("missing_requested_doc_type");
  if (!confirmation.reason) errors.push("missing_reason");
  if (confirmation.cost_ceiling === null) errors.push("missing_cost_ceiling");
  if (confirmation.cost_ceiling !== null && confirmation.cost_ceiling < 0) errors.push("invalid_cost_ceiling");
  if (request) {
    addMismatch(errors, confirmation, request, "request_id");
    addMismatch(errors, confirmation, request, "approval_id");
    addMismatch(errors, confirmation, request, "lead_key");
    addMismatch(errors, confirmation, request, "radar_id");
    if (confirmation.requested_doc_type && confirmation.requested_doc_type !== request.requested_doc_type) errors.push("requested_doc_type_mismatch");
    if (confirmation.reason && confirmation.reason !== request.reason) errors.push("reason_mismatch");
    if (confirmation.cost_ceiling !== null && Number(request.cost_ceiling) < confirmation.cost_ceiling) errors.push("cost_ceiling_exceeds_approval");
    addMismatch(errors, confirmation, request, "county");
    addMismatch(errors, confirmation, request, "apn");
    addMismatch(errors, confirmation, request, "address");
    if (!confirmation.address && !request.address) errors.push("missing_property_address");
  }
  return errors;
}

function buildConfirmedAction(request, confirmation, at) {
  return {
    confirmation_id: `titlepro_confirm_${request.approval_id}`,
    request_id: request.request_id,
    approval_id: request.approval_id,
    lead_key: request.lead_key,
    radar_id: request.radar_id,
    apn: confirmation.apn || request.apn || null,
    county: confirmation.county || request.county || null,
    address: confirmation.address || request.address || null,
    city: confirmation.city || request.city || null,
    requested_doc_type: request.requested_doc_type,
    reason: request.reason,
    cost_ceiling: confirmation.cost_ceiling,
    approved_cost_ceiling: request.cost_ceiling,
    confirmed_by: confirmation.confirmed_by,
    confirmed_at: confirmation.confirmed_at || at,
    status: "action_time_confirmed_pending_serial_titlepro_pull",
    paid_action_allowed: true,
    titlepro_pulls_executed: false,
    pull_executed: false,
    browser_action_executed: false,
    external_write_executed: false,
    serial_execution_required: true,
    duplicate_order_check_required: true,
    evidence_destination: request.evidence_destination,
    next_action: "Use the TitlePro skill/browser lane for this single confirmed request, then import saved evidence with titlepro-import."
  };
}

function normalize(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function addMismatch(errors, confirmation, request, field) {
  if (confirmation[field] && request[field] && normalize(confirmation[field]) !== normalize(request[field])) {
    errors.push(`${field}_mismatch`);
  }
}

module.exports = {
  applyTitleProActionConfirmations,
  readTitleProConfirmationFile
};
