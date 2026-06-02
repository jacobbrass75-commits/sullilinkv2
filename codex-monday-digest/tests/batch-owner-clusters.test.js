const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildBatchArtifacts } = require("../src/batch-owner-clusters");

test("batch owner-cluster fixture matches expected candidates and clusters", (t) => {
  const workspace = path.resolve(__dirname, "..", "..");
  const csv = process.env.PROPERTYRADAR_BATCH_CSV || path.join(workspace, "data", "Export-20260526-091844.csv");
  if (!fs.existsSync(csv)) {
    t.skip("PropertyRadar batch CSV fixture is not present on this machine.");
    return;
  }

  const artifacts = buildBatchArtifacts(csv, "local_dry_run", "test-batch");
  const expectedCandidatesPath = path.join(workspace, "outputs/cre_ops_blueprint/fixtures/propertyradar/batch_exports/export_20260526_091844_candidate_properties_expected.json");
  const expectedClustersPath = path.join(workspace, "outputs/cre_ops_blueprint/fixtures/propertyradar/batch_exports/export_20260526_091844_owner_clusters_expected.json");
  if (!fs.existsSync(expectedCandidatesPath) || !fs.existsSync(expectedClustersPath)) {
    t.skip("Expected batch assertion files are not present on this machine.");
    return;
  }
  const expectedCandidates = JSON.parse(fs.readFileSync(expectedCandidatesPath, "utf8")).candidate_properties;
  const expectedClusters = JSON.parse(fs.readFileSync(expectedClustersPath, "utf8")).owner_cluster_candidates;

  assert.equal(artifacts.batch_source_profile.source_sha256, "604fcf4e09602a1bec0740a727ffa68716ccb19259a1d7ff18446c3412a64f11");
  assert.equal(artifacts.candidate_properties.length, 242);
  assert.equal(artifacts.owner_cluster_candidates.length, 8);
  assert.deepEqual(projectCandidate(artifacts.candidate_properties[0]), projectCandidate(expectedCandidates[0]));
  assert.deepEqual(projectCandidate(artifacts.candidate_properties.at(-1)), projectCandidate(expectedCandidates.at(-1)));
  assert.deepEqual(projectCluster(artifacts.owner_cluster_candidates[0]), projectCluster(expectedClusters[0]));
  assert.deepEqual(projectCluster(artifacts.owner_cluster_candidates.at(-1)), projectCluster(expectedClusters.at(-1)));
});

function projectCandidate(row) {
  return {
    source_row_index: row.source_row_index,
    property_key: row.property_key,
    dedupe_key: row.dedupe_key,
    cluster_id: row.cluster_id,
    address: row.address,
    city: row.city,
    owner_string: row.owner_string,
    control_claim_allowed: row.control_claim_allowed,
    broker_ready: row.broker_ready
  };
}

function projectCluster(row) {
  return {
    cluster_id: row.cluster_id,
    owner_string: row.owner_string,
    target_row_count: row.target_row_count,
    negative_equity_count: row.negative_equity_count,
    low_equity_count: row.low_equity_count,
    total_est_value: row.total_est_value,
    total_est_equity: row.total_est_equity,
    control_claim_allowed: row.control_claim_allowed,
    verification_status: row.verification_status
  };
}
