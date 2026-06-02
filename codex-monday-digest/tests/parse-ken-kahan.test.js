const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { parseDigestFile } = require("../src/parse-digest");
const { dedupeLeads } = require("../src/dedupe-leads");

test("Ken Kahan fixture parses and dedupes to Monday-ready leads", () => {
  const fixture = path.join(__dirname, "..", "fixtures", "ken_kahan_digest_2026-05-30.txt");
  const { parsedRows } = parseDigestFile(fixture);
  const { leads } = dedupeLeads(parsedRows, { runFolder: "outputs/test" });
  assert.equal(parsedRows.length, 4);
  assert.equal(leads.length, 3);
  const p15 = leads.find((lead) => lead.radar_id === "P15F1852");
  assert.equal(p15.priority, "High");
  assert.equal(p15.source_events.length, 1);
  assert.equal(p15.exact_duplicate_count, 1);
  assert.equal(leads.find((lead) => lead.radar_id === "P1555F5F").priority, "Medium-High");
  assert.equal(leads.find((lead) => lead.radar_id === "P17C6EDA").priority, "Medium");
});
