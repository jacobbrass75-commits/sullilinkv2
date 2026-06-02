#!/usr/bin/env node
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
const { buildTitleProApprovalQueue } = require("./titlepro-approval-queue");
const { assertLiveWriteAllowed, redactedBoardShapeFromEnv } = require("./monday-graphql");
const { FORBIDDEN_ZERO, ensureDir, writeJson, appendJsonl, nowIso } = require("./runtime");

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = { command };
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = rest[i + 1];
      if (!next || next.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = next;
        i += 1;
      }
    }
  }
  return args;
}

function usage() {
  return [
    "Usage:",
    "  codex-monday-digest parse --input FILE --mode local_dry_run --out RUN_FOLDER",
    "  codex-monday-digest preview --input SAVED_EMAIL_FILE --label LABEL --since WINDOW --mode gmail_preview --out RUN_FOLDER",
    "  codex-monday-digest export --run RUN_FOLDER --xlsx RUN_FOLDER/monday_import_preview.xlsx",
    "  codex-monday-digest verify --run RUN_FOLDER",
    "  codex-monday-digest batch-owner-clusters --input CSV --mode local_dry_run --out RUN_FOLDER",
    "  codex-monday-digest sync --run RUN_FOLDER --mode monday_lookup_dry_run|live_write"
  ].join("\n");
}

function runIdFromOut(outDir) {
  return path.basename(path.resolve(outDir)).replace(/[^a-zA-Z0-9_-]+/g, "_") || `run_${Date.now()}`;
}

function rejectAmbiguousDryRun(mode) {
  if (mode === "dry_run") {
    throw new Error("Use --mode local_dry_run or --mode monday_lookup_dry_run; dry_run alone is ambiguous.");
  }
}

function writeDigestRunFromFile({ input, out, mode, inputPaths = [input], sourceOverrides = {} }) {
  const outDir = out;
  ensureDir(outDir);
  const runId = runIdFromOut(outDir);
  const at = nowIso();
  const parsed = parseDigestFile(input);
  const deduped = dedupeLeads(parsed.parsedRows, { runFolder: outDir });
  const leads = deduped.leads;
  const sourceEmail = {
    ...parsed.source,
    ...sourceOverrides,
    row_count_raw: parsed.parsedRows.length,
    row_count_unique: leads.length,
    exact_duplicate_count: leads.reduce((sum, lead) => sum + lead.exact_duplicate_count, 0)
  };
  const lookup = leads.map(lookupPlaceholderForLead);
  const mutations = leads.map((lead) => mutationPreviewForLead(lead, mode));
  const titleproQueue = buildTitleProApprovalQueue(leads, runId);
  const subitems = buildSubitems(leads, { titleproQueue });
  const packets = buildBrokerPackets(leads);
  const approvals = buildApprovalEvents(leads, runId, at);
  const comments = buildComments(leads);
  const queue = buildQueueDecisions(leads, { titleproQueue });
  const audit = buildAuditEvents(runId, parsed.parsedRows, leads, deduped.auditEvents, at);
  const needsReview = parsed.needsReview;
  const manifest = {
    run_id: runId,
    started_at: at,
    mode,
    input_paths: inputPaths,
    output_paths: [],
    forbidden_actions: { ...FORBIDDEN_ZERO },
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
    "titlepro_approval_queue_preview.json": titleproQueue,
    "broker_packets_preview.json": packets,
    "approval_events_preview.json": approvals,
    "queue_decisions_preview.json": queue,
    "needs_review.json": needsReview,
    "run_manifest.json": manifest
  };
  const outputPaths = [];
  for (const [name, value] of Object.entries(files)) {
    const outputPath = path.join(outDir, name);
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
  return { parsedRows: parsed.parsedRows, leads, outDir };
}

function parseCommand(args) {
  rejectAmbiguousDryRun(args.mode);
  if (!args.input || !args.out || args.mode !== "local_dry_run") {
    throw new Error("parse requires --input FILE --mode local_dry_run --out RUN_FOLDER");
  }
  const { parsedRows, leads, outDir } = writeDigestRunFromFile({
    input: args.input,
    out: args.out,
    mode: args.mode
  });
  console.log(`parsed_rows=${parsedRows.length} deduped_leads=${leads.length} out=${outDir}`);
}

function previewCommand(args) {
  rejectAmbiguousDryRun(args.mode);
  if (args.mode !== "gmail_preview" || !args.out) {
    throw new Error("preview requires --input SAVED_EMAIL_FILE --label LABEL --since WINDOW --mode gmail_preview --out RUN_FOLDER");
  }
  if (args.input) {
    const label = args.label || "CRE/PropertyRadar Alerts";
    const since = args.since || "2d";
    const { parsedRows, leads, outDir } = writeDigestRunFromFile({
      input: args.input,
      out: args.out,
      mode: "gmail_preview",
      inputPaths: [`gmail_preview:${label}:${since}`, args.input],
      sourceOverrides: {
        collection_mode: "gmail_preview",
        gmail_selector_label: label,
        gmail_selector_since: since
      }
    });
    console.log(`gmail_preview_rows=${parsedRows.length} deduped_leads=${leads.length} out=${outDir}`);
    return;
  }
  ensureDir(args.out);
  const runId = runIdFromOut(args.out);
  const at = nowIso();
  const manifest = {
    run_id: runId,
    started_at: at,
    mode: "gmail_preview",
    input_paths: [`gmail:${args.label || "CRE/PropertyRadar Alerts"}:${args.since || "2d"}`],
    output_paths: [],
    forbidden_actions: { ...FORBIDDEN_ZERO },
    blocked_reason: "Gmail connector read is intentionally not implemented in the first local runner proof."
  };
  writeJson(path.join(args.out, "source_emails.json"), []);
  writeJson(path.join(args.out, "parsed_rows.json"), []);
  writeJson(path.join(args.out, "deduped_leads.json"), []);
  writeJson(path.join(args.out, "monday_lookup_results.json"), []);
  writeJson(path.join(args.out, "monday_mutations_preview.json"), []);
  writeJson(path.join(args.out, "monday_subitems_preview.json"), []);
  writeJson(path.join(args.out, "monday_comments_preview.json"), []);
  writeJson(path.join(args.out, "titlepro_approval_queue_preview.json"), []);
  writeJson(path.join(args.out, "broker_packets_preview.json"), []);
  writeJson(path.join(args.out, "approval_events_preview.json"), []);
  writeJson(path.join(args.out, "queue_decisions_preview.json"), []);
  writeJson(path.join(args.out, "needs_review.json"), [{ source_id: "gmail_preview", reason: "unsupported_format", severity: "blocker", summary: "Use saved digest text until Gmail preview is promoted." }]);
  appendJsonl(path.join(args.out, "audit_events_preview.jsonl"), [{ run_id: runId, event_type: "preview_blocked", at, lead_key: null, summary: "Gmail preview blocked in first local proof." }]);
  writeJson(path.join(args.out, "run_manifest.json"), manifest);
  console.log(`gmail_preview_blocked out=${args.out}`);
}

function exportCommand(args) {
  if (!args.run || !args.xlsx) throw new Error("export requires --run RUN_FOLDER --xlsx PATH");
  exportWorkbook(args.run, args.xlsx);
  updateManifestWithWorkbook(args.run, args.xlsx);
  console.log(`xlsx=${args.xlsx}`);
}

function syncCommand(args) {
  rejectAmbiguousDryRun(args.mode);
  if (!args.run || !["monday_lookup_dry_run", "live_write"].includes(args.mode)) {
    throw new Error("sync requires --run RUN_FOLDER --mode monday_lookup_dry_run|live_write");
  }
  if (args.mode === "live_write") assertLiveWriteAllowed();

  const leadsPath = path.join(args.run, "deduped_leads.json");
  const leads = fs.existsSync(leadsPath) ? JSON.parse(fs.readFileSync(leadsPath, "utf8")) : [];
  const lookup = leads.map((lead) => ({
    dedupe_key: lead.dedupe_key,
    radar_id: lead.radar_id,
    lookup_mode: args.mode,
    result: args.mode === "monday_lookup_dry_run" ? "not_run" : "error",
    existing_item_id: null,
    error: args.mode === "monday_lookup_dry_run" ? "Monday read connector not configured in local proof; no mutation executed." : "live_write is blocked unless explicit gates pass."
  }));
  writeJson(path.join(args.run, "monday_lookup_results.json"), lookup);
  writeJson(path.join(args.run, "monday_board_shape_redacted.json"), redactedBoardShapeFromEnv());
  console.log(`${args.mode}=no_mutations lookup_rows=${lookup.length}`);
}

function batchCommand(args) {
  rejectAmbiguousDryRun(args.mode);
  if (!args.input || !args.out || args.mode !== "local_dry_run") {
    throw new Error("batch-owner-clusters requires --input CSV --mode local_dry_run --out RUN_FOLDER");
  }
  const runId = runIdFromOut(args.out);
  const artifacts = buildBatchArtifacts(args.input, args.mode, runId);
  writeBatchRun(args.out, artifacts);
  console.log(`candidate_properties=${artifacts.candidate_properties.length} owner_clusters=${artifacts.owner_cluster_candidates.length} out=${args.out}`);
}

function verifyCommand(args) {
  if (!args.run) throw new Error("verify requires --run RUN_FOLDER");
  const result = verifyRun(args.run);
  process.stdout.write(result.report);
  if (!result.passed) process.exitCode = 1;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  try {
    switch (args.command) {
      case "parse":
        parseCommand(args);
        break;
      case "preview":
        previewCommand(args);
        break;
      case "export":
        exportCommand(args);
        break;
      case "sync":
        syncCommand(args);
        break;
      case "batch-owner-clusters":
        batchCommand(args);
        break;
      case "verify":
        verifyCommand(args);
        break;
      default:
        console.error(usage());
        process.exitCode = 2;
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  parseArgs,
  parseCommand,
  previewCommand,
  exportCommand,
  batchCommand,
  verifyCommand
};
