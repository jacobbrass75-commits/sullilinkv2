const { nowIso } = require("./runtime");

function buildApprovalEvents(leads, runId, at = nowIso()) {
  return leads.map((lead, index) => ({
    approval_id: `apr_${runId}_${String(index + 1).padStart(3, "0")}`,
    lead_key: lead.dedupe_key,
    approval_type: "monday_live_write",
    target_type: "lead",
    target_id: lead.radar_id || lead.dedupe_key,
    requested_at: at,
    reason: "Preview only. Monday live write requires scoped broker approval and dry-run gates cleared.",
    state: "not_requested",
    approved_by: null,
    approved_at: null,
    scope: "research intake only",
    expires_at: null
  }));
}

function baseAudit(runId, at, type, summary, leadKey = null) {
  return { run_id: runId, event_type: type, at, lead_key: leadKey, summary };
}

function buildAuditEvents(runId, parsedRows, leads, extraEvents = [], at = nowIso()) {
  const events = [
    baseAudit(runId, at, "parse", `Parsed ${parsedRows.length} PropertyRadar rows.`),
    baseAudit(runId, at, "dedupe", `Produced ${leads.length} deduped leads.`)
  ];
  for (const extra of extraEvents) {
    events.push(baseAudit(runId, at, extra.event_type, extra.summary, extra.lead_key || null));
  }
  for (const lead of leads) {
    events.push(baseAudit(runId, at, "mutation_preview", `Prepared ${lead.action} preview for ${lead.dedupe_key}.`, lead.dedupe_key));
    events.push(baseAudit(runId, at, "blocked_action", lead.blocked_action, lead.dedupe_key));
  }
  return events;
}

function buildQueueDecisions(leads, options = {}) {
  const titleProApprovalByLead = new Map((options.titleproQueue || []).map((row) => [row.lead_key, row.approval_id]));
  return leads.flatMap((lead) => [
    {
      lead_key: lead.dedupe_key,
      queue_name: "current_status_verification",
      decision: "enqueue",
      reason: lead.hard_hold ? "Hard hold requires current status QA before broker action." : "Digest status is intake-only and must be verified.",
      approval_id: null
    },
    {
      lead_key: lead.dedupe_key,
      queue_name: "owner_llc_disambiguation",
      decision: "enqueue",
      reason: "Owner/control cannot be inferred from digest or owner string.",
      approval_id: null
    },
    {
      lead_key: lead.dedupe_key,
      queue_name: "relationship_suppression_readiness",
      decision: "hold",
      reason: "Outreach readiness remains blocked until relationship context, suppression, current status, and broker approval clear.",
      approval_id: null
    },
    {
      lead_key: lead.dedupe_key,
      queue_name: "titlepro_approval",
      decision: "hold",
      reason: "TitlePro profile/document pulls require screened scope, cost ceiling, and explicit broker/admin approval.",
      approval_id: titleProApprovalByLead.get(lead.dedupe_key) || null
    }
  ]);
}

function buildComments(leads) {
  return leads.map((lead) => ({
    lead_key: lead.dedupe_key,
    comment_type: "source_event_summary",
    body_preview: [
      `PropertyRadar intake preview for ${lead.item_name}.`,
      `Distinct source events: ${lead.source_events.length}. Exact duplicates: ${lead.exact_duplicate_count}.`,
      `Blocked: ${lead.blocked_action}`
    ].join("\n"),
    blocked_reason: "Preview only; no Monday update comment was written."
  }));
}

module.exports = {
  buildApprovalEvents,
  buildAuditEvents,
  buildQueueDecisions,
  buildComments
};
