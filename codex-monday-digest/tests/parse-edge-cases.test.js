const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { parseDigestFile } = require("../src/parse-digest");
const { dedupeLeads } = require("../src/dedupe-leads");

test("edge fixture preserves duplicate and multiline events", () => {
  const fixture = path.join(__dirname, "..", "fixtures", "southern_california_edge_cases_2026-05-30_excerpt.txt");
  const { parsedRows } = parseDigestFile(fixture);
  const { leads } = dedupeLeads(parsedRows, { runFolder: "outputs/test" });
  assert.equal(parsedRows.length, 7);
  assert.equal(leads.length, 5);
  assert.equal(leads.find((lead) => lead.radar_id === "P15F1852").exact_duplicate_count, 1);
  assert.equal(leads.find((lead) => lead.radar_id === "P187C3F2").source_events.length, 2);
  assert.deepEqual(leads.find((lead) => lead.radar_id === "P19F0A4C").source_events[0].change_lines, [
    "Prior Sale Date: 4/28/2026 => 6/2/2026",
    "Sale Date: 6/2/2026 => 7/7/2026"
  ]);
  const bankruptcy = leads.find((lead) => lead.radar_id === "P12D8FEE");
  assert.equal(bankruptcy.hard_hold, true);
  assert.equal(bankruptcy.outreach_readiness, "Blocked");
});
