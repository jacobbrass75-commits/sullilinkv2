const fs = require("fs");
const path = require("path");
const { readGmailConnectorPreviewFile } = require("./gmail-connector-preview");
const { readMondayConnectorLookupFile } = require("./monday-lookup");
const { FORBIDDEN_ZERO, ensureDir, nowIso, writeJson } = require("./runtime");

function buildConnectorReadiness({ gmailJson, mondayJson, label = "CRE/PropertyRadar Alerts", since = "2d", query }) {
  if (!gmailJson || !mondayJson) {
    throw new Error("connector-readiness requires --gmail-json and --monday-json");
  }
  const at = nowIso();
  const gmail = readGmailConnectorPreviewFile(gmailJson, { label, since, query });
  const monday = readMondayConnectorLookupFile(mondayJson);
  const gmailChecks = gmailReadinessChecks(gmail, { label, since, query });
  const mondayChecks = mondayReadinessChecks(monday);
  const checks = [...gmailChecks, ...mondayChecks, ...globalChecks(gmail, monday)];
  const ready = checks.every((check) => check.status === "ready");
  const report = {
    mode: "connector_readiness",
    generated_at: at,
    ready,
    canonical_gmail_label: label,
    canonical_gmail_since: since,
    canonical_gmail_query: query || `label:"${label}" newer_than:${since}`,
    gmail_source_profile: compactGmailProfile(gmail.sourceProfile),
    monday_source_profile: compactMondayProfile(monday),
    checks,
    forbidden_actions: { ...FORBIDDEN_ZERO }
  };
  return {
    report,
    gmail_contract: buildGmailContract(report, gmail),
    monday_contract: buildMondayContract(report, monday),
    plan_markdown: renderReadinessPlan(report)
  };
}

function gmailReadinessChecks(gmail, expected) {
  const profile = gmail.sourceProfile;
  const sourceEmails = gmail.sourceEmails || [];
  return [
    check("gmail_source_path_basename_only", profile.source_path_scope === "basename_only" && !String(profile.source_path || "").includes("/"), "Gmail connector source path is basename-only."),
    check("gmail_collection_mode_read_only", profile.collection_mode === "gmail_connector_preview", "Gmail connector result is consumed in preview/read-only mode."),
    check("gmail_canonical_label", profile.gmail_selector_label === expected.label, `Gmail selector label is ${expected.label}.`),
    check("gmail_canonical_window", profile.gmail_selector_since === expected.since, `Gmail selector window is ${expected.since}.`),
    check("gmail_query_recorded", Boolean(profile.gmail_query) && profile.gmail_query === (expected.query || `label:"${expected.label}" newer_than:${expected.since}`), "Gmail query is recorded exactly for repeat runs."),
    check("gmail_messages_present", profile.connector_record_count > 0 && profile.parsed_message_count > 0, "Gmail connector read includes message records."),
    check("gmail_propertyradar_rows_present", profile.parsed_row_count > 0, "Gmail connector read parses at least one PropertyRadar row."),
    check("gmail_message_ids_preserved", sourceEmails.every((source) => source.gmail_message_id && source.gmail_thread_id), "Gmail message and thread IDs are preserved."),
    check("gmail_contacts_redacted", sourceEmails.every((source) => noPlainContact(source.from) && noPlainContact(source.to)), "Gmail contacts are redacted to hashes."),
    check("gmail_no_mutations", profile.gmail_mutations_executed === 0 && profile.gmail_sends_executed === 0 && profile.external_writes_executed === 0, "Gmail connector preview executed no Gmail mutations, sends, or external writes.")
  ];
}

function mondayReadinessChecks(monday) {
  const records = monday.records || [];
  return [
    check("monday_source_path_basename_only", monday.source_path_scope === "basename_only" && !String(monday.source_path || "").includes("/"), "Monday connector source path is basename-only."),
    check("monday_collection_mode_read_only", monday.collection_mode === "monday_connector_lookup", "Monday connector result is consumed in lookup/read-only mode."),
    check("monday_boards_present", monday.board_count > 0, "Monday connector read includes at least one board."),
    check("monday_items_present", monday.lookup_record_count > 0 && records.length > 0, "Monday connector read includes item records."),
    check("monday_radar_ids_present", records.some((record) => record.radar_id), "At least one Monday item has a Radar ID."),
    check("monday_ids_preserved", records.every((record) => record.item_id && record.board_id && record.group_id), "Monday item, board, and group IDs are preserved."),
    check("monday_no_writes", monday.monday_live_writes_executed === 0 && monday.write_actions_executed === 0 && monday.external_writes_executed === 0, "Monday connector lookup executed no Monday writes or external writes.")
  ];
}

function globalChecks(gmail, monday) {
  return [
    check("external_writes_zero", gmail.sourceProfile.external_writes_executed === 0 && monday.external_writes_executed === 0, "Connector readiness performs no external writes."),
    check("saved_json_shapes_reusable", gmail.sourceProfile.parsed_row_count > 0 && monday.lookup_record_count > 0, "Saved connector JSON files are reusable by preview/sync commands.")
  ];
}

function compactGmailProfile(profile) {
  return {
    source_path: profile.source_path,
    source_path_scope: profile.source_path_scope,
    source_sha256: profile.source_sha256,
    source_format: profile.source_format,
    collection_mode: profile.collection_mode,
    gmail_selector_label: profile.gmail_selector_label,
    gmail_selector_since: profile.gmail_selector_since,
    gmail_query: profile.gmail_query,
    connector_record_count: profile.connector_record_count,
    parsed_message_count: profile.parsed_message_count,
    parsed_row_count: profile.parsed_row_count,
    unmatched_message_count: profile.unmatched_message_count,
    gmail_mutations_executed: profile.gmail_mutations_executed,
    gmail_sends_executed: profile.gmail_sends_executed,
    external_writes_executed: profile.external_writes_executed
  };
}

function compactMondayProfile(monday) {
  const records = monday.records || [];
  return {
    source_path: monday.source_path,
    source_path_scope: monday.source_path_scope,
    source_sha256: monday.source_sha256,
    source_format: monday.source_format,
    collection_mode: monday.collection_mode,
    board_count: monday.board_count,
    lookup_record_count: monday.lookup_record_count,
    record_with_radar_id_count: records.filter((record) => record.radar_id).length,
    record_with_item_board_group_ids_count: records.filter((record) => record.item_id && record.board_id && record.group_id).length,
    monday_live_writes_executed: monday.monday_live_writes_executed,
    write_actions_executed: monday.write_actions_executed,
    external_writes_executed: monday.external_writes_executed
  };
}

function buildGmailContract(report, gmail) {
  return {
    connector: "gmail",
    operation: "read_only_search_then_save_json",
    canonical_label: report.canonical_gmail_label,
    canonical_since: report.canonical_gmail_since,
    canonical_query: report.canonical_gmail_query,
    expected_saved_json_shapes: [
      "messages[].id",
      "messages[].thread_id or messages[].threadId",
      "messages[].subject",
      "messages[].body/html/text with full PropertyRadar table"
    ],
    next_runner_command: "node src/cli.js preview --gmail-json GMAIL_CONNECTOR_READ.json --label \"CRE/PropertyRadar Alerts\" --since 2d --mode gmail_connector_preview --out RUN_FOLDER",
    parsed_row_count: gmail.sourceProfile.parsed_row_count,
    mutation_policy: {
      gmail_mutations_executed: 0,
      gmail_sends_executed: 0,
      external_writes_executed: 0
    }
  };
}

function buildMondayContract(report, monday) {
  return {
    connector: "monday",
    operation: "read_only_board_items_then_save_json",
    expected_saved_json_shapes: [
      "boards[].id/name with groups/items",
      "items[].id/name/group/board",
      "items[].column_values[] containing Radar ID text"
    ],
    next_runner_command: "node src/cli.js sync --run RUN_FOLDER --mode monday_lookup_dry_run --connector-json MONDAY_CONNECTOR_READ.json",
    board_count: monday.board_count,
    lookup_record_count: monday.lookup_record_count,
    id_preservation_required: ["item_id", "board_id", "group_id", "radar_id"],
    mutation_policy: {
      monday_live_writes_executed: 0,
      write_actions_executed: 0,
      external_writes_executed: 0
    }
  };
}

function renderReadinessPlan(report) {
  const status = report.ready ? "READY" : "NOT READY";
  const failed = report.checks.filter((check) => check.status !== "ready");
  const lines = [
    "# Connector Readiness",
    "",
    `Status: ${status}`,
    `Generated: ${report.generated_at}`,
    "",
    "## Gmail",
    `- Label: ${report.canonical_gmail_label}`,
    `- Window: ${report.canonical_gmail_since}`,
    `- Query: ${report.canonical_gmail_query}`,
    `- Parsed rows: ${report.gmail_source_profile.parsed_row_count}`,
    "",
    "## Monday",
    `- Boards: ${report.monday_source_profile.board_count}`,
    `- Lookup records: ${report.monday_source_profile.lookup_record_count}`,
    `- Records with item/board/group IDs: ${report.monday_source_profile.record_with_item_board_group_ids_count}`,
    "",
    "## Failed Checks",
    ...(failed.length ? failed.map((row) => `- ${row.id}: ${row.message}`) : ["- None"]),
    "",
    "## Next Commands",
    "- node src/cli.js preview --gmail-json GMAIL_CONNECTOR_READ.json --label \"CRE/PropertyRadar Alerts\" --since 2d --mode gmail_connector_preview --out RUN_FOLDER",
    "- node src/cli.js sync --run RUN_FOLDER --mode monday_lookup_dry_run --connector-json MONDAY_CONNECTOR_READ.json",
    "",
    "## Safety",
    "- Connector reads are saved JSON inputs only.",
    "- No Gmail labels, archives, drafts, sends, Monday writes, or external writes are executed by this runner."
  ];
  return lines.join("\n") + "\n";
}

function writeConnectorReadinessRun(outDir, readiness) {
  ensureDir(outDir);
  const outputPaths = [
    path.join(outDir, "connector_readiness_report.json"),
    path.join(outDir, "gmail_connector_contract.json"),
    path.join(outDir, "monday_connector_contract.json"),
    path.join(outDir, "connector_readiness_plan.md")
  ];
  writeJson(outputPaths[0], readiness.report);
  writeJson(outputPaths[1], readiness.gmail_contract);
  writeJson(outputPaths[2], readiness.monday_contract);
  fs.writeFileSync(outputPaths[3], readiness.plan_markdown);
  writeJson(path.join(outDir, "run_manifest.json"), {
    run_id: path.basename(path.resolve(outDir)).replace(/[^a-zA-Z0-9_-]+/g, "_") || "connector_readiness",
    started_at: readiness.report.generated_at,
    mode: "connector_readiness",
    input_paths: [
      `gmail_connector_json:${readiness.report.gmail_source_profile.source_path}:${readiness.report.gmail_source_profile.source_sha256.slice(0, 16)}`,
      `monday_connector_json:${readiness.report.monday_source_profile.source_path}:${readiness.report.monday_source_profile.source_sha256.slice(0, 16)}`
    ],
    output_paths: [...outputPaths, path.join(outDir, "run_manifest.json")],
    forbidden_actions: { ...FORBIDDEN_ZERO },
    counts: {
      gmail_parsed_rows: readiness.report.gmail_source_profile.parsed_row_count,
      monday_lookup_records: readiness.report.monday_source_profile.lookup_record_count,
      readiness_check_count: readiness.report.checks.length,
      readiness_failed_check_count: readiness.report.checks.filter((check) => check.status !== "ready").length
    }
  });
}

function check(id, condition, message) {
  return {
    id,
    status: condition ? "ready" : "not_ready",
    message
  };
}

function noPlainContact(value) {
  if (!value) return true;
  return !String(value).includes("@") && !String(value).includes("<");
}

module.exports = {
  buildConnectorReadiness,
  writeConnectorReadinessRun
};
