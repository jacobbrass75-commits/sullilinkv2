const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { connectorReadinessCommand, verifyCommand } = require("../src/cli");

test("connector-readiness validates canonical Gmail and Monday read-only saved JSON", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "connector-readiness-"));
  const out = path.join(tmp, "run");
  const gmailJson = path.join(__dirname, "..", "fixtures", "gmail_connector_read_sample.json");
  const mondayJson = path.join(__dirname, "..", "fixtures", "monday_connector_items_sample.json");

  connectorReadinessCommand({
    "gmail-json": gmailJson,
    "monday-json": mondayJson,
    label: "CRE/PropertyRadar Alerts",
    since: "30d",
    out
  });
  verifyCommand({ run: out });

  const report = JSON.parse(fs.readFileSync(path.join(out, "connector_readiness_report.json"), "utf8"));
  const gmailContract = JSON.parse(fs.readFileSync(path.join(out, "gmail_connector_contract.json"), "utf8"));
  const mondayContract = JSON.parse(fs.readFileSync(path.join(out, "monday_connector_contract.json"), "utf8"));
  const manifest = JSON.parse(fs.readFileSync(path.join(out, "run_manifest.json"), "utf8"));
  const reportText = fs.readFileSync(path.join(out, "connector_readiness_report.json"), "utf8");

  assert.equal(report.ready, true);
  assert.equal(report.canonical_gmail_label, "CRE/PropertyRadar Alerts");
  assert.equal(report.canonical_gmail_query, "label:\"CRE/PropertyRadar Alerts\" newer_than:30d");
  assert.equal(report.gmail_source_profile.source_path, "gmail_connector_read_sample.json");
  assert.equal(report.gmail_source_profile.parsed_row_count, 3);
  assert.equal(report.gmail_source_profile.gmail_mutations_executed, 0);
  assert.equal(report.monday_source_profile.source_path, "monday_connector_items_sample.json");
  assert.equal(report.monday_source_profile.board_count, 1);
  assert.equal(report.monday_source_profile.lookup_record_count, 4);
  assert.equal(report.monday_source_profile.record_with_item_board_group_ids_count, 4);
  assert.equal(gmailContract.operation, "read_only_search_then_save_json");
  assert.equal(mondayContract.operation, "read_only_board_items_then_save_json");
  assert.equal(manifest.mode, "connector_readiness");
  assert.equal(manifest.forbidden_actions.monday_live_writes, 0);
  assert.equal(manifest.forbidden_actions.gmail_writes_or_sends, 0);
  assert.doesNotMatch(reportText, /\/Users\//);
  assert.doesNotMatch(reportText, /broker@example\.com|ops@example\.com/);
});
