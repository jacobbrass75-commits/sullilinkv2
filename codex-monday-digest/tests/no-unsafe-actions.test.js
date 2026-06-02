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
