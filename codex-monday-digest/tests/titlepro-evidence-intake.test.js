const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parseCommand, titleProImportCommand } = require("../src/cli");
const { readTitleProEvidenceFile, matchTitleProEvidenceToLeads, buildTitleProRoleAssertions } = require("../src/titlepro-evidence-intake");
const { verifyRun } = require("../src/verify-run");

test("saved TitlePro evidence imports into role assertions without executing pulls", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "codex-titlepro-evidence-"));
  const out = path.join(tmp, "run");
  const digest = path.join(__dirname, "..", "fixtures", "ken_kahan_digest_2026-05-30.txt");
  const evidence = path.join(__dirname, "..", "fixtures", "titlepro_evidence_sample.json");

  const source = readTitleProEvidenceFile(evidence);
  assert.equal(source.record_count, 2);
  assert.equal(source.profile_count, 1);
  assert.equal(source.document_count, 1);
  assert.equal(source.titlepro_pulls_executed, 0);

  parseCommand({ input: digest, mode: "local_dry_run", out });
  titleProImportCommand({ run: out, evidence });

  const records = JSON.parse(fs.readFileSync(path.join(out, "titlepro_evidence_intake.json"), "utf8"));
  const assertions = JSON.parse(fs.readFileSync(path.join(out, "titlepro_role_assertions_preview.json"), "utf8"));
  const profile = JSON.parse(fs.readFileSync(path.join(out, "titlepro_evidence_source_profile.json"), "utf8"));
  const manifest = JSON.parse(fs.readFileSync(path.join(out, "run_manifest.json"), "utf8"));
  const needsReview = JSON.parse(fs.readFileSync(path.join(out, "needs_review.json"), "utf8"));

  assert.equal(records.length, 2);
  assert.equal(records.every((record) => record.match_status === "matched"), true);
  assert.equal(records.every((record) => record.lead_key === "radar_id:P15F1852"), true);
  assert.equal(records.every((record) => record.titlepro_pulls_executed === false), true);
  assert.equal(profile.source_path, "titlepro_evidence_sample.json");
  assert.equal(profile.source_path_scope, "basename_only");
  assert.equal(profile.record_count, 2);
  assert.equal(profile.role_assertion_count, assertions.length);
  assert.equal(profile.titlepro_pulls_executed, 0);
  assert.equal(profile.paid_actions_executed, 0);
  assert.equal(profile.external_writes_executed, 0);
  assert.equal(manifest.forbidden_actions.titlepro_pulls, 0);
  assert.ok(manifest.output_paths.some((outputPath) => outputPath.endsWith("titlepro_role_assertions_preview.json")));
  assert.ok(needsReview.some((row) => row.reason === "manual_titlepro_document_targets_remaining"));

  const roles = new Map(assertions.map((row) => [row.role, row]));
  assert.equal(roles.get("title_owner").actor, "Statham Industrial LLC");
  assert.equal(roles.get("title_owner").title_owner_claim_allowed, true);
  assert.equal(roles.get("title_owner").beneficial_owner_claim_allowed, false);
  assert.equal(roles.get("trustor").actor, "Statham Industrial LLC");
  assert.equal(roles.get("beneficiary").actor, "Preferred Bank");
  assert.equal(roles.get("beneficiary").service_actor, true);
  assert.equal(roles.get("beneficiary").control_lead_claim_allowed, false);
  assert.equal(roles.get("trustee").service_actor, true);
  assert.equal(roles.get("recorded_signer").actor, "Jordan Manager");
  assert.equal(roles.get("recorded_signer").control_lead_claim_allowed, true);
  assert.equal(assertions.every((row) => row.beneficial_owner_claim_allowed === false && row.outreach_ready === false), true);

  const verification = verifyRun(out);
  assert.equal(verification.passed, true, verification.report);
  assert.match(verification.report, /TitlePro evidence import executed no paid\/browser\/write actions/);
});

test("TitlePro evidence can match leads by normalized address when Radar ID is absent", () => {
  const evidence = readTitleProEvidenceFile(path.join(__dirname, "..", "fixtures", "titlepro_evidence_sample.json"));
  const withoutRadar = evidence.records.map((record) => ({ ...record, radar_id: null }));
  const matched = matchTitleProEvidenceToLeads(withoutRadar, [
    {
      dedupe_key: "radar_id:P15F1852",
      radar_id: "P15F1852",
      street: "2701 STATHAM BLVD",
      city: "OXNARD",
      state: "CA",
      zip: "93033"
    }
  ]);
  assert.equal(matched.every((record) => record.match_status === "matched"), true);
  const assertions = buildTitleProRoleAssertions(matched);
  assert.ok(assertions.some((row) => row.role === "recorded_signer" && row.control_lead_claim_allowed === true));
  assert.equal(assertions.every((row) => row.beneficial_owner_claim_allowed === false), true);
});
