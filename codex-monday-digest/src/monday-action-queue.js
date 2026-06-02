const fs = require("fs");
const path = require("path");
const { ensureDir } = require("./runtime");
const { csvEscape, parseCsv } = require("./csv-utils");

const ACTION_QUEUE_HEADERS = [
  "queue_row_id",
  "run_id",
  "run_type",
  "source_type",
  "lead_key",
  "radar_id",
  "property_key",
  "cluster_id",
  "source_row_index",
  "source_row_indexes",
  "apn",
  "county",
  "address",
  "city",
  "owner_string",
  "queue_name",
  "task",
  "task_type",
  "status",
  "owner_role",
  "priority",
  "due_offset",
  "approval_required",
  "approval_id",
  "paid_action_allowed",
  "monday_write_executed",
  "external_write_executed",
  "control_claim_allowed",
  "broker_ready",
  "source_ref",
  "evidence_link",
  "blocked_reason",
  "next_action",
  "caveat"
];

function buildDigestActionQueue({ runId, leads, subitems, titleproQueue = [], approvedTitleproPulls = [] }) {
  const leadByKey = new Map((leads || []).map((lead) => [lead.dedupe_key, lead]));
  const titleproByApprovalId = new Map(titleproQueue.map((row) => [row.approval_id, row]));
  const approvedByApprovalId = new Map(approvedTitleproPulls.map((row) => [row.approval_id, row]));
  return (subitems || []).map((subitem, index) => {
    const lead = leadByKey.get(subitem.lead_key) || {};
    const titleproRow = subitem.approval_id ? titleproByApprovalId.get(subitem.approval_id) : null;
    const approvedPull = subitem.approval_id ? approvedByApprovalId.get(subitem.approval_id) : null;
    const status = approvedPull && subitem.task === "Pull/save approved TitlePro docs"
      ? approvedPull.status
      : subitem.status;
    return normalizeActionQueueRow({
      queue_row_id: `digest_${lead.radar_id || index + 1}_${String(index + 1).padStart(3, "0")}`,
      run_id: runId,
      run_type: "digest",
      source_type: "digest",
      lead_key: subitem.lead_key,
      radar_id: lead.radar_id || null,
      property_key: lead.dedupe_key || subitem.lead_key,
      cluster_id: null,
      source_row_index: lead.source_events?.[0]?.source_row_index || null,
      source_row_indexes: (lead.source_events || []).map((event) => event.source_row_index).filter(Boolean),
      apn: titleproRow?.apn || null,
      county: titleproRow?.county || null,
      address: lead.street || titleproRow?.address || null,
      city: lead.city || titleproRow?.city || null,
      owner_string: null,
      queue_name: subitem.queue_name,
      task: subitem.task,
      task_type: subitem.queue_name,
      status,
      owner_role: subitem.owner_role,
      priority: lead.priority || null,
      due_offset: subitem.due_offset || null,
      approval_required: subitem.approval_required,
      approval_id: subitem.approval_id,
      paid_action_allowed: approvedPull ? true : false,
      source_ref: `deduped_leads:${lead.radar_id || subitem.lead_key}`,
      evidence_link: lead.evidence_link || approvedPull?.evidence_destination || null,
      blocked_reason: lead.blocked_action || null,
      next_action: approvedPull?.next_action || lead.next_action || null,
      caveat: approvedPull
        ? "Approved intake recorded; TitlePro browser/order step still needs action-time confirmation."
        : lead.blocked_action_detail || "Preview-only Monday action queue row."
    });
  });
}

function buildBatchActionQueue({ runId, candidates, clusters, roleTasks, currentStatusTasks, documentPullTasks }) {
  const candidateByProperty = new Map((candidates || []).map((candidate) => [candidate.property_key, candidate]));
  const clusterById = new Map((clusters || []).map((cluster) => [cluster.cluster_id, cluster]));
  const rows = [];
  for (const task of currentStatusTasks || []) {
    const candidate = candidateByProperty.get(task.property_key) || {};
    rows.push(batchTaskRow(runId, task, candidate, clusterById.get(task.cluster_id), "batch_current_status"));
  }
  for (const task of documentPullTasks || []) {
    const candidate = candidateByProperty.get(task.property_key) || {};
    rows.push(batchTaskRow(runId, task, candidate, clusterById.get(task.cluster_id), "batch_document_decision"));
  }
  for (const task of roleTasks || []) {
    const cluster = clusterById.get(task.cluster_id) || {};
    rows.push(batchTaskRow(runId, task, {}, cluster, "batch_owner_control"));
  }
  return rows.map((row, index) => ({
    ...row,
    queue_row_id: `${row.queue_row_id}_${String(index + 1).padStart(4, "0")}`
  }));
}

function batchTaskRow(runId, task, candidate, cluster, queueName) {
  return normalizeActionQueueRow({
    queue_row_id: queueName,
    run_id: runId,
    run_type: "batch",
    source_type: "batch",
    lead_key: null,
    radar_id: null,
    property_key: task.property_key || null,
    cluster_id: task.cluster_id || null,
    source_row_index: candidate.source_row_index || null,
    source_row_indexes: candidate.source_row_indexes || [],
    apn: candidate.apn || null,
    county: candidate.county || null,
    address: candidate.address || null,
    city: candidate.city || null,
    owner_string: candidate.owner_string || cluster?.owner_string || null,
    queue_name: queueName,
    task: task.task_type,
    task_type: task.task_type,
    status: task.status,
    owner_role: ownerRoleForBatchTask(task.task_type),
    priority: priorityForBatchCandidate(candidate),
    due_offset: task.task_type === "current_status_verification" ? "next business day" : null,
    approval_required: task.approval_required,
    approval_id: task.approval_id,
    paid_action_allowed: false,
    source_ref: task.source_ref,
    evidence_link: null,
    blocked_reason: task.task_type === "identity_document_decision"
      ? "No paid pull is authorized from CSV preview alone."
      : "Preview-only verification task.",
    next_action: nextActionForBatchTask(task.task_type),
    caveat: task.caveat || "CSV batch queue row is provisional and preview-only."
  });
}

function ownerRoleForBatchTask(taskType) {
  if (taskType === "current_status_verification") return "Intern";
  if (taskType === "identity_document_decision") return "Broker/senior operator";
  if (taskType === "owner_string_candidate") return "Intern";
  return "Codex + operator";
}

function priorityForBatchCandidate(candidate) {
  if (candidate.negative_equity) return "High";
  if (candidate.low_equity) return "Medium";
  return "Review";
}

function nextActionForBatchTask(taskType) {
  if (taskType === "current_status_verification") return "Verify current status before broker action.";
  if (taskType === "identity_document_decision") return "Decide whether approved title/identity evidence is needed.";
  if (taskType === "owner_string_candidate") return "Disambiguate owner string with title/SOS/current-status evidence before any control claim.";
  return "Review task.";
}

function normalizeActionQueueRow(row) {
  return {
    ...row,
    approval_required: Boolean(row.approval_required),
    paid_action_allowed: Boolean(row.paid_action_allowed),
    monday_write_executed: false,
    external_write_executed: false,
    control_claim_allowed: false,
    broker_ready: false
  };
}

function writeActionQueueCsv(filePath, rows) {
  ensureDir(path.dirname(filePath));
  const lines = [
    ACTION_QUEUE_HEADERS.join(","),
    ...(rows || []).map((row) => ACTION_QUEUE_HEADERS.map((header) => csvEscape(row[header])).join(","))
  ];
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
  return filePath;
}

function readActionQueueCsv(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const rows = parseCsv(fs.readFileSync(filePath, "utf8"));
  const headers = rows[0] || [];
  return rows.slice(1)
    .filter((row) => row.length > 1 || row[0])
    .map((row) => {
      const record = {};
      headers.forEach((header, index) => {
        record[header] = row[index] === undefined ? "" : row[index];
      });
      return record;
    });
}

module.exports = {
  ACTION_QUEUE_HEADERS,
  buildDigestActionQueue,
  buildBatchActionQueue,
  readActionQueueCsv,
  writeActionQueueCsv
};
