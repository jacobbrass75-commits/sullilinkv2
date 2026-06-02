const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildBatchArtifacts, writeBatchRun } = require("../src/batch-owner-clusters");
const { parseCommand, titleProApproveCommand } = require("../src/cli");
const { readActionQueueCsv } = require("../src/monday-action-queue");
const { verifyRun } = require("../src/verify-run");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeBatchFixtureCsv() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "codex-monday-action-batch-"));
  const csv = path.join(tmp, "batch.csv");
  fs.writeFileSync(csv, [
    "Type,Address,City,Sq Ft,Beds,Baths,Est Value,Est Equity $,Owner,Owner Occ?,Listed for Sale?,APN,County",
    "COM,100 MAIN ST,LOS ANGELES,10000,,,3000000,100000,ACME HOLDINGS LLC,0,0,123-456-789,Los Angeles",
    "COM,100 MAIN ST,LOS ANGELES,10000,,,3000000,100000,ACME HOLDINGS LLC,0,0,123 456 789,Los Angeles",
    "IND,200 SIDE ST,LOS ANGELES,12000,,,4000000,-500000,ACME HOLDINGS LLC,0,0,987-654-321,Los Angeles"
  ].join("\n"));
  return { tmp, csv };
}

test("digest runs write a preview-only Monday action queue and refresh it after TitlePro approval intake", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "codex-monday-action-digest-"));
  const out = path.join(tmp, "run");
  const fixture = path.join(__dirname, "..", "fixtures", "ken_kahan_digest_2026-05-30.txt");
  parseCommand({ input: fixture, mode: "local_dry_run", out });

  const leads = readJson(path.join(out, "deduped_leads.json"));
  const subitems = readJson(path.join(out, "monday_subitems_preview.json"));
  let actionQueue = readActionQueueCsv(path.join(out, "monday_action_queue.csv"));
  assert.equal(actionQueue.length, subitems.length);
  assert.equal(actionQueue.every((row) => row.run_type === "digest"), true);
  assert.equal(actionQueue.every((row) => row.monday_write_executed === "false"), true);
  assert.equal(actionQueue.every((row) => row.external_write_executed === "false"), true);
  assert.equal(actionQueue.every((row) => row.control_claim_allowed === "false"), true);
  assert.equal(actionQueue.every((row) => row.broker_ready === "false"), true);
  assert.equal(leads.every((lead) => actionQueue.some((row) => row.lead_key === lead.dedupe_key && row.task === "Verify current notice/status")), true);

  const titleproQueue = readJson(path.join(out, "titlepro_approval_queue_preview.json"));
  const approvalsPath = path.join(tmp, "approvals.csv");
  fs.writeFileSync(approvalsPath, [
    "approval_id,approved,requested_doc_type,reason,cost_ceiling,approved_by",
    `${titleproQueue[0].approval_id},approved,property_profile,Need title owner evidence after broker screen,25,Broker`
  ].join("\n"));
  titleProApproveCommand({ run: out, approvals: approvalsPath });

  actionQueue = readActionQueueCsv(path.join(out, "monday_action_queue.csv"));
  const approvedPullRow = actionQueue.find((row) => row.approval_id === titleproQueue[0].approval_id && row.task === "Pull/save approved TitlePro docs");
  assert.equal(approvedPullRow.status, "approved_pending_manual_titlepro_pull");
  assert.equal(approvedPullRow.paid_action_allowed, "false");
  assert.equal(approvedPullRow.monday_write_executed, "false");
  assert.equal(approvedPullRow.external_write_executed, "false");
  assert.equal(approvedPullRow.control_claim_allowed, "false");
  assert.equal(verifyRun(out).passed, true);
});

test("batch runs write a preview-only Monday action queue with APN and source-row identity", () => {
  const { tmp, csv } = writeBatchFixtureCsv();
  const artifacts = buildBatchArtifacts(csv, "local_dry_run", "batch-action-test");
  const out = path.join(tmp, "run");
  writeBatchRun(out, artifacts);

  const actionQueue = readActionQueueCsv(path.join(out, "monday_action_queue.csv"));
  assert.equal(actionQueue.length, artifacts.current_status_tasks.length + artifacts.document_pull_tasks.length + artifacts.role_assertion_tasks.length);
  assert.equal(actionQueue.every((row) => row.run_type === "batch"), true);
  assert.equal(actionQueue.every((row) => row.monday_write_executed === "false"), true);
  assert.equal(actionQueue.every((row) => row.external_write_executed === "false"), true);
  assert.equal(actionQueue.every((row) => row.control_claim_allowed === "false"), true);
  assert.equal(actionQueue.every((row) => row.broker_ready === "false"), true);

  const duplicatedApnRow = actionQueue.find((row) => row.apn === "123-456-789" && row.queue_name === "batch_current_status");
  assert.equal(duplicatedApnRow.county, "LOS ANGELES");
  assert.equal(duplicatedApnRow.source_row_indexes, "1|2");
  assert.equal(actionQueue.some((row) => row.queue_name === "batch_owner_control" && row.cluster_id === "exact-owner-acme-holdings-llc"), true);
  assert.equal(verifyRun(out).passed, true);
});
