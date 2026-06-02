const fs = require("fs");
const path = require("path");
const { parseDigestFile } = require("./parse-digest");
const { dedupeLeads } = require("./dedupe-leads");
const { mutationPreviewForLead, lookupPlaceholderForLead } = require("./monday-field-map");
const { buildSubitems } = require("./subitems");
const { buildBrokerPackets } = require("./broker-packet-preview");
const { buildApprovalEvents, buildAuditEvents, buildQueueDecisions, buildComments } = require("./approval-audit-preview");
const { exportWorkbook, updateManifestWithWorkbook } = require("./export-workbook");
const { verifyRun } = require("./verify-run");
const { buildBatchArtifacts, writeBatchRun } = require("./batch-owner-clusters");
const { FORBIDDEN_ZERO, ensureDir, writeJson, appendJsonl, nowIso, readJson } = require("./runtime");

const WORKSPACE_ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_RUNS_ROOT = path.join(WORKSPACE_ROOT, "outputs", "monday_digest_runs");
const DEFAULT_BATCH_CSV = process.env.PROPERTYRADAR_BATCH_CSV || path.join(WORKSPACE_ROOT, "data", "Export-20260526-091844.csv");

function runsRoot() {
  return process.env.MONDAY_DIGEST_RUNS_ROOT || DEFAULT_RUNS_ROOT;
}

function safeSlug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 44);
}

function runId(prefix, label = "") {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  const slug = safeSlug(label);
  return slug ? `${prefix}-${stamp}-${slug}` : `${prefix}-${stamp}`;
}

function assertSafeRunId(id) {
  if (!/^[a-zA-Z0-9_.-]+$/.test(id || "")) {
    throw new Error("Invalid run id.");
  }
}

function runPath(id) {
  assertSafeRunId(id);
  return path.join(runsRoot(), id);
}

function readIfExists(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return readJson(file);
}

function createDigestRun({ text, name = "digest" }) {
  if (!text || !String(text).trim()) {
    throw new Error("Paste or upload a PropertyRadar digest first.");
  }
  const id = runId("digest", name);
  const outDir = runPath(id);
  const inputDir = path.join(outDir, "input");
  ensureDir(inputDir);
  const inputPath = path.join(inputDir, "propertyradar_digest.txt");
  fs.writeFileSync(inputPath, String(text));
  writeDigestRun({ inputPath, outDir, mode: "local_dry_run" });
  exportWorkbook(outDir, path.join(outDir, "monday_import_preview.xlsx"));
  updateManifestWithWorkbook(outDir, path.join(outDir, "monday_import_preview.xlsx"));
  verifyRun(outDir);
  return readRunDetails(id);
}

function writeDigestRun({ inputPath, outDir, mode }) {
  ensureDir(outDir);
  const id = path.basename(outDir);
  const at = nowIso();
  const parsed = parseDigestFile(inputPath);
  const deduped = dedupeLeads(parsed.parsedRows, { runFolder: outDir });
  const leads = deduped.leads;
  const sourceEmail = {
    ...parsed.source,
    row_count_raw: parsed.parsedRows.length,
    row_count_unique: leads.length,
    exact_duplicate_count: leads.reduce((sum, lead) => sum + lead.exact_duplicate_count, 0)
  };
  const lookup = leads.map(lookupPlaceholderForLead);
  const mutations = leads.map((lead) => mutationPreviewForLead(lead, mode));
  const subitems = buildSubitems(leads);
  const packets = buildBrokerPackets(leads);
  const approvals = buildApprovalEvents(leads, id, at);
  const comments = buildComments(leads);
  const queue = buildQueueDecisions(leads);
  const audit = buildAuditEvents(id, parsed.parsedRows, leads, deduped.auditEvents, at);
  const manifest = {
    run_id: id,
    started_at: at,
    mode,
    input_paths: [inputPath],
    output_paths: [],
    forbidden_actions: { ...FORBIDDEN_ZERO },
    app_created: true,
    counts: {
      parsed_rows: parsed.parsedRows.length,
      deduped_leads: leads.length,
      exact_duplicate_count: sourceEmail.exact_duplicate_count
    }
  };

  const files = {
    "source_emails.json": [sourceEmail],
    "parsed_rows.json": parsed.parsedRows,
    "deduped_leads.json": leads,
    "monday_lookup_results.json": lookup,
    "monday_mutations_preview.json": mutations,
    "monday_subitems_preview.json": subitems,
    "monday_comments_preview.json": comments,
    "broker_packets_preview.json": packets,
    "approval_events_preview.json": approvals,
    "queue_decisions_preview.json": queue,
    "needs_review.json": parsed.needsReview,
    "run_manifest.json": manifest
  };
  const outputPaths = [];
  for (const [fileName, value] of Object.entries(files)) {
    const outputPath = path.join(outDir, fileName);
    writeJson(outputPath, value);
    outputPaths.push(outputPath);
  }
  appendJsonl(path.join(outDir, "audit_events_preview.jsonl"), audit);
  outputPaths.push(path.join(outDir, "audit_events_preview.jsonl"));
  manifest.output_paths = outputPaths;
  writeJson(path.join(outDir, "run_manifest.json"), manifest);
  for (const lead of leads) {
    ensureDir(path.join(outDir, "evidence", lead.radar_id || lead.dedupe_key.replace(/[^a-z0-9]+/gi, "-"), "titlepro"));
  }
}

function createBatchRun({ csvText = null, csvPath = null, name = "owner-clusters" }) {
  const id = runId("batch", name);
  const outDir = runPath(id);
  const inputDir = path.join(outDir, "input");
  ensureDir(inputDir);
  let inputPath = csvPath || DEFAULT_BATCH_CSV;
  if (csvText && String(csvText).trim()) {
    inputPath = path.join(inputDir, "propertyradar_export.csv");
    fs.writeFileSync(inputPath, String(csvText));
  }
  if (!fs.existsSync(inputPath)) {
    throw new Error(`CSV not found: ${inputPath}`);
  }
  const artifacts = buildBatchArtifacts(inputPath, "local_dry_run", id);
  artifacts.run_manifest.app_created = true;
  artifacts.run_manifest.started_at = nowIso();
  writeBatchRun(outDir, artifacts);
  exportWorkbook(outDir, path.join(outDir, "monday_import_preview.xlsx"));
  updateManifestWithWorkbook(outDir, path.join(outDir, "monday_import_preview.xlsx"));
  verifyRun(outDir);
  return readRunDetails(id);
}

function listRuns() {
  ensureDir(runsRoot());
  return fs.readdirSync(runsRoot(), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => summarizeRun(entry.name))
    .filter(Boolean)
    .sort((a, b) => String(b.started_at || b.modified_at).localeCompare(String(a.started_at || a.modified_at)));
}

function summarizeRun(id) {
  try {
    const folder = runPath(id);
    const manifest = readIfExists(path.join(folder, "run_manifest.json"), {});
    const isBatch = fs.existsSync(path.join(folder, "batch_source_profile.json"));
    const report = readReport(folder);
    const stat = fs.statSync(folder);
    if (isBatch) {
      const profile = readIfExists(path.join(folder, "batch_source_profile.json"), {});
      return {
        id,
        type: "batch",
        mode: manifest.mode || "local_dry_run",
        started_at: manifest.started_at || null,
        modified_at: stat.mtime.toISOString(),
        status: report.status,
        counts: {
          candidate_properties: profile.target_filter_rows || manifest.counts?.candidate_properties || 0,
          owner_clusters: profile.exact_owner_groups_ge_2_target_properties || manifest.counts?.owner_cluster_candidates || 0,
          negative_equity: profile.target_negative_equity_rows || 0,
          low_equity: profile.target_low_equity_rows_le_15pct_value || 0
        },
        report_path: path.join(folder, "verification_report.md"),
        workbook: fs.existsSync(path.join(folder, "monday_import_preview.xlsx"))
      };
    }
    const leads = readIfExists(path.join(folder, "deduped_leads.json"), []);
    const parsed = readIfExists(path.join(folder, "parsed_rows.json"), []);
    return {
      id,
      type: "digest",
      mode: manifest.mode || "local_dry_run",
      started_at: manifest.started_at || null,
      modified_at: stat.mtime.toISOString(),
      status: report.status,
      counts: {
        parsed_rows: parsed.length,
        deduped_leads: leads.length,
        exact_duplicates: leads.reduce((sum, lead) => sum + (lead.exact_duplicate_count || 0), 0),
        hard_holds: leads.filter((lead) => lead.hard_hold).length
      },
      report_path: path.join(folder, "verification_report.md"),
      workbook: fs.existsSync(path.join(folder, "monday_import_preview.xlsx"))
    };
  } catch {
    return null;
  }
}

function readRunDetails(id) {
  const summary = summarizeRun(id);
  if (!summary) throw new Error(`Run not found: ${id}`);
  const folder = runPath(id);
  if (summary.type === "batch") {
    return {
      summary,
      profile: readIfExists(path.join(folder, "batch_source_profile.json"), {}),
      clusters: readIfExists(path.join(folder, "owner_cluster_candidates.json"), []),
      candidates: readIfExists(path.join(folder, "candidate_properties.json"), []),
      role_tasks: readIfExists(path.join(folder, "role_assertion_tasks.json"), []),
      current_status_tasks: readIfExists(path.join(folder, "current_status_tasks.json"), []),
      document_pull_tasks: readIfExists(path.join(folder, "document_pull_tasks.json"), []),
      preview: readIfExists(path.join(folder, "monday_batch_preview.json"), []),
      needs_review: readIfExists(path.join(folder, "needs_review.json"), []),
      report: readReport(folder).text
    };
  }
  return {
    summary,
    source_emails: readIfExists(path.join(folder, "source_emails.json"), []),
    parsed_rows: readIfExists(path.join(folder, "parsed_rows.json"), []),
    leads: readIfExists(path.join(folder, "deduped_leads.json"), []),
    mutations: readIfExists(path.join(folder, "monday_mutations_preview.json"), []),
    subitems: readIfExists(path.join(folder, "monday_subitems_preview.json"), []),
    packets: readIfExists(path.join(folder, "broker_packets_preview.json"), []),
    needs_review: readIfExists(path.join(folder, "needs_review.json"), []),
    report: readReport(folder).text
  };
}

function readReport(folder) {
  const reportPath = path.join(folder, "verification_report.md");
  if (!fs.existsSync(reportPath)) return { status: "UNKNOWN", text: "" };
  const text = fs.readFileSync(reportPath, "utf8");
  const status = /Status:\s*PASS/.test(text) ? "PASS" : /Status:\s*FAIL/.test(text) ? "FAIL" : "UNKNOWN";
  return { status, text };
}

function downloadableFile(id, fileName) {
  assertSafeRunId(id);
  const allowed = new Set([
    "monday_import_preview.xlsx",
    "verification_report.md",
    "deduped_leads.json",
    "monday_mutations_preview.json",
    "monday_subitems_preview.json",
    "broker_packets_preview.json",
    "candidate_properties.json",
    "owner_cluster_candidates.json",
    "monday_batch_preview.json"
  ]);
  if (!allowed.has(fileName)) throw new Error("File is not downloadable from the app.");
  const file = path.join(runPath(id), fileName);
  if (!fs.existsSync(file)) throw new Error(`File not found: ${fileName}`);
  return file;
}

module.exports = {
  DEFAULT_BATCH_CSV,
  DEFAULT_RUNS_ROOT,
  runsRoot,
  runPath,
  createDigestRun,
  createBatchRun,
  listRuns,
  readRunDetails,
  downloadableFile
};
