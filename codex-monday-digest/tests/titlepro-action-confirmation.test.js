const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parseCommand, titleProApproveCommand, titleProConfirmCommand } = require("../src/cli");
const { readActionQueueCsv } = require("../src/monday-action-queue");
const { verifyRun } = require("../src/verify-run");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function makeApprovedRun() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "codex-monday-titlepro-confirm-"));
  const out = path.join(tmp, "run");
  const fixture = path.join(__dirname, "..", "fixtures", "ken_kahan_digest_2026-05-30.txt");
  const approvalsPath = path.join(__dirname, "..", "fixtures", "titlepro_approvals_sample.csv");
  parseCommand({ input: fixture, mode: "local_dry_run", out });
  titleProApproveCommand({ run: out, approvals: approvalsPath });
  return { tmp, out, approvedPulls: readJson(path.join(out, "titlepro_pull_requests_approved.json")) };
}

test("titlepro-confirm records action-time confirmation without executing a pull", () => {
  const { out } = makeApprovedRun();
  const confirmationsPath = path.join(__dirname, "..", "fixtures", "titlepro_confirmations_sample.csv");

  titleProConfirmCommand({ run: out, confirmations: confirmationsPath });

  const confirmations = readJson(path.join(out, "titlepro_action_confirmations.json"));
  const actions = readJson(path.join(out, "titlepro_confirmed_manual_actions.json"));
  const profile = readJson(path.join(out, "titlepro_action_confirmation_source_profile.json"));
  const manifest = readJson(path.join(out, "run_manifest.json"));
  const actionQueueText = fs.readFileSync(path.join(out, "monday_action_queue.csv"), "utf8");
  const actionQueue = readActionQueueCsv(path.join(out, "monday_action_queue.csv"));

  assert.equal(confirmations.length, 1);
  assert.deepEqual(confirmations[0].validation_errors, []);
  assert.equal(confirmations[0].action_time_confirmed, true);
  assert.equal(confirmations[0].titlepro_pulls_executed, false);
  assert.equal(confirmations[0].browser_action_executed, false);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].status, "action_time_confirmed_pending_serial_titlepro_pull");
  assert.equal(actions[0].paid_action_allowed, true);
  assert.equal(actions[0].cost_ceiling, 25);
  assert.equal(actions[0].approved_cost_ceiling, 25);
  assert.equal(actions[0].titlepro_pulls_executed, false);
  assert.equal(actions[0].pull_executed, false);
  assert.equal(actions[0].browser_action_executed, false);
  assert.equal(actions[0].external_write_executed, false);
  assert.equal(profile.action_time_confirmed_count, 1);
  assert.equal(profile.titlepro_pulls_executed, 0);
  assert.equal(profile.browser_actions_executed, 0);
  assert.equal(manifest.forbidden_actions.titlepro_pulls, 0);
  assert.match(actionQueueText, /action_time_confirmed_pending_serial_titlepro_pull/);
  const pullRow = actionQueue.find((row) => row.approval_id === actions[0].approval_id && row.task === "Pull/save approved TitlePro docs");
  assert.equal(pullRow.paid_action_allowed, "true");

  const result = verifyRun(out);
  assert.equal(result.passed, true, result.report);
  assert.match(result.report, /TitlePro action confirmation profile records zero paid\/browser\/write actions/);
});

test("titlepro-confirm rejects mixed identifiers on action-time confirmation", () => {
  const { tmp, out, approvedPulls } = makeApprovedRun();
  const approved = approvedPulls[0];
  const confirmationsPath = path.join(tmp, "mixed-identifiers.csv");
  fs.writeFileSync(confirmationsPath, [
    "approval_id,request_id,radar_id,confirm_action,requested_doc_type,reason,cost_ceiling,confirmed_by,confirmed_at,county,address",
    `${approved.approval_id},wrong-request,P1555F5F,confirmed,${approved.requested_doc_type},${approved.reason},25,Broker,2026-06-01T12:00:00Z,${approved.county},${approved.address}`
  ].join("\n"));

  titleProConfirmCommand({ run: out, confirmations: confirmationsPath });

  const confirmations = readJson(path.join(out, "titlepro_action_confirmations.json"));
  const actions = readJson(path.join(out, "titlepro_confirmed_manual_actions.json"));

  assert.deepEqual(confirmations[0].validation_errors, ["request_id_mismatch", "radar_id_mismatch"]);
  assert.equal(confirmations[0].action_time_confirmed, false);
  assert.equal(actions.length, 0);

  const result = verifyRun(out);
  assert.equal(result.passed, true, result.report);
});

test("titlepro-confirm carries the lower action-time cost ceiling", () => {
  const { tmp, out, approvedPulls } = makeApprovedRun();
  const approved = approvedPulls[0];
  const confirmationsPath = path.join(tmp, "lower-cost.csv");
  fs.writeFileSync(confirmationsPath, [
    "approval_id,confirm_action,requested_doc_type,reason,cost_ceiling,confirmed_by,confirmed_at,county,address",
    `${approved.approval_id},confirmed,${approved.requested_doc_type},${approved.reason},10,Broker,2026-06-01T12:00:00Z,${approved.county},${approved.address}`
  ].join("\n"));

  titleProConfirmCommand({ run: out, confirmations: confirmationsPath });

  const actions = readJson(path.join(out, "titlepro_confirmed_manual_actions.json"));

  assert.equal(actions.length, 1);
  assert.equal(actions[0].cost_ceiling, 10);
  assert.equal(actions[0].approved_cost_ceiling, 25);

  const result = verifyRun(out);
  assert.equal(result.passed, true, result.report);
});

test("titlepro-confirm blocks mismatched action-time confirmation", () => {
  const { tmp, out } = makeApprovedRun();
  const confirmationsPath = path.join(tmp, "bad-confirmations.csv");
  fs.writeFileSync(confirmationsPath, [
    "radar_id,confirm_action,requested_doc_type,reason,cost_ceiling,confirmed_by,confirmed_at,county,address",
    "P15F1852,confirmed,property_profile,Changed reason should fail,25,Broker,2026-06-01T12:00:00Z,Ventura,2701 STATHAM BLVD"
  ].join("\n"));

  titleProConfirmCommand({ run: out, confirmations: confirmationsPath });

  const confirmations = readJson(path.join(out, "titlepro_action_confirmations.json"));
  const actions = readJson(path.join(out, "titlepro_confirmed_manual_actions.json"));

  assert.deepEqual(confirmations[0].validation_errors, ["reason_mismatch"]);
  assert.equal(confirmations[0].action_time_confirmed, false);
  assert.equal(actions.length, 0);

  const result = verifyRun(out);
  assert.equal(result.passed, true, result.report);
});
