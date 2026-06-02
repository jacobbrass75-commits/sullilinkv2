const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parseCommand, statusImportCommand } = require("../src/cli");
const { readCurrentStatusFile, matchCurrentStatusToLeads, buildCurrentStatusAssertions } = require("../src/current-status-intake");
const { verifyRun } = require("../src/verify-run");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function makeDigestRun(prefix = "codex-current-status-") {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const out = path.join(tmp, "run");
  const digest = path.join(__dirname, "..", "fixtures", "ken_kahan_digest_2026-05-30.txt");
  parseCommand({ input: digest, mode: "local_dry_run", out });
  return { tmp, out };
}

test("status-import ingests saved current-status evidence without provider or outreach actions", () => {
  const { out } = makeDigestRun();
  const statusFile = path.join(__dirname, "..", "fixtures", "current_status_sample.json");

  const source = readCurrentStatusFile(statusFile);
  assert.equal(source.record_count, 1);
  assert.equal(source.provider_backfills_executed, 0);

  statusImportCommand({ run: out, status: statusFile });

  const records = readJson(path.join(out, "current_status_intake.json"));
  const assertions = readJson(path.join(out, "current_status_assertions_preview.json"));
  const profile = readJson(path.join(out, "current_status_source_profile.json"));
  const manifest = readJson(path.join(out, "run_manifest.json"));
  const needsReview = readJson(path.join(out, "needs_review.json"));

  assert.equal(records.length, 1);
  assert.equal(records[0].match_status, "matched");
  assert.equal(records[0].lead_key, "radar_id:P15F1852");
  assert.equal(records[0].provider_backfill_executed, false);
  assert.equal(records[0].external_lookup_executed, false);
  assert.equal(records[0].outreach_executed, false);
  assert.equal(records[0].external_write_executed, false);
  assert.equal(assertions.length, 1);
  assert.equal(assertions[0].current_status_use_allowed, false);
  assert.equal(assertions[0].current_status_urgency_claim_allowed, false);
  assert.equal(assertions[0].broker_action_ready, false);
  assert.equal(assertions[0].outreach_ready, false);
  assert.equal(assertions[0].provider_backfill_allowed, false);
  assert.equal(assertions[0].day_of_action_recheck_required, true);
  assert.equal(profile.source_path, "current_status_sample.json");
  assert.equal(profile.source_path_scope, "basename_only");
  assert.equal(profile.record_count, 1);
  assert.equal(profile.assertion_count, assertions.length);
  assert.equal(profile.provider_backfills_executed, 0);
  assert.equal(profile.external_lookups_executed, 0);
  assert.equal(profile.outreach_actions_executed, 0);
  assert.equal(profile.external_writes_executed, 0);
  assert.equal(manifest.forbidden_actions.provider_backfills, 0);
  assert.equal(manifest.forbidden_actions.control_claim_promotions, 0);
  assert.ok(needsReview.some((row) => row.reason === "day_of_action_status_recheck_required"));

  const result = verifyRun(out);
  assert.equal(result.passed, true, result.report);
  assert.match(result.report, /current status source profile records zero provider\/outreach\/write actions/);
});

test("status-import flags unmatched saved status rows for review", () => {
  const { tmp, out } = makeDigestRun("codex-current-status-unmatched-");
  const statusFile = path.join(tmp, "unmatched-status.csv");
  fs.writeFileSync(statusFile, [
    "radar_id,subject,provider,public_status,next_action",
    "PUNKNOWN,Unknown Owner / 1 Missing Way,example status source,Active sale-date note requires recheck,Confirm official status before broker action"
  ].join("\n"));

  statusImportCommand({ run: out, status: statusFile });

  const records = readJson(path.join(out, "current_status_intake.json"));
  const assertions = readJson(path.join(out, "current_status_assertions_preview.json"));
  const needsReview = readJson(path.join(out, "needs_review.json"));

  assert.equal(records[0].match_status, "unmatched_review");
  assert.equal(assertions[0].broker_action_ready, false);
  assert.equal(assertions[0].day_of_action_recheck_required, true);
  assert.ok(needsReview.some((row) => row.reason === "current_status_not_matched_to_run_lead"));
  assert.ok(needsReview.some((row) => row.reason === "current_status_as_of_missing"));

  const result = verifyRun(out);
  assert.equal(result.passed, true, result.report);
});

test("current status can match by normalized address", () => {
  const source = readCurrentStatusFile(path.join(__dirname, "..", "fixtures", "current_status_sample.json"));
  const withoutRadar = source.records.map((record) => ({
    ...record,
    radar_id: null,
    property_address: "2701 Statham Boulevard Oxnard CA 93033",
    normalized_address_key: "2701 statham oxnard 93033"
  }));
  const matched = matchCurrentStatusToLeads(withoutRadar, [
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
  const assertions = buildCurrentStatusAssertions(matched);
  assert.equal(assertions[0].current_status_use_allowed, false);
  assert.equal(assertions[0].provider_backfill_allowed, false);
  assert.equal(assertions[0].day_of_action_recheck_required, true);
});
