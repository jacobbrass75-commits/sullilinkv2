const test = require("node:test");
const assert = require("node:assert/strict");
const { dedupeLeads } = require("../src/dedupe-leads");

test("same Radar ID with different change lines keeps distinct source events", () => {
  const base = {
    source_id: "source:test",
    radar_id: "PTEST",
    street: "1 MAIN ST",
    city: "LOS ANGELES",
    zip: "90001",
    state: "CA",
    property_type: "COM",
    sq_ft: 10000,
    est_value: 3000000
  };
  const { leads } = dedupeLeads([
    { ...base, source_row_index: 1, what_changed: "New Notice", change_lines: ["New Notice"] },
    { ...base, source_row_index: 2, what_changed: "Sale Date: 1 => 2", change_lines: ["Sale Date: 1 => 2"] }
  ]);
  assert.equal(leads.length, 1);
  assert.equal(leads[0].source_events.length, 2);
  assert.equal(leads[0].exact_duplicate_count, 0);
});
