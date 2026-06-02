const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { safetyAuditCommand, verifyCommand } = require("../src/cli");
const { buildSafetyAudit, REQUIRED_SAFETY_PROOF_COMMANDS } = require("../src/safety-audit");
const { PROOF_RUN_FOLDERS } = require("../src/goal-audit");
const { FORBIDDEN_ZERO } = require("../src/runtime");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

test("safety-audit proves canonical proof runs have zero forbidden actions", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "safety-audit-"));
  const proofRoot = path.join(tmp, "proofs");
  const goalMd = writeGoalMarkdown(path.join(tmp, "goal.md"));
  writeProofRuns(proofRoot);

  const audit = buildSafetyAudit({ proofRoot, goalMd });

  assert.equal(audit.passed, true);
  assert.equal(audit.proof_runs.length, REQUIRED_SAFETY_PROOF_COMMANDS.length);
  assert.equal(audit.aggregate_forbidden_actions.monday_live_writes, 0);
  assert.equal(audit.direct_external_action_hit_count, 0);
  assert.equal(audit.goal_safety_checks.every((row) => row.status === "pass"), true);
  assert.doesNotMatch(JSON.stringify(audit), /\/Users\//);
});

test("safety-audit command writes a verified local run", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "safety-audit-command-"));
  const proofRoot = path.join(tmp, "proofs");
  const goalMd = writeGoalMarkdown(path.join(tmp, "goal.md"));
  const out = path.join(tmp, "run");
  writeProofRuns(proofRoot);

  safetyAuditCommand({
    "proof-root": proofRoot,
    "goal-md": goalMd,
    out
  });
  verifyCommand({ run: out });

  const report = readJson(path.join(out, "safety_audit_report.json"));
  const manifest = readJson(path.join(out, "run_manifest.json"));
  const summary = fs.readFileSync(path.join(out, "safety_audit_summary.md"), "utf8");

  assert.equal(report.mode, "safety_audit");
  assert.equal(report.passed, true);
  assert.equal(manifest.mode, "safety_audit");
  assert.equal(manifest.forbidden_actions.monday_live_writes, 0);
  assert.match(summary, /Status: PASS/);
  assert.doesNotMatch(JSON.stringify(report), /\/Users\//);
});

test("safety-audit fails when a proof artifact records a forbidden action", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "safety-audit-forbidden-"));
  const proofRoot = path.join(tmp, "proofs");
  const goalMd = writeGoalMarkdown(path.join(tmp, "goal.md"));
  writeProofRuns(proofRoot);
  const devManifest = path.join(proofRoot, PROOF_RUN_FOLDERS["proof:ken"], "run_manifest.json");
  const manifest = readJson(devManifest);
  manifest.forbidden_actions.monday_live_writes = 1;
  fs.writeFileSync(devManifest, `${JSON.stringify(manifest, null, 2)}\n`);

  const audit = buildSafetyAudit({ proofRoot, goalMd });

  assert.equal(audit.passed, false);
  assert.equal(audit.aggregate_forbidden_actions.monday_live_writes, 1);
  assert.equal(audit.checks.some((row) => row.id === "aggregate_forbidden_actions_zero" && row.status === "fail"), true);
});

function writeGoalMarkdown(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, [
    "# Goal",
    "",
    "- no Monday live writes by default",
    "- Monday live write remains blocked unless explicit board/column/rollback/broker gates are satisfied.",
    ""
  ].join("\n"));
  return file;
}

function writeProofRuns(proofRoot) {
  for (const command of REQUIRED_SAFETY_PROOF_COMMANDS) {
    const folder = PROOF_RUN_FOLDERS[command];
    const runDir = path.join(proofRoot, folder);
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(path.join(runDir, "verification_report.md"), "# Verification\n\nStatus: PASS\n");
    fs.writeFileSync(path.join(runDir, "run_manifest.json"), `${JSON.stringify({
      run_id: folder,
      mode: folder.replace(/-/g, "_"),
      forbidden_actions: { ...FORBIDDEN_ZERO },
      monday_live_writes_executed: 0,
      external_writes_executed: 0,
      output_paths: ["run_manifest.json"]
    }, null, 2)}\n`);
  }
}
