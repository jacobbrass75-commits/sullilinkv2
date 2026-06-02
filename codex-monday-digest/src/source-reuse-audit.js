const fs = require("fs");
const path = require("path");
const { FORBIDDEN_ZERO, ensureDir, hash16, nowIso, sha256File, writeJson } = require("./runtime");

const REUSE_CATALOG = [
  {
    id: "propertyradar_digest_parser",
    match: ["propertyradar-alerts.js", "email_importer.py"],
    useful_pattern: "PropertyRadar daily digest HTML/text parsing with source-event preservation.",
    monday_lane_action: "Keep parser support in local preview and Gmail connector preview lanes.",
    treatment: "reuse_pattern_only",
    implementation_status: "implemented",
    current_runner_surface: ["parse", "preview --input", "preview --gmail-json"],
    proof_scripts: ["proof:ken", "proof:preview", "proof:gmail-connector"],
    acceptance_gate: "Text/HTML digest rows parse into source events and dedupe by Radar ID without Gmail mutations.",
    allowed_input: "Saved digest text/HTML or saved read-only Gmail connector JSON.",
    blocked_actions: ["gmail_mutation", "gmail_send", "monday_live_write", "titlepro_pull"]
  },
  {
    id: "apn_dedupe",
    match: ["dedupe_spreadsheet.py", "foreclosure-import.js"],
    useful_pattern: "Normalize APNs, skip existing APNs, and report imported/skipped counts.",
    monday_lane_action: "Keep APN dedupe in batch owner-cluster preview with source row indexes.",
    treatment: "reuse_pattern_only",
    implementation_status: "implemented",
    current_runner_surface: ["batch-owner-clusters"],
    proof_scripts: ["proof:batch"],
    acceptance_gate: "APN-bearing batch rows collapse by normalized APN while preserving all source row indexes.",
    allowed_input: "PropertyRadar CSV/XLSX export.",
    blocked_actions: ["control_claim_promotion", "monday_live_write", "provider_backfill"]
  },
  {
    id: "daily_import_loop",
    match: ["daily_update.py", "sync-propertyradar-alerts.js", "propertyradar-feed.js"],
    useful_pattern: "Daily polling/import loop with idempotency and counts.",
    monday_lane_action: "Use only after Gmail/Monday read configuration is confirmed.",
    treatment: "future_after_connector_setup",
    implementation_status: "not_started",
    current_runner_surface: ["connector-readiness", "preview --gmail-json", "sync --connector-json"],
    proof_scripts: ["proof:connector-readiness", "proof:gmail-connector", "proof:monday-connector"],
    acceptance_gate: "Saved connector reads preserve message/thread IDs and Monday item/board/group IDs with zero writes.",
    allowed_input: "Saved read-only Gmail and Monday connector JSON.",
    blocked_actions: ["scheduled_live_read_without_readiness", "gmail_mutation", "monday_live_write"]
  },
  {
    id: "titlepro_serial_worker",
    match: ["titlepro_worker.py", "titlepro_scraper_worker.py", "titleProSQLite.py", "CODEBASE_GUIDE.md"],
    useful_pattern: "One-at-a-time TitlePro worker with queued, processing, success, mismatch, failed, skipped statuses.",
    monday_lane_action: "Keep TitlePro execution serialized and approval-gated; no unsupervised pulls.",
    treatment: "reuse_queue_shape_only",
    implementation_status: "approval_and_saved_evidence_present",
    current_runner_surface: ["titlepro-approve", "titlepro-confirm", "titlepro-import"],
    proof_scripts: ["proof:titlepro-approval", "proof:titlepro-confirm", "proof:titlepro-evidence"],
    acceptance_gate: "Approval and action-time confirmation are recorded, but browser/order execution remains separate and serialized.",
    allowed_input: "Approval CSV/JSON, action-time confirmation CSV/JSON, or already-saved TitlePro evidence JSON.",
    blocked_actions: ["titlepro_pull", "browser_action", "paid_action", "external_write"]
  },
  {
    id: "recording_document_schema",
    match: ["recording_doc_extractor.py", "recording_doc_extractor", "recDocReader/reader.py", "reader.py"],
    useful_pattern: "Recording document fact schema for NOD/NTS/DOT extraction.",
    monday_lane_action: "Use fields for saved TitlePro evidence import and role assertions.",
    treatment: "reuse_schema_only",
    implementation_status: "implemented",
    current_runner_surface: ["titlepro-import", "status-import"],
    proof_scripts: ["proof:titlepro-evidence", "proof:status"],
    acceptance_gate: "Saved document/status facts import into role/status assertions without control or outreach promotion.",
    allowed_input: "Already-saved document extraction JSON or saved current-status/provider evidence JSON.",
    blocked_actions: ["beneficial_owner_claim", "outreach_ready_claim", "provider_backfill"]
  },
  {
    id: "owner_entity_clustering",
    match: ["src/entities/cluster.js", "resolve-llc.js", "portfolio-distress.js", "distress-score.js"],
    useful_pattern: "Entity/portfolio grouping and distress scoring as candidate signals.",
    monday_lane_action: "Keep owner clusters provisional until title/SOS/current-status proof exists.",
    treatment: "future_candidate_scoring_only",
    implementation_status: "partial_batch_preview",
    current_runner_surface: ["batch-owner-clusters", "monday_action_queue.csv"],
    proof_scripts: ["proof:batch"],
    acceptance_gate: "Owner-string clusters are candidate-only with control_claim_allowed=false and broker_ready=false.",
    allowed_input: "PropertyRadar CSV/XLSX batch export.",
    blocked_actions: ["control_claim_promotion", "beneficial_owner_claim", "broker_ready_claim"]
  },
  {
    id: "contact_enrichment",
    match: ["broker-email-lookup", "llc-manager-finder", "realnex-crm", "realnex.js"],
    useful_pattern: "Contact lookup and CRM enrichment tools.",
    monday_lane_action: "Treat as manual pasteback or separately approved enrichment lane.",
    treatment: "manual_or_approved_lane_only",
    implementation_status: "not_started",
    current_runner_surface: ["contact-import"],
    proof_scripts: ["proof:contact"],
    acceptance_gate: "Manual contacts import as blocked assertions with no RocketReach reveal, outreach, RealNex write, or owner/control promotion.",
    allowed_input: "Manual contact enrichment CSV/JSON pasteback.",
    blocked_actions: ["rocketreach_reveal", "outreach_send", "realnex_write", "beneficial_owner_claim"]
  }
];

const RISK_RULES = [
  { id: "env_or_credentials", label: "credential/env file", test: (rel) => /(^|\/)\.env($|\.)|credentials?|secret|password/i.test(rel) },
  { id: "local_settings", label: "local app or agent settings", test: (rel) => /settings\.local\.json|\.claude\//i.test(rel) },
  { id: "browser_or_session", label: "browser/session artifact", test: (rel) => /cookie|session|login\.html|account\.html/i.test(rel) },
  { id: "paid_or_raw_docs", label: "paid/raw evidence document", test: (rel) => /\.(pdf|tif|tiff|png|jpe?g)$/i.test(rel) },
  { id: "dependency_tree", label: "dependency tree", test: (rel) => /(^|\/)node_modules(\/|$)|(^|\/)\.pytest_cache(\/|$)/i.test(rel) },
  { id: "git_metadata", label: "git metadata", test: (rel) => /(^|\/)\.git(\/|$)/i.test(rel) },
  { id: "raw_export_dump", label: "raw export dump", test: (rel) => /(^|\/)raw(\/|$)|\.xlsx$/i.test(rel) }
];

const SECRET_PATTERNS = [
  { id: "private_key", regex: /BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY/g },
  { id: "authorization_header", regex: /Authorization\s*:/gi },
  { id: "password_assignment", regex: /\b(password|passwd|pwd)\b\s*[:=]/gi },
  { id: "api_key_assignment", regex: /\b(api[_-]?key|secret|token)\b\s*[:=]/gi },
  { id: "openai_key_shape", regex: /\bsk-[A-Za-z0-9_-]{16,}\b/g }
];

const BINARY_EXTENSIONS = new Set([
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".tif",
  ".tiff",
  ".xlsx",
  ".xls",
  ".zip",
  ".sqlite",
  ".db"
]);

function buildSourceReuseAudit({ zipPath, goalMd, sourceDir }) {
  if (!zipPath && !sourceDir) {
    throw new Error("source-audit requires --zip SOURCE.zip or --source-dir EXTERNAL_REFERENCE_DIR");
  }
  const generatedAt = nowIso();
  const zipEntries = zipPath ? readZipEntryNames(zipPath) : [];
  const sourceDirEntries = sourceDir ? listSourceDirEntries(sourceDir) : { files: [], skippedTrees: [] };
  const allEntryNames = [
    ...zipEntries.map((entry) => entry.path),
    ...sourceDirEntries.files.map((entry) => entry.path),
    ...sourceDirEntries.skippedTrees.map((entry) => entry.path)
  ];
  const recommendations = buildRecommendations(allEntryNames);
  const reuseContract = buildReuseContract(recommendations);
  const riskScan = buildRiskScan({ zipEntries, sourceDirEntries, sourceDir });
  const goalProfile = goalMd ? readGoalMarkdown(goalMd) : null;

  const sourceProfile = {
    mode: "source_audit",
    generated_at: generatedAt,
    zip_source: zipPath ? sourceDescriptor(zipPath, "zip_archive") : null,
    goal_md_source: goalMd ? sourceDescriptor(goalMd, "goal_markdown") : null,
    source_dir: sourceDir ? {
      source_path: path.basename(path.resolve(sourceDir)),
      source_path_scope: "basename_only",
      source_type: "extracted_reference_directory",
      file_count: sourceDirEntries.files.length,
      skipped_tree_count: sourceDirEntries.skippedTrees.length
    } : null,
    counts: {
      zip_entry_count: zipEntries.length,
      source_dir_file_count: sourceDirEntries.files.length,
      recommended_pattern_count: recommendations.length,
      reusable_pattern_count: recommendations.filter((row) => row.matched).length,
      excluded_risk_category_count: riskScan.risk_categories.length,
      secret_hit_file_count: riskScan.secret_hits.length
    },
    forbidden_actions: { ...FORBIDDEN_ZERO }
  };

  return {
    source_profile: sourceProfile,
    goal_profile: goalProfile,
    recommendations,
    reuse_contract: reuseContract,
    risk_scan: riskScan,
    plan_markdown: renderPlanMarkdown({ sourceProfile, goalProfile, recommendations, reuseContract, riskScan })
  };
}

function sourceDescriptor(filePath, sourceType) {
  return {
    source_path: path.basename(path.resolve(filePath)),
    source_path_scope: "basename_only",
    source_type: sourceType,
    source_sha256: sha256File(filePath)
  };
}

function readZipEntryNames(zipPath) {
  const buffer = fs.readFileSync(zipPath);
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset < 0) throw new Error(`Could not locate ZIP central directory: ${zipPath}`);
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = [];
  let offset = centralOffset;
  for (let i = 0; i < totalEntries; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(`Invalid ZIP central directory entry at offset ${offset}`);
    }
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    entries.push({
      path: normalizeEntryPath(name),
      source: "zip",
      compressed_size: compressedSize,
      uncompressed_size: uncompressedSize
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function findEndOfCentralDirectory(buffer) {
  const minOffset = Math.max(0, buffer.length - 22 - 0xffff);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

function listSourceDirEntries(sourceDir) {
  const root = path.resolve(sourceDir);
  const files = [];
  const skippedTrees = [];
  function walk(current) {
    const rel = normalizeEntryPath(path.relative(root, current));
    const stat = fs.statSync(current);
    if (stat.isDirectory()) {
      const base = path.basename(current);
      if (["node_modules", ".git", ".pytest_cache"].includes(base)) {
        skippedTrees.push({ path: rel ? `${rel}/` : `${base}/`, source: "source_dir", reason: "excluded_tree" });
        return;
      }
      for (const child of fs.readdirSync(current)) walk(path.join(current, child));
      return;
    }
    files.push({
      path: rel,
      source: "source_dir",
      size_bytes: stat.size
    });
  }
  walk(root);
  return { files, skippedTrees };
}

function buildRecommendations(entryNames) {
  return REUSE_CATALOG.map((rule) => {
    const matches = entryNames
      .filter((entry) => rule.match.some((needle) => entry.toLowerCase().includes(needle.toLowerCase())))
      .slice(0, 8);
    return {
      id: rule.id,
      matched: matches.length > 0,
      matched_files: matches,
      useful_pattern: rule.useful_pattern,
      treatment: rule.treatment,
      copy_strategy: "copy_pattern_not_source",
      monday_lane_action: rule.monday_lane_action,
      implementation_status: rule.implementation_status,
      current_runner_surface: rule.current_runner_surface,
      proof_scripts: rule.proof_scripts,
      acceptance_gate: rule.acceptance_gate,
      allowed_input: rule.allowed_input,
      blocked_actions: rule.blocked_actions,
      guardrail: "Do not copy credentials, sessions, raw paid docs, or unsupervised browser automation."
    };
  });
}

function buildReuseContract(recommendations) {
  return {
    schema_version: 1,
    mode: "sullilink_pattern_contract",
    contract_scope: "Map old SullyLink/retranToReel patterns to current local Monday runner surfaces without copying old source.",
    lanes: recommendations.map((row) => ({
      pattern_id: row.id,
      matched: row.matched,
      matched_files: row.matched_files,
      useful_pattern: row.useful_pattern,
      implementation_status: row.implementation_status,
      current_runner_surface: row.current_runner_surface,
      proof_scripts: row.proof_scripts,
      acceptance_gate: row.acceptance_gate,
      allowed_input: row.allowed_input,
      blocked_actions: row.blocked_actions,
      copy_strategy: row.copy_strategy,
      live_action_gate: "External reads/writes/pulls require separate explicit approval and runner-specific gates."
    })),
    forbidden_actions: { ...FORBIDDEN_ZERO }
  };
}

function buildRiskScan({ zipEntries, sourceDirEntries, sourceDir }) {
  const allEntries = [
    ...zipEntries.map((entry) => ({ ...entry, value_scan_available: false })),
    ...sourceDirEntries.files,
    ...sourceDirEntries.skippedTrees
  ];
  const riskCategories = RISK_RULES.map((rule) => {
    const matches = allEntries.filter((entry) => rule.test(entry.path));
    return {
      id: rule.id,
      label: rule.label,
      count: matches.length,
      examples: matches.slice(0, 10).map((entry) => entry.path),
      treatment: "exclude_from_shareable_repo_and_outputs"
    };
  }).filter((row) => row.count > 0);
  const secretHits = sourceDir ? scanSourceDirSecrets(sourceDir, sourceDirEntries.files) : [];
  return {
    scanned_at: nowIso(),
    risk_categories: riskCategories,
    secret_hits: secretHits,
    secret_values_exposed: false,
    excluded_action: "Risk hits are path/category counts only; values are never copied into outputs."
  };
}

function scanSourceDirSecrets(sourceDir, files) {
  const root = path.resolve(sourceDir);
  const hits = [];
  for (const entry of files) {
    const filePath = path.join(root, entry.path);
    const ext = path.extname(entry.path).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext) || entry.size_bytes > 512 * 1024) continue;
    let text;
    try {
      text = fs.readFileSync(filePath, "utf8");
    } catch {
      continue;
    }
    const patternHits = SECRET_PATTERNS.map((pattern) => {
      const matches = text.match(pattern.regex);
      return matches ? { id: pattern.id, count: matches.length } : null;
    }).filter(Boolean);
    if (patternHits.length) {
      hits.push({
        file: entry.path,
        hit_count: patternHits.reduce((sum, row) => sum + row.count, 0),
        patterns: patternHits,
        value_exposed: false
      });
    }
  }
  return hits;
}

function readGoalMarkdown(goalMd) {
  const text = fs.readFileSync(goalMd, "utf8");
  const headings = text
    .split(/\r?\n/)
    .filter((line) => /^#{1,3}\s+/.test(line))
    .map((line) => line.replace(/^#{1,3}\s+/, "").trim())
    .slice(0, 20);
  const lower = text.toLowerCase();
  return {
    source_path: path.basename(path.resolve(goalMd)),
    source_path_scope: "basename_only",
    source_sha256: sha256File(goalMd),
    heading_count: headings.length,
    headings,
    mentions_monday: lower.includes("monday"),
    mentions_titlepro: lower.includes("titlepro"),
    mentions_propertyradar: lower.includes("propertyradar"),
    mentions_sullilink: lower.includes("sullilink") || lower.includes("sullylink"),
    mentions_safety_gates: lower.includes("no monday live writes") || lower.includes("approval-gated") || lower.includes("paid pulls")
  };
}

function renderPlanMarkdown({ sourceProfile, goalProfile, recommendations, reuseContract, riskScan }) {
  const matched = recommendations.filter((row) => row.matched);
  const future = recommendations.filter((row) => row.matched && row.implementation_status.includes("not_started"));
  const lines = [
    "# Source Reuse Audit",
    "",
    `Generated: ${sourceProfile.generated_at}`,
    "",
    "## Sources",
    `- Zip: ${sourceProfile.zip_source ? sourceProfile.zip_source.source_path : "not supplied"}`,
    `- Source dir: ${sourceProfile.source_dir ? sourceProfile.source_dir.source_path : "not supplied"}`,
    `- Goal markdown: ${goalProfile ? goalProfile.source_path : "not supplied"}`,
    "",
    "## Reuse Patterns",
    ...matched.map((row) => `- ${row.id}: ${row.treatment}; ${row.monday_lane_action}`),
    "",
    "## Runner Contract",
    ...reuseContract.lanes.map((row) => `- ${row.pattern_id}: ${row.current_runner_surface.join(", ")}; proofs: ${row.proof_scripts.join(", ")}; blocked: ${row.blocked_actions.join(", ")}`),
    "",
    "## Future Work",
    ...(future.length ? future.map((row) => `- ${row.id}: ${row.monday_lane_action}`) : ["- No matched not-started pattern was promoted in this audit."]),
    "",
    "## Exclusions",
    ...riskScan.risk_categories.map((row) => `- ${row.id}: ${row.count} path(s), ${row.treatment}`),
    "",
    "## Safety",
    "- No old source files, credentials, cookies, raw PDFs, or node_modules are copied into the shareable repo.",
    "- This audit is read-only and records zero Monday, Gmail, TitlePro, RealNex, provider, or control-claim actions."
  ];
  return lines.join("\n") + "\n";
}

function writeSourceAuditRun(outDir, audit) {
  ensureDir(outDir);
  const outputPaths = [
    path.join(outDir, "source_reuse_audit.json"),
    path.join(outDir, "source_reuse_recommendations.json"),
    path.join(outDir, "source_reuse_contract.json"),
    path.join(outDir, "source_risk_scan.json"),
    path.join(outDir, "source_reuse_plan.md")
  ];
  writeJson(outputPaths[0], {
    source_profile: audit.source_profile,
    goal_profile: audit.goal_profile
  });
  writeJson(outputPaths[1], audit.recommendations);
  writeJson(outputPaths[2], audit.reuse_contract);
  writeJson(outputPaths[3], audit.risk_scan);
  fs.writeFileSync(outputPaths[4], audit.plan_markdown);
  writeJson(path.join(outDir, "run_manifest.json"), {
    run_id: path.basename(path.resolve(outDir)).replace(/[^a-zA-Z0-9_-]+/g, "_") || `source_audit_${hash16(outDir)}`,
    started_at: audit.source_profile.generated_at,
    mode: "source_audit",
    input_paths: [
      audit.source_profile.zip_source ? `zip:${audit.source_profile.zip_source.source_path}:${audit.source_profile.zip_source.source_sha256.slice(0, 16)}` : null,
      audit.source_profile.source_dir ? `source_dir:${audit.source_profile.source_dir.source_path}` : null,
      audit.goal_profile ? `goal_md:${audit.goal_profile.source_path}:${audit.goal_profile.source_sha256.slice(0, 16)}` : null
    ].filter(Boolean),
    output_paths: [...outputPaths, path.join(outDir, "run_manifest.json")],
    forbidden_actions: { ...FORBIDDEN_ZERO },
    counts: audit.source_profile.counts
  });
}

function normalizeEntryPath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

module.exports = {
  REUSE_CATALOG,
  buildSourceReuseAudit,
  buildReuseContract,
  readZipEntryNames,
  writeSourceAuditRun
};
