const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { sourceAuditCommand, verifyCommand } = require("../src/cli");
const { readZipEntryNames } = require("../src/source-reuse-audit");

test("source-audit maps SullyLink references without exposing old secrets or local paths", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "source-audit-"));
  const sourceDir = path.join(root, "external_references");
  mkdirWrite(path.join(sourceDir, "retranToReel", "CODEBASE_GUIDE.md"), "# Guide\nTitlePro worker queue.\n");
  mkdirWrite(path.join(sourceDir, "retranToReel", "daily_update.py"), "print('daily import')\n");
  mkdirWrite(path.join(sourceDir, "retranToReel", "recDocReader", "reader.py"), "SCHEMA = ['trustee', 'beneficiary']\n");
  mkdirWrite(path.join(sourceDir, "retranToReel", ".env"), "PASSWORD=<redacted-fixture-value>\n");
  mkdirWrite(path.join(sourceDir, "sullilink", "src", "import-export", "propertyradar-alerts.js"), "export function parse() {}\n");
  mkdirWrite(path.join(sourceDir, "sullilink", "src", "entities", "cluster.js"), "export function cluster() {}\n");
  mkdirWrite(path.join(sourceDir, "sullilink", "node_modules", "pkg", "index.js"), "module.exports = {};\n");
  mkdirWrite(path.join(sourceDir, "sullilink", "raw", "old-contact-export.csv"), "name,email\n");
  const zipPath = path.join(root, "retranToReel_codebase_fixture.zip");
  fs.writeFileSync(zipPath, makeTinyZip([
    "retranToReel/dedupe_spreadsheet.py",
    "retranToReel/retran_scraper.py",
    "retranToReel/recDocReader/5540-021-001_rec-250084662.pdf",
    "retranToReel/.env"
  ]));
  const goalMd = path.join(root, "TONIGHT_BUILD_GOAL.md");
  fs.writeFileSync(goalMd, "# Tonight Build Goal\nUse Monday, PropertyRadar, TitlePro, and approval-gated paid pulls.\n");
  const out = path.join(root, "run");

  assert.equal(readZipEntryNames(zipPath).length, 4);
  sourceAuditCommand({ zip: zipPath, "source-dir": sourceDir, "goal-md": goalMd, out });
  verifyCommand({ run: out });

  const recommendations = JSON.parse(fs.readFileSync(path.join(out, "source_reuse_recommendations.json"), "utf8"));
  const contract = JSON.parse(fs.readFileSync(path.join(out, "source_reuse_contract.json"), "utf8"));
  const risks = JSON.parse(fs.readFileSync(path.join(out, "source_risk_scan.json"), "utf8"));
  const auditText = fs.readFileSync(path.join(out, "source_reuse_audit.json"), "utf8");
  const planText = fs.readFileSync(path.join(out, "source_reuse_plan.md"), "utf8");
  const byId = Object.fromEntries(recommendations.map((row) => [row.id, row]));
  const lanesById = Object.fromEntries(contract.lanes.map((row) => [row.pattern_id, row]));
  assert.equal(byId.propertyradar_digest_parser.matched, true);
  assert.equal(byId.apn_dedupe.matched, true);
  assert.equal(byId.recording_document_schema.matched, true);
  assert.equal(byId.titlepro_serial_worker.copy_strategy, "copy_pattern_not_source");
  assert.equal(contract.mode, "sullilink_pattern_contract");
  assert.ok(lanesById.propertyradar_digest_parser.current_runner_surface.includes("preview --gmail-json"));
  assert.ok(lanesById.propertyradar_digest_parser.proof_scripts.includes("proof:gmail-connector"));
  assert.ok(lanesById.apn_dedupe.current_runner_surface.includes("batch-owner-clusters"));
  assert.ok(lanesById.apn_dedupe.proof_scripts.includes("proof:batch"));
  assert.ok(lanesById.titlepro_serial_worker.current_runner_surface.includes("titlepro-confirm"));
  assert.ok(lanesById.titlepro_serial_worker.blocked_actions.includes("paid_action"));
  assert.match(planText, /Runner Contract/);
  assert.ok(risks.risk_categories.some((row) => row.id === "env_or_credentials"));
  assert.ok(risks.risk_categories.some((row) => row.id === "dependency_tree"));
  assert.ok(risks.secret_hits.some((hit) => hit.file.endsWith(".env") && hit.value_exposed === false));
  assert.equal(risks.secret_values_exposed, false);
  assert.doesNotMatch(auditText, /\/Users\//);
  assert.doesNotMatch(auditText, /redacted-fixture-value/);
});

function mkdirWrite(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function makeTinyZip(names) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const name of names) {
    const nameBuffer = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(nameBuffer.length, 26);
    locals.push(Buffer.concat([local, nameBuffer]));

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, nameBuffer]));
    offset += local.length + nameBuffer.length;
  }
  const centralOffset = offset;
  const centralSize = centrals.reduce((sum, row) => sum + row.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(names.length, 8);
  eocd.writeUInt16LE(names.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([...locals, ...centrals, eocd]);
}
