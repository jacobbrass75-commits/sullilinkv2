const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parseCommand, contactImportCommand } = require("../src/cli");
const { readContactEnrichmentFile, matchContactEnrichmentToLeads, buildContactRoleAssertions } = require("../src/contact-enrichment-intake");
const { verifyRun } = require("../src/verify-run");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function makeDigestRun() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "codex-contact-enrichment-"));
  const out = path.join(tmp, "run");
  const digest = path.join(__dirname, "..", "fixtures", "ken_kahan_digest_2026-05-30.txt");
  parseCommand({ input: digest, mode: "local_dry_run", out });
  return { tmp, out };
}

test("contact-import ingests manual contact pasteback without outreach or CRM actions", () => {
  const { out } = makeDigestRun();
  const contacts = path.join(__dirname, "..", "fixtures", "contact_enrichment_sample.csv");

  const source = readContactEnrichmentFile(contacts);
  assert.equal(source.record_count, 1);
  assert.equal(source.external_lookups_executed, 0);

  contactImportCommand({ run: out, contacts });

  const records = readJson(path.join(out, "contact_enrichment_intake.json"));
  const assertions = readJson(path.join(out, "contact_role_assertions_preview.json"));
  const profile = readJson(path.join(out, "contact_enrichment_source_profile.json"));
  const manifest = readJson(path.join(out, "run_manifest.json"));
  const needsReview = readJson(path.join(out, "needs_review.json"));

  assert.equal(records.length, 1);
  assert.equal(records[0].match_status, "matched");
  assert.equal(records[0].lead_key, "radar_id:P15F1852");
  assert.equal(records[0].rocketreach_reveal_executed, false);
  assert.equal(records[0].realnex_write_executed, false);
  assert.equal(records[0].outreach_executed, false);
  assert.equal(assertions.length, 1);
  assert.equal(assertions[0].contact_name, "Jordan Manager");
  assert.equal(assertions[0].contact_use_allowed, false);
  assert.equal(assertions[0].outreach_ready, false);
  assert.equal(assertions[0].realnex_write_allowed, false);
  assert.equal(assertions[0].control_lead_claim_allowed, false);
  assert.equal(assertions[0].beneficial_owner_claim_allowed, false);
  assert.equal(profile.source_path, "contact_enrichment_sample.csv");
  assert.equal(profile.source_path_scope, "basename_only");
  assert.equal(profile.record_count, 1);
  assert.equal(profile.role_assertion_count, assertions.length);
  assert.equal(profile.rocketreach_reveals_executed, 0);
  assert.equal(profile.external_lookups_executed, 0);
  assert.equal(profile.realnex_writes_executed, 0);
  assert.equal(profile.outreach_actions_executed, 0);
  assert.equal(manifest.forbidden_actions.realnex_writes, 0);
  assert.equal(manifest.forbidden_actions.control_claim_promotions, 0);
  assert.ok(needsReview.some((row) => row.reason === "manual_contact_requires_broker_approval"));

  const result = verifyRun(out);
  assert.equal(result.passed, true, result.report);
  assert.match(result.report, /contact enrichment import executed no lookup\/outreach\/CRM actions/);
});

test("contact-import flags unmatched contact pasteback rows for review", () => {
  const { tmp, out } = makeDigestRun();
  const contacts = path.join(tmp, "unmatched-contacts.csv");
  fs.writeFileSync(contacts, [
    "radar_id,owner_entity,contact_name,relationship_to_owner,source_type,email,confidence",
    "PUNKNOWN,Unknown Owner LLC,Unmatched Person,member candidate,manual_pasteback,unmatched@example.com,manual_unverified"
  ].join("\n"));

  contactImportCommand({ run: out, contacts });

  const records = readJson(path.join(out, "contact_enrichment_intake.json"));
  const assertions = readJson(path.join(out, "contact_role_assertions_preview.json"));
  const needsReview = readJson(path.join(out, "needs_review.json"));

  assert.equal(records[0].match_status, "unmatched_review");
  assert.equal(assertions[0].outreach_ready, false);
  assert.ok(needsReview.some((row) => row.reason === "contact_not_matched_to_run_lead"));

  const result = verifyRun(out);
  assert.equal(result.passed, true, result.report);
});

test("contact enrichment can match by normalized address", () => {
  const source = readContactEnrichmentFile(path.join(__dirname, "..", "fixtures", "contact_enrichment_sample.csv"));
  const withoutRadar = source.records.map((record) => ({
    ...record,
    radar_id: null,
    property_address: "2701 Statham Boulevard Oxnard CA 93033",
    normalized_address_key: "2701 statham oxnard 93033"
  }));
  const matched = matchContactEnrichmentToLeads(withoutRadar, [
    {
      dedupe_key: "radar_id:P15F1852",
      radar_id: "P15F1852",
      street: "2701 STATHAM BLVD",
      city: "OXNARD",
      state: "CA",
      zip: "93033"
    }
  ]);
  assert.equal(matched[0].match_status, "matched");
  const assertions = buildContactRoleAssertions(matched);
  assert.equal(assertions[0].beneficial_owner_claim_allowed, false);
  assert.equal(assertions[0].contact_use_allowed, false);
});
