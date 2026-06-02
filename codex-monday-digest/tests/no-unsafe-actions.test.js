const test = require("node:test");
const assert = require("node:assert/strict");
const { SAFE_DEFAULTS, liveWriteGateFailures } = require("../src/runtime");

test("runtime defaults fail closed", () => {
  assert.equal(SAFE_DEFAULTS.CRE_GLOBAL_DRY_RUN, "true");
  assert.equal(SAFE_DEFAULTS.ALLOW_EXTERNAL_WRITES, "false");
  assert.equal(SAFE_DEFAULTS.ALLOW_MONDAY_WRITES, "false");
  assert.equal(SAFE_DEFAULTS.ALLOW_PAID_PULLS, "false");
  assert.equal(SAFE_DEFAULTS.MONDAY_DRY_RUN, "true");
  assert.ok(liveWriteGateFailures().length >= 1);
});

test("Monday live writes require board, column map, rollback, and broker approval gates", () => {
  const previous = { ...process.env };
  try {
    process.env.CRE_GLOBAL_DRY_RUN = "false";
    process.env.ALLOW_EXTERNAL_WRITES = "true";
    process.env.ALLOW_MONDAY_WRITES = "true";
    process.env.MONDAY_DRY_RUN = "false";
    delete process.env.MONDAY_SYNC_MODE;
    delete process.env.MONDAY_LEAD_BOARD_ID;
    delete process.env.MONDAY_GROUP_NEW_LEAD_RESEARCH_ID;
    delete process.env.MONDAY_COLUMN_MAP_JSON;
    delete process.env.MONDAY_ROLLBACK_PLAN;
    delete process.env.MONDAY_ROLLBACK_PLAN_PATH;
    delete process.env.MONDAY_BROKER_APPROVAL;

    assert.deepEqual(liveWriteGateFailures(), [
      "MONDAY_SYNC_MODE",
      "MONDAY_LEAD_BOARD_ID",
      "MONDAY_GROUP_NEW_LEAD_RESEARCH_ID",
      "MONDAY_COLUMN_MAP_JSON",
      "MONDAY_ROLLBACK_PLAN",
      "MONDAY_BROKER_APPROVAL"
    ]);
  } finally {
    process.env = previous;
  }
});
