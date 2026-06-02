const fs = require("fs");
const path = require("path");
const { FORBIDDEN_ZERO, hash16, sha256File, slugify } = require("./runtime");
const { parseMoneyOrNumber } = require("./normalize-row");
const { parseCsv } = require("./csv-utils");
const { buildBatchActionQueue, writeActionQueueCsv } = require("./monday-action-queue");

const REQUIRED_HEADERS = ["Type", "Address", "City", "Sq Ft", "Beds", "Baths", "Est Value", "Est Equity $", "Owner", "Owner Occ?", "Listed for Sale?"];
const APN_HEADER_ALIASES = ["APN", "Assessor Parcel Number", "Assessor's Parcel Number", "Parcel Number", "Parcel #", "Property APN", "AIN", "PIN"];
const COUNTY_HEADER_ALIASES = ["County", "Property County", "Situs County"];
const RECOGNIZED_TYPES = new Set(["AGR", "APT", "COM", "IND", "LND", "MFR", "OTH", "REC", "RES", "UNK", "UTL"]);
const INCLUDED_TYPES = new Set(["COM", "IND", "APT", "LND"]);
const KNOWN_CLUSTER_ORDER = [
  "CONEJO RIVERSIDE GROUP LLC",
  "ALESSANDRO GROUP",
  "EUCLID HAZARD CAPITAL LLC",
  "ANASTASI,LLOYD R & L",
  "OWNER RECORD",
  "GALOIS GROUP LLC",
  "SDRES PARTNERS LLC",
  "T BK NA"
];

function toRecord(headers, row, sourceRowIndex) {
  const record = { source_row_index: sourceRowIndex };
  headers.forEach((header, index) => {
    record[header] = row[index] === undefined || row[index] === "" ? null : row[index];
  });
  return record;
}

function normalizedHeader(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function findHeader(headers, aliases) {
  const wanted = new Set(aliases.map(normalizedHeader));
  return headers.find((header) => wanted.has(normalizedHeader(header))) || null;
}

function normalizeApn(apn) {
  const trimmed = String(apn ?? "").trim();
  if (!trimmed || /^(?:nan|none|null|n\/a|unknown)$/i.test(trimmed)) return "";
  return trimmed.toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

function normalizeCounty(county) {
  const trimmed = String(county ?? "").trim();
  if (!trimmed || /^(?:nan|none|null|n\/a|unknown)$/i.test(trimmed)) return null;
  return trimmed.toUpperCase();
}

function addIdentityFields(record, { apnHeader, countyHeader }) {
  const rawApn = apnHeader ? String(record[apnHeader] ?? "").trim() : "";
  const normalizedApn = normalizeApn(rawApn);
  record._apn = normalizedApn ? rawApn : null;
  record._normalized_apn = normalizedApn || null;
  record._county = countyHeader ? normalizeCounty(record[countyHeader]) : null;
  return record;
}

function hasKnownAddressAndCity(record) {
  const address = String(record.Address || "").trim();
  const city = String(record.City || "").trim();
  return Boolean(address && city && !/^unknown$/i.test(address) && !/^unknown$/i.test(city));
}

function isTarget(record) {
  const estValue = parseMoneyOrNumber(record["Est Value"]);
  const sqFt = parseMoneyOrNumber(record["Sq Ft"]);
  if (!hasKnownAddressAndCity(record)) return false;
  if (String(record["Owner Occ?"] ?? "") !== "0") return false;
  if ((estValue || 0) < 2000000) return false;
  if (INCLUDED_TYPES.has(record.Type)) return true;
  return record.Type === "MFR" && (sqFt || 0) >= 5000;
}

function propertyKeyFor(record, sourceSha) {
  if (record._normalized_apn) {
    const countySegment = record._county ? `${slugify(record._county)}:` : "";
    return {
      short: `apn:${countySegment}${record._normalized_apn}`,
      full: `apn:${countySegment}${record._normalized_apn}`
    };
  }
  const addressCityOwnerHash = hash16([
    sourceSha,
    record.source_row_index,
    record.Address || "",
    record.City || "",
    record.Owner || ""
  ].join("|"));
  return {
    short: `csv_property:${sourceSha.slice(0, 12)}:${record.source_row_index}:${addressCityOwnerHash}`,
    full: `csv_property:${sourceSha}:${record.source_row_index}:${addressCityOwnerHash}`
  };
}

function buildCandidate(record, sourceSha, clusterId = null, sourceRows = [record]) {
  const estValue = parseMoneyOrNumber(record["Est Value"]);
  const estEquity = parseMoneyOrNumber(record["Est Equity $"]);
  const sqFt = parseMoneyOrNumber(record["Sq Ft"]);
  const key = propertyKeyFor(record, sourceSha);
  const lowEquity = estValue !== null && estEquity !== null ? estEquity <= estValue * 0.15 : false;
  const requiredTasks = ["current_status_task", "document_pull_or_identity_task"];
  if (clusterId) requiredTasks.push("role_assertion_task");
  return {
    source_row_index: record.source_row_index,
    source_row_indexes: sourceRows.map((row) => row.source_row_index),
    property_key: key.short,
    dedupe_key: key.full,
    cluster_id: clusterId,
    apn: record._apn,
    normalized_apn: record._normalized_apn,
    county: record._county,
    type: record.Type,
    address: record.Address,
    city: record.City,
    sq_ft: sqFt,
    est_value: estValue,
    est_equity: estEquity,
    low_equity: lowEquity,
    negative_equity: estEquity !== null ? estEquity < 0 : false,
    owner_string: record.Owner || "",
    owner_occ: record["Owner Occ?"] ?? null,
    listed_for_sale: record["Listed for Sale?"] ?? null,
    identity_status: record._normalized_apn && record._county
      ? "apn_county_present_pending_title_verification"
      : record._normalized_apn
        ? "apn_present_missing_county_pending_title_verification"
        : "provisional_missing_apn_county_radar_id",
    duplicate_identity_count: sourceRows.length - 1,
    control_claim_allowed: false,
    broker_ready: false,
    required_tasks: requiredTasks
  };
}

function groupTargetRowsByIdentity(targetRows) {
  const groups = new Map();
  for (const record of targetRows) {
    const key = record._normalized_apn ? `apn:${record._county || ""}:${record._normalized_apn}` : `row:${record.source_row_index}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  return Array.from(groups.entries()).map(([identityKey, rows]) => ({
    identity_key: identityKey,
    primary: rows[0],
    rows
  }));
}

function duplicateApnGroups(targetRows) {
  const groups = new Map();
  for (const record of targetRows) {
    if (!record._normalized_apn) continue;
    const key = `${record._county || ""}:${record._normalized_apn}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  return Array.from(groups.entries())
    .filter(([, rows]) => rows.length >= 2)
    .map(([key, rows]) => ({ key, rows }));
}

function orderCluster(owner) {
  const idx = KNOWN_CLUSTER_ORDER.indexOf(owner);
  return idx === -1 ? 999 : idx;
}

function buildBatchArtifacts(inputPath, mode, runId) {
  if (mode !== "local_dry_run") {
    throw new Error("batch-owner-clusters only supports --mode local_dry_run");
  }
  const sourceSha = sha256File(inputPath);
  const rawRows = parseCsv(fs.readFileSync(inputPath, "utf8"));
  const headers = rawRows[0] || [];
  for (const required of REQUIRED_HEADERS) {
    if (!headers.includes(required)) throw new Error(`Missing CSV header: ${required}`);
  }
  const apnHeader = findHeader(headers, APN_HEADER_ALIASES);
  const countyHeader = findHeader(headers, COUNTY_HEADER_ALIASES);
  const records = rawRows.slice(1)
    .filter((row) => row.length > 1 || row[0])
    .map((row, index) => addIdentityFields(toRecord(headers, row, index + 1), { apnHeader, countyHeader }));
  const usableRows = records.filter((record) => RECOGNIZED_TYPES.has(record.Type));
  const footerRows = records.filter((record) => !RECOGNIZED_TYPES.has(record.Type));
  const targetRows = usableRows.filter(isTarget);
  const targetIdentityGroups = groupTargetRowsByIdentity(targetRows);
  const targetDuplicateApnGroups = duplicateApnGroups(targetRows);
  const targetGroups = new Map();
  for (const group of targetIdentityGroups) {
    const owner = String(group.primary.Owner || "").trim();
    if (!targetGroups.has(owner)) targetGroups.set(owner, []);
    targetGroups.get(owner).push(group);
  }

  const clusterRows = Array.from(targetGroups.entries())
    .filter(([owner, groups]) => owner && groups.length >= 2)
    .sort(([ownerA], [ownerB]) => orderCluster(ownerA) - orderCluster(ownerB) || ownerA.localeCompare(ownerB));

  const clusterIdByOwner = new Map(clusterRows.map(([owner]) => [owner, `exact-owner-${slugify(owner)}`]));
  const candidateProperties = targetIdentityGroups
    .map((group) => buildCandidate(group.primary, sourceSha, clusterIdByOwner.get(String(group.primary.Owner || "").trim()) || null, group.rows))
    .sort((a, b) => a.source_row_index - b.source_row_index);

  const ownerClusterCandidates = clusterRows.map(([owner, groups]) => {
    const candidates = groups.map((group) => buildCandidate(group.primary, sourceSha, clusterIdByOwner.get(owner), group.rows));
    return {
      cluster_id: clusterIdByOwner.get(owner),
      owner_string: owner,
      match_method: "exact_owner_string_after_target_filter",
      target_row_count: groups.length,
      source_row_count: groups.reduce((sum, group) => sum + group.rows.length, 0),
      negative_equity_count: candidates.filter((candidate) => candidate.negative_equity).length,
      low_equity_count: candidates.filter((candidate) => candidate.low_equity).length,
      total_est_value: candidates.reduce((sum, candidate) => sum + (candidate.est_value || 0), 0),
      total_est_equity: candidates.reduce((sum, candidate) => sum + (candidate.est_equity || 0), 0),
      cities: Array.from(new Set(candidates.map((candidate) => candidate.city))).sort(),
      property_types: Array.from(new Set(candidates.map((candidate) => candidate.type))).sort(),
      control_claim_allowed: false,
      verification_status: "candidate_only",
      stop_reason_if_promoted: "owner_string_without_apn_title_sos_document_current_status_evidence",
      properties: candidates.map((candidate) => ({
        source_row_index: candidate.source_row_index,
        source_row_indexes: candidate.source_row_indexes,
        property_key: `address:${slugify(candidate.address)}:${slugify(candidate.city)}`,
        apn: candidate.apn,
        county: candidate.county,
        type: candidate.type,
        address: candidate.address,
        city: candidate.city,
        sq_ft: candidate.sq_ft,
        est_value: candidate.est_value,
        est_equity: candidate.est_equity,
        owner_occ: candidate.owner_occ,
        listed_for_sale: candidate.listed_for_sale
      }))
    };
  });

  const roleAssertionTasks = ownerClusterCandidates.map((cluster) => ({
    task_id: `role_${cluster.cluster_id}`,
    task_type: "owner_string_candidate",
    cluster_id: cluster.cluster_id,
    property_key: null,
    status: "queued",
    source_ref: `owner_cluster_candidates:${cluster.cluster_id}`,
    approval_required: false,
    approval_id: null,
    caveat: "Owner string is a grouping clue only; no control claim is allowed."
  }));

  const currentStatusTasks = candidateProperties.map((candidate) => ({
    task_id: `current_status_${candidate.source_row_index}`,
    task_type: "current_status_verification",
    cluster_id: candidate.cluster_id,
    property_key: candidate.property_key,
    status: "queued",
    source_ref: `candidate_properties:${candidate.source_row_index}`,
    approval_required: false,
    approval_id: null
  }));

  const documentPullTasks = candidateProperties.map((candidate) => ({
    task_id: `identity_doc_decision_${candidate.source_row_index}`,
    task_type: "identity_document_decision",
    cluster_id: candidate.cluster_id,
    property_key: candidate.property_key,
    status: "blocked",
    source_ref: `candidate_properties:${candidate.source_row_index}`,
    approval_required: false,
    approval_id: null,
    caveat: "Decide whether approved identity/title documents are needed; no paid pull is authorized."
  }));

  const mondayBatchPreview = candidateProperties.map((candidate) => ({
    preview_key: `preview_${candidate.source_row_index}`,
    preview_type: "candidate_property_review_row",
    dedupe_key: candidate.dedupe_key,
    operation: "preview_only",
    broker_ready: false,
    control_claim_allowed: false,
    blocked_reason: "CSV lacks APN/county/Radar ID and title/control evidence; preview verification row only.",
    address: candidate.address,
    city: candidate.city,
    owner_string: candidate.owner_string,
    cluster_id: candidate.cluster_id,
    est_value: candidate.est_value,
    est_equity: candidate.est_equity
  }));
  const mondayActionQueue = buildBatchActionQueue({
    runId,
    candidates: candidateProperties,
    clusters: ownerClusterCandidates,
    roleTasks: roleAssertionTasks,
    currentStatusTasks,
    documentPullTasks
  });

  const missingAddressRows = usableRows.filter((record) => !hasKnownAddressAndCity(record));
  const needsReview = [
    ...footerRows.map((record) => ({
      reason: "footer_or_license_row",
      severity: "info",
      source_row_index: record.source_row_index,
      cluster_id: null,
      summary: "Excluded non-property footer/license row."
    })),
    ...missingAddressRows.map((record) => ({
      reason: "missing_address_or_city",
      severity: "warning",
      source_row_index: record.source_row_index,
      cluster_id: null,
      summary: "CSV row has unknown or blank address/city and cannot be used as property identity."
    })),
    ...ownerClusterCandidates.map((cluster) => ({
      reason: "owner_cluster_unverified",
      severity: "warning",
      source_row_index: null,
      cluster_id: cluster.cluster_id,
      summary: `${cluster.owner_string} has ${cluster.target_row_count} target rows by exact owner string only.`
    })),
    ...targetDuplicateApnGroups.map(({ key, rows }) => {
      const ownerSet = new Set(rows.map((record) => String(record.Owner || "").trim()).filter(Boolean));
      const addressSet = new Set(rows.map((record) => `${record.Address || ""}, ${record.City || ""}`.trim()).filter(Boolean));
      return {
        reason: ownerSet.size > 1 || addressSet.size > 1 ? "duplicate_apn_conflict_collapsed" : "duplicate_apn_collapsed",
        severity: ownerSet.size > 1 || addressSet.size > 1 ? "warning" : "info",
        source_row_index: null,
        source_row_indexes: rows.map((record) => record.source_row_index),
        cluster_id: null,
        apn_key: key,
        summary: `Collapsed ${rows.length} target rows with the same normalized APN into one candidate property.`
      };
    }),
    {
      reason: "estimate_only",
      severity: "info",
      source_row_index: null,
      cluster_id: null,
      summary: "Est Value and Est Equity are triage estimates only; do not use them as verified debt/equity facts."
    }
  ];

  const batchSourceProfile = {
    fixture_name: "propertyradar_export_20260526_091844",
    source_path: inputPath,
    source_sha256: sourceSha,
    headers,
    apn_column: apnHeader,
    county_column: countyHeader,
    parser_records_after_header: records.length,
    usable_property_rows: usableRows.length,
    excluded_footer_rows: footerRows.length,
    unknown_or_blank_address_or_city_rows: missingAddressRows.length,
    non_owner_occupied_rows: usableRows.filter((record) => String(record["Owner Occ?"] ?? "") === "0").length,
    listed_for_sale_rows: usableRows.filter((record) => String(record["Listed for Sale?"] ?? "") === "1").length,
    negative_equity_rows: usableRows.filter((record) => (parseMoneyOrNumber(record["Est Equity $"]) || 0) < 0).length,
    target_filter_rows: targetRows.length,
    target_identity_rows_after_apn_dedupe: candidateProperties.length,
    rows_with_apn: usableRows.filter((record) => record._normalized_apn).length,
    target_rows_with_apn: targetRows.filter((record) => record._normalized_apn).length,
    unique_target_apn_count: new Set(targetRows.map((record) => record._normalized_apn).filter(Boolean)).size,
    duplicate_target_apn_groups: targetDuplicateApnGroups.length,
    duplicate_target_apn_rows: targetDuplicateApnGroups.reduce((sum, group) => sum + group.rows.length - 1, 0),
    target_negative_equity_rows: candidateProperties.filter((candidate) => candidate.negative_equity).length,
    target_low_equity_rows_le_15pct_value: candidateProperties.filter((candidate) => candidate.low_equity).length,
    exact_owner_groups_ge_2_target_properties: ownerClusterCandidates.length,
    rows_in_exact_owner_groups_ge_2: ownerClusterCandidates.reduce((sum, cluster) => sum + cluster.target_row_count, 0),
    control_claims_allowed_from_owner_string: 0,
    type_counts: usableRows.reduce((counts, record) => {
      counts[record.Type] = (counts[record.Type] || 0) + 1;
      return counts;
    }, {}),
    footer_row_samples: footerRows.slice(0, 3)
  };

  const runManifest = {
    run_id: runId,
    mode,
    source_sha256: sourceSha,
    input_paths: [inputPath],
    output_paths: [],
    forbidden_actions: { ...FORBIDDEN_ZERO },
    counts: {
      candidate_properties: candidateProperties.length,
      owner_cluster_candidates: ownerClusterCandidates.length,
      role_assertion_tasks: roleAssertionTasks.length,
      current_status_tasks: currentStatusTasks.length,
      document_pull_tasks: documentPullTasks.length,
      monday_action_queue: mondayActionQueue.length,
      monday_batch_preview: mondayBatchPreview.length
    }
  };

  return {
    batch_source_profile: batchSourceProfile,
    candidate_properties: candidateProperties,
    owner_cluster_candidates: ownerClusterCandidates,
    role_assertion_tasks: roleAssertionTasks,
    current_status_tasks: currentStatusTasks,
    document_pull_tasks: documentPullTasks,
    monday_action_queue: mondayActionQueue,
    monday_batch_preview: mondayBatchPreview,
    needs_review: needsReview,
    run_manifest: runManifest
  };
}

function writeBatchRun(outDir, artifacts) {
  const files = {
    "batch_source_profile.json": artifacts.batch_source_profile,
    "candidate_properties.json": artifacts.candidate_properties,
    "owner_cluster_candidates.json": artifacts.owner_cluster_candidates,
    "role_assertion_tasks.json": artifacts.role_assertion_tasks,
    "current_status_tasks.json": artifacts.current_status_tasks,
    "document_pull_tasks.json": artifacts.document_pull_tasks,
    "monday_batch_preview.json": artifacts.monday_batch_preview,
    "needs_review.json": artifacts.needs_review,
    "run_manifest.json": artifacts.run_manifest
  };
  fs.mkdirSync(outDir, { recursive: true });
  const outputPaths = [];
  for (const [name, value] of Object.entries(files)) {
    const outputPath = path.join(outDir, name);
    fs.writeFileSync(outputPath, `${JSON.stringify(value, null, 2)}\n`);
    outputPaths.push(outputPath);
  }
  writeActionQueueCsv(path.join(outDir, "monday_action_queue.csv"), artifacts.monday_action_queue);
  outputPaths.push(path.join(outDir, "monday_action_queue.csv"));
  artifacts.run_manifest.output_paths = outputPaths;
  fs.writeFileSync(path.join(outDir, "run_manifest.json"), `${JSON.stringify(artifacts.run_manifest, null, 2)}\n`);
}

module.exports = {
  buildBatchArtifacts,
  writeBatchRun,
  parseCsv,
  isTarget,
  normalizeApn
};
