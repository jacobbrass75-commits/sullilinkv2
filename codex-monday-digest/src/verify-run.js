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

function verifyRun(runFolder) {
  const isBatch = fs.existsSync(path.join(runFolder, "batch_source_profile.json"));
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
    "group_id",
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
  verifyBatchRun
};
