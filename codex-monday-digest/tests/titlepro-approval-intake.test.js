const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parseCommand, titleProApproveCommand } = require("../src/cli");
const { verifyRun } = require("../src/verify-run");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function makeRun() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "codex-monday-titlepro-approval-"));
  const out = path.join(tmp, "run");
  const fixture = path.join(__dirname, "..", "fixtures", "ken_kahan_digest_2026-05-30.txt");
  parseCommand({ input: fixture, mode: "local_dry_run", out });
  return { tmp, out, queue: readJson(path.join(out, "titlepro_approval_queue_preview.json")) };
}

test("titlepro approval CSV creates approved pending pull requests without executing TitlePro", () => {
  const { tmp, out, queue } = makeRun();
  const approvalsPath = path.join(tmp, "approvals.csv");
  fs.writeFileSync(approvalsPath, [
    "approval_id,approved,requested_doc_type,reason,cost_ceiling,approved_by,approved_at,county,notes",
    `${queue[0].approval_id},approved,property_profile,Need title owner evidence after broker screen,25,Broker,2026-06-01,Ventura,valid scoped approval`,
    `${queue[1].approval_id},approved,,Missing doc type should stay invalid,25,Broker,2026-06-01,San Bernardino,invalid missing doc type`,
    `${queue[2].approval_id},rejected,property_profile,Broker rejected this pull,25,Broker,2026-06-01,San Bernardino,rejected audit only`
  ].join("\n"));

  titleProApproveCommand({ run: out, approvals: approvalsPath });

  const decisions = readJson(path.join(out, "titlepro_approval_decisions.json"));
  const pullRequests = readJson(path.join(out, "titlepro_pull_requests_approved.json"));
  const sourceProfile = readJson(path.join(out, "titlepro_approval_source_profile.json"));
  const manifest = readJson(path.join(out, "run_manifest.json"));

  assert.equal(decisions.length, 3);
  assert.equal(pullRequests.length, 1);
  assert.equal(decisions[0].approval_recorded, true);
  assert.equal(decisions[0].paid_action_allowed, true);
  assert.deepEqual(decisions[0].validation_errors, []);
  assert.equal(decisions[1].approval_recorded, false);
  assert.deepEqual(decisions[1].validation_errors, ["missing_requested_doc_type"]);
  assert.equal(decisions[2].decision, "rejected");
  assert.equal(decisions[2].approval_recorded, false);

  assert.equal(pullRequests[0].status, "approved_pending_manual_titlepro_pull");
  assert.equal(pullRequests[0].paid_action_allowed, true);
  assert.equal(pullRequests[0].pull_executed, false);
  assert.equal(pullRequests[0].external_write_executed, false);
  assert.equal(pullRequests[0].approval_id, queue[0].approval_id);
  assert.equal(pullRequests[0].lead_key, queue[0].lead_key);

  assert.equal(sourceProfile.approval_record_count, 3);
  assert.equal(sourceProfile.approved_pull_request_count, 1);
  assert.equal(sourceProfile.invalid_decision_count, 1);
  assert.equal(sourceProfile.titlepro_pulls_executed, 0);
  assert.equal(sourceProfile.external_writes_executed, 0);
  assert.equal(manifest.forbidden_actions.titlepro_pulls, 0);
  assert.equal(manifest.output_paths.some((file) => file.endsWith("titlepro_pull_requests_approved.json")), true);

  const result = verifyRun(out);
  assert.equal(result.passed, true, result.report);
});

test("titlepro approval JSON records unknown approved rows as invalid without pull requests", () => {
  const { tmp, out } = makeRun();
  const approvalsPath = path.join(tmp, "approvals.json");
  fs.writeFileSync(approvalsPath, `${JSON.stringify({
    approvals: [
      {
        radar_id: "UNKNOWN-RADAR",
        approved: true,
        requested_doc_type: "property_profile",
        reason: "No matching queue row should block this approval.",
        cost_ceiling: 25,
        approved_by: "Broker"
      },
      {
        radar_id: "P15F1852",
        decision: "hold",
        requested_doc_type: "property_profile",
        reason: "Hold rows are audit-only.",
        cost_ceiling: 25,
        approved_by: "Broker"
      }
    ]
  }, null, 2)}\n`);

  titleProApproveCommand({ run: out, approvals: approvalsPath });

  const decisions = readJson(path.join(out, "titlepro_approval_decisions.json"));
  const pullRequests = readJson(path.join(out, "titlepro_pull_requests_approved.json"));

  assert.equal(decisions.length, 2);
  assert.deepEqual(decisions[0].validation_errors, ["no_matching_titlepro_queue_row"]);
  assert.equal(decisions[0].approval_recorded, false);
  assert.equal(decisions[1].decision, "hold");
  assert.equal(decisions[1].approval_recorded, false);
  assert.equal(pullRequests.length, 0);

  const result = verifyRun(out);
  assert.equal(result.passed, true, result.report);
});
