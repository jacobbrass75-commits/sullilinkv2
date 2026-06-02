const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { parseDigestFile, parseDigestText } = require("../src/parse-digest");
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

test("PropertyRadar HTML table parses like the daily digest email", () => {
  const html = `
Subject: FW: Daily Digest Alert: Ken Kahan List
From: Broker User <broker@example.com>
Message timestamp: 2026-05-30T04:16:22
<p>Your daily digest alert, Ken Kahan List, found matches.</p>
<table>
  <tr>
    <th>Radar ID</th><th>Street</th><th>City</th><th>Zip</th><th>State</th><th>Type</th>
    <th>Sq Ft</th><th>Beds</th><th>Baths</th><th>Est. Value</th><th>What Changed</th>
  </tr>
  <tr>
    <td><a href="https://goradar.it/P15F1852">P15F1852</a></td><td>2701 STATHAM BLVD</td><td>OXNARD</td><td>93033</td><td>CA</td><td>IND</td>
    <td>102,543</td><td></td><td></td><td>$8,458,447</td><td>New Notice</td>
  </tr>
  <tr>
    <td><a href="https://goradar.it/P15F1852">P15F1852</a></td><td>2701 STATHAM BLVD</td><td>OXNARD</td><td>93033</td><td>CA</td><td>IND</td>
    <td>102,543</td><td></td><td></td><td>$8,458,447</td><td>New Notice</td>
  </tr>
  <tr>
    <td>P1555F5F</td><td>16757 SLOVER AVE</td><td>FONTANA</td><td>92337</td><td>CA</td><td>COM</td>
    <td>59,524</td><td></td><td></td><td>$2,750,000</td><td>New Matches</td>
  </tr>
</table>`;
  const { parsedRows, needsReview } = parseDigestText(html, "html_fixture.html");
  const { leads } = dedupeLeads(parsedRows, { runFolder: "outputs/test" });
  assert.equal(needsReview.length, 0);
  assert.equal(parsedRows.length, 3);
  assert.equal(leads.length, 2);
  assert.equal(leads.find((lead) => lead.radar_id === "P15F1852").exact_duplicate_count, 1);
  assert.equal(leads.find((lead) => lead.radar_id === "P1555F5F").source_events[0].what_changed, "New Matches");
});

test("PropertyRadar HTML parser flags malformed short rows for review", () => {
  const html = `
Subject: FW: Daily Digest Alert: Ken Kahan List
<table>
  <tr>
    <th>Radar ID</th><th>Street</th><th>City</th><th>Zip</th><th>State</th><th>Type</th>
    <th>Sq Ft</th><th>Beds</th><th>Baths</th><th>Est. Value</th><th>What Changed</th>
  </tr>
  <tr>
    <td><a href="https://goradar.it/P15F1852">P15F1852</a></td><td>2701 STATHAM BLVD</td><td>OXNARD</td><td>93033</td><td>CA</td><td>IND</td>
    <td>102,543</td><td></td><td></td><td>$8,458,447</td><td>New Notice</td>
  </tr>
  <tr><td>P17C6EDA</td><td>14338 FOOTHILL BLVD</td></tr>
</table>`;

  const { parsedRows, needsReview } = parseDigestText(html, "html_fixture.html");
  assert.equal(parsedRows.length, 1);
  assert.ok(needsReview.some((row) => row.reason === "malformed_html_table_row"));
});
