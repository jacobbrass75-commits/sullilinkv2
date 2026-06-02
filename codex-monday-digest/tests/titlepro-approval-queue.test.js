const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parseCommand, previewCommand } = require("../src/cli");
const { verifyRun } = require("../src/verify-run");

const REQUIRED_TITLEPRO_QUEUE_FIELDS = [
  "lead_key",
  "radar_id",
  "apn",
  "county",
  "address",
  "city",
  "requested_doc_type",
  "reason",
  "status",
  "approval_required",
  "approval_id",
  "cost_ceiling",
  "existing_evidence_path",
  "paid_action_allowed"
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function assertTitleProApprovalQueue(runFolder) {
  const queuePath = path.join(runFolder, "titlepro_approval_queue_preview.json");
  assert.equal(fs.existsSync(queuePath), true, "TitlePro approval queue preview artifact exists");

  const queue = readJson(queuePath);
  const leads = readJson(path.join(runFolder, "deduped_leads.json"));
  const leadsByKey = new Map(leads.map((lead) => [lead.dedupe_key, lead]));
  const approvalIds = new Set();

  assert.equal(queue.length, leads.length, "queue has one preview row per deduped lead");
  for (const [index, row] of queue.entries()) {
    const missingFields = REQUIRED_TITLEPRO_QUEUE_FIELDS.filter((field) => {
      return !Object.prototype.hasOwnProperty.call(row, field);
    });
    assert.deepEqual(missingFields, [], `queue row ${index + 1} has required fields`);

    const lead = leadsByKey.get(row.lead_key);
    assert.ok(lead, `queue row ${index + 1} references a deduped lead`);
    assert.equal(row.radar_id, lead.radar_id);
    assert.equal(row.paid_action_allowed, false);
    assert.equal(row.approval_required, true);
    assert.equal(typeof row.requested_doc_type, "string");
    assert.notEqual(row.requested_doc_type.trim(), "");
    assert.equal(typeof row.reason, "string");
    assert.notEqual(row.reason.trim(), "");
    assert.equal(typeof row.status, "string");
    assert.notEqual(row.status.trim(), "");
    assert.equal(typeof row.approval_id, "string");
    assert.notEqual(row.approval_id.trim(), "");
    assert.equal(approvalIds.has(row.approval_id), false, "approval_id is unique");
    approvalIds.add(row.approval_id);
    assert.equal(typeof row.city, "string");
    assert.notEqual(row.city.trim(), "");
    assert.equal(typeof row.address, "string");
    assert.notEqual(row.address.trim(), "");
    assert.ok(
      row.cost_ceiling === null || ["number", "string"].includes(typeof row.cost_ceiling),
      "cost_ceiling is present as null, a number, or a string"
    );
    assert.ok(row.existing_evidence_path === null || typeof row.existing_evidence_path === "string");
  }
}

function assertVerifyRunChecksTitleProQueue(runFolder) {
  const result = verifyRun(runFolder);
  assert.equal(result.passed, true, result.report);
  assert.match(result.report, /titlepro_approval_queue_preview\.json/);
  assert.match(result.report, /TitlePro approval queue/i);
}

test("digest parse and saved Gmail preview write a preview-only TitlePro approval queue", async (t) => {
  const fixture = path.join(__dirname, "..", "fixtures", "ken_kahan_digest_2026-05-30.txt");

  await t.test("parse local_dry_run", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "codex-monday-titlepro-parse-"));
    const out = path.join(tmp, "parse-run");

    parseCommand({ input: fixture, mode: "local_dry_run", out });

    assertTitleProApprovalQueue(out);
    assertVerifyRunChecksTitleProQueue(out);
  });

  await t.test("preview gmail_preview from saved digest", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "codex-monday-titlepro-preview-"));
    const out = path.join(tmp, "preview-run");

    previewCommand({
      input: fixture,
      mode: "gmail_preview",
      out,
      label: "CRE/PropertyRadar Alerts",
      since: "2d"
    });

    assertTitleProApprovalQueue(out);
    assertVerifyRunChecksTitleProQueue(out);
  });
});
