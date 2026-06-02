const fs = require("fs");
const path = require("path");
const { parseCsv } = require("./csv-utils");
const { sha256File, nowIso } = require("./runtime");

const APPROVAL_ID_HEADERS = ["approval_id", "Approval ID", "TitlePro Approval ID"];
const LEAD_KEY_HEADERS = ["lead_key", "Lead Key"];
const RADAR_ID_HEADERS = ["radar_id", "Radar ID"];
const DECISION_HEADERS = ["decision", "Decision", "approved", "Approved"];
const DOC_TYPE_HEADERS = ["requested_doc_type", "Requested Doc Type", "doc_type", "Document Type", "TitlePro Request"];
const REASON_HEADERS = ["reason", "Reason", "approval_reason", "Approval Reason"];
const COST_HEADERS = ["cost_ceiling", "Cost Ceiling", "max_cost", "Max Cost"];
const APPROVED_BY_HEADERS = ["approved_by", "Approved By", "broker", "Broker"];
const APPROVED_AT_HEADERS = ["approved_at", "Approved At"];
const APN_HEADERS = ["apn", "APN"];
const COUNTY_HEADERS = ["county", "County"];
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

function parseApprovalDecision(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["true", "yes", "y", "approved", "approve"].includes(normalized)) return "approved";
  if (["false", "no", "n", "rejected", "reject", "denied", "deny"].includes(normalized)) return "rejected";
  if (["hold", "needs_info", "needs info", "pending"].includes(normalized)) return "hold";
  return normalized || "hold";
}

function parseCostCeiling(value) {
  const cleaned = String(value || "").replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function rowObject(headers, row) {
  const result = {};
  headers.forEach((header, index) => {
    result[header] = row[index] === undefined ? "" : row[index];
  });
  return result;
}

function readApprovalFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  let rows;
  if (extension === ".json") {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    rows = Array.isArray(parsed) ? parsed : parsed.approvals || parsed.decisions || [];
  } else {
    const csvRows = parseCsv(fs.readFileSync(filePath, "utf8"));
    const headers = csvRows[0] || [];
    rows = csvRows.slice(1).filter((row) => row.length > 1 || row[0]).map((row) => rowObject(headers, row));
  }
  const approvals = rows.map(normalizeApprovalRow);
  return {
    source_path: filePath,
    source_sha256: sha256File(filePath),
    source_format: extension.replace(/^\./, "") || "csv",
    approvals
  };
}

function normalizeApprovalRow(row, index) {
  return {
    source_row_index: index + 1,
    approval_id: valueFromHeaders(row, APPROVAL_ID_HEADERS) || null,
    lead_key: valueFromHeaders(row, LEAD_KEY_HEADERS) || null,
    radar_id: valueFromHeaders(row, RADAR_ID_HEADERS) || null,
    decision: parseApprovalDecision(valueFromHeaders(row, DECISION_HEADERS)),
    requested_doc_type: valueFromHeaders(row, DOC_TYPE_HEADERS) || null,
    reason: valueFromHeaders(row, REASON_HEADERS) || null,
    cost_ceiling: parseCostCeiling(valueFromHeaders(row, COST_HEADERS)),
    approved_by: valueFromHeaders(row, APPROVED_BY_HEADERS) || null,
    approved_at: valueFromHeaders(row, APPROVED_AT_HEADERS) || null,
    apn: valueFromHeaders(row, APN_HEADERS) || null,
    county: valueFromHeaders(row, COUNTY_HEADERS) || null,
    notes: valueFromHeaders(row, NOTES_HEADERS) || null
  };
}

function applyTitleProApprovals(queueRows, approvals, options = {}) {
  const at = options.at || nowIso();
  const queue = queueRows || [];
  const decisions = [];
  const approvedPullRequests = [];
  for (const approval of approvals) {
    const queueRow = findQueueRow(queue, approval);
    const validationErrors = validateApproval(approval, queueRow);
    const decisionRow = {
      ...approval,
      matched_lead_key: queueRow?.lead_key || null,
      matched_radar_id: queueRow?.radar_id || null,
      matched_approval_id: queueRow?.approval_id || null,
      validation_errors: validationErrors,
      approval_recorded: approval.decision === "approved" && validationErrors.length === 0,
      paid_action_allowed: approval.decision === "approved" && validationErrors.length === 0,
      pull_executed: false,
      external_write_executed: false,
      recorded_at: at
    };
    decisions.push(decisionRow);
    if (decisionRow.approval_recorded) {
      approvedPullRequests.push(buildApprovedPullRequest(queueRow, decisionRow, at));
    }
  }
  return { decisions, approvedPullRequests };
}

function findQueueRow(queueRows, approval) {
  return queueRows.find((row) => {
    return (approval.approval_id && row.approval_id === approval.approval_id)
      || (approval.lead_key && row.lead_key === approval.lead_key)
      || (approval.radar_id && row.radar_id === approval.radar_id);
  }) || null;
}

function validateApproval(approval, queueRow) {
  const errors = [];
  if (!queueRow) errors.push("no_matching_titlepro_queue_row");
  if (approval.decision === "approved") {
    if (!approval.requested_doc_type) errors.push("missing_requested_doc_type");
    if (!approval.reason) errors.push("missing_reason");
    if (!approval.approved_by) errors.push("missing_approved_by");
    if (approval.cost_ceiling === null) errors.push("missing_cost_ceiling");
    if (approval.cost_ceiling !== null && approval.cost_ceiling < 0) errors.push("invalid_cost_ceiling");
  }
  return errors;
}

function buildApprovedPullRequest(queueRow, decision, at) {
  return {
    request_id: `titlepro_pull_${queueRow.approval_id}`,
    approval_id: queueRow.approval_id,
    lead_key: queueRow.lead_key,
    radar_id: queueRow.radar_id,
    apn: decision.apn || queueRow.apn || null,
    county: decision.county || queueRow.county || null,
    address: queueRow.address,
    city: queueRow.city,
    requested_doc_type: decision.requested_doc_type,
    reason: decision.reason,
    cost_ceiling: decision.cost_ceiling,
    approved_by: decision.approved_by,
    approved_at: decision.approved_at || at,
    status: "approved_pending_manual_titlepro_pull",
    paid_action_allowed: true,
    pull_executed: false,
    external_write_executed: false,
    evidence_destination: queueRow.existing_evidence_path,
    next_action: "Use TitlePro skill/browser lane only after confirming this approved request scope at action time."
  };
}

module.exports = {
  applyTitleProApprovals,
  readApprovalFile
};
