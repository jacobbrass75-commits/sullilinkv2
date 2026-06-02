const DEFAULT_SUBITEMS = [
  ["Save digest source", "Codex", "source email/text saved or linked", "intake"],
  ["Confirm property identity", "Intern", "address/APN/county verified or missing flag added", "identity"],
  ["Verify current notice/status", "Intern", "status and as-of date entered", "current_status"],
  ["Decide TitlePro need", "Broker/senior operator", "TitlePro status set", "titlepro"],
  ["Pull/save approved TitlePro docs", "Intern", "evidence link saved after approval", "titlepro"],
  ["Owner/LLC disambiguation", "Intern", "title owner, registered agent, manager/member/signer fields updated", "owner_control"],
  ["Official provider/control enrichment", "Codex + intern", "provider sample/status, role assertions, conflicts, and no-claim caveats captured", "provider_control"],
  ["Niche research / broker packet", "Codex + intern", "priority score, niche signal, packet preview, missing evidence, and blocked claims captured", "broker_packet"],
  ["Relationship/suppression readiness", "Codex + broker", "Gmail/RealNex context, suppression status, outreach readiness, and approval state captured", "relationship"],
  ["Identify likely control lead", "Broker + intern", "likely control lead and confidence updated", "owner_control"],
  ["Draft broker call angle", "Codex", "evidence-backed call angle filled", "broker_packet"],
  ["Broker review decision", "Broker", "item moved to next workflow stage", "broker_review"]
];

function buildSubitems(leads, options = {}) {
  const titleProApprovalByLead = new Map((options.titleproQueue || []).map((row) => [row.lead_key, row.approval_id]));
  return leads.flatMap((lead) =>
    DEFAULT_SUBITEMS.map(([task, ownerRole, exitCriteria, queueName]) => ({
      lead_key: lead.dedupe_key,
      task,
      queue_name: queueName,
      owner_role: ownerRole,
      status: task === "Pull/save approved TitlePro docs" ? "blocked" : "preview_only",
      due_offset: queueName === "current_status" ? "next business day" : null,
      exit_criteria: exitCriteria,
      approval_required: task === "Pull/save approved TitlePro docs",
      approval_id: task === "Pull/save approved TitlePro docs" ? titleProApprovalByLead.get(lead.dedupe_key) || null : null,
      subitem_delivery: "preview"
    }))
  );
}

module.exports = {
  DEFAULT_SUBITEMS,
  buildSubitems
};
