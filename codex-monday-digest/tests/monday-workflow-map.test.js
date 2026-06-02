const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { workflowMapCommand } = require("../src/cli");
const { verifyRun } = require("../src/verify-run");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

test("workflow-map parses exported Monday workflow workbooks into a local verified contract", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "codex-monday-workflow-map-"));
  const out = path.join(tmp, "run");
  const workflowDir = path.join(__dirname, "..", "..", "broker_packet", "workflows", "monday_exports");

  workflowMapCommand({ "workflow-dir": workflowDir, out });

  const workflowMap = readJson(path.join(out, "monday_workflow_map.json"));
  const stageMap = readJson(path.join(out, "monday_workflow_stage_map.json"));
  const sourceProfile = readJson(path.join(out, "monday_workflow_source_profile.json"));
  const manifest = readJson(path.join(out, "run_manifest.json"));

  assert.equal(workflowMap.mode, "monday_workflow_map");
  assert.equal(workflowMap.schema_version, 1);
  assert.equal(workflowMap.workflow_count, 11);
  assert.equal(workflowMap.parent_task_count, 116);
  assert.equal(workflowMap.subitem_count, 362);
  assert.equal(stageMap.length, workflowMap.parent_task_count);
  assert.equal(sourceProfile.source_count, 11);
  assert.equal(sourceProfile.sources.every((source) => source.source_path_scope === "basename_only" && !source.source_path.includes("/")), true);
  assert.equal(manifest.forbidden_actions.monday_live_writes, 0);

  const leadGeneration = workflowMap.workflows.find((workflow) => workflow.workflow_name === "1. Lead Generation");
  assert.ok(leadGeneration);
  assert.deepEqual(leadGeneration.main_columns, ["name", "subitems", "person", "status", "date", "long_text"]);
  assert.equal(leadGeneration.subitem_column_variants.some((variant) => variant.includes("long_text")), true);
  assert.equal(leadGeneration.parent_tasks.some((task) => task.subitems.some((subitem) => subitem.name === "Function 7: Ownership Research")), true);
  assert.equal(stageMap.some((stage) => stage.workflow_name === "2. Pre-Marketing" && stage.stage_name === "Premarketing: Investment"), true);

  const result = verifyRun(out);
  assert.equal(result.passed, true, result.report);
});

test("workflow-map skips non-template solution workbook tabs without review noise", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "codex-monday-workflow-solution-"));
  const out = path.join(tmp, "run");
  const workbook = path.join(__dirname, "..", "..", "broker_packet", "workflows", "monday_workflow_solution_2026-05-30.xlsx");

  workflowMapCommand({ input: workbook, out });

  const workflowMap = readJson(path.join(out, "monday_workflow_map.json"));
  const sourceProfile = readJson(path.join(out, "monday_workflow_source_profile.json"));
  const needsReview = readJson(path.join(out, "needs_review.json"));

  assert.equal(workflowMap.workflow_count, 11);
  assert.equal(workflowMap.skipped_sheet_count, 49);
  assert.equal(sourceProfile.skipped_sheet_count, 49);
  assert.equal(needsReview.length, 0);

  const result = verifyRun(out);
  assert.equal(result.passed, true, result.report);
});

test("workflow-map parses the combined Monday workbook without leaking local source paths", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "codex-monday-workflow-combined-"));
  const out = path.join(tmp, "run");
  const workbook = path.join(__dirname, "..", "..", "broker_packet", "workflows", "monday_workflows_combined_2026-05-30.xlsx");

  workflowMapCommand({ input: workbook, out });

  const workflowMap = readJson(path.join(out, "monday_workflow_map.json"));
  const sourceProfile = readJson(path.join(out, "monday_workflow_source_profile.json"));
  const summary = fs.readFileSync(path.join(out, "monday_workflow_summary.md"), "utf8");

  assert.equal(workflowMap.workflow_count, 11);
  assert.equal(sourceProfile.source_count, 1);
  assert.equal(sourceProfile.sources[0].source_path, "monday_workflows_combined_2026-05-30.xlsx");
  assert.equal(summary.includes("/Users/"), false);

  const result = verifyRun(out);
  assert.equal(result.passed, true, result.report);
});
