const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parseCommand, syncCommand } = require("../src/cli");
const { lookupLeads, normalizeRadarId, readLookupFile, readMondayConnectorLookupFile } = require("../src/monday-lookup");
const { verifyRun } = require("../src/verify-run");

function writeLookupCsv(tmp) {
  const file = path.join(tmp, "monday-board-export.csv");
  fs.writeFileSync(file, [
    "Item ID,Name,Radar ID,Group ID",
    "1001,P15F1852 - 2701 STATHAM BLVD,P15F1852,new-leads",
    "1002,P1555F5F - 16757 SLOVER AVE,P1555F5F,new-leads",
    "1003,P1555F5F duplicate,P1555F5F,new-leads",
    "1004,Unrelated lead,P9999999,new-leads"
  ].join("\n"));
  return file;
}

test("read-only Monday lookup file matches generated leads by Radar ID", () => {
  assert.equal(normalizeRadarId("Radar: P15F1852"), "P15F1852");

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "codex-monday-lookup-"));
  const lookupFile = writeLookupCsv(tmp);
  const lookupSource = readLookupFile(lookupFile);
  assert.equal(lookupSource.records.length, 4);

  const leads = [
    { dedupe_key: "radar_id:P15F1852", radar_id: "P15F1852" },
    { dedupe_key: "radar_id:P1555F5F", radar_id: "P1555F5F" },
    { dedupe_key: "radar_id:P17C6EDA", radar_id: "P17C6EDA" }
  ];
  const rows = lookupLeads(leads, lookupSource.records, "monday_lookup_file");
  assert.equal(rows[0].result, "matched");
  assert.equal(rows[0].existing_item_id, "1001");
  assert.equal(rows[1].result, "duplicate_match");
  assert.deepEqual(rows[1].existing_item_ids, ["1002", "1003"]);
  assert.equal(rows[2].result, "not_found");
});

test("sync command writes read-only Monday lookup results from a board export", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "codex-monday-sync-"));
  const out = path.join(tmp, "run");
  const lookupFile = writeLookupCsv(tmp);
  const fixture = path.join(__dirname, "..", "fixtures", "ken_kahan_digest_2026-05-30.txt");

  parseCommand({ input: fixture, mode: "local_dry_run", out });
  syncCommand({ run: out, mode: "monday_lookup_dry_run", "lookup-file": lookupFile });

  const results = JSON.parse(fs.readFileSync(path.join(out, "monday_lookup_results.json"), "utf8"));
  const profile = JSON.parse(fs.readFileSync(path.join(out, "monday_lookup_source_profile.json"), "utf8"));
  const manifest = JSON.parse(fs.readFileSync(path.join(out, "run_manifest.json"), "utf8"));
  assert.equal(results.length, 3);
  assert.equal(results.find((row) => row.radar_id === "P15F1852").result, "matched");
  assert.equal(results.find((row) => row.radar_id === "P1555F5F").result, "duplicate_match");
  assert.equal(results.find((row) => row.radar_id === "P17C6EDA").result, "not_found");
  assert.equal(profile.lookup_record_count, 4);
  assert.equal(profile.write_actions_executed, 0);
  assert.equal(manifest.forbidden_actions.monday_live_writes, 0);
  assert.ok(manifest.output_paths.some((outputPath) => outputPath.endsWith("monday_lookup_source_profile.json")));

  const verification = verifyRun(out);
  assert.equal(verification.passed, true, verification.report);
  assert.match(verification.report, /Monday lookup results exist with required read-only fields/);
});

test("sync command writes read-only Monday connector lookup results from saved connector JSON", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "codex-monday-connector-sync-"));
  const out = path.join(tmp, "run");
  const connectorJson = path.join(__dirname, "..", "fixtures", "monday_connector_items_sample.json");
  const fixture = path.join(__dirname, "..", "fixtures", "ken_kahan_digest_2026-05-30.txt");
  const connectorSource = readMondayConnectorLookupFile(connectorJson);

  assert.equal(connectorSource.source_path, "monday_connector_items_sample.json");
  assert.equal(connectorSource.source_path_scope, "basename_only");
  assert.equal(connectorSource.collection_mode, "monday_connector_lookup");
  assert.equal(connectorSource.board_count, 1);
  assert.equal(connectorSource.lookup_record_count, 4);
  assert.equal(connectorSource.monday_live_writes_executed, 0);

  parseCommand({ input: fixture, mode: "local_dry_run", out });
  syncCommand({ run: out, mode: "monday_lookup_dry_run", "connector-json": connectorJson });

  const results = JSON.parse(fs.readFileSync(path.join(out, "monday_lookup_results.json"), "utf8"));
  const profile = JSON.parse(fs.readFileSync(path.join(out, "monday_connector_source_profile.json"), "utf8"));
  const manifest = JSON.parse(fs.readFileSync(path.join(out, "run_manifest.json"), "utf8"));
  const p15 = results.find((row) => row.radar_id === "P15F1852");
  const p1555 = results.find((row) => row.radar_id === "P1555F5F");
  const p17 = results.find((row) => row.radar_id === "P17C6EDA");

  assert.equal(results.length, 3);
  assert.equal(p15.lookup_mode, "monday_connector_lookup");
  assert.equal(p15.result, "matched");
  assert.equal(p15.existing_item_id, "5001");
  assert.equal(p15.board_id, "board-4242");
  assert.equal(p15.group_id, "new-leads");
  assert.equal(p1555.result, "duplicate_match");
  assert.deepEqual(p1555.existing_item_ids, ["5002", "5003"]);
  assert.deepEqual(p1555.board_ids, ["board-4242"]);
  assert.deepEqual(p1555.group_ids, ["new-leads", "duplicates"]);
  assert.equal(p17.result, "not_found");
  assert.equal(profile.lookup_record_count, 4);
  assert.equal(Object.prototype.hasOwnProperty.call(profile, "records"), false);
  assert.equal(profile.matched_lead_count, 1);
  assert.equal(profile.duplicate_match_lead_count, 1);
  assert.equal(profile.not_found_lead_count, 1);
  assert.equal(profile.write_actions_executed, 0);
  assert.equal(profile.external_writes_executed, 0);
  assert.equal(manifest.last_lookup_mode, "monday_connector_lookup");
  assert.equal(manifest.forbidden_actions.monday_live_writes, 0);
  assert.ok(manifest.output_paths.some((outputPath) => outputPath.endsWith("monday_connector_source_profile.json")));

  const verification = verifyRun(out);
  assert.equal(verification.passed, true, verification.report);
  assert.match(verification.report, /Monday connector lookup executed no Monday writes or external writes/);
});

test("Monday connector lookup parses bare item arrays once without false duplicates", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "codex-monday-array-connector-"));
  const input = path.join(tmp, "array-items.json");
  fs.writeFileSync(input, JSON.stringify([
    {
      id: "6001",
      name: "P15F1852 - 2701 STATHAM BLVD",
      board: { id: "board-4242" },
      group: { id: "new-leads", title: "New Leads" },
      column_values: [
        { id: "radar_id", title: "Radar ID", text: "P15F1852" }
      ]
    }
  ], null, 2));

  const connectorSource = readMondayConnectorLookupFile(input);
  assert.equal(connectorSource.lookup_record_count, 1);
  assert.deepEqual(connectorSource.records.map((record) => ({
    radar_id: record.radar_id,
    item_id: record.item_id,
    board_id: record.board_id,
    group_id: record.group_id
  })), [
    { radar_id: "P15F1852", item_id: "6001", board_id: "board-4242", group_id: "new-leads" }
  ]);

  const rows = lookupLeads([
    { dedupe_key: "radar_id:P15F1852", radar_id: "P15F1852" }
  ], connectorSource.records, "monday_connector_lookup");
  assert.equal(rows[0].result, "matched");
  assert.equal(rows[0].match_count, 1);
  assert.deepEqual(rows[0].existing_item_ids, ["6001"]);
});
