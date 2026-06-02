const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

test("browser workflow creates a digest run with workbook and verification", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "codex-monday-web-"));
  process.env.MONDAY_DIGEST_RUNS_ROOT = tmp;
  const { createDigestRun, listRuns } = require("../src/run-workflows");
  const fixture = fs.readFileSync(path.join(__dirname, "..", "fixtures", "ken_kahan_digest_2026-05-30.txt"), "utf8");

  const detail = createDigestRun({ text: fixture, name: "web-test" });
  assert.equal(detail.summary.type, "digest");
  assert.equal(detail.summary.status, "PASS");
  assert.equal(detail.summary.counts.parsed_rows, 4);
  assert.equal(detail.summary.counts.deduped_leads, 3);
  assert.equal(detail.titlepro_approval_queue.length, 3);
  assert.deepEqual(detail.titlepro_approval_decisions, []);
  assert.deepEqual(detail.titlepro_pull_requests_approved, []);
  assert.equal(detail.titlepro_approval_queue.every((row) => row.paid_action_allowed === false), true);
  assert.equal(fs.existsSync(path.join(tmp, detail.summary.id, "monday_import_preview.xlsx")), true);
  assert.equal(fs.existsSync(path.join(tmp, detail.summary.id, "titlepro_approval_queue_preview.json")), true);
  assert.equal(fs.existsSync(path.join(tmp, detail.summary.id, "titlepro_approval_decisions.json")), true);
  assert.equal(fs.existsSync(path.join(tmp, detail.summary.id, "titlepro_pull_requests_approved.json")), true);
  assert.equal(listRuns().length, 1);
});
