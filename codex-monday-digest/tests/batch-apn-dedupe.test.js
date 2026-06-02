const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildBatchArtifacts, normalizeApn, writeBatchRun } = require("../src/batch-owner-clusters");
const { verifyRun } = require("../src/verify-run");

function writeFixtureCsv() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "codex-monday-apn-batch-"));
  const csv = path.join(tmp, "apn-batch.csv");
  fs.writeFileSync(csv, [
    "Type,Address,City,Sq Ft,Beds,Baths,Est Value,Est Equity $,Owner,Owner Occ?,Listed for Sale?,APN,County",
    "COM,100 MAIN ST,LOS ANGELES,10000,,,3000000,100000,ACME HOLDINGS LLC,0,0,123-456-789,Los Angeles",
    "COM,100 MAIN ST,LOS ANGELES,10000,,,3000000,100000,ACME HOLDINGS LLC,0,0,123 456 789,Los Angeles",
    "IND,200 SIDE ST,LOS ANGELES,12000,,,4000000,-500000,ACME HOLDINGS LLC,0,0,987-654-321,Los Angeles",
    "RES,1 HOUSE ST,LOS ANGELES,1200,,,3500000,1000000,ACME HOLDINGS LLC,0,0,555-111-222,Los Angeles"
  ].join("\n"));
  return { tmp, csv };
}

test("batch preview collapses duplicate target rows by normalized APN when APN columns exist", () => {
  assert.equal(normalizeApn("123-456 789"), "123456789");

  const { tmp, csv } = writeFixtureCsv();
  const artifacts = buildBatchArtifacts(csv, "local_dry_run", "apn-test");
  const out = path.join(tmp, "run");
  writeBatchRun(out, artifacts);

  assert.equal(artifacts.batch_source_profile.apn_column, "APN");
  assert.equal(artifacts.batch_source_profile.county_column, "County");
  assert.equal(artifacts.batch_source_profile.target_filter_rows, 3);
  assert.equal(artifacts.batch_source_profile.target_identity_rows_after_apn_dedupe, 2);
  assert.equal(artifacts.batch_source_profile.duplicate_target_apn_groups, 1);
  assert.equal(artifacts.batch_source_profile.duplicate_target_apn_rows, 1);

  assert.equal(artifacts.candidate_properties.length, 2);
  const duplicated = artifacts.candidate_properties.find((candidate) => candidate.normalized_apn === "123456789");
  assert.deepEqual(duplicated.source_row_indexes, [1, 2]);
  assert.equal(duplicated.duplicate_identity_count, 1);
  assert.equal(duplicated.dedupe_key, "apn:los-angeles:123456789");
  assert.equal(duplicated.identity_status, "apn_county_present_pending_title_verification");
  assert.equal(duplicated.control_claim_allowed, false);

  assert.equal(artifacts.owner_cluster_candidates.length, 1);
  assert.equal(artifacts.owner_cluster_candidates[0].target_row_count, 2);
  assert.equal(artifacts.owner_cluster_candidates[0].source_row_count, 3);
  assert.equal(artifacts.needs_review.some((row) => row.reason === "duplicate_apn_collapsed"), true);

  const verification = verifyRun(out);
  assert.equal(verification.passed, true, verification.report);
  assert.match(verification.report, /APN-aware identity count matches candidate properties/);
});
