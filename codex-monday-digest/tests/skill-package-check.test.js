const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { skillCheckCommand, verifyCommand } = require("../src/cli");
const { buildSkillPackageCheck } = require("../src/skill-package-check");

function repoRoot() {
  return path.resolve(__dirname, "..", "..");
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

test("skill package check validates the Monday CRE skill against repo proofs", () => {
  const root = repoRoot();
  const report = buildSkillPackageCheck({
    skillDir: path.join(root, "codex_skills", "monday-cre-workflow"),
    packageJson: path.join(root, "codex-monday-digest", "package.json"),
    goalMd: path.join(root, "docs", "TONIGHT_BUILD_GOAL.md")
  });

  assert.equal(report.passed, true);
  assert.equal(report.skill_name, "monday-cre-workflow");
  assert.ok(report.required_references.includes("references/runbook.md"));
  assert.ok(report.required_references.includes("references/sullilink-reuse.md"));
  assert.ok(report.required_proof_scripts.includes("proof:workflow-map"));
  assert.ok(report.required_proof_scripts.includes("proof:status"));
  assert.ok(report.checks.every((check) => check.status === "pass"));
  assert.equal(report.forbidden_actions.monday_live_writes, 0);
  assert.equal(report.forbidden_actions.provider_backfills, 0);
});

test("skill-check command writes a verified local run", () => {
  const root = repoRoot();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "codex-skill-package-"));
  const out = path.join(tmp, "run");

  skillCheckCommand({
    "skill-dir": path.join(root, "codex_skills", "monday-cre-workflow"),
    "package-json": path.join(root, "codex-monday-digest", "package.json"),
    "goal-md": path.join(root, "docs", "TONIGHT_BUILD_GOAL.md"),
    out
  });
  verifyCommand({ run: out });

  const report = readJson(path.join(out, "skill_package_report.json"));
  const manifest = readJson(path.join(out, "run_manifest.json"));
  const summary = fs.readFileSync(path.join(out, "skill_package_summary.md"), "utf8");

  assert.equal(report.passed, true);
  assert.equal(manifest.mode, "skill_package_check");
  assert.equal(manifest.forbidden_actions.monday_live_writes, 0);
  assert.match(summary, /Status: PASS/);
  assert.doesNotMatch(summary, /\/Users\//);
});
