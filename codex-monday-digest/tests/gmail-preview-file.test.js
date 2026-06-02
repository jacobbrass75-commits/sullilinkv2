const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parseCommand, previewCommand } = require("../src/cli");
const { verifyRun } = require("../src/verify-run");

function savedHtmlDigest() {
  return `
Subject: FW: Daily Digest Alert: Ken Kahan List
From: Broker User <broker@example.com>
Original sender: PropertyRadar Alerts <no-reply@propertyradar.info>
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
    <td><a href="https://goradar.it/P1555F5F">P1555F5F</a></td><td>16757 SLOVER AVE</td><td>FONTANA</td><td>92337</td><td>CA</td><td>COM</td>
    <td>59,524</td><td></td><td></td><td>$2,750,000</td><td>New Matches</td>
  </tr>
</table>`;
}

function topLevelArtifacts(runFolder) {
  return fs.readdirSync(runFolder).sort();
}

test("gmail_preview parses a saved PropertyRadar HTML digest and verifies", () => {
  assert.equal(typeof previewCommand, "function");

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "codex-monday-gmail-preview-"));
  const input = path.join(tmp, "saved-propertyradar-digest.html");
  const parseOut = path.join(tmp, "parse-run");
  const out = path.join(tmp, "gmail-preview-run");
  fs.writeFileSync(input, savedHtmlDigest());

  parseCommand({ input, mode: "local_dry_run", out: parseOut });
  previewCommand({
    input,
    mode: "gmail_preview",
    out,
    label: "CRE/PropertyRadar Alerts",
    since: "2d"
  });

  assert.deepEqual(topLevelArtifacts(out), topLevelArtifacts(parseOut));

  const manifest = JSON.parse(fs.readFileSync(path.join(out, "run_manifest.json"), "utf8"));
  assert.equal(manifest.mode, "gmail_preview");
  assert.ok(manifest.input_paths.includes(input));
  assert.ok(manifest.input_paths.some((inputPath) => {
    return inputPath.startsWith("gmail")
      && inputPath.includes("CRE/PropertyRadar Alerts")
      && inputPath.includes("2d");
  }));

  const parsedRows = JSON.parse(fs.readFileSync(path.join(out, "parsed_rows.json"), "utf8"));
  const leads = JSON.parse(fs.readFileSync(path.join(out, "deduped_leads.json"), "utf8"));
  assert.equal(parsedRows.length, 3);
  assert.equal(leads.length, 2);

  const result = verifyRun(out);
  assert.equal(result.passed, true, result.report);
});
