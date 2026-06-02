const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { goalAuditCommand, verifyCommand } = require("../src/cli");
const { buildGoalAudit, extractAcceptanceGates } = require("../src/goal-audit");

function repoRoot() {
  return path.resolve(__dirname, "..", "..");
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

test("goal-audit maps every current acceptance gate without claiming completion", () => {
  const root = repoRoot();
  const goalMd = path.join(root, "docs", "TONIGHT_BUILD_GOAL.md");
  const audit = buildGoalAudit({
    goalMd,
    packageJson: path.join(root, "codex-monday-digest", "package.json"),
    proofRoot: path.join(root, "outputs", "monday_digest_runs")
  });

  assert.equal(extractAcceptanceGates(fs.readFileSync(goalMd, "utf8")).length, audit.acceptance_gates.length);
  assert.ok(audit.acceptance_gates.length >= 20);
  assert.equal(audit.acceptance_gates.some((row) => row.status === "uncategorized"), false);
  assert.equal(audit.acceptance_gates.some((row) => row.status === "missing_proof"), false);
  assert.equal(audit.acceptance_gates.some((row) => row.id === "goal_audit" && row.status === "covered_by_local_proof"), true);
  assert.equal(audit.acceptance_gates.some((row) => row.id === "source_reuse_contract" && row.status === "covered_by_local_proof"), true);
  assert.equal(audit.acceptance_gates.some((row) => row.id === "shareable_packet_safety" && row.status === "covered_by_local_proof"), true);
  assert.equal(audit.acceptance_gates.some((row) => row.id === "broker_control_claims" && row.status === "covered_by_local_proof"), true);
  assert.equal(audit.acceptance_gates.some((row) => row.id === "source_audit_real" && row.status === "covered_by_local_proof"), true);
  assert.equal(audit.acceptance_gates.some((row) => row.id === "source_audit_real_contract_drift" && row.status === "covered_by_local_proof"), true);
  assert.equal(audit.acceptance_gates.some((row) => row.id === "monday_live_write_gate" && row.status === "deferred_external_gate"), true);
  assert.equal(audit.completion_claimed, false);
  assert.equal(audit.goal_complete, false);
});

test("goal-audit command writes a verified local audit run", () => {
  const root = repoRoot();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "goal-audit-"));
  const proofRoot = path.join(tmp, "proofs");
  const out = path.join(tmp, "run");
  writePassReport(path.join(proofRoot, "source-audit-real", "verification_report.md"));
  writePassReport(path.join(proofRoot, "skill-package-bundle", "verification_report.md"));

  goalAuditCommand({
    "goal-md": path.join(root, "docs", "TONIGHT_BUILD_GOAL.md"),
    "package-json": path.join(root, "codex-monday-digest", "package.json"),
    "proof-root": proofRoot,
    out
  });
  verifyCommand({ run: out });

  const report = readJson(path.join(out, "goal_audit_report.json"));
  const manifest = readJson(path.join(out, "run_manifest.json"));
  const summary = fs.readFileSync(path.join(out, "goal_audit_summary.md"), "utf8");
  assert.equal(report.mode, "goal_audit");
  assert.equal(report.forbidden_actions.monday_live_writes, 0);
  assert.equal(manifest.output_path_scope, "run_folder_relative");
  assert.match(summary, /Status: REVIEW_READY/);
  assert.doesNotMatch(JSON.stringify(report), /\/Users\//);
});

function writePassReport(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "# Verification\n\nStatus: PASS\n");
}
