const fs = require("fs");
const path = require("path");
const { FORBIDDEN_ZERO, readJson } = require("./runtime");
const { REQUIRED_GATE_COLUMNS } = require("./monday-field-map");
const { DEFAULT_SUBITEMS } = require("./subitems");

const DIGEST_FILES = [
  "source_emails.json",
  "parsed_rows.json",
  "deduped_leads.json",
  "monday_lookup_results.json",
  "monday_mutations_preview.json",
  "monday_subitems_preview.json",
  "monday_comments_preview.json",
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
  const mutations = readJson(path.join(runFolder, "monday_mutations_preview.json"));
  const subitems = readJson(path.join(runFolder, "monday_subitems_preview.json"));
  const comments = readJson(path.join(runFolder, "monday_comments_preview.json"));
  const packets = readJson(path.join(runFolder, "broker_packets_preview.json"));
  const approvals = readJson(path.join(runFolder, "approval_events_preview.json"));
  const queueDecisions = readJson(path.join(runFolder, "queue_decisions_preview.json"));
  const manifest = readJson(path.join(runFolder, "run_manifest.json"));
  const auditEvents = parseJsonl(path.join(runFolder, "audit_events_preview.jsonl"));

  checks.push({ pass: Array.isArray(sourceEmails) && sourceEmails.length >= 1, message: "source_emails has at least one source" });
  checks.push({ pass: parsedRows.every(hasParsedRowFields), message: "all parsed rows have required fields" });
  checks.push({ pass: leads.every(hasLeadFields), message: "all deduped leads have required gate fields" });
  checks.push({ pass: leads.every((lead) => lead.evidence_link && lead.source_events?.length), message: "all deduped leads keep evidence links and source events" });
  checks.push({ pass: totalExactDuplicates(leads) === Math.max(0, parsedRows.length - totalDistinctEvents(leads)), message: "exact duplicate count is recorded separately from distinct events" });
  checks.push({ pass: noDuplicateRadarMutation(mutations), message: "no duplicate Monday mutation targets the same Radar ID" });
  checks.push({ pass: mutations.every((mutation) => REQUIRED_GATE_COLUMNS.every((column) => Object.prototype.hasOwnProperty.call(mutation.columns || {}, column))), message: "mutation previews include default gate columns" });
  checks.push({ pass: leads.every((lead) => hasRequiredSubitems(lead, subitems)), message: "every lead has current-status, owner/control, provider, and relationship subitems" });
  checks.push({ pass: comments.length >= leads.length, message: "comment previews exist for every lead" });
  checks.push({ pass: approvals.length >= leads.length, message: "approval previews exist for every lead" });
  checks.push({ pass: auditEvents.length >= leads.length + 2, message: "audit events exist for parse, dedupe, and blocked decisions" });
  checks.push({ pass: queueDecisions.length >= leads.length, message: "queue decisions exist for every lead" });
  checks.push({ pass: packets.length === leads.length && packets.every((packet) => packet.packet_type !== "action_ready"), message: "broker packets exist and are not call-ready by default" });
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
  const manifest = readJson(path.join(runFolder, "run_manifest.json"));

  checks.push({ pass: profile.source_sha256 === manifest.source_sha256, message: "source SHA matches manifest" });
  checks.push({ pass: profile.parser_records_after_header === 608, message: "parser records after header = 608" });
  checks.push({ pass: profile.usable_property_rows === 607, message: "usable property rows = 607" });
  checks.push({ pass: profile.excluded_footer_rows === 1, message: "excluded footer rows = 1" });
  checks.push({ pass: profile.target_filter_rows === 242 && candidates.length === 242, message: "target filter and candidate_properties rows = 242" });
  checks.push({ pass: profile.target_negative_equity_rows === 102, message: "target negative-equity rows = 102" });
  checks.push({ pass: profile.target_low_equity_rows_le_15pct_value === 123, message: "target low-equity rows <= 15 percent value = 123" });
  checks.push({ pass: profile.exact_owner_groups_ge_2_target_properties === 8 && clusters.length === 8, message: "exact owner groups with 2+ target properties = 8" });
  checks.push({ pass: profile.rows_in_exact_owner_groups_ge_2 === 21, message: "rows in exact owner groups = 21" });
  checks.push({ pass: isSortedBySourceRow(candidates), message: "candidate_properties sorted by source row" });
  checks.push({ pass: candidates.every((candidate) => candidate.control_claim_allowed === false && candidate.broker_ready === false), message: "candidate properties are not broker-ready and allow no control claims" });
  checks.push({ pass: clusters.every((cluster) => cluster.control_claim_allowed === false && cluster.verification_status === "candidate_only"), message: "owner clusters are candidate_only with no control claims" });
  checks.push({ pass: roleTasks.length >= clusters.length && roleTasks.every((task) => task.task_type === "owner_string_candidate"), message: "role assertion tasks exist for owner-string clusters" });
  checks.push({ pass: statusTasks.length >= candidates.length, message: "current-status tasks exist for every candidate property" });
  checks.push({ pass: docTasks.length >= candidates.length, message: "document/identity decision tasks exist for every candidate property" });
  checks.push({ pass: mondayPreview.length === candidates.length && mondayPreview.every((row) => row.operation === "preview_only" && row.broker_ready === false && row.control_claim_allowed === false), message: "Monday batch preview is one preview-only row per candidate" });
  checks.push({ pass: manifest.mode === "local_dry_run", message: "batch run mode is local_dry_run" });
  checks.push({ pass: forbiddenZero(manifest), message: "forbidden action counts are zero" });
  checks.push({ pass: profile.control_claims_allowed_from_owner_string === 0, message: "control_claims_allowed_from_owner_string = 0" });
  checks.push({ pass: noCredentialLeaks(runFolder), message: "no configured credential values found in outputs" });

  if (profile.source_sha256 === "604fcf4e09602a1bec0740a727ffa68716ccb19259a1d7ff18446c3412a64f11") {
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
