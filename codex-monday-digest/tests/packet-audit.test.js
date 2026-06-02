const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { packetAuditCommand, verifyCommand } = require("../src/cli");
const { buildPacketAudit } = require("../src/packet-audit");

function repoRoot() {
  return path.resolve(__dirname, "..", "..");
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

test("packet-audit verifies the current shareable broker packet", () => {
  const root = repoRoot();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "packet-audit-"));
  const out = path.join(tmp, "run");

  packetAuditCommand({
    "packet-dir": path.join(root, "broker_packet"),
    out
  });
  verifyCommand({ run: out });

  const report = readJson(path.join(out, "packet_audit_report.json"));
  assert.equal(report.passed, true);
  assert.equal(report.forbidden_files.length, 0);
  assert.equal(report.claim_audit.beneficial_owner_overclaim_count, 0);
  assert.ok(report.required_files.every((file) => file.exists && file.sha256));
  assert.ok(report.scans.some((scan) => scan.relative_path.endsWith(".xlsx") && scan.scanned_text_units > 0));
});

test("packet-audit flags beneficial-owner overclaims", () => {
  const root = repoRoot();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "packet-audit-overclaim-"));
  copyFile(path.join(root, "broker_packet", "broker_owner_control_report.html"), path.join(tmp, "broker_owner_control_report.html"));
  copyFile(path.join(root, "broker_packet", "owner_disambiguation_packet.xlsx"), path.join(tmp, "owner_disambiguation_packet.xlsx"));
  copyFile(path.join(root, "broker_packet", "monday_action_queue.csv"), path.join(tmp, "monday_action_queue.csv"));
  copyFile(path.join(root, "broker_packet", "owner_disambiguation_report.md"), path.join(tmp, "owner_disambiguation_report.md"));
  writeJson(path.join(tmp, "supporting", "manifest.json"), {
    dirs: {
      runDir: "raw_run_not_included",
      documents: "raw_run_not_included/documents",
      evidence: "raw_run_not_included/evidence"
    }
  });
  writeJson(path.join(tmp, "supporting", "owner_disambiguation_packets.json"), {
    packets: [{
      cluster_id: "bad",
      likely_control_lead: "Someone",
      source_summary: "Recorded document evidence exists for this fixture overclaim row.",
      saved_evidence: ["evidence/example.pdf"],
      confidence: "High confidence",
      beneficial_owner_status: "Proven",
      next_verification: "Review current official evidence before action."
    }]
  });

  const audit = buildPacketAudit({ packetDir: tmp });
  assert.equal(audit.passed, false);
  assert.equal(audit.claim_audit.beneficial_owner_overclaim_count, 1);
});

function copyFile(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
