#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { parseDigestFile } = require("./parse-digest");
const { readGmailConnectorPreviewFile } = require("./gmail-connector-preview");
const { dedupeLeads, eventFingerprint } = require("./dedupe-leads");
const { mutationPreviewForLead, lookupPlaceholderForLead } = require("./monday-field-map");
const { buildSubitems } = require("./subitems");
const { buildBrokerPackets } = require("./broker-packet-preview");
const { buildApprovalEvents, buildAuditEvents, buildQueueDecisions, buildComments } = require("./approval-audit-preview");
const { exportWorkbook, updateManifestWithWorkbook } = require("./export-workbook");
const { verifyRun } = require("./verify-run");
const { buildBatchArtifacts, writeBatchRun } = require("./batch-owner-clusters");
const { buildTitleProApprovalQueue } = require("./titlepro-approval-queue");
const { applyTitleProApprovals, readApprovalFile } = require("./titlepro-approval-intake");
const { applyTitleProActionConfirmations, readTitleProConfirmationFile } = require("./titlepro-action-confirmation");
const { readTitleProEvidenceFile, matchTitleProEvidenceToLeads, buildTitleProRoleAssertions, buildTitleProNeedsReview } = require("./titlepro-evidence-intake");
const { readContactEnrichmentFile, matchContactEnrichmentToLeads, buildContactRoleAssertions, buildContactNeedsReview } = require("./contact-enrichment-intake");
const { readCurrentStatusFile, matchCurrentStatusToLeads, buildCurrentStatusAssertions, buildCurrentStatusNeedsReview } = require("./current-status-intake");
const { buildSourceReuseAudit, writeSourceAuditRun } = require("./source-reuse-audit");
const { buildGoalAudit, writeGoalAuditRun } = require("./goal-audit");
const { buildPacketAudit, writePacketAuditRun } = require("./packet-audit");
const { buildSafetyAudit, writeSafetyAuditRun } = require("./safety-audit");
const { buildConnectorReadiness, writeConnectorReadinessRun } = require("./connector-readiness");
const { buildWorkflowMap, writeWorkflowMapRun } = require("./monday-workflow-map");
const { buildSkillPackageCheck, writeSkillPackageCheckRun, buildSkillPackageBundle, writeSkillPackageBundleRun } = require("./skill-package-check");
const { buildDigestActionQueue, writeActionQueueCsv } = require("./monday-action-queue");
const { lookupLeads, readLookupFile, readMondayConnectorLookupFile } = require("./monday-lookup");
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
    "  codex-monday-digest preview --gmail-json GMAIL_CONNECTOR_READ.json --label LABEL --since WINDOW --mode gmail_connector_preview --out RUN_FOLDER",
    "  codex-monday-digest export --run RUN_FOLDER --xlsx RUN_FOLDER/monday_import_preview.xlsx",
    "  codex-monday-digest verify --run RUN_FOLDER",
    "  codex-monday-digest batch-owner-clusters --input CSV --mode local_dry_run --out RUN_FOLDER",
    "  codex-monday-digest workflow-map --workflow-dir MONDAY_EXPORT_DIR --out RUN_FOLDER",
    "  codex-monday-digest workflow-map --input MONDAY_WORKFLOW_EXPORT.xlsx --out RUN_FOLDER",
    "  codex-monday-digest sync --run RUN_FOLDER --mode monday_lookup_dry_run --lookup-file MONDAY_EXPORT.csv|json|xlsx",
    "  codex-monday-digest sync --run RUN_FOLDER --mode monday_lookup_dry_run --connector-json MONDAY_CONNECTOR_READ.json",
    "  codex-monday-digest titlepro-approve --run RUN_FOLDER --approvals APPROVALS.csv|json",
    "  codex-monday-digest titlepro-confirm --run RUN_FOLDER --confirmations CONFIRMATIONS.csv|json",
    "  codex-monday-digest titlepro-import --run RUN_FOLDER --evidence TITLEPRO_EVIDENCE.json",
    "  codex-monday-digest contact-import --run RUN_FOLDER --contacts CONTACTS.csv|json",
    "  codex-monday-digest status-import --run RUN_FOLDER --status STATUS.json|csv",
    "  codex-monday-digest skill-check --skill-dir SKILL_DIR --package-json PACKAGE.json --goal-md GOAL.md --out RUN_FOLDER",
    "  codex-monday-digest skill-pack --skill-dir SKILL_DIR --package-json PACKAGE.json --goal-md GOAL.md --out RUN_FOLDER",
    "  codex-monday-digest goal-audit --goal-md GOAL.md --package-json PACKAGE.json --proof-root OUTPUT_ROOT --out RUN_FOLDER",
    "  codex-monday-digest packet-audit --packet-dir PACKET_DIR --out RUN_FOLDER",
    "  codex-monday-digest safety-audit --proof-root OUTPUT_ROOT --goal-md GOAL.md --out RUN_FOLDER",
    "  codex-monday-digest source-audit --zip SOURCE.zip --source-dir EXTERNAL_REFERENCE_DIR --goal-md GOAL.md --out RUN_FOLDER",
    "  codex-monday-digest connector-readiness --gmail-json GMAIL_CONNECTOR_READ.json --monday-json MONDAY_CONNECTOR_READ.json --label LABEL --since WINDOW --out RUN_FOLDER",
    "  codex-monday-digest sync --run RUN_FOLDER --mode live_write"
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
  const parsed = parseDigestFile(input);
  return writeDigestRunFromParsed({
    parsedRows: parsed.parsedRows,
    needsReview: parsed.needsReview,
    sourceEmails: [parsed.source],
    out,
    mode,
    inputPaths,
    sourceOverrides
  });
}

function writeDigestRunFromParsed({ parsedRows, needsReview = [], sourceEmails = [], out, mode, inputPaths, sourceOverrides = {}, extraFiles = {} }) {
  const outDir = out;
  ensureDir(outDir);
  const runId = runIdFromOut(outDir);
  const at = nowIso();
  const deduped = dedupeLeads(parsedRows, { runFolder: outDir });
  const leads = deduped.leads;
  const sourceStats = sourceEventStats(parsedRows);
  const sourceEmailRows = sourceEmails.map((source) => ({
    ...source,
    ...sourceOverrides,
    row_count_raw: sourceStats.get(source.source_id)?.raw || 0,
    row_count_unique: sourceStats.get(source.source_id)?.unique || 0,
    exact_duplicate_count: sourceStats.get(source.source_id)?.duplicates || 0
  }));
  const lookup = leads.map(lookupPlaceholderForLead);
  const mutations = leads.map((lead) => mutationPreviewForLead(lead, mode));
  const titleproQueue = buildTitleProApprovalQueue(leads, runId);
  const subitems = buildSubitems(leads, { titleproQueue });
  const actionQueue = buildDigestActionQueue({ runId, leads, subitems, titleproQueue });
  const packets = buildBrokerPackets(leads);
  const approvals = buildApprovalEvents(leads, runId, at);
  const comments = buildComments(leads);
  const queue = buildQueueDecisions(leads, { titleproQueue });
  const audit = buildAuditEvents(runId, parsedRows, leads, deduped.auditEvents, at);
  const manifest = {
    run_id: runId,
    started_at: at,
    mode,
    input_paths: inputPaths,
    output_paths: [],
    forbidden_actions: { ...FORBIDDEN_ZERO },
    counts: {
      parsed_rows: parsedRows.length,
      deduped_leads: leads.length,
      exact_duplicate_count: leads.reduce((sum, lead) => sum + lead.exact_duplicate_count, 0)
    }
  };

  const files = {
    "source_emails.json": sourceEmailRows,
    "parsed_rows.json": parsedRows,
    "deduped_leads.json": leads,
    "monday_lookup_results.json": lookup,
    "monday_mutations_preview.json": mutations,
    "monday_subitems_preview.json": subitems,
    "monday_comments_preview.json": comments,
    "titlepro_approval_queue_preview.json": titleproQueue,
    "titlepro_approval_decisions.json": [],
    "titlepro_pull_requests_approved.json": [],
    "broker_packets_preview.json": packets,
    "approval_events_preview.json": approvals,
    "queue_decisions_preview.json": queue,
    "needs_review.json": needsReview,
    ...extraFiles,
    "run_manifest.json": manifest
  };
  const outputPaths = [];
  for (const [name, value] of Object.entries(files)) {
    const outputPath = path.join(outDir, name);
    writeJson(outputPath, value);
    outputPaths.push(outputPath);
  }
  writeActionQueueCsv(path.join(outDir, "monday_action_queue.csv"), actionQueue);
  outputPaths.push(path.join(outDir, "monday_action_queue.csv"));
  appendJsonl(path.join(outDir, "audit_events_preview.jsonl"), audit);
  outputPaths.push(path.join(outDir, "audit_events_preview.jsonl"));
  manifest.output_paths = outputPaths;
  writeJson(path.join(outDir, "run_manifest.json"), manifest);

  for (const lead of leads) {
    ensureDir(path.join(outDir, "evidence", lead.radar_id || lead.dedupe_key.replace(/[^a-z0-9]+/gi, "-"), "titlepro"));
  }
  return { parsedRows, leads, outDir };
}

function sourceEventStats(parsedRows) {
  const stats = new Map();
  const seen = new Set();
  for (const row of parsedRows) {
    const sourceId = row.source_id || "unknown_source";
    if (!stats.has(sourceId)) stats.set(sourceId, { raw: 0, unique: 0, duplicates: 0 });
    const sourceStats = stats.get(sourceId);
    sourceStats.raw += 1;
    const fingerprint = eventFingerprint(row);
    if (seen.has(fingerprint)) {
      sourceStats.duplicates += 1;
    } else {
      sourceStats.unique += 1;
      seen.add(fingerprint);
    }
  }
  return stats;
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
  if (!["gmail_preview", "gmail_connector_preview"].includes(args.mode) || !args.out) {
    throw new Error("preview requires --input SAVED_EMAIL_FILE --mode gmail_preview or --gmail-json GMAIL_CONNECTOR_READ.json --mode gmail_connector_preview");
  }
  if (args.mode === "gmail_connector_preview") {
    const gmailJson = args["gmail-json"] || args.gmail_json || args.gmailJson;
    if (!gmailJson) throw new Error("gmail_connector_preview requires --gmail-json GMAIL_CONNECTOR_READ.json");
    const label = args.label || "CRE/PropertyRadar Alerts";
    const since = args.since || "2d";
    const connector = readGmailConnectorPreviewFile(gmailJson, {
      label,
      since,
      query: args.query
    });
    const { parsedRows, leads, outDir } = writeDigestRunFromParsed({
      parsedRows: connector.parsedRows,
      needsReview: connector.needsReview,
      sourceEmails: connector.sourceEmails,
      out: args.out,
      mode: "gmail_connector_preview",
      inputPaths: [
        `gmail_connector_preview:${label}:${since}`,
        `gmail_connector_json:${path.basename(gmailJson)}:${connector.sourceProfile.source_sha256.slice(0, 16)}`
      ],
      extraFiles: {
        "gmail_connector_source_profile.json": connector.sourceProfile
      }
    });
    console.log(`gmail_connector_preview_rows=${parsedRows.length} deduped_leads=${leads.length} out=${outDir}`);
    return;
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
    blocked_reason: "Supply --input SAVED_EMAIL_FILE or --gmail-json GMAIL_CONNECTOR_READ.json; the local runner does not call Gmail directly."
  };
  writeJson(path.join(args.out, "source_emails.json"), []);
  writeJson(path.join(args.out, "parsed_rows.json"), []);
  writeJson(path.join(args.out, "deduped_leads.json"), []);
  writeJson(path.join(args.out, "monday_lookup_results.json"), []);
  writeJson(path.join(args.out, "monday_mutations_preview.json"), []);
  writeJson(path.join(args.out, "monday_subitems_preview.json"), []);
  writeJson(path.join(args.out, "monday_comments_preview.json"), []);
  writeJson(path.join(args.out, "titlepro_approval_queue_preview.json"), []);
  writeJson(path.join(args.out, "titlepro_approval_decisions.json"), []);
  writeJson(path.join(args.out, "titlepro_pull_requests_approved.json"), []);
  writeJson(path.join(args.out, "broker_packets_preview.json"), []);
  writeJson(path.join(args.out, "approval_events_preview.json"), []);
  writeJson(path.join(args.out, "queue_decisions_preview.json"), []);
  writeActionQueueCsv(path.join(args.out, "monday_action_queue.csv"), []);
  writeJson(path.join(args.out, "needs_review.json"), [{ source_id: "gmail_preview", reason: "missing_preview_input", severity: "blocker", summary: "Supply a saved email file or Gmail connector read JSON." }]);
  appendJsonl(path.join(args.out, "audit_events_preview.jsonl"), [{ run_id: runId, event_type: "preview_blocked", at, lead_key: null, summary: "Gmail preview blocked because no input file or connector JSON was supplied." }]);
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
  const lookupFile = args["lookup-file"] || args.lookup_file || args.lookupFile;
  const connectorJson = args["connector-json"] || args.connector_json || args.connectorJson;
  if (lookupFile && connectorJson) {
    throw new Error("sync accepts either --lookup-file or --connector-json, not both");
  }
  let lookup;
  let sourceProfile = null;
  let connectorProfile = null;
  let lookupMode = args.mode;
  if (args.mode === "monday_lookup_dry_run" && connectorJson) {
    const connectorSource = readMondayConnectorLookupFile(connectorJson);
    lookupMode = "monday_connector_lookup";
    lookup = lookupLeads(leads, connectorSource.records, lookupMode);
    connectorProfile = {
      source_path: connectorSource.source_path,
      source_path_scope: connectorSource.source_path_scope,
      source_sha256: connectorSource.source_sha256,
      source_format: connectorSource.source_format,
      collection_mode: connectorSource.collection_mode,
      board_count: connectorSource.board_count,
      lookup_record_count: connectorSource.lookup_record_count,
      monday_live_writes_executed: connectorSource.monday_live_writes_executed,
      write_actions_executed: connectorSource.write_actions_executed,
      external_writes_executed: connectorSource.external_writes_executed,
      matched_lead_count: lookup.filter((row) => row.result === "matched").length,
      duplicate_match_lead_count: lookup.filter((row) => row.result === "duplicate_match").length,
      not_found_lead_count: lookup.filter((row) => row.result === "not_found").length
    };
    sourceProfile = connectorProfile;
  } else if (args.mode === "monday_lookup_dry_run" && lookupFile) {
    const lookupSource = readLookupFile(lookupFile);
    lookup = lookupLeads(leads, lookupSource.records, "monday_lookup_file");
    sourceProfile = {
      source_path: path.basename(lookupSource.source_path),
      source_path_scope: "basename_only",
      source_sha256: lookupSource.source_sha256,
      source_format: lookupSource.source_format,
      collection_mode: "monday_lookup_file",
      lookup_record_count: lookupSource.records.length,
      matched_lead_count: lookup.filter((row) => row.result === "matched").length,
      duplicate_match_lead_count: lookup.filter((row) => row.result === "duplicate_match").length,
      not_found_lead_count: lookup.filter((row) => row.result === "not_found").length,
      write_actions_executed: 0
    };
  } else {
    lookup = leads.map((lead) => ({
      dedupe_key: lead.dedupe_key,
      radar_id: lead.radar_id,
      lookup_mode: args.mode,
      result: args.mode === "monday_lookup_dry_run" ? "not_run" : "error",
      match_count: 0,
      existing_item_id: null,
      existing_item_ids: [],
      existing_item_name: null,
      existing_item_names: [],
      board_id: null,
      board_ids: [],
      group_id: null,
      group_ids: [],
      error: args.mode === "monday_lookup_dry_run" ? "Supply --lookup-file with a Monday board export or --connector-json with a read-only Monday connector result." : "live_write is blocked unless explicit gates pass."
    }));
  }
  writeJson(path.join(args.run, "monday_lookup_results.json"), lookup);
  writeJson(path.join(args.run, "monday_board_shape_redacted.json"), redactedBoardShapeFromEnv());
  if (sourceProfile) writeJson(path.join(args.run, "monday_lookup_source_profile.json"), sourceProfile);
  if (connectorProfile) writeJson(path.join(args.run, "monday_connector_source_profile.json"), connectorProfile);
  updateManifestAfterSync(args.run, [
    path.join(args.run, "monday_lookup_results.json"),
    path.join(args.run, "monday_board_shape_redacted.json"),
    ...(sourceProfile ? [path.join(args.run, "monday_lookup_source_profile.json")] : []),
    ...(connectorProfile ? [path.join(args.run, "monday_connector_source_profile.json")] : [])
  ], lookupMode);
  const matched = lookup.filter((row) => row.result === "matched" || row.result === "duplicate_match").length;
  console.log(`${lookupMode}=no_mutations lookup_rows=${lookup.length} matched_or_duplicate=${matched}`);
}

function updateManifestAfterSync(runFolder, outputPaths, lookupMode = "monday_lookup_dry_run") {
  const manifestPath = path.join(runFolder, "run_manifest.json");
  if (!fs.existsSync(manifestPath)) return;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.output_paths = Array.from(new Set([...(manifest.output_paths || []), ...outputPaths]));
  manifest.last_lookup_sync_at = nowIso();
  manifest.last_lookup_mode = lookupMode;
  manifest.forbidden_actions = manifest.forbidden_actions || { ...FORBIDDEN_ZERO };
  manifest.forbidden_actions.monday_live_writes = manifest.forbidden_actions.monday_live_writes || 0;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function titleProApproveCommand(args) {
  if (!args.run || !args.approvals) {
    throw new Error("titlepro-approve requires --run RUN_FOLDER --approvals APPROVALS.csv|json");
  }
  const queuePath = path.join(args.run, "titlepro_approval_queue_preview.json");
  if (!fs.existsSync(queuePath)) throw new Error("Run has no titlepro_approval_queue_preview.json");
  const queueRows = JSON.parse(fs.readFileSync(queuePath, "utf8"));
  const approvalSource = readApprovalFile(args.approvals);
  const { decisions, approvedPullRequests } = applyTitleProApprovals(queueRows, approvalSource.approvals);
  writeJson(path.join(args.run, "titlepro_approval_decisions.json"), decisions);
  writeJson(path.join(args.run, "titlepro_pull_requests_approved.json"), approvedPullRequests);
  const leads = JSON.parse(fs.readFileSync(path.join(args.run, "deduped_leads.json"), "utf8"));
  const subitems = JSON.parse(fs.readFileSync(path.join(args.run, "monday_subitems_preview.json"), "utf8"));
  const manifestPath = path.join(args.run, "run_manifest.json");
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : {};
  const actionQueue = buildDigestActionQueue({
    runId: manifest.run_id || path.basename(path.resolve(args.run)),
    leads,
    subitems,
    titleproQueue: queueRows,
    approvedTitleproPulls: approvedPullRequests
  });
  writeActionQueueCsv(path.join(args.run, "monday_action_queue.csv"), actionQueue);
  const invalidDecisionCount = decisions.filter((decision) => decision.validation_errors.length > 0).length;
  writeJson(path.join(args.run, "titlepro_approval_source_profile.json"), {
    source_path: approvalSource.source_path,
    source_sha256: approvalSource.source_sha256,
    source_format: approvalSource.source_format,
    approval_record_count: approvalSource.approvals.length,
    approved_decision_count: decisions.filter((decision) => decision.decision === "approved").length,
    recorded_approval_count: decisions.filter((decision) => decision.approval_recorded).length,
    hold_decision_count: decisions.filter((decision) => decision.decision === "hold").length,
    rejected_decision_count: decisions.filter((decision) => decision.decision === "rejected").length,
    approved_pull_request_count: approvedPullRequests.length,
    invalid_decision_count: invalidDecisionCount,
    titlepro_pulls_executed: 0,
    external_writes_executed: 0
  });
  updateManifestAfterTitleProApproval(args.run, [
    path.join(args.run, "titlepro_approval_decisions.json"),
    path.join(args.run, "titlepro_pull_requests_approved.json"),
    path.join(args.run, "titlepro_approval_source_profile.json"),
    path.join(args.run, "monday_action_queue.csv")
  ]);
  console.log(`titlepro_approval_decisions=${decisions.length} approved_pull_requests=${approvedPullRequests.length} invalid_decisions=${invalidDecisionCount} titlepro_pulls_executed=0`);
}

function titleProConfirmCommand(args) {
  const confirmationsPath = args.confirmations || args.confirmation || args["confirmation-file"] || args.confirmation_file || args.confirmationFile;
  if (!args.run || !confirmationsPath) {
    throw new Error("titlepro-confirm requires --run RUN_FOLDER --confirmations CONFIRMATIONS.csv|json");
  }
  const approvedPath = path.join(args.run, "titlepro_pull_requests_approved.json");
  if (!fs.existsSync(approvedPath)) throw new Error("Run has no titlepro_pull_requests_approved.json");
  const approvedPullRequests = JSON.parse(fs.readFileSync(approvedPath, "utf8"));
  const confirmationSource = readTitleProConfirmationFile(confirmationsPath);
  const { confirmationRows, confirmedActions } = applyTitleProActionConfirmations(approvedPullRequests, confirmationSource.confirmations);
  writeJson(path.join(args.run, "titlepro_action_confirmations.json"), confirmationRows);
  writeJson(path.join(args.run, "titlepro_confirmed_manual_actions.json"), confirmedActions);
  const leads = JSON.parse(fs.readFileSync(path.join(args.run, "deduped_leads.json"), "utf8"));
  const subitems = JSON.parse(fs.readFileSync(path.join(args.run, "monday_subitems_preview.json"), "utf8"));
  const titleproQueue = JSON.parse(fs.readFileSync(path.join(args.run, "titlepro_approval_queue_preview.json"), "utf8"));
  const manifestPath = path.join(args.run, "run_manifest.json");
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : {};
  const actionQueue = buildDigestActionQueue({
    runId: manifest.run_id || path.basename(path.resolve(args.run)),
    leads,
    subitems,
    titleproQueue,
    approvedTitleproPulls: approvedPullRequests,
    confirmedTitleproActions: confirmedActions
  });
  writeActionQueueCsv(path.join(args.run, "monday_action_queue.csv"), actionQueue);
  const invalidConfirmationCount = confirmationRows.filter((row) => row.validation_errors.length > 0).length;
  writeJson(path.join(args.run, "titlepro_action_confirmation_source_profile.json"), {
    source_path: confirmationSource.source_path,
    source_path_scope: confirmationSource.source_path_scope,
    source_sha256: confirmationSource.source_sha256,
    source_format: confirmationSource.source_format,
    confirmation_record_count: confirmationSource.confirmations.length,
    action_time_confirmed_count: confirmedActions.length,
    invalid_confirmation_count: invalidConfirmationCount,
    titlepro_pulls_executed: 0,
    browser_actions_executed: 0,
    paid_actions_executed: 0,
    external_writes_executed: 0
  });
  updateManifestAfterTitleProConfirmation(args.run, [
    path.join(args.run, "titlepro_action_confirmations.json"),
    path.join(args.run, "titlepro_confirmed_manual_actions.json"),
    path.join(args.run, "titlepro_action_confirmation_source_profile.json"),
    path.join(args.run, "monday_action_queue.csv")
  ]);
  console.log(`titlepro_action_confirmations=${confirmationRows.length} confirmed_manual_actions=${confirmedActions.length} invalid_confirmations=${invalidConfirmationCount} titlepro_pulls_executed=0`);
}

function titleProImportCommand(args) {
  if (!args.run || !args.evidence) {
    throw new Error("titlepro-import requires --run RUN_FOLDER --evidence TITLEPRO_EVIDENCE.json");
  }
  const leadsPath = path.join(args.run, "deduped_leads.json");
  if (!fs.existsSync(leadsPath)) throw new Error("Run has no deduped_leads.json");
  const leads = JSON.parse(fs.readFileSync(leadsPath, "utf8"));
  const source = readTitleProEvidenceFile(args.evidence);
  const matchedRecords = matchTitleProEvidenceToLeads(source.records, leads);
  const roleAssertions = buildTitleProRoleAssertions(matchedRecords);
  const evidenceNeedsReview = buildTitleProNeedsReview(matchedRecords);
  const needsReviewPath = path.join(args.run, "needs_review.json");
  const existingNeedsReview = fs.existsSync(needsReviewPath) ? JSON.parse(fs.readFileSync(needsReviewPath, "utf8")) : [];
  const sourceProfile = {
    source_path: source.source_path,
    source_path_scope: source.source_path_scope,
    source_sha256: source.source_sha256,
    source_format: source.source_format,
    as_of: source.as_of,
    record_count: source.record_count,
    profile_count: source.profile_count,
    document_count: source.document_count,
    matched_record_count: matchedRecords.filter((record) => record.match_status === "matched").length,
    unmatched_record_count: matchedRecords.filter((record) => record.match_status !== "matched").length,
    role_assertion_count: roleAssertions.length,
    titlepro_pulls_executed: 0,
    paid_actions_executed: 0,
    external_writes_executed: 0
  };
  writeJson(path.join(args.run, "titlepro_evidence_intake.json"), matchedRecords);
  writeJson(path.join(args.run, "titlepro_role_assertions_preview.json"), roleAssertions);
  writeJson(path.join(args.run, "titlepro_evidence_source_profile.json"), sourceProfile);
  writeJson(needsReviewPath, [...existingNeedsReview, ...evidenceNeedsReview]);
  updateManifestAfterTitleProEvidenceImport(args.run, [
    path.join(args.run, "titlepro_evidence_intake.json"),
    path.join(args.run, "titlepro_role_assertions_preview.json"),
    path.join(args.run, "titlepro_evidence_source_profile.json"),
    path.join(args.run, "needs_review.json")
  ]);
  console.log(`titlepro_evidence_records=${matchedRecords.length} role_assertions=${roleAssertions.length} matched=${sourceProfile.matched_record_count} titlepro_pulls_executed=0`);
}

function contactImportCommand(args) {
  const contactsPath = args.contacts || args.contact || args["contact-file"] || args.contact_file || args.contactFile;
  if (!args.run || !contactsPath) {
    throw new Error("contact-import requires --run RUN_FOLDER --contacts CONTACTS.csv|json");
  }
  const leadsPath = path.join(args.run, "deduped_leads.json");
  if (!fs.existsSync(leadsPath)) throw new Error("Run has no deduped_leads.json");
  const leads = JSON.parse(fs.readFileSync(leadsPath, "utf8"));
  const source = readContactEnrichmentFile(contactsPath);
  const matchedRecords = matchContactEnrichmentToLeads(source.records, leads);
  const assertions = buildContactRoleAssertions(matchedRecords);
  const contactNeedsReview = buildContactNeedsReview(matchedRecords);
  const needsReviewPath = path.join(args.run, "needs_review.json");
  const existingNeedsReview = fs.existsSync(needsReviewPath) ? JSON.parse(fs.readFileSync(needsReviewPath, "utf8")) : [];
  const sourceProfile = {
    source_path: source.source_path,
    source_path_scope: source.source_path_scope,
    source_sha256: source.source_sha256,
    source_format: source.source_format,
    record_count: source.record_count,
    matched_record_count: matchedRecords.filter((record) => record.match_status === "matched").length,
    unmatched_record_count: matchedRecords.filter((record) => record.match_status !== "matched").length,
    role_assertion_count: assertions.length,
    rocketreach_record_count: source.rocketreach_record_count,
    manual_record_count: source.manual_record_count,
    rocketreach_reveals_executed: 0,
    external_lookups_executed: 0,
    realnex_writes_executed: 0,
    outreach_actions_executed: 0,
    external_writes_executed: 0
  };
  writeJson(path.join(args.run, "contact_enrichment_intake.json"), matchedRecords);
  writeJson(path.join(args.run, "contact_role_assertions_preview.json"), assertions);
  writeJson(path.join(args.run, "contact_enrichment_source_profile.json"), sourceProfile);
  writeJson(needsReviewPath, [...existingNeedsReview, ...contactNeedsReview]);
  updateManifestAfterContactImport(args.run, [
    path.join(args.run, "contact_enrichment_intake.json"),
    path.join(args.run, "contact_role_assertions_preview.json"),
    path.join(args.run, "contact_enrichment_source_profile.json"),
    path.join(args.run, "needs_review.json")
  ]);
  console.log(`contact_enrichment_records=${matchedRecords.length} contact_assertions=${assertions.length} matched=${sourceProfile.matched_record_count} outreach_actions_executed=0`);
}

function statusImportCommand(args) {
  const statusPath = args.status || args["status-file"] || args.status_file || args.statusFile;
  if (!args.run || !statusPath) {
    throw new Error("status-import requires --run RUN_FOLDER --status STATUS.json|csv");
  }
  const leadsPath = path.join(args.run, "deduped_leads.json");
  if (!fs.existsSync(leadsPath)) throw new Error("Run has no deduped_leads.json");
  const leads = JSON.parse(fs.readFileSync(leadsPath, "utf8"));
  const source = readCurrentStatusFile(statusPath);
  const matchedRecords = matchCurrentStatusToLeads(source.records, leads);
  const assertions = buildCurrentStatusAssertions(matchedRecords);
  const statusNeedsReview = buildCurrentStatusNeedsReview(matchedRecords);
  const needsReviewPath = path.join(args.run, "needs_review.json");
  const existingNeedsReview = fs.existsSync(needsReviewPath) ? JSON.parse(fs.readFileSync(needsReviewPath, "utf8")) : [];
  const sourceProfile = {
    source_path: source.source_path,
    source_path_scope: source.source_path_scope,
    source_sha256: source.source_sha256,
    source_format: source.source_format,
    as_of: source.as_of,
    record_count: source.record_count,
    matched_record_count: matchedRecords.filter((record) => record.match_status === "matched").length,
    unmatched_record_count: matchedRecords.filter((record) => record.match_status !== "matched").length,
    assertion_count: assertions.length,
    provider_backfills_executed: 0,
    external_lookups_executed: 0,
    outreach_actions_executed: 0,
    external_writes_executed: 0
  };
  writeJson(path.join(args.run, "current_status_intake.json"), matchedRecords);
  writeJson(path.join(args.run, "current_status_assertions_preview.json"), assertions);
  writeJson(path.join(args.run, "current_status_source_profile.json"), sourceProfile);
  writeJson(needsReviewPath, [...existingNeedsReview, ...statusNeedsReview]);
  updateManifestAfterCurrentStatusImport(args.run, [
    path.join(args.run, "current_status_intake.json"),
    path.join(args.run, "current_status_assertions_preview.json"),
    path.join(args.run, "current_status_source_profile.json"),
    path.join(args.run, "needs_review.json")
  ]);
  console.log(`current_status_records=${matchedRecords.length} current_status_assertions=${assertions.length} matched=${sourceProfile.matched_record_count} provider_backfills_executed=0`);
}

function updateManifestAfterTitleProConfirmation(runFolder, outputPaths) {
  const manifestPath = path.join(runFolder, "run_manifest.json");
  if (!fs.existsSync(manifestPath)) return;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.output_paths = Array.from(new Set([...(manifest.output_paths || []), ...outputPaths]));
  manifest.last_titlepro_action_confirmation_at = nowIso();
  manifest.forbidden_actions = manifest.forbidden_actions || { ...FORBIDDEN_ZERO };
  manifest.forbidden_actions.titlepro_pulls = manifest.forbidden_actions.titlepro_pulls || 0;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function updateManifestAfterCurrentStatusImport(runFolder, outputPaths) {
  const manifestPath = path.join(runFolder, "run_manifest.json");
  if (!fs.existsSync(manifestPath)) return;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.output_paths = Array.from(new Set([...(manifest.output_paths || []), ...outputPaths]));
  manifest.last_current_status_import_at = nowIso();
  manifest.forbidden_actions = manifest.forbidden_actions || { ...FORBIDDEN_ZERO };
  manifest.forbidden_actions.provider_backfills = manifest.forbidden_actions.provider_backfills || 0;
  manifest.forbidden_actions.control_claim_promotions = manifest.forbidden_actions.control_claim_promotions || 0;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function updateManifestAfterContactImport(runFolder, outputPaths) {
  const manifestPath = path.join(runFolder, "run_manifest.json");
  if (!fs.existsSync(manifestPath)) return;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.output_paths = Array.from(new Set([...(manifest.output_paths || []), ...outputPaths]));
  manifest.last_contact_enrichment_import_at = nowIso();
  manifest.forbidden_actions = manifest.forbidden_actions || { ...FORBIDDEN_ZERO };
  manifest.forbidden_actions.realnex_writes = manifest.forbidden_actions.realnex_writes || 0;
  manifest.forbidden_actions.control_claim_promotions = manifest.forbidden_actions.control_claim_promotions || 0;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function updateManifestAfterTitleProEvidenceImport(runFolder, outputPaths) {
  const manifestPath = path.join(runFolder, "run_manifest.json");
  if (!fs.existsSync(manifestPath)) return;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.output_paths = Array.from(new Set([...(manifest.output_paths || []), ...outputPaths]));
  manifest.last_titlepro_evidence_import_at = nowIso();
  manifest.forbidden_actions = manifest.forbidden_actions || { ...FORBIDDEN_ZERO };
  manifest.forbidden_actions.titlepro_pulls = manifest.forbidden_actions.titlepro_pulls || 0;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function updateManifestAfterTitleProApproval(runFolder, outputPaths) {
  const manifestPath = path.join(runFolder, "run_manifest.json");
  if (!fs.existsSync(manifestPath)) return;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.output_paths = Array.from(new Set([...(manifest.output_paths || []), ...outputPaths]));
  manifest.last_titlepro_approval_intake_at = nowIso();
  manifest.forbidden_actions = manifest.forbidden_actions || { ...FORBIDDEN_ZERO };
  manifest.forbidden_actions.titlepro_pulls = manifest.forbidden_actions.titlepro_pulls || 0;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
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

function sourceAuditCommand(args) {
  if (!args.out) {
    throw new Error("source-audit requires --out RUN_FOLDER");
  }
  const zipPath = args.zip || args["source-zip"] || args.source_zip || args.sourceZip;
  const sourceDir = args["source-dir"] || args.source_dir || args.sourceDir;
  const goalMd = args["goal-md"] || args.goal_md || args.goalMd;
  const audit = buildSourceReuseAudit({ zipPath, sourceDir, goalMd });
  writeSourceAuditRun(args.out, audit);
  const matched = audit.recommendations.filter((row) => row.matched).length;
  const risks = audit.risk_scan.risk_categories.reduce((sum, row) => sum + row.count, 0);
  console.log(`source_audit_patterns=${matched} risk_path_count=${risks} out=${args.out}`);
}

function workflowMapCommand(args) {
  if (!args.out) {
    throw new Error("workflow-map requires --out RUN_FOLDER");
  }
  const workflowDir = args["workflow-dir"] || args.workflow_dir || args.workflowDir;
  const input = args.input || args.workbook;
  const workflowMap = buildWorkflowMap({ workflowDir, input });
  writeWorkflowMapRun(args.out, workflowMap);
  console.log(`monday_workflow_map=local_only workflows=${workflowMap.workflow_map.workflow_count} parent_tasks=${workflowMap.workflow_map.parent_task_count} subitems=${workflowMap.workflow_map.subitem_count} out=${args.out}`);
}

function connectorReadinessCommand(args) {
  if (!args.out) {
    throw new Error("connector-readiness requires --out RUN_FOLDER");
  }
  const gmailJson = args["gmail-json"] || args.gmail_json || args.gmailJson;
  const mondayJson = args["monday-json"] || args.monday_json || args.mondayJson || args["connector-json"] || args.connector_json || args.connectorJson;
  const readiness = buildConnectorReadiness({
    gmailJson,
    mondayJson,
    label: args.label || "CRE/PropertyRadar Alerts",
    since: args.since || "2d",
    query: args.query
  });
  writeConnectorReadinessRun(args.out, readiness);
  const failed = readiness.report.checks.filter((check) => check.status !== "ready").length;
  console.log(`connector_readiness=${readiness.report.ready ? "ready" : "not_ready"} checks=${readiness.report.checks.length} failed=${failed} out=${args.out}`);
}

function skillCheckCommand(args) {
  if (!args.out) {
    throw new Error("skill-check requires --out RUN_FOLDER");
  }
  const skillDir = args["skill-dir"] || args.skill_dir || args.skillDir;
  const packageJson = args["package-json"] || args.package_json || args.packageJson;
  const goalMd = args["goal-md"] || args.goal_md || args.goalMd;
  const report = buildSkillPackageCheck({ skillDir, packageJson, goalMd });
  writeSkillPackageCheckRun(args.out, report);
  const failed = report.checks.filter((check) => check.status !== "pass").length;
  console.log(`skill_package_check=${report.passed ? "pass" : "fail"} checks=${report.checks.length} failed=${failed} out=${args.out}`);
}

function skillPackCommand(args) {
  if (!args.out) {
    throw new Error("skill-pack requires --out RUN_FOLDER");
  }
  const skillDir = args["skill-dir"] || args.skill_dir || args.skillDir;
  const packageJson = args["package-json"] || args.package_json || args.packageJson;
  const goalMd = args["goal-md"] || args.goal_md || args.goalMd;
  const bundle = buildSkillPackageBundle({ skillDir, packageJson, goalMd });
  writeSkillPackageBundleRun(args.out, bundle, skillDir);
  const failed = bundle.source_check.checks.filter((check) => check.status !== "pass").length;
  console.log(`skill_package_bundle=${bundle.package_ready ? "ready" : "not_ready"} files=${bundle.files.length} failed_checks=${failed} out=${args.out}`);
}

function goalAuditCommand(args) {
  if (!args.out) {
    throw new Error("goal-audit requires --out RUN_FOLDER");
  }
  const goalMd = args["goal-md"] || args.goal_md || args.goalMd;
  const packageJson = args["package-json"] || args.package_json || args.packageJson;
  const proofRoot = args["proof-root"] || args.proof_root || args.proofRoot;
  const audit = buildGoalAudit({ goalMd, packageJson, proofRoot });
  writeGoalAuditRun(args.out, audit);
  console.log(`goal_audit=review_ready gates=${audit.counts.acceptance_gate_count} missing=${audit.counts.missing_or_uncategorized_count} deferred=${audit.counts.deferred_external_gate_count} out=${args.out}`);
}

function packetAuditCommand(args) {
  if (!args.out) {
    throw new Error("packet-audit requires --out RUN_FOLDER");
  }
  const packetDir = args["packet-dir"] || args.packet_dir || args.packetDir;
  const audit = buildPacketAudit({ packetDir });
  writePacketAuditRun(args.out, audit);
  const failed = audit.checks.filter((row) => row.status !== "pass").length;
  console.log(`packet_audit=${audit.passed ? "pass" : "fail"} files=${audit.packet_source.file_count} owner_packets=${audit.claim_audit.packet_count} failed=${failed} out=${args.out}`);
}

function safetyAuditCommand(args) {
  if (!args.out) {
    throw new Error("safety-audit requires --out RUN_FOLDER");
  }
  const proofRoot = args["proof-root"] || args.proof_root || args.proofRoot;
  const goalMd = args["goal-md"] || args.goal_md || args.goalMd;
  const audit = buildSafetyAudit({ proofRoot, goalMd });
  writeSafetyAuditRun(args.out, audit);
  const failed = audit.checks.filter((row) => row.status !== "pass").length;
  console.log(`safety_audit=${audit.passed ? "pass" : "fail"} proofs=${audit.proof_runs.length} failed=${failed} out=${args.out}`);
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
      case "titlepro-approve":
        titleProApproveCommand(args);
        break;
      case "titlepro-confirm":
        titleProConfirmCommand(args);
        break;
      case "titlepro-import":
        titleProImportCommand(args);
        break;
      case "contact-import":
        contactImportCommand(args);
        break;
      case "status-import":
        statusImportCommand(args);
        break;
      case "batch-owner-clusters":
        batchCommand(args);
        break;
      case "workflow-map":
        workflowMapCommand(args);
        break;
      case "source-audit":
        sourceAuditCommand(args);
        break;
      case "connector-readiness":
        connectorReadinessCommand(args);
        break;
      case "skill-check":
        skillCheckCommand(args);
        break;
      case "skill-pack":
        skillPackCommand(args);
        break;
      case "goal-audit":
        goalAuditCommand(args);
        break;
      case "packet-audit":
        packetAuditCommand(args);
        break;
      case "safety-audit":
        safetyAuditCommand(args);
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
  syncCommand,
  titleProApproveCommand,
  titleProConfirmCommand,
  titleProImportCommand,
  contactImportCommand,
  statusImportCommand,
  batchCommand,
  workflowMapCommand,
  sourceAuditCommand,
  connectorReadinessCommand,
  skillCheckCommand,
  skillPackCommand,
  goalAuditCommand,
  packetAuditCommand,
  safetyAuditCommand,
  verifyCommand
};
