const { liveWriteGateFailures } = require("./runtime");

function assertLiveWriteAllowed() {
  const failures = liveWriteGateFailures();
  if (failures.length) {
    const error = new Error(`live_write blocked by fail-closed gates: ${failures.join(", ")}`);
    error.gateFailures = failures;
    throw error;
  }
}

function redactedBoardShapeFromEnv() {
  let columnMap = {};
  try {
    columnMap = process.env.MONDAY_COLUMN_MAP_JSON ? JSON.parse(process.env.MONDAY_COLUMN_MAP_JSON) : {};
  } catch {
    columnMap = {};
  }
  return {
    captured: false,
    board_id_present: Boolean(process.env.MONDAY_LEAD_BOARD_ID),
    group_id_present: Boolean(process.env.MONDAY_GROUP_NEW_LEAD_RESEARCH_ID),
    column_keys_present: Object.keys(columnMap),
    missing_column_keys: []
  };
}

module.exports = {
  assertLiveWriteAllowed,
  redactedBoardShapeFromEnv
};
