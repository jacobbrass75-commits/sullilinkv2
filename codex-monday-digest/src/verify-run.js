const fs = require("fs");
const path = require("path");
const { FORBIDDEN_ZERO, readJson } = require("./runtime");
const { REQUIRED_GATE_COLUMNS } = require("./monday-field-map");
const { DEFAULT_SUBITEMS } = require("./subitems");
const { ACTION_QUEUE_HEADERS, readActionQueueCsv } = require("./monday-action-queue");

const DIGEST_FILES = [
  "source_emails.json",
  "parsed_rows.json",
  "deduped_leads.json",
  "monday_lookup_results.json",
  "monday_mutations_preview.json",
  "monday_subitems_preview.json",
  "monday_action_queue.csv",
  "monday_comments_preview.json",
  "titlepro_approval_queue_preview.json",
  "titlepro_approval_decisions.json",
  "titlepro_pull_requests_approved.json",
  "broker_packets_preview.json",
  "approval_events_preview.json",
  "audit_events_preview.jsonl",
  "queue_decisions_preview.json",
  "run_manifest.json",
  "needs_review.json"
];

const BATCH_FILES = [
  "batch_source_profile.json",
  "candidate_properties.json",
  "owner_cluster_candidates.json",
  "role_assertion_tasks.json",
  "current_status_tasks.json",
  "document_pull_tasks.json",
  "monday_batch_preview.json",
  "monday_action_queue.csv",
  "needs_review.json",
  "run_manifest.json"
];

const SOURCE_AUDIT_FILES = [
  "source_reuse_audit.json",
  "source_reuse_recommendations.json",
  "source_risk_scan.json",
  "source_reuse_plan.md",
  "run_manifest.json"
];

const CONNECTOR_READINESS_FILES = [
  "connector_readiness_report.json",
  "gmail_connector_contract.json",
  "monday_connector_contract.json",
  "connector_readiness_plan.md",
  "run_manifest.json"
];

const WORKFLOW_MAP_FILES = [
  "monday_workflow_map.json",
  "monday_workflow_stage_map.json",
  "monday_workflow_source_profile.json",
  "monday_workflow_summary.md",
  "needs_review.json",
  "run_manifest.json"
];

function verifyRun(runFolder) {
  const isConnectorReadiness = fs.existsSync(path.join(runFolder, "connector_readiness_report.json"));
  const isWorkflowMap = fs.existsSync(path.join(runFolder, "monday_workflow_map.json"));
  const isSourceAudit = fs.existsSync(path.join(runFolder, "source_reuse_audit.json"));
  const isBatch = fs.existsSync(path.join(runFolder, "batch_source_profile.json"));
  if (isConnectorReadiness) return verifyConnectorReadinessRun(runFolder);
  if (isWorkflowMap) return verifyWorkflowMapRun(runFolder);
  if (isSourceAudit) return verifySourceAuditRun(runFolder);
  return isBatch ? verifyBatchRun(runFolder) : verifyDigestRun(runFolder);
}

function makeReport(runFolder, title, checks) {
  const failed = checks.filter((check) => !check.pass);
  const lines = [
    `# ${title}`,
    "",
    failed.length ? "Status: FAIL" : "Status: PASS",
    "",
    "## Checks",
    ...checks.map((check) => `- ${check.pass ? "PASS" : "FAIL"}: ${check.message}`)
  ];
  const report = lines.join("\n") + "\n";
  fs.writeFileSync(path.join(runFolder, "verification_report.md"), report);
  return { passed: failed.length === 0, failed, report };
}

function checkFiles(runFolder, files, checks) {
  for (const file of files) {
    checks.push({ pass: fs.existsSync(path.join(runFolder, file)), message: `${file} exists` });
  }
}

function parseJsonl(file) {
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

function forbiddenZero(manifest) {
  const forbidden = manifest.forbidden_actions || {};
  return Object.keys(FORBIDDEN_ZERO).every((key) => forbidden[key] === 0);
}

function verifyDigestRun(runFolder) {
  const checks = [];
  checkFiles(runFolder, DIGEST_FILES, checks);
  if (checks.some((check) => !check.pass)) return makeReport(runFolder, "codex-monday-digest Verification", checks);

  const sourceEmails = readJson(path.join(runFolder, "source_emails.json"));
  const parsedRows = readJson(path.join(runFolder, "parsed_rows.json"));
  const leads = readJson(path.join(runFolder, "deduped_leads.json"));
  const lookupResults = readJson(path.join(runFolder, "monday_lookup_results.json"));
  const mutations = readJson(path.join(runFolder, "monday_mutations_preview.json"));
  const subitems = readJson(path.join(runFolder, "monday_subitems_preview.json"));
  const actionQueue = readActionQueueCsv(path.join(runFolder, "monday_action_queue.csv"));
  const comments = readJson(path.join(runFolder, "monday_comments_preview.json"));
  const titleproQueue = readJson(path.join(runFolder, "titlepro_approval_queue_preview.json"));
  const titleproDecisions = readJson(path.join(runFolder, "titlepro_approval_decisions.json"));
  const approvedTitleproPulls = readJson(path.join(runFolder, "titlepro_pull_requests_approved.json"));
  const packets = readJson(path.join(runFolder, "broker_packets_preview.json"));
  const approvals = readJson(path.join(runFolder, "approval_events_preview.json"));
  const queueDecisions = readJson(path.join(runFolder, "queue_decisions_preview.json"));
  const manifest = readJson(path.join(runFolder, "run_manifest.json"));
  const gmailConnectorProfilePath = path.join(runFolder, "gmail_connector_source_profile.json");
  const mondayConnectorProfilePath = path.join(runFolder, "monday_connector_source_profile.json");
  const titleproEvidencePath = path.join(runFolder, "titlepro_evidence_intake.json");
  const titleproRoleAssertionsPath = path.join(runFolder, "titlepro_role_assertions_preview.json");
  const titleproEvidenceProfilePath = path.join(runFolder, "titlepro_evidence_source_profile.json");
  const titleproActionConfirmationsPath = path.join(runFolder, "titlepro_action_confirmations.json");
  const titleproConfirmedManualActionsPath = path.join(runFolder, "titlepro_confirmed_manual_actions.json");
  const titleproActionConfirmationProfilePath = path.join(runFolder, "titlepro_action_confirmation_source_profile.json");
  const contactEnrichmentPath = path.join(runFolder, "contact_enrichment_intake.json");
  const contactAssertionsPath = path.join(runFolder, "contact_role_assertions_preview.json");
  const contactProfilePath = path.join(runFolder, "contact_enrichment_source_profile.json");
  const currentStatusPath = path.join(runFolder, "current_status_intake.json");
  const currentStatusAssertionsPath = path.join(runFolder, "current_status_assertions_preview.json");
  const currentStatusProfilePath = path.join(runFolder, "current_status_source_profile.json");
  const auditEvents = parseJsonl(path.join(runFolder, "audit_events_preview.jsonl"));

  checks.push({ pass: Array.isArray(sourceEmails) && sourceEmails.length >= 1, message: "source_emails has at least one source" });
  checks.push({ pass: parsedRows.every(hasParsedRowFields), message: "all parsed rows have required fields" });
  checks.push({ pass: leads.every(hasLeadFields), message: "all deduped leads have required gate fields" });
  checks.push({ pass: leads.every((lead) => lead.evidence_link && lead.source_events?.length), message: "all deduped leads keep evidence links and source events" });
  checks.push({ pass: totalExactDuplicates(leads) === Math.max(0, parsedRows.length - totalDistinctEvents(leads)), message: "exact duplicate count is recorded separately from distinct events" });
  checks.push({ pass: lookupResults.length >= leads.length && lookupResults.every(hasLookupFields), message: "Monday lookup results exist with required read-only fields" });
  checks.push({ pass: lookupResults.every((row) => row.lookup_mode !== "live_write"), message: "Monday lookup results are read-only, not live writes" });
  checks.push({ pass: noDuplicateRadarMutation(mutations), message: "no duplicate Monday mutation targets the same Radar ID" });
  checks.push({ pass: mutations.every((mutation) => REQUIRED_GATE_COLUMNS.every((column) => Object.prototype.hasOwnProperty.call(mutation.columns || {}, column))), message: "mutation previews include default gate columns" });
  checks.push({ pass: leads.every((lead) => hasRequiredSubitems(lead, subitems)), message: "every lead has current-status, owner/control, provider, and relationship subitems" });
  checks.push({ pass: actionQueue.length >= subitems.length && actionQueue.every(hasActionQueueFields), message: "Monday action queue CSV has one structured row per subitem or more" });
  checks.push({ pass: actionQueue.every(actionQueueIsPreviewOnly), message: "Monday action queue rows are preview-only with no writes, paid pulls, broker-ready status, or control claims" });
  checks.push({ pass: subitems.every((subitem) => hasActionQueueRowForSubitem(subitem, actionQueue)), message: "every subitem is represented in the Monday action queue" });
  checks.push({ pass: comments.length >= leads.length, message: "comment previews exist for every lead" });
  checks.push({ pass: titleproQueue.length >= leads.length && titleproQueue.every(hasTitleProQueueFields), message: "TitlePro approval queue exists with required fields for every lead" });
  checks.push({ pass: titleproQueue.every((row) => row.approval_required === true && row.paid_action_allowed === false), message: "TitlePro queue requires approval and allows no paid actions" });
  checks.push({ pass: leads.every((lead) => hasTitleProQueueLinks(lead, titleproQueue, subitems, queueDecisions)), message: "TitlePro queue approval ids are linked to subitems and queue decisions" });
  checks.push({ pass: Array.isArray(titleproDecisions) && titleproDecisions.every(hasTitleProDecisionFields), message: "TitlePro approval decisions are structured audit rows" });
  checks.push({ pass: Array.isArray(approvedTitleproPulls) && approvedTitleproPulls.every(hasApprovedTitleProPullFields), message: "approved TitlePro pull requests are structured pending requests" });
  checks.push({ pass: approvedTitleproPulls.every((row) => row.pull_executed === false && row.external_write_executed === false), message: "approved TitlePro pull requests have not executed paid/browser/write actions" });
  checks.push({ pass: approvedTitleproPulls.every((row) => hasMatchingRecordedTitleProDecision(row, titleproDecisions)), message: "approved TitlePro pull requests match recorded valid approvals" });
  if (manifest.last_titlepro_action_confirmation_at || fs.existsSync(titleproActionConfirmationsPath) || fs.existsSync(titleproConfirmedManualActionsPath)) {
    checks.push({ pass: fs.existsSync(titleproActionConfirmationsPath), message: "TitlePro action confirmations exist after action-time confirmation" });
    checks.push({ pass: fs.existsSync(titleproConfirmedManualActionsPath), message: "TitlePro confirmed manual actions exist after action-time confirmation" });
    checks.push({ pass: fs.existsSync(titleproActionConfirmationProfilePath), message: "TitlePro action confirmation source profile exists" });
    if (fs.existsSync(titleproActionConfirmationsPath) && fs.existsSync(titleproConfirmedManualActionsPath) && fs.existsSync(titleproActionConfirmationProfilePath)) {
      const confirmations = readJson(titleproActionConfirmationsPath);
      const confirmedActions = readJson(titleproConfirmedManualActionsPath);
      const confirmationProfile = readJson(titleproActionConfirmationProfilePath);
      checks.push({ pass: Array.isArray(confirmations) && confirmations.length > 0 && confirmations.every(hasTitleProActionConfirmationFields), message: "TitlePro action confirmations are structured audit rows" });
      checks.push({ pass: Array.isArray(confirmedActions) && confirmedActions.every(hasConfirmedTitleProManualActionFields), message: "TitlePro confirmed manual actions are structured" });
      checks.push({ pass: confirmations.every((row) => row.titlepro_pulls_executed === false && row.browser_action_executed === false && row.external_write_executed === false), message: "TitlePro action confirmations executed no paid/browser/write actions" });
      checks.push({ pass: confirmedActions.every((row) => row.titlepro_pulls_executed === false && row.pull_executed === false && row.browser_action_executed === false && row.external_write_executed === false), message: "confirmed TitlePro manual actions have not executed browser/order/write actions" });
      checks.push({ pass: confirmedActions.every((row) => hasMatchingTitleProConfirmation(row, confirmations, approvedTitleproPulls)), message: "confirmed TitlePro manual actions match approved pulls and valid confirmations" });
      checks.push({ pass: confirmationProfile.titlepro_pulls_executed === 0 && confirmationProfile.browser_actions_executed === 0 && confirmationProfile.paid_actions_executed === 0 && confirmationProfile.external_writes_executed === 0, message: "TitlePro action confirmation profile records zero paid/browser/write actions" });
      checks.push({ pass: confirmationProfile.source_path_scope === "basename_only" && !String(confirmationProfile.source_path || "").includes("/"), message: "TitlePro action confirmation source profile stores basename-only source path" });
      checks.push({ pass: confirmationProfile.confirmation_record_count === confirmations.length && confirmationProfile.action_time_confirmed_count === confirmedActions.length, message: "TitlePro action confirmation profile counts match artifacts" });
    }
  }
  if (manifest.last_titlepro_evidence_import_at || fs.existsSync(titleproEvidencePath) || fs.existsSync(titleproRoleAssertionsPath)) {
    checks.push({ pass: fs.existsSync(titleproEvidencePath), message: "TitlePro evidence intake exists after evidence import" });
    checks.push({ pass: fs.existsSync(titleproRoleAssertionsPath), message: "TitlePro role assertions exist after evidence import" });
    checks.push({ pass: fs.existsSync(titleproEvidenceProfilePath), message: "TitlePro evidence source profile exists after evidence import" });
    if (fs.existsSync(titleproEvidencePath) && fs.existsSync(titleproRoleAssertionsPath) && fs.existsSync(titleproEvidenceProfilePath)) {
      const titleproEvidence = readJson(titleproEvidencePath);
      const titleproAssertions = readJson(titleproRoleAssertionsPath);
      const titleproProfile = readJson(titleproEvidenceProfilePath);
      checks.push({ pass: Array.isArray(titleproEvidence) && titleproEvidence.length > 0 && titleproEvidence.every(hasTitleProEvidenceFields), message: "TitlePro evidence intake rows are structured" });
      checks.push({ pass: titleproEvidence.every((row) => row.titlepro_pulls_executed === false && row.paid_action_executed === false && row.external_write_executed === false), message: "TitlePro evidence import executed no paid/browser/write actions" });
      checks.push({ pass: Array.isArray(titleproAssertions) && titleproAssertions.length > 0 && titleproAssertions.every(hasTitleProRoleAssertionFields), message: "TitlePro role assertions are structured" });
      checks.push({ pass: titleproAssertions.every((row) => row.beneficial_owner_claim_allowed === false && row.outreach_ready === false), message: "TitlePro role assertions do not promote beneficial-owner or outreach-ready claims" });
      checks.push({ pass: titleproAssertions.every((row) => !row.service_actor || row.control_lead_claim_allowed === false), message: "TitlePro service actors are excluded from control-lead claims" });
      checks.push({ pass: titleproProfile.titlepro_pulls_executed === 0 && titleproProfile.paid_actions_executed === 0 && titleproProfile.external_writes_executed === 0, message: "TitlePro evidence source profile records zero paid/browser/write actions" });
      checks.push({ pass: titleproProfile.source_path_scope === "basename_only" && !String(titleproProfile.source_path || "").includes("/"), message: "TitlePro evidence source profile stores basename-only source path" });
      checks.push({ pass: titleproProfile.record_count === titleproEvidence.length && titleproProfile.role_assertion_count === titleproAssertions.length, message: "TitlePro evidence profile counts match artifacts" });
    }
  }
  if (manifest.last_contact_enrichment_import_at || fs.existsSync(contactEnrichmentPath) || fs.existsSync(contactAssertionsPath)) {
    checks.push({ pass: fs.existsSync(contactEnrichmentPath), message: "contact enrichment intake exists after contact import" });
    checks.push({ pass: fs.existsSync(contactAssertionsPath), message: "contact role assertions exist after contact import" });
    checks.push({ pass: fs.existsSync(contactProfilePath), message: "contact enrichment source profile exists" });
    if (fs.existsSync(contactEnrichmentPath) && fs.existsSync(contactAssertionsPath) && fs.existsSync(contactProfilePath)) {
      const contactRecords = readJson(contactEnrichmentPath);
      const contactAssertions = readJson(contactAssertionsPath);
      const contactProfile = readJson(contactProfilePath);
      checks.push({ pass: Array.isArray(contactRecords) && contactRecords.length > 0 && contactRecords.every(hasContactEnrichmentFields), message: "contact enrichment intake rows are structured" });
      checks.push({ pass: contactRecords.every((row) => row.rocketreach_reveal_executed === false && row.external_lookup_executed === false && row.realnex_write_executed === false && row.outreach_executed === false && row.external_write_executed === false), message: "contact enrichment import executed no lookup/outreach/CRM actions" });
      checks.push({ pass: Array.isArray(contactAssertions) && contactAssertions.every(hasContactAssertionFields), message: "contact role assertions are structured" });
      checks.push({ pass: contactAssertions.every((row) => row.contact_use_allowed === false && row.outreach_ready === false && row.realnex_write_allowed === false && row.control_lead_claim_allowed === false && row.beneficial_owner_claim_allowed === false), message: "contact assertions are not outreach-ready and promote no control/beneficial-owner claims" });
      checks.push({ pass: contactAssertions.every((row) => contactRecords.some((record) => record.contact_enrichment_id === row.contact_enrichment_id)), message: "contact assertions match imported contact records" });
      checks.push({ pass: contactProfile.rocketreach_reveals_executed === 0 && contactProfile.external_lookups_executed === 0 && contactProfile.realnex_writes_executed === 0 && contactProfile.outreach_actions_executed === 0 && contactProfile.external_writes_executed === 0, message: "contact enrichment source profile records zero lookup/outreach/CRM actions" });
      checks.push({ pass: contactProfile.source_path_scope === "basename_only" && !String(contactProfile.source_path || "").includes("/"), message: "contact enrichment source profile stores basename-only source path" });
      checks.push({ pass: contactProfile.record_count === contactRecords.length && contactProfile.role_assertion_count === contactAssertions.length, message: "contact enrichment profile counts match artifacts" });
    }
  }
  if (manifest.last_current_status_import_at || fs.existsSync(currentStatusPath) || fs.existsSync(currentStatusAssertionsPath)) {
    checks.push({ pass: fs.existsSync(currentStatusPath), message: "current status intake exists after status import" });
    checks.push({ pass: fs.existsSync(currentStatusAssertionsPath), message: "current status assertions exist after status import" });
    checks.push({ pass: fs.existsSync(currentStatusProfilePath), message: "current status source profile exists" });
    if (fs.existsSync(currentStatusPath) && fs.existsSync(currentStatusAssertionsPath) && fs.existsSync(currentStatusProfilePath)) {
      const currentStatusRecords = readJson(currentStatusPath);
      const currentStatusAssertions = readJson(currentStatusAssertionsPath);
      const currentStatusProfile = readJson(currentStatusProfilePath);
      checks.push({ pass: Array.isArray(currentStatusRecords) && currentStatusRecords.length > 0 && currentStatusRecords.every(hasCurrentStatusIntakeFields), message: "current status intake rows are structured" });
      checks.push({ pass: currentStatusRecords.every((row) => row.provider_backfill_executed === false && row.external_lookup_executed === false && row.outreach_executed === false && row.external_write_executed === false), message: "current status import executed no provider lookup, outreach, or write actions" });
      checks.push({ pass: Array.isArray(currentStatusAssertions) && currentStatusAssertions.every(hasCurrentStatusAssertionFields), message: "current status assertions are structured" });
      checks.push({ pass: currentStatusAssertions.every((row) => row.current_status_use_allowed === false && row.current_status_urgency_claim_allowed === false && row.broker_action_ready === false && row.outreach_ready === false && row.provider_backfill_allowed === false && row.day_of_action_recheck_required === true), message: "current status assertions stay blocked until day-of-action recheck" });
      checks.push({ pass: currentStatusAssertions.every((row) => currentStatusRecords.some((record) => record.current_status_id === row.current_status_id)), message: "current status assertions match imported status records" });
      checks.push({ pass: currentStatusProfile.provider_backfills_executed === 0 && currentStatusProfile.external_lookups_executed === 0 && currentStatusProfile.outreach_actions_executed === 0 && currentStatusProfile.external_writes_executed === 0, message: "current status source profile records zero provider/outreach/write actions" });
      checks.push({ pass: currentStatusProfile.source_path_scope === "basename_only" && !String(currentStatusProfile.source_path || "").includes("/"), message: "current status source profile stores basename-only source path" });
      checks.push({ pass: currentStatusProfile.record_count === currentStatusRecords.length && currentStatusProfile.assertion_count === currentStatusAssertions.length, message: "current status profile counts match artifacts" });
      checks.push({ pass: currentStatusProfile.matched_record_count + currentStatusProfile.unmatched_record_count === currentStatusRecords.length, message: "current status profile match counts cover all rows" });
      checks.push({ pass: noAbsoluteLocalPathsInCurrentStatus(runFolder), message: "current status outputs contain no absolute local paths" });
    }
  }
  checks.push({ pass: approvals.length >= leads.length, message: "approval previews exist for every lead" });
  checks.push({ pass: auditEvents.length >= leads.length + 2, message: "audit events exist for parse, dedupe, and blocked decisions" });
  checks.push({ pass: queueDecisions.length >= leads.length, message: "queue decisions exist for every lead" });
  checks.push({ pass: packets.length === leads.length && packets.every((packet) => packet.packet_type !== "action_ready"), message: "broker packets exist and are not call-ready by default" });
  if (manifest.mode === "gmail_connector_preview") {
    checks.push({ pass: fs.existsSync(gmailConnectorProfilePath), message: "Gmail connector source profile exists for connector preview mode" });
    if (fs.existsSync(gmailConnectorProfilePath)) {
      const gmailProfile = readJson(gmailConnectorProfilePath);
      checks.push({ pass: gmailProfile.gmail_mutations_executed === 0 && gmailProfile.gmail_sends_executed === 0 && gmailProfile.external_writes_executed === 0, message: "Gmail connector preview executed no Gmail mutations, sends, or external writes" });
      checks.push({ pass: gmailProfile.parsed_row_count === parsedRows.length, message: "Gmail connector profile parsed row count matches parsed rows" });
      checks.push({ pass: parsedRows.length > 0 && leads.length > 0, message: "Gmail connector preview contains at least one parsed PropertyRadar lead" });
    }
  }
  if (manifest.last_lookup_mode === "monday_connector_lookup" || fs.existsSync(mondayConnectorProfilePath)) {
    checks.push({ pass: fs.existsSync(mondayConnectorProfilePath), message: "Monday connector source profile exists for connector lookup mode" });
    if (fs.existsSync(mondayConnectorProfilePath)) {
      const mondayProfile = readJson(mondayConnectorProfilePath);
      checks.push({ pass: mondayProfile.collection_mode === "monday_connector_lookup", message: "Monday connector profile records connector lookup mode" });
      checks.push({ pass: mondayProfile.monday_live_writes_executed === 0 && mondayProfile.write_actions_executed === 0 && mondayProfile.external_writes_executed === 0, message: "Monday connector lookup executed no Monday writes or external writes" });
      checks.push({ pass: mondayProfile.lookup_record_count > 0, message: "Monday connector lookup has at least one readable Monday item record" });
      checks.push({ pass: mondayProfile.source_path_scope === "basename_only" && !String(mondayProfile.source_path || "").includes("/"), message: "Monday connector profile stores basename-only source path" });
    }
    checks.push({ pass: lookupResults.every((row) => row.lookup_mode === "monday_connector_lookup"), message: "Monday connector lookup results are marked with connector lookup mode" });
  }
  checks.push({ pass: forbiddenZero(manifest), message: "forbidden action counts are zero" });
  checks.push({ pass: noCredentialLeaks(runFolder), message: "no configured credential values found in outputs" });

  const inputNames = (manifest.input_paths || []).join(" ");
  if (inputNames.includes("ken_kahan_digest_2026-05-30")) {
    const p15 = leads.find((lead) => lead.radar_id === "P15F1852");
    checks.push({ pass: parsedRows.length === 4, message: "Ken Kahan fixture parsed 4 raw rows" });
    checks.push({ pass: leads.length === 3, message: "Ken Kahan fixture produced 3 unique leads" });
    checks.push({ pass: Boolean(p15 && p15.source_events.length === 1 && p15.exact_duplicate_count === 1), message: "P15F1852 appears once and records one exact duplicate" });
  }
  if (inputNames.includes("southern_california_edge_cases_2026-05-30_excerpt")) {
    const repeated = leads.find((lead) => lead.radar_id === "P187C3F2");
    const bankruptcy = leads.find((lead) => lead.radar_id === "P12D8FEE");
    const multiline = leads.find((lead) => lead.radar_id === "P19F0A4C");
    checks.push({ pass: parsedRows.length === 7, message: "edge fixture parsed 7 raw rows" });
    checks.push({ pass: leads.length === 5, message: "edge fixture produced one lead per Radar ID" });
    checks.push({ pass: Boolean(repeated && repeated.source_events.length === 2), message: "same Radar ID with different events preserves multiple source_events" });
    checks.push({ pass: Boolean(multiline && multiline.source_events.some((event) => event.change_lines.length >= 2)), message: "multiline What Changed rows are preserved" });
    checks.push({ pass: Boolean(bankruptcy && bankruptcy.hard_hold && bankruptcy.outreach_readiness === "Blocked"), message: "bankruptcy/postponement row becomes a current-status hard hold" });
  }

  return makeReport(runFolder, "codex-monday-digest Verification", checks);
}

function hasParsedRowFields(row) {
  return ["source_id", "source_row_index", "radar_id", "street", "city", "zip", "state", "property_type", "what_changed", "change_lines"].every((field) => row[field] !== undefined && row[field] !== null && row[field] !== "");
}

function hasLeadFields(lead) {
  return [
    "dedupe_key",
    "radar_id",
    "item_name",
    "action",
    "stage",
    "priority",
    "current_status",
    "owner_confidence",
    "source_events",
    "exact_duplicate_count",
    "official_provider_status",
    "niche_research_status",
    "relationship_context_status",
    "suppression_status",
    "outreach_readiness",
    "broker_packet_status",
    "evidence_link",
    "allowed_action",
    "blocked_action",
    "blocked_action_detail",
    "hard_hold",
    "hard_hold_reason",
    "stale_after"
  ].every((field) => lead[field] !== undefined && lead[field] !== null);
}

function totalExactDuplicates(leads) {
  return leads.reduce((sum, lead) => sum + (lead.exact_duplicate_count || 0), 0);
}

function totalDistinctEvents(leads) {
  return leads.reduce((sum, lead) => sum + (lead.source_events || []).length, 0);
}

function noDuplicateRadarMutation(mutations) {
  const seen = new Set();
  for (const mutation of mutations) {
    const radarId = mutation.columns?.["Radar ID"];
    if (!radarId) continue;
    if (seen.has(radarId)) return false;
    seen.add(radarId);
  }
  return true;
}

function hasLookupFields(row) {
  return [
    "dedupe_key",
    "radar_id",
    "lookup_mode",
    "result",
    "match_count",
    "existing_item_id",
    "existing_item_ids",
    "existing_item_name",
    "existing_item_names",
    "board_id",
    "board_ids",
    "group_id",
    "group_ids",
    "error"
  ].every((field) => Object.prototype.hasOwnProperty.call(row, field));
}

function hasRequiredSubitems(lead, subitems) {
  const leadSubitems = subitems.filter((subitem) => subitem.lead_key === lead.dedupe_key).map((subitem) => subitem.task);
  const required = [
    "Verify current notice/status",
    "Owner/LLC disambiguation",
    "Official provider/control enrichment",
    "Relationship/suppression readiness"
  ];
  return required.every((task) => leadSubitems.includes(task)) && DEFAULT_SUBITEMS.length <= leadSubitems.length;
}

function hasActionQueueFields(row) {
  return ACTION_QUEUE_HEADERS.every((field) => Object.prototype.hasOwnProperty.call(row, field));
}

function actionQueueIsPreviewOnly(row) {
  return row.monday_write_executed === "false"
    && row.external_write_executed === "false"
    && row.control_claim_allowed === "false"
    && row.broker_ready === "false";
}

function hasActionQueueRowForSubitem(subitem, actionQueue) {
  return actionQueue.some((row) => {
    return row.lead_key === subitem.lead_key
      && row.queue_name === subitem.queue_name
      && row.task === subitem.task
      && (!subitem.approval_id || row.approval_id === subitem.approval_id);
  });
}

function hasActionQueueSourceRef(sourceRef, actionQueue) {
  return actionQueue.some((row) => row.source_ref === sourceRef);
}

function hasTitleProQueueFields(row) {
  return [
    "lead_key",
    "radar_id",
    "apn",
    "county",
    "address",
    "city",
    "requested_doc_type",
    "reason",
    "status",
    "approval_required",
    "approval_id",
    "cost_ceiling",
    "existing_evidence_path",
    "paid_action_allowed"
  ].every((field) => Object.prototype.hasOwnProperty.call(row, field));
}

function hasTitleProQueueLinks(lead, titleproQueue, subitems, queueDecisions) {
  const queueRow = titleproQueue.find((row) => row.lead_key === lead.dedupe_key);
  if (!queueRow || !queueRow.approval_id) return false;
  const titleproSubitem = subitems.find((subitem) => {
    return subitem.lead_key === lead.dedupe_key
      && subitem.task === "Pull/save approved TitlePro docs"
      && subitem.approval_id === queueRow.approval_id
      && subitem.status === "blocked";
  });
  const queueDecision = queueDecisions.find((decision) => {
    return decision.lead_key === lead.dedupe_key
      && decision.queue_name === "titlepro_approval"
      && decision.approval_id === queueRow.approval_id
      && decision.decision === "hold";
  });
  return Boolean(titleproSubitem && queueDecision);
}

function hasTitleProDecisionFields(row) {
  return [
    "source_row_index",
    "decision",
    "validation_errors",
    "approval_recorded",
    "paid_action_allowed",
    "pull_executed",
    "external_write_executed",
    "recorded_at"
  ].every((field) => Object.prototype.hasOwnProperty.call(row, field))
    && Array.isArray(row.validation_errors)
    && row.pull_executed === false
    && row.external_write_executed === false;
}

function hasApprovedTitleProPullFields(row) {
  return [
    "request_id",
    "approval_id",
    "lead_key",
    "radar_id",
    "requested_doc_type",
    "reason",
    "cost_ceiling",
    "approved_by",
    "approved_at",
    "status",
    "paid_action_allowed",
    "pull_executed",
    "external_write_executed",
    "evidence_destination",
    "next_action"
  ].every((field) => Object.prototype.hasOwnProperty.call(row, field))
    && row.status === "approved_pending_manual_titlepro_pull"
    && row.paid_action_allowed === true;
}

function hasTitleProActionConfirmationFields(row) {
  return [
    "source_row_index",
    "confirm_action",
    "confirmed_by",
    "requested_doc_type",
    "reason",
    "cost_ceiling",
    "validation_errors",
    "action_time_confirmed",
    "paid_action_allowed",
    "titlepro_pulls_executed",
    "browser_action_executed",
    "external_write_executed",
    "recorded_at"
  ].every((field) => Object.prototype.hasOwnProperty.call(row, field))
    && Array.isArray(row.validation_errors)
    && row.titlepro_pulls_executed === false
    && row.browser_action_executed === false
    && row.external_write_executed === false;
}

function hasConfirmedTitleProManualActionFields(row) {
  return [
    "confirmation_id",
    "request_id",
    "approval_id",
    "lead_key",
    "radar_id",
    "requested_doc_type",
    "reason",
    "cost_ceiling",
    "approved_cost_ceiling",
    "confirmed_by",
    "confirmed_at",
    "status",
    "paid_action_allowed",
    "titlepro_pulls_executed",
    "pull_executed",
    "browser_action_executed",
    "external_write_executed",
    "serial_execution_required",
    "duplicate_order_check_required",
    "evidence_destination",
    "next_action"
  ].every((field) => Object.prototype.hasOwnProperty.call(row, field))
    && row.status === "action_time_confirmed_pending_serial_titlepro_pull"
    && row.paid_action_allowed === true;
}

function hasTitleProEvidenceFields(row) {
  return [
    "evidence_id",
    "source_type",
    "titlepro_order_id",
    "property_address",
    "match_status",
    "titlepro_pulls_executed",
    "paid_action_executed",
    "external_write_executed",
    "saved_evidence"
  ].every((field) => Object.prototype.hasOwnProperty.call(row, field))
    && Array.isArray(row.saved_evidence);
}

function hasTitleProRoleAssertionFields(row) {
  return [
    "assertion_id",
    "evidence_id",
    "role",
    "role_category",
    "actor",
    "basis",
    "confidence",
    "service_actor",
    "title_owner_claim_allowed",
    "control_lead_claim_allowed",
    "beneficial_owner_claim_allowed",
    "outreach_ready",
    "broker_packet_note"
  ].every((field) => Object.prototype.hasOwnProperty.call(row, field));
}

function hasContactEnrichmentFields(row) {
  return [
    "contact_enrichment_id",
    "source_row_index",
    "lead_key",
    "radar_id",
    "property_address",
    "owner_entity",
    "contact_name",
    "contact_title",
    "company",
    "relationship_to_owner",
    "source_type",
    "source_url",
    "email",
    "phone",
    "linkedin_url",
    "confidence",
    "match_status",
    "rocketreach_reveal_executed",
    "external_lookup_executed",
    "realnex_write_executed",
    "outreach_executed",
    "external_write_executed"
  ].every((field) => Object.prototype.hasOwnProperty.call(row, field));
}

function hasContactAssertionFields(row) {
  return [
    "contact_assertion_id",
    "contact_enrichment_id",
    "lead_key",
    "radar_id",
    "match_status",
    "owner_entity",
    "contact_name",
    "contact_title",
    "company",
    "relationship_to_owner",
    "source_type",
    "has_email",
    "has_phone",
    "has_linkedin",
    "confidence",
    "service_actor",
    "role_category",
    "contact_use_allowed",
    "outreach_ready",
    "realnex_write_allowed",
    "control_lead_claim_allowed",
    "beneficial_owner_claim_allowed",
    "broker_approval_required",
    "basis",
    "broker_packet_note"
  ].every((field) => Object.prototype.hasOwnProperty.call(row, field))
    && row.broker_approval_required === true;
}

function hasCurrentStatusIntakeFields(row) {
  return [
    "current_status_id",
    "source_row_index",
    "lead_key",
    "radar_id",
    "subject",
    "property_address",
    "normalized_address_key",
    "provider",
    "case_or_file",
    "public_status",
    "status_summary",
    "sale_date",
    "status_as_of",
    "packet_interpretation",
    "confidence",
    "source_urls",
    "saved_evidence",
    "next_action",
    "notes",
    "provider_backfill_executed",
    "external_lookup_executed",
    "outreach_executed",
    "external_write_executed",
    "matched_radar_id",
    "match_status"
  ].every((field) => Object.prototype.hasOwnProperty.call(row, field))
    && Array.isArray(row.source_urls)
    && Array.isArray(row.saved_evidence);
}

function hasCurrentStatusAssertionFields(row) {
  return [
    "current_status_assertion_id",
    "current_status_id",
    "lead_key",
    "radar_id",
    "match_status",
    "provider",
    "case_or_file",
    "property_address",
    "public_status",
    "status_summary",
    "sale_date",
    "status_as_of",
    "confidence",
    "source_url_count",
    "saved_evidence_count",
    "current_status_use_allowed",
    "current_status_urgency_claim_allowed",
    "broker_action_ready",
    "outreach_ready",
    "provider_backfill_allowed",
    "day_of_action_recheck_required",
    "basis",
    "next_action"
  ].every((field) => Object.prototype.hasOwnProperty.call(row, field))
    && row.current_status_use_allowed === false
    && row.current_status_urgency_claim_allowed === false
    && row.broker_action_ready === false
    && row.outreach_ready === false
    && row.provider_backfill_allowed === false
    && row.day_of_action_recheck_required === true;
}

function hasMatchingRecordedTitleProDecision(pullRequest, decisions) {
  return decisions.some((decision) => {
    return decision.approval_recorded === true
      && decision.paid_action_allowed === true
      && decision.matched_approval_id === pullRequest.approval_id
      && decision.matched_lead_key === pullRequest.lead_key
      && decision.matched_radar_id === pullRequest.radar_id
      && decision.requested_doc_type === pullRequest.requested_doc_type
      && decision.reason === pullRequest.reason
      && decision.approved_by === pullRequest.approved_by;
  });
}

function hasMatchingTitleProConfirmation(action, confirmations, approvedPulls) {
  const approved = approvedPulls.some((pullRequest) => {
    return pullRequest.request_id === action.request_id
      && pullRequest.approval_id === action.approval_id
      && pullRequest.lead_key === action.lead_key
      && pullRequest.radar_id === action.radar_id
      && pullRequest.requested_doc_type === action.requested_doc_type
      && pullRequest.reason === action.reason;
  });
  const confirmed = confirmations.some((confirmation) => {
    return confirmation.action_time_confirmed === true
      && confirmation.matched_request_id === action.request_id
      && confirmation.matched_approval_id === action.approval_id
      && confirmation.matched_lead_key === action.lead_key
      && confirmation.matched_radar_id === action.radar_id
      && confirmation.confirmed_by === action.confirmed_by
      && confirmation.validation_errors.length === 0;
  });
  return approved && confirmed;
}

function noCredentialLeaks(runFolder) {
  const secretNames = [
    "MONDAY_API_TOKEN",
    "PROPERTYRADAR_PASSWORD",
    "PROPERTYRADAR_API_KEY",
    "TITLEPRO247_PASSWORD",
    "GMAIL_ACCOUNT",
    "COMPANY_GMAIL_USERNAME"
  ];
  const secrets = secretNames.map((name) => process.env[name]).filter((value) => value && String(value).length >= 8);
  if (!secrets.length) return true;
  const files = fs.readdirSync(runFolder).filter((file) => /\.(json|jsonl|md|txt|csv)$/i.test(file));
  for (const file of files) {
    const text = fs.readFileSync(path.join(runFolder, file), "utf8");
    if (secrets.some((secret) => text.includes(secret))) return false;
  }
  return true;
}

function verifyBatchRun(runFolder) {
  const checks = [];
  checkFiles(runFolder, BATCH_FILES, checks);
  if (checks.some((check) => !check.pass)) return makeReport(runFolder, "codex-monday-digest Batch Verification", checks);

  const profile = readJson(path.join(runFolder, "batch_source_profile.json"));
  const candidates = readJson(path.join(runFolder, "candidate_properties.json"));
  const clusters = readJson(path.join(runFolder, "owner_cluster_candidates.json"));
  const roleTasks = readJson(path.join(runFolder, "role_assertion_tasks.json"));
  const statusTasks = readJson(path.join(runFolder, "current_status_tasks.json"));
  const docTasks = readJson(path.join(runFolder, "document_pull_tasks.json"));
  const mondayPreview = readJson(path.join(runFolder, "monday_batch_preview.json"));
  const actionQueue = readActionQueueCsv(path.join(runFolder, "monday_action_queue.csv"));
  const manifest = readJson(path.join(runFolder, "run_manifest.json"));

  checks.push({ pass: profile.source_sha256 === manifest.source_sha256, message: "source SHA matches manifest" });
  checks.push({ pass: profile.parser_records_after_header >= profile.usable_property_rows, message: "parser row count covers usable property rows" });
  checks.push({ pass: profile.excluded_footer_rows >= 0, message: "excluded footer row count is recorded" });
  checks.push({ pass: profile.target_filter_rows >= candidates.length, message: "target rows are greater than or equal to APN-deduped candidates" });
  checks.push({ pass: profile.target_negative_equity_rows === candidates.filter((candidate) => candidate.negative_equity).length, message: "target negative-equity count matches candidates" });
  checks.push({ pass: profile.target_low_equity_rows_le_15pct_value === candidates.filter((candidate) => candidate.low_equity).length, message: "target low-equity count matches candidates" });
  checks.push({ pass: profile.exact_owner_groups_ge_2_target_properties === clusters.length, message: "exact owner group count matches cluster rows" });
  checks.push({ pass: profile.rows_in_exact_owner_groups_ge_2 >= clusters.length, message: "rows in exact owner groups covers cluster rows" });
  checks.push({ pass: manifest.counts?.candidate_properties === candidates.length, message: "manifest candidate count matches output" });
  checks.push({ pass: manifest.counts?.owner_cluster_candidates === clusters.length, message: "manifest owner-cluster count matches output" });
  checks.push({ pass: isSortedBySourceRow(candidates), message: "candidate_properties sorted by source row" });
  checks.push({ pass: candidates.every((candidate) => candidate.control_claim_allowed === false && candidate.broker_ready === false), message: "candidate properties are not broker-ready and allow no control claims" });
  checks.push({ pass: clusters.every((cluster) => cluster.control_claim_allowed === false && cluster.verification_status === "candidate_only"), message: "owner clusters are candidate_only with no control claims" });
  checks.push({ pass: roleTasks.length >= clusters.length && roleTasks.every((task) => task.task_type === "owner_string_candidate"), message: "role assertion tasks exist for owner-string clusters" });
  checks.push({ pass: statusTasks.length >= candidates.length, message: "current-status tasks exist for every candidate property" });
  checks.push({ pass: docTasks.length >= candidates.length, message: "document/identity decision tasks exist for every candidate property" });
  checks.push({ pass: actionQueue.length >= statusTasks.length + docTasks.length + roleTasks.length && actionQueue.every(hasActionQueueFields), message: "Monday action queue CSV includes batch status, document, and owner-control tasks" });
  checks.push({ pass: actionQueue.every(actionQueueIsPreviewOnly), message: "batch Monday action queue rows are preview-only with no writes, paid pulls, broker-ready status, or control claims" });
  checks.push({ pass: statusTasks.every((task) => hasActionQueueSourceRef(task.source_ref, actionQueue)) && docTasks.every((task) => hasActionQueueSourceRef(task.source_ref, actionQueue)), message: "every batch status/document task is represented in the Monday action queue" });
  checks.push({ pass: mondayPreview.length === candidates.length && mondayPreview.every((row) => row.operation === "preview_only" && row.broker_ready === false && row.control_claim_allowed === false), message: "Monday batch preview is one preview-only row per candidate" });
  checks.push({ pass: typeof profile.target_identity_rows_after_apn_dedupe === "number" && profile.target_identity_rows_after_apn_dedupe === candidates.length, message: "APN-aware identity count matches candidate properties" });
  checks.push({ pass: typeof profile.duplicate_target_apn_groups === "number" && typeof profile.duplicate_target_apn_rows === "number", message: "APN duplicate counters are present" });
  checks.push({ pass: candidates.every(hasCandidateIdentityFields), message: "candidate properties include APN/county identity fields" });
  if (profile.apn_column) {
    checks.push({ pass: candidates.filter((candidate) => candidate.normalized_apn).every((candidate) => candidate.dedupe_key.startsWith("apn:")), message: "candidates with APN use APN-based dedupe keys" });
    checks.push({ pass: candidates.every((candidate) => Array.isArray(candidate.source_row_indexes) && candidate.source_row_indexes.length >= 1), message: "APN-aware candidates preserve source row indexes" });
  }
  checks.push({ pass: manifest.mode === "local_dry_run", message: "batch run mode is local_dry_run" });
  checks.push({ pass: forbiddenZero(manifest), message: "forbidden action counts are zero" });
  checks.push({ pass: profile.control_claims_allowed_from_owner_string === 0, message: "control_claims_allowed_from_owner_string = 0" });
  checks.push({ pass: noCredentialLeaks(runFolder), message: "no configured credential values found in outputs" });

  if (profile.source_sha256 === "604fcf4e09602a1bec0740a727ffa68716ccb19259a1d7ff18446c3412a64f11") {
    checks.push({ pass: profile.parser_records_after_header === 608, message: "fixture parser records after header = 608" });
    checks.push({ pass: profile.usable_property_rows === 607, message: "fixture usable property rows = 607" });
    checks.push({ pass: profile.excluded_footer_rows === 1, message: "fixture excluded footer rows = 1" });
    checks.push({ pass: profile.target_filter_rows === 242 && candidates.length === 242, message: "fixture target filter and candidate_properties rows = 242" });
    checks.push({ pass: profile.target_negative_equity_rows === 102, message: "fixture target negative-equity rows = 102" });
    checks.push({ pass: profile.target_low_equity_rows_le_15pct_value === 123, message: "fixture target low-equity rows <= 15 percent value = 123" });
    checks.push({ pass: profile.exact_owner_groups_ge_2_target_properties === 8 && clusters.length === 8, message: "fixture exact owner groups with 2+ target properties = 8" });
    checks.push({ pass: profile.rows_in_exact_owner_groups_ge_2 === 21, message: "fixture rows in exact owner groups = 21" });
    const expectedOwners = new Set([
      "CONEJO RIVERSIDE GROUP LLC",
      "ALESSANDRO GROUP",
      "EUCLID HAZARD CAPITAL LLC",
      "ANASTASI,LLOYD R & L",
      "OWNER RECORD",
      "GALOIS GROUP LLC",
      "SDRES PARTNERS LLC",
      "T BK NA"
    ]);
    checks.push({ pass: clusters.every((cluster) => expectedOwners.has(cluster.owner_string)), message: "known fixture owner-cluster set matches expected owners" });
    checks.push({ pass: fixtureCandidateDiffs(candidates).length === 0, message: "candidate_properties match expected fixture row indexes, keys, and core fields" });
    checks.push({ pass: fixtureClusterDiffs(clusters).length === 0, message: "owner_cluster_candidates match expected fixture cluster summaries" });
    checks.push({ pass: batchNeedsReviewMinimums(runFolder), message: "batch needs_review includes footer, missing-address, owner-cluster, and estimate-only caveats" });
  }

  return makeReport(runFolder, "codex-monday-digest Batch Verification", checks);
}

function verifySourceAuditRun(runFolder) {
  const checks = [];
  checkFiles(runFolder, SOURCE_AUDIT_FILES, checks);
  if (checks.some((check) => !check.pass)) return makeReport(runFolder, "codex-monday-digest Source Audit Verification", checks);

  const audit = readJson(path.join(runFolder, "source_reuse_audit.json"));
  const recommendations = readJson(path.join(runFolder, "source_reuse_recommendations.json"));
  const riskScan = readJson(path.join(runFolder, "source_risk_scan.json"));
  const manifest = readJson(path.join(runFolder, "run_manifest.json"));
  const plan = fs.readFileSync(path.join(runFolder, "source_reuse_plan.md"), "utf8");

  checks.push({ pass: manifest.mode === "source_audit", message: "manifest records source_audit mode" });
  checks.push({ pass: forbiddenZero(manifest), message: "forbidden action counts are zero" });
  checks.push({ pass: audit.source_profile?.mode === "source_audit", message: "source profile records source_audit mode" });
  checks.push({ pass: audit.source_profile?.forbidden_actions && forbiddenZero(audit.source_profile), message: "source profile forbidden action counts are zero" });
  checks.push({ pass: Array.isArray(recommendations) && recommendations.length >= 5, message: "source reuse recommendations are present" });
  checks.push({ pass: recommendations.some((row) => row.id === "propertyradar_digest_parser" && row.matched), message: "PropertyRadar parser pattern is matched when present" });
  checks.push({ pass: recommendations.every(hasSourceRecommendationFields), message: "source reuse recommendations are structured" });
  checks.push({ pass: recommendations.every((row) => row.copy_strategy === "copy_pattern_not_source"), message: "recommendations copy patterns, not old source files" });
  checks.push({ pass: riskScan.secret_values_exposed === false && riskScan.secret_hits.every((hit) => hit.value_exposed === false), message: "secret scan exposes no secret values" });
  checks.push({ pass: Array.isArray(riskScan.risk_categories) && riskScan.risk_categories.every(hasRiskCategoryFields), message: "risk scan categories are structured" });
  checks.push({ pass: noAbsoluteLocalPathsInSourceAudit(runFolder), message: "source audit outputs contain no absolute local paths" });
  checks.push({ pass: !plan.includes("PASSWORD=") && !plan.includes("BEGIN PRIVATE KEY"), message: "source reuse plan contains no credential values" });
  checks.push({ pass: noCredentialLeaks(runFolder), message: "no configured credential values found in outputs" });

  return makeReport(runFolder, "codex-monday-digest Source Audit Verification", checks);
}

function verifyConnectorReadinessRun(runFolder) {
  const checks = [];
  checkFiles(runFolder, CONNECTOR_READINESS_FILES, checks);
  if (checks.some((check) => !check.pass)) return makeReport(runFolder, "codex-monday-digest Connector Readiness Verification", checks);

  const report = readJson(path.join(runFolder, "connector_readiness_report.json"));
  const gmailContract = readJson(path.join(runFolder, "gmail_connector_contract.json"));
  const mondayContract = readJson(path.join(runFolder, "monday_connector_contract.json"));
  const manifest = readJson(path.join(runFolder, "run_manifest.json"));
  const plan = fs.readFileSync(path.join(runFolder, "connector_readiness_plan.md"), "utf8");

  checks.push({ pass: manifest.mode === "connector_readiness", message: "manifest records connector_readiness mode" });
  checks.push({ pass: forbiddenZero(manifest), message: "forbidden action counts are zero" });
  checks.push({ pass: report.mode === "connector_readiness" && report.ready === true, message: "connector readiness report is ready" });
  checks.push({ pass: report.forbidden_actions && forbiddenZero(report), message: "connector readiness report forbidden action counts are zero" });
  checks.push({ pass: Array.isArray(report.checks) && report.checks.length >= 10 && report.checks.every(hasConnectorReadinessCheckFields), message: "connector readiness checks are structured" });
  checks.push({ pass: report.checks.every((check) => check.status === "ready"), message: "all connector readiness checks are ready" });
  checks.push({ pass: report.canonical_gmail_label === "CRE/PropertyRadar Alerts", message: "canonical Gmail label is CRE/PropertyRadar Alerts" });
  checks.push({ pass: Boolean(report.canonical_gmail_query) && report.canonical_gmail_query.includes("CRE/PropertyRadar Alerts"), message: "canonical Gmail query is recorded" });
  checks.push({ pass: report.gmail_source_profile?.source_path_scope === "basename_only" && !String(report.gmail_source_profile?.source_path || "").includes("/"), message: "Gmail readiness source path is basename-only" });
  checks.push({ pass: report.gmail_source_profile?.parsed_row_count > 0, message: "Gmail readiness parsed at least one PropertyRadar row" });
  checks.push({ pass: report.gmail_source_profile?.gmail_mutations_executed === 0 && report.gmail_source_profile?.gmail_sends_executed === 0 && report.gmail_source_profile?.external_writes_executed === 0, message: "Gmail readiness records zero Gmail mutations/sends/external writes" });
  checks.push({ pass: report.monday_source_profile?.source_path_scope === "basename_only" && !String(report.monday_source_profile?.source_path || "").includes("/"), message: "Monday readiness source path is basename-only" });
  checks.push({ pass: report.monday_source_profile?.board_count > 0 && report.monday_source_profile?.lookup_record_count > 0, message: "Monday readiness has board and item records" });
  checks.push({ pass: report.monday_source_profile?.record_with_item_board_group_ids_count === report.monday_source_profile?.lookup_record_count, message: "Monday readiness preserves item, board, and group IDs for every record" });
  checks.push({ pass: report.monday_source_profile?.monday_live_writes_executed === 0 && report.monday_source_profile?.write_actions_executed === 0 && report.monday_source_profile?.external_writes_executed === 0, message: "Monday readiness records zero Monday/external writes" });
  checks.push({ pass: gmailContract.connector === "gmail" && gmailContract.operation === "read_only_search_then_save_json", message: "Gmail connector contract records read-only save shape" });
  checks.push({ pass: mondayContract.connector === "monday" && mondayContract.operation === "read_only_board_items_then_save_json", message: "Monday connector contract records read-only save shape" });
  checks.push({ pass: noAbsoluteLocalPathsInConnectorReadiness(runFolder), message: "connector readiness outputs contain no absolute local paths" });
  checks.push({ pass: !plan.includes("Authorization:") && !plan.includes("PASSWORD="), message: "connector readiness plan contains no credential values" });
  checks.push({ pass: noCredentialLeaks(runFolder), message: "no configured credential values found in outputs" });

  return makeReport(runFolder, "codex-monday-digest Connector Readiness Verification", checks);
}

function verifyWorkflowMapRun(runFolder) {
  const checks = [];
  checkFiles(runFolder, WORKFLOW_MAP_FILES, checks);
  if (checks.some((check) => !check.pass)) return makeReport(runFolder, "codex-monday-digest Workflow Map Verification", checks);

  const workflowMap = readJson(path.join(runFolder, "monday_workflow_map.json"));
  const stageMap = readJson(path.join(runFolder, "monday_workflow_stage_map.json"));
  const sourceProfile = readJson(path.join(runFolder, "monday_workflow_source_profile.json"));
  const needsReview = readJson(path.join(runFolder, "needs_review.json"));
  const manifest = readJson(path.join(runFolder, "run_manifest.json"));
  const summary = fs.readFileSync(path.join(runFolder, "monday_workflow_summary.md"), "utf8");
  const workflows = workflowMap.workflows || [];

  checks.push({ pass: manifest.mode === "monday_workflow_map", message: "manifest records monday_workflow_map mode" });
  checks.push({ pass: forbiddenZero(manifest), message: "forbidden action counts are zero" });
  checks.push({ pass: workflowMap.schema_version === 1 && workflowMap.mode === "monday_workflow_map", message: "workflow map records schema version and monday_workflow_map mode" });
  checks.push({ pass: workflowMap.guardrails?.monday_live_writes_executed === 0 && workflowMap.guardrails?.external_writes_executed === 0 && workflowMap.guardrails?.control_claim_promotions === 0, message: "workflow map guardrails record zero writes/promotions" });
  checks.push({ pass: sourceProfile.mode === "monday_workflow_map", message: "source profile records monday_workflow_map mode" });
  checks.push({ pass: sourceProfile.forbidden_actions && forbiddenZero(sourceProfile), message: "source profile forbidden action counts are zero" });
  checks.push({ pass: sourceProfile.monday_live_writes_executed === 0 && sourceProfile.external_writes_executed === 0, message: "source profile records zero Monday/external writes" });
  checks.push({ pass: Array.isArray(workflows) && workflows.length > 0, message: "workflow map includes at least one workflow" });
  checks.push({ pass: workflows.every(hasWorkflowMapFields), message: "workflows are structured with basename-only source paths" });
  checks.push({ pass: workflows.every((workflow) => workflow.parent_task_count === workflow.parent_tasks.length), message: "workflow parent task counts match task arrays" });
  checks.push({ pass: workflows.every((workflow) => workflow.subitem_count === workflow.parent_tasks.reduce((sum, task) => sum + task.subitems.length, 0)), message: "workflow subitem counts match task arrays" });
  checks.push({ pass: Array.isArray(stageMap) && stageMap.length === workflowMap.parent_task_count && stageMap.every(hasWorkflowStageMapFields), message: "workflow stage map is flat and count-aligned" });
  checks.push({ pass: stageMap.every((stage) => stage.monday_live_writes_executed === 0 && stage.external_writes_executed === 0), message: "workflow stage map records zero writes" });
  checks.push({ pass: sourceProfile.parsed_workflow_count === workflows.length, message: "source profile workflow count matches map" });
  checks.push({ pass: sourceProfile.parent_task_count === workflowMap.parent_task_count && sourceProfile.subitem_count === workflowMap.subitem_count, message: "source profile counts match workflow map" });
  checks.push({ pass: sourceProfile.skipped_sheet_count === workflowMap.skipped_sheet_count && Array.isArray(sourceProfile.skipped_sheets), message: "source profile skipped-sheet count matches workflow map" });
  checks.push({ pass: Array.isArray(sourceProfile.sources) && sourceProfile.sources.length > 0 && sourceProfile.sources.every(hasWorkflowSourceFields), message: "workflow source profile stores basename-only source paths" });
  checks.push({ pass: Array.isArray(needsReview), message: "needs_review is structured as an array" });
  checks.push({ pass: summary.includes("Monday Workflow Map") && summary.includes("zero external actions"), message: "workflow summary documents local-only purpose" });
  checks.push({ pass: noAbsoluteLocalPathsInWorkflowMap(runFolder), message: "workflow map outputs contain no absolute local paths" });
  checks.push({ pass: !summary.includes("Authorization:") && !summary.includes("PASSWORD="), message: "workflow summary contains no credential values" });
  checks.push({ pass: noCredentialLeaks(runFolder), message: "no configured credential values found in outputs" });

  return makeReport(runFolder, "codex-monday-digest Workflow Map Verification", checks);
}

function hasWorkflowMapFields(workflow) {
  return [
    "workflow_id",
    "workflow_name",
    "template_name",
    "source_path",
    "source_path_scope",
    "source_sheet",
    "columns",
    "main_columns",
    "subitem_column_variants",
    "parent_task_count",
    "subitem_count",
    "parent_tasks"
  ].every((field) => Object.prototype.hasOwnProperty.call(workflow, field))
    && workflow.source_path_scope === "basename_only"
    && !String(workflow.source_path || "").includes("/")
    && Array.isArray(workflow.columns)
    && Array.isArray(workflow.main_columns)
    && Array.isArray(workflow.subitem_column_variants)
    && Array.isArray(workflow.parent_tasks)
    && workflow.parent_tasks.every(hasWorkflowParentTaskFields);
}

function hasWorkflowParentTaskFields(task) {
  return [
    "task_id",
    "source_row_index",
    "name",
    "person",
    "status",
    "date",
    "long_text",
    "action_count",
    "subitems"
  ].every((field) => Object.prototype.hasOwnProperty.call(task, field))
    && Array.isArray(task.subitems)
    && task.subitems.every(hasWorkflowSubitemFields);
}

function hasWorkflowSubitemFields(subitem) {
  return [
    "subitem_id",
    "source_row_index",
    "name",
    "owner",
    "status",
    "date",
    "long_text",
    "action_count"
  ].every((field) => Object.prototype.hasOwnProperty.call(subitem, field));
}

function hasWorkflowSourceFields(source) {
  return [
    "source_path",
    "source_path_scope",
    "source_sha256",
    "source_format",
    "sheet_count"
  ].every((field) => Object.prototype.hasOwnProperty.call(source, field))
    && source.source_path_scope === "basename_only"
    && !String(source.source_path || "").includes("/");
}

function hasWorkflowStageMapFields(stage) {
  return [
    "workflow_id",
    "workflow_name",
    "stage_id",
    "stage_order",
    "stage_name",
    "source_path",
    "source_path_scope",
    "source_sheet",
    "source_row_index",
    "status",
    "date",
    "subitem_count",
    "subitem_names",
    "long_text_present",
    "action_count",
    "monday_live_writes_executed",
    "external_writes_executed"
  ].every((field) => Object.prototype.hasOwnProperty.call(stage, field))
    && stage.source_path_scope === "basename_only"
    && !String(stage.source_path || "").includes("/")
    && Array.isArray(stage.subitem_names);
}

function noAbsoluteLocalPathsInWorkflowMap(runFolder) {
  const files = WORKFLOW_MAP_FILES.filter((file) => file !== "run_manifest.json");
  return files.every((file) => {
    const text = fs.readFileSync(path.join(runFolder, file), "utf8");
    return !hasAbsoluteLocalPath(text);
  });
}

function hasConnectorReadinessCheckFields(row) {
  return ["id", "status", "message"].every((field) => Object.prototype.hasOwnProperty.call(row, field));
}

function noAbsoluteLocalPathsInConnectorReadiness(runFolder) {
  const files = CONNECTOR_READINESS_FILES.filter((file) => file !== "run_manifest.json");
  return files.every((file) => {
    const text = fs.readFileSync(path.join(runFolder, file), "utf8");
    return !hasAbsoluteLocalPath(text);
  });
}

function noAbsoluteLocalPathsInCurrentStatus(runFolder) {
  const files = [
    "current_status_intake.json",
    "current_status_assertions_preview.json",
    "current_status_source_profile.json"
  ];
  return files.every((file) => {
    const text = fs.readFileSync(path.join(runFolder, file), "utf8");
    return !hasAbsoluteLocalPath(text);
  });
}

function hasSourceRecommendationFields(row) {
  return [
    "id",
    "matched",
    "matched_files",
    "useful_pattern",
    "treatment",
    "copy_strategy",
    "monday_lane_action",
    "implementation_status",
    "guardrail"
  ].every((field) => Object.prototype.hasOwnProperty.call(row, field))
    && Array.isArray(row.matched_files);
}

function hasRiskCategoryFields(row) {
  return [
    "id",
    "label",
    "count",
    "examples",
    "treatment"
  ].every((field) => Object.prototype.hasOwnProperty.call(row, field))
    && Array.isArray(row.examples);
}

function noAbsoluteLocalPathsInSourceAudit(runFolder) {
  const files = SOURCE_AUDIT_FILES.filter((file) => file !== "run_manifest.json");
  return files.every((file) => {
    const text = fs.readFileSync(path.join(runFolder, file), "utf8");
    return !hasAbsoluteLocalPath(text);
  });
}

function hasAbsoluteLocalPath(text) {
  return /\/Users\/|file:\/\/|(^|[\s"'])[A-Za-z]:[\\/][^\s"']*/.test(text);
}

function isSortedBySourceRow(candidates) {
  for (let i = 1; i < candidates.length; i += 1) {
    if (candidates[i - 1].source_row_index > candidates[i].source_row_index) return false;
  }
  return true;
}

function hasCandidateIdentityFields(candidate) {
  return [
    "source_row_indexes",
    "apn",
    "normalized_apn",
    "county",
    "identity_status",
    "duplicate_identity_count"
  ].every((field) => Object.prototype.hasOwnProperty.call(candidate, field));
}

function findFixtureFile(relativePath) {
  const candidates = [
    path.resolve(__dirname, "..", "..", relativePath),
    path.resolve(process.cwd(), relativePath)
  ];
  return candidates.find((file) => fs.existsSync(file));
}

function fixtureCandidateDiffs(candidates) {
  const fixture = findFixtureFile("outputs/cre_ops_blueprint/fixtures/propertyradar/batch_exports/export_20260526_091844_candidate_properties_expected.json");
  if (!fixture) return ["missing fixture"];
  const expected = readJson(fixture).candidate_properties || [];
  const fields = [
    "source_row_index",
    "property_key",
    "dedupe_key",
    "cluster_id",
    "type",
    "address",
    "city",
    "sq_ft",
    "est_value",
    "est_equity",
    "low_equity",
    "negative_equity",
    "owner_string",
    "owner_occ",
    "listed_for_sale",
    "identity_status",
    "control_claim_allowed",
    "broker_ready"
  ];
  return compareRows(candidates, expected, fields);
}

function fixtureClusterDiffs(clusters) {
  const fixture = findFixtureFile("outputs/cre_ops_blueprint/fixtures/propertyradar/batch_exports/export_20260526_091844_owner_clusters_expected.json");
  if (!fixture) return ["missing fixture"];
  const expected = readJson(fixture).owner_cluster_candidates || [];
  const fields = [
    "cluster_id",
    "owner_string",
    "match_method",
    "target_row_count",
    "negative_equity_count",
    "low_equity_count",
    "total_est_value",
    "total_est_equity",
    "control_claim_allowed",
    "verification_status"
  ];
  return compareRows(clusters, expected, fields);
}

function compareRows(actual, expected, fields) {
  const diffs = [];
  if (actual.length !== expected.length) diffs.push(`length ${actual.length} != ${expected.length}`);
  for (let i = 0; i < Math.min(actual.length, expected.length); i += 1) {
    for (const field of fields) {
      if (JSON.stringify(actual[i][field]) !== JSON.stringify(expected[i][field])) {
        diffs.push(`${i}.${field}`);
      }
    }
  }
  return diffs;
}

function batchNeedsReviewMinimums(runFolder) {
  const rows = readJson(path.join(runFolder, "needs_review.json"));
  const counts = rows.reduce((acc, row) => {
    acc[row.reason] = (acc[row.reason] || 0) + 1;
    return acc;
  }, {});
  return counts.footer_or_license_row >= 1
    && counts.missing_address_or_city >= 21
    && counts.owner_cluster_unverified >= 8
    && counts.estimate_only >= 1;
}

module.exports = {
  verifyRun,
  verifyDigestRun,
  verifyBatchRun,
  verifySourceAuditRun,
  verifyConnectorReadinessRun
};
