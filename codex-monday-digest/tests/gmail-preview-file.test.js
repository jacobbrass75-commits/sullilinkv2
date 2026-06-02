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

test("gmail_connector_preview parses saved Gmail connector JSON without Gmail writes", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "codex-monday-gmail-connector-preview-"));
  const out = path.join(tmp, "gmail-connector-run");
  const input = path.join(__dirname, "..", "fixtures", "gmail_connector_read_sample.json");

  previewCommand({
    "gmail-json": input,
    mode: "gmail_connector_preview",
    out,
    label: "CRE/PropertyRadar Alerts",
    since: "30d"
  });

  const sourceEmails = JSON.parse(fs.readFileSync(path.join(out, "source_emails.json"), "utf8"));
  const parsedRows = JSON.parse(fs.readFileSync(path.join(out, "parsed_rows.json"), "utf8"));
  const leads = JSON.parse(fs.readFileSync(path.join(out, "deduped_leads.json"), "utf8"));
  const sourceProfile = JSON.parse(fs.readFileSync(path.join(out, "gmail_connector_source_profile.json"), "utf8"));
  const manifest = JSON.parse(fs.readFileSync(path.join(out, "run_manifest.json"), "utf8"));

  assert.equal(manifest.mode, "gmail_connector_preview");
  assert.equal(sourceEmails.length, 1);
  assert.equal(sourceEmails[0].gmail_message_id, "gmail-msg-ken-kahan-001");
  assert.equal(sourceEmails[0].gmail_thread_id, "gmail-thread-ken-kahan");
  assert.equal(sourceEmails[0].collection_mode, "gmail_connector_preview");
  assert.equal(sourceEmails[0].from.startsWith("redacted_contact:"), true);
  assert.equal(sourceEmails[0].to.startsWith("redacted_contact:"), true);
  assert.equal(sourceEmails[0].row_count_raw, 3);
  assert.equal(sourceEmails[0].row_count_unique, 2);
  assert.equal(sourceEmails[0].exact_duplicate_count, 1);
  assert.equal(parsedRows.length, 3);
  assert.equal(parsedRows.every((row) => row.source_id === "gmail:gmail-msg-ken-kahan-001"), true);
  assert.equal(leads.length, 2);
  assert.equal(sourceProfile.source_path, "gmail_connector_read_sample.json");
  assert.equal(sourceProfile.source_path_scope, "basename_only");
  assert.equal(sourceProfile.parsed_row_count, 3);
  assert.equal(sourceProfile.gmail_mutations_executed, 0);
  assert.equal(sourceProfile.gmail_sends_executed, 0);
  assert.equal(sourceProfile.external_writes_executed, 0);
  assert.equal(manifest.input_paths.includes(input), false);
  assert.ok(manifest.input_paths.some((inputPath) => inputPath.startsWith("gmail_connector_json:gmail_connector_read_sample.json:")));

  const result = verifyRun(out);
  assert.equal(result.passed, true, result.report);
});

test("gmail_connector_preview fails verification for snippet-only connector search results", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "codex-monday-gmail-snippet-only-"));
  const input = path.join(tmp, "snippet-only.json");
  const out = path.join(tmp, "gmail-connector-run");
  fs.writeFileSync(input, JSON.stringify({
    messages: [
      {
        id: "gmail-msg-snippet-only",
        thread_id: "gmail-thread-snippet-only",
        subject: "Daily Digest Alert: Ken Kahan List",
        snippet: "Your daily digest alert found matches, but this search result has no table body."
      }
    ]
  }, null, 2));

  previewCommand({
    "gmail-json": input,
    mode: "gmail_connector_preview",
    out,
    label: "CRE/PropertyRadar Alerts",
    since: "30d"
  });

  const parsedRows = JSON.parse(fs.readFileSync(path.join(out, "parsed_rows.json"), "utf8"));
  const needsReview = JSON.parse(fs.readFileSync(path.join(out, "needs_review.json"), "utf8"));
  assert.equal(parsedRows.length, 0);
  assert.ok(needsReview.some((row) => row.reason === "no_propertyradar_table_found" || row.reason === "no_table_found"));

  const result = verifyRun(out);
  assert.equal(result.passed, false);
  assert.ok(result.failed.some((check) => check.message.includes("at least one parsed PropertyRadar lead")));
});

test("gmail_connector_preview records per-message duplicate provenance across connector messages", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "codex-monday-gmail-cross-message-duplicate-"));
  const input = path.join(tmp, "two-message-duplicate.json");
  const out = path.join(tmp, "gmail-connector-run");
  const row = "<tr><td><a href=\"https://goradar.it/P15F1852\">P15F1852</a></td><td>2701 STATHAM BLVD</td><td>OXNARD</td><td>93033</td><td>CA</td><td>IND</td><td>102,543</td><td></td><td></td><td>$8,458,447</td><td>New Notice</td></tr>";
  const body = (name) => [
    `Subject: Daily Digest Alert: ${name}`,
    "",
    `<p>Your daily digest alert, ${name}, found matches.</p>`,
    "<table>",
    "<tr><th>Radar ID</th><th>Street</th><th>City</th><th>Zip</th><th>State</th><th>Type</th><th>Sq Ft</th><th>Beds</th><th>Baths</th><th>Est. Value</th><th>What Changed</th></tr>",
    row,
    "</table>"
  ].join("\n");
  fs.writeFileSync(input, JSON.stringify({
    emails: [
      { id: "gmail-msg-one", thread_id: "gmail-thread-one", subject: "Daily Digest Alert: Ken Kahan List", from: "broker@example.com", body: body("Ken Kahan List") },
      { id: "gmail-msg-two", thread_id: "gmail-thread-two", subject: "Daily Digest Alert: Ken Kahan List", from: "broker@example.com", body: body("Ken Kahan List") }
    ]
  }, null, 2));

  previewCommand({
    "gmail-json": input,
    mode: "gmail_connector_preview",
    out,
    label: "CRE/PropertyRadar Alerts",
    since: "30d"
  });

  const sourceEmails = JSON.parse(fs.readFileSync(path.join(out, "source_emails.json"), "utf8"));
  const leads = JSON.parse(fs.readFileSync(path.join(out, "deduped_leads.json"), "utf8"));
  assert.equal(leads.length, 1);
  assert.equal(leads[0].exact_duplicate_count, 1);
  assert.deepEqual(sourceEmails.map((source) => ({
    id: source.gmail_message_id,
    raw: source.row_count_raw,
    unique: source.row_count_unique,
    duplicates: source.exact_duplicate_count
  })), [
    { id: "gmail-msg-one", raw: 1, unique: 1, duplicates: 0 },
    { id: "gmail-msg-two", raw: 1, unique: 0, duplicates: 1 }
  ]);

  const result = verifyRun(out);
  assert.equal(result.passed, true, result.report);
});
