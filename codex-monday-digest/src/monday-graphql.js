const { liveWriteGateFailures } = require("./runtime");

const REQUIRED_COLUMN_KEYS = [
  "radar_id",
  "stage",
  "current_status",
  "owner_confidence",
  "llc_disambiguation",
  "outreach_readiness",
  "broker_packet_status",
  "allowed_action",
  "blocked_action"
];

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
    live_write_mode_present: process.env.MONDAY_SYNC_MODE === "live_write",
    column_keys_present: Object.keys(columnMap),
    missing_column_keys: REQUIRED_COLUMN_KEYS.filter((key) => !Object.prototype.hasOwnProperty.call(columnMap, key)),
    rollback_gate_present: Boolean(process.env.MONDAY_ROLLBACK_PLAN || process.env.MONDAY_ROLLBACK_PLAN_PATH),
    broker_approval_gate_present: process.env.MONDAY_BROKER_APPROVAL === "true"
  };
}

module.exports = {
  assertLiveWriteAllowed,
  redactedBoardShapeFromEnv
};
