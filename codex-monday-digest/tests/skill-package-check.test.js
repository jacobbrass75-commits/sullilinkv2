const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { skillCheckCommand, skillPackCommand, verifyCommand } = require("../src/cli");
const { buildSkillPackageCheck, buildSkillPackageBundle } = require("../src/skill-package-check");
const { verifyRun } = require("../src/verify-run");

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
  assert.ok(report.required_proof_scripts.includes("proof:source-audit-real"));
  assert.ok(report.required_proof_scripts.includes("proof:goal-audit"));
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

test("skill package bundle is installable from copied skill files", () => {
  const root = repoRoot();
  const bundle = buildSkillPackageBundle({
    skillDir: path.join(root, "codex_skills", "monday-cre-workflow"),
    packageJson: path.join(root, "codex-monday-digest", "package.json"),
    goalMd: path.join(root, "docs", "TONIGHT_BUILD_GOAL.md")
  });

  assert.equal(bundle.package_ready, true);
  assert.equal(bundle.skill_name, "monday-cre-workflow");
  assert.ok(bundle.files.some((file) => file.relative_path === "SKILL.md"));
  assert.ok(bundle.files.some((file) => file.relative_path === "agents/openai.yaml"));
  assert.ok(bundle.files.some((file) => file.relative_path === "references/runbook.md"));
  assert.ok(bundle.files.some((file) => file.relative_path === "references/sullilink-reuse.md"));
  assert.equal(bundle.forbidden_actions.monday_live_writes, 0);
});

test("skill-pack command writes a verified installable package run", () => {
  const root = repoRoot();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "codex-skill-pack-"));
  const out = path.join(tmp, "run");

  skillPackCommand({
    "skill-dir": path.join(root, "codex_skills", "monday-cre-workflow"),
    "package-json": path.join(root, "codex-monday-digest", "package.json"),
    "goal-md": path.join(root, "docs", "TONIGHT_BUILD_GOAL.md"),
    out
  });
  verifyCommand({ run: out });

  const manifest = readJson(path.join(out, "skill_package_bundle_manifest.json"));
  const install = fs.readFileSync(path.join(out, "skill_package_install.md"), "utf8");
  assert.equal(manifest.package_ready, true);
  assert.match(install, /cp -R/);
  assert.ok(fs.existsSync(path.join(out, "skill_package", "monday-cre-workflow", "SKILL.md")));
  assert.ok(fs.existsSync(path.join(out, "skill_package", "monday-cre-workflow", "agents", "openai.yaml")));
});

test("skill-pack clears stale package files before copying", () => {
  const root = repoRoot();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "codex-skill-pack-stale-"));
  const out = path.join(tmp, "run");
  const stale = path.join(out, "skill_package", "monday-cre-workflow", "references", "stale.txt");

  fs.mkdirSync(path.dirname(stale), { recursive: true });
  fs.writeFileSync(stale, "old unmanifested file /Users/example\n");

  skillPackCommand({
    "skill-dir": path.join(root, "codex_skills", "monday-cre-workflow"),
    "package-json": path.join(root, "codex-monday-digest", "package.json"),
    "goal-md": path.join(root, "docs", "TONIGHT_BUILD_GOAL.md"),
    out
  });

  assert.equal(fs.existsSync(stale), false);
  verifyCommand({ run: out });
});

test("skill bundle verification fails on unmanifested package files", () => {
  const root = repoRoot();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "codex-skill-pack-extra-"));
  const out = path.join(tmp, "run");
  const extra = path.join(out, "skill_package", "monday-cre-workflow", "references", "extra.txt");

  skillPackCommand({
    "skill-dir": path.join(root, "codex_skills", "monday-cre-workflow"),
    "package-json": path.join(root, "codex-monday-digest", "package.json"),
    "goal-md": path.join(root, "docs", "TONIGHT_BUILD_GOAL.md"),
    out
  });
  fs.writeFileSync(extra, "unmanifested package file\n");

  const result = verifyRun(out);
  assert.equal(result.passed, false);
  assert.match(result.report, /packaged skill contains only manifest-listed files/);
});
