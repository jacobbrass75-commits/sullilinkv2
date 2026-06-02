const fs = require("fs");
const path = require("path");
const { FORBIDDEN_ZERO, ensureDir, nowIso, sha256File, writeJson } = require("./runtime");

const PROOF_RUN_FOLDERS = {
  "proof:ken": "dev",
  "proof:preview": "gmail-preview",
  "proof:gmail-connector": "gmail-connector-preview",
  "proof:connector-readiness": "connector-readiness",
  "proof:lookup": "lookup",
  "proof:monday-connector": "monday-connector-lookup",
  "proof:titlepro-approval": "titlepro-approval",
  "proof:titlepro-confirm": "titlepro-confirm",
  "proof:titlepro-evidence": "titlepro-evidence",
  "proof:contact": "contact-enrichment",
  "proof:status": "current-status",
  "proof:skill": "skill-package",
  "proof:skill-pack": "skill-package-bundle",
  "proof:goal-audit": "goal-audit",
  "proof:packet-audit": "packet-audit",
  "proof:source-audit": "source-audit",
  "proof:source-audit-real": "source-audit-real",
  "proof:workflow-map": "workflow-map",
  "proof:batch": "batch-owner-clusters"
};

const GATE_CATALOG = [
  gate("npm_test", /npm test/i, ["npm test"], "covered_by_local_proof", "Full local runner test suite."),
  gate("digest_parser", /Digest parser handles/i, ["proof:ken", "proof:preview"], "covered_by_local_proof", "Saved text and HTML digest parsing."),
  gate("gmail_connector_preview", /Gmail connector preview/i, ["proof:gmail-connector"], "covered_by_local_proof", "Saved read-only Gmail connector JSON preview."),
  gate("connector_readiness", /connector-readiness/i, ["proof:connector-readiness"], "covered_by_local_proof", "Read-only Gmail/Monday connector readiness."),
  gate("batch_local_only", /Batch owner-cluster preview remains/i, ["proof:batch"], "covered_by_local_proof", "Local-only provisional batch owner clusters."),
  gate("batch_apn_dedupe", /Batch CSV preview normalizes APNs/i, ["proof:batch"], "covered_by_local_proof", "APN normalization and duplicate APN collapse."),
  gate("titlepro_approval_queue", /titlepro_approval_queue_preview/i, ["proof:titlepro-approval"], "covered_by_local_proof", "Preview-only TitlePro approval queue."),
  gate("monday_action_queue", /monday_action_queue\.csv/i, ["proof:ken", "proof:batch"], "covered_by_local_proof", "Monday action queue preview rows."),
  gate("workflow_map", /workflow-map/i, ["proof:workflow-map"], "covered_by_local_proof", "Downloaded Monday workflow export map."),
  gate("monday_lookup_file", /lookup-file/i, ["proof:lookup"], "covered_by_local_proof", "Read-only Monday export lookup."),
  gate("monday_lookup_connector", /connector-json/i, ["proof:monday-connector"], "covered_by_local_proof", "Read-only Monday connector lookup."),
  gate("titlepro_approve", /titlepro-approve/i, ["proof:titlepro-approval"], "covered_by_local_proof", "Record-only TitlePro approval intake."),
  gate("titlepro_confirm", /titlepro-confirm/i, ["proof:titlepro-confirm"], "covered_by_local_proof", "Record-only action-time TitlePro confirmation."),
  gate("titlepro_import", /titlepro-import/i, ["proof:titlepro-evidence"], "covered_by_local_proof", "Saved TitlePro evidence import."),
  gate("contact_import", /contact-import/i, ["proof:contact"], "covered_by_local_proof", "Manual contact enrichment pasteback."),
  gate("status_import", /status-import/i, ["proof:status"], "covered_by_local_proof", "Saved current-status/provider evidence import."),
  gate("skill_check", /skill-check/i, ["proof:skill"], "covered_by_local_proof", "Skill package validation."),
  gate("skill_pack", /skill-pack/i, ["proof:skill-pack"], "covered_by_local_proof", "Installable skill package export."),
  gate("goal_audit", /goal-audit/i, ["proof:goal-audit"], "covered_by_local_proof", "Repeatable goal completion audit surface."),
  gate("packet_audit", /packet-audit --packet-dir/i, ["proof:packet-audit"], "covered_by_local_proof", "Shareable packet and broker claim audit surface."),
  gate("source_audit", /source-audit --zip/i, ["proof:source-audit"], "covered_by_local_proof", "Fixture/source reference reuse audit."),
  gate("source_audit_real", /proof:source-audit-real/i, ["proof:source-audit-real"], "covered_by_local_proof", "Local ignored SullyLink/retranToReel reuse audit."),
  gate("shareable_packet_safety", /Shareable packet files/i, ["proof:packet-audit"], "covered_by_local_proof", "Shareable packet safety, no raw docs, no secrets, and no local paths."),
  gate("broker_control_claims", /broker-facing owner\/control claim/i, ["proof:packet-audit"], "covered_by_local_proof", "Broker-facing control claims include evidence, confidence, and beneficial-owner caveats."),
  gate("titlepro_serialized", /TitlePro actions remain serialized/i, ["proof:titlepro-confirm"], "covered_by_local_proof", "TitlePro execution stays serialized and approval-gated."),
  gate("monday_live_write_gate", /Monday live write remains blocked/i, [], "deferred_external_gate", "Live Monday writes require explicit board, column, rollback, and broker gates.")
];

function gate(id, pattern, proofCommands, classification, evidence_basis) {
  return { id, pattern, proofCommands, classification, evidence_basis };
}

function buildGoalAudit({ goalMd, packageJson, proofRoot }) {
  if (!goalMd) throw new Error("goal-audit requires --goal-md GOAL.md");
  if (!packageJson) throw new Error("goal-audit requires --package-json PACKAGE.json");
  const goalPath = path.resolve(goalMd);
  const packagePath = path.resolve(packageJson);
  const proofPath = proofRoot ? path.resolve(proofRoot) : null;
  const generatedAt = nowIso();
  const goalText = fs.readFileSync(goalPath, "utf8");
  const packageData = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  const scripts = packageData.scripts || {};
  const acceptanceGates = extractAcceptanceGates(goalText).map((requirement, index) => {
    const catalog = GATE_CATALOG.find((row) => row.pattern.test(requirement));
    if (!catalog) {
      return {
        id: `uncategorized_${index + 1}`,
        requirement,
        status: "uncategorized",
        classification: "missing_catalog_mapping",
        evidence_basis: "No goal-audit catalog row matched this acceptance gate.",
        proof_commands: [],
        evidence: []
      };
    }
    const evidence = catalog.proofCommands.map((command) => proofEvidence(command, scripts, proofPath));
    return {
      id: catalog.id,
      requirement,
      status: gateStatus(catalog, evidence),
      classification: catalog.classification,
      evidence_basis: catalog.evidence_basis,
      proof_commands: catalog.proofCommands,
      evidence
    };
  });
  const commandCoverage = Object.keys(PROOF_RUN_FOLDERS).map((command) => proofEvidence(command, scripts, proofPath));
  const counts = {
    acceptance_gate_count: acceptanceGates.length,
    covered_by_local_proof_count: acceptanceGates.filter((row) => row.status === "covered_by_local_proof").length,
    documented_manual_gate_count: acceptanceGates.filter((row) => row.status === "documented_manual_gate").length,
    deferred_external_gate_count: acceptanceGates.filter((row) => row.status === "deferred_external_gate").length,
    missing_or_uncategorized_count: acceptanceGates.filter((row) => row.status === "missing_proof" || row.status === "uncategorized").length,
    proof_command_count: commandCoverage.length,
    proof_command_present_count: commandCoverage.filter((row) => row.script_present).length,
    proof_artifact_pass_count: commandCoverage.filter((row) => row.artifact_status === "pass").length
  };
  const goalComplete = counts.missing_or_uncategorized_count === 0
    && counts.documented_manual_gate_count === 0
    && counts.deferred_external_gate_count === 0;

  return {
    schema_version: 1,
    mode: "goal_audit",
    generated_at: generatedAt,
    goal_complete: goalComplete,
    completion_claimed: false,
    completion_reason: goalComplete
      ? "All acceptance gates have direct proof; caller may perform a final completion audit."
      : "Goal remains active because some gates are documented/manual or deferred external gates.",
    goal_source: sourceDescriptor(goalPath, "goal_markdown"),
    package_source: sourceDescriptor(packagePath, "package_json"),
    proof_root: proofPath ? {
      source_path: path.basename(proofPath),
      source_path_scope: "basename_only"
    } : null,
    counts,
    acceptance_gates: acceptanceGates,
    proof_commands: commandCoverage,
    forbidden_actions: { ...FORBIDDEN_ZERO }
  };
}

function extractAcceptanceGates(goalText) {
  const lines = String(goalText || "").split(/\r?\n/);
  const gates = [];
  let inSection = false;
  for (const line of lines) {
    if (/^##\s+Acceptance Gates\s*$/i.test(line.trim())) {
      inSection = true;
      continue;
    }
    if (inSection && /^##\s+/.test(line)) break;
    if (inSection && /^-\s+/.test(line)) {
      gates.push(line.replace(/^-\s+/, "").trim());
    }
  }
  return gates;
}

function proofEvidence(command, scripts, proofRoot) {
  const runFolder = PROOF_RUN_FOLDERS[command] || null;
  const artifact = runFolder && proofRoot ? readVerificationStatus(path.join(proofRoot, runFolder, "verification_report.md")) : null;
  return {
    command,
    script_present: command === "npm test" ? typeof scripts.test === "string" : typeof scripts[command] === "string",
    run_folder: runFolder,
    artifact_status: artifact?.status || (runFolder ? "not_checked_or_missing" : "not_persistent"),
    artifact_source_path: artifact ? path.basename(path.dirname(path.resolve(artifact.file))) : null
  };
}

function readVerificationStatus(file) {
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, "utf8");
  if (/Status:\s+PASS/i.test(text)) return { status: "pass", file };
  if (/Status:\s+FAIL/i.test(text)) return { status: "fail", file };
  return { status: "unknown", file };
}

function gateStatus(catalog, evidence) {
  if (catalog.classification === "documented_manual_gate") return "documented_manual_gate";
  if (catalog.classification === "deferred_external_gate") return "deferred_external_gate";
  return evidence.every((row) => row.script_present) ? "covered_by_local_proof" : "missing_proof";
}

function sourceDescriptor(filePath, sourceType) {
  return {
    source_path: path.basename(path.resolve(filePath)),
    source_path_scope: "basename_only",
    source_type: sourceType,
    source_sha256: sha256File(filePath)
  };
}

function writeGoalAuditRun(outDir, audit) {
  ensureDir(outDir);
  writeJson(path.join(outDir, "goal_audit_report.json"), audit);
  fs.writeFileSync(path.join(outDir, "goal_audit_summary.md"), renderGoalAuditSummary(audit));
  writeJson(path.join(outDir, "run_manifest.json"), {
    run_id: path.basename(path.resolve(outDir)).replace(/[^a-zA-Z0-9_-]+/g, "_"),
    started_at: audit.generated_at,
    mode: "goal_audit",
    input_paths: [
      `goal_md:${audit.goal_source.source_path}:${audit.goal_source.source_sha256.slice(0, 16)}`,
      `package_json:${audit.package_source.source_path}:${audit.package_source.source_sha256.slice(0, 16)}`,
      audit.proof_root ? `proof_root:${audit.proof_root.source_path}` : null
    ].filter(Boolean),
    output_path_scope: "run_folder_relative",
    output_paths: [
      "goal_audit_report.json",
      "goal_audit_summary.md",
      "run_manifest.json"
    ],
    forbidden_actions: { ...FORBIDDEN_ZERO },
    counts: audit.counts
  });
}

function renderGoalAuditSummary(audit) {
  const lines = [
    "# Goal Audit",
    "",
    "Status: REVIEW_READY",
    "",
    `Goal complete claimed: ${audit.completion_claimed ? "true" : "false"}`,
    `Goal complete by audit: ${audit.goal_complete ? "true" : "false"}`,
    `Reason: ${audit.completion_reason}`,
    "",
    "## Counts",
    `- Acceptance gates: ${audit.counts.acceptance_gate_count}`,
    `- Covered by local proof: ${audit.counts.covered_by_local_proof_count}`,
    `- Documented/manual gates: ${audit.counts.documented_manual_gate_count}`,
    `- Deferred external gates: ${audit.counts.deferred_external_gate_count}`,
    `- Missing or uncategorized: ${audit.counts.missing_or_uncategorized_count}`,
    "",
    "## Acceptance Gates",
    ...audit.acceptance_gates.map((row) => `- ${row.status}: ${row.id} - ${row.evidence_basis}`)
  ];
  return lines.join("\n") + "\n";
}

module.exports = {
  GATE_CATALOG,
  buildGoalAudit,
  extractAcceptanceGates,
  writeGoalAuditRun
};
