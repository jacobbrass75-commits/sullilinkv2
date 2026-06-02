const fs = require("fs");
const path = require("path");
const { FORBIDDEN_ZERO, ensureDir, nowIso, sha256File, writeJson } = require("./runtime");
const { PROOF_RUN_FOLDERS } = require("./goal-audit");

const REQUIRED_SAFETY_PROOF_COMMANDS = Object.keys(PROOF_RUN_FOLDERS)
  .filter((command) => command !== "proof:safety-audit" && command !== "proof:goal-audit");

const REQUIRED_GOAL_PHRASES = [
  {
    id: "no_monday_live_writes_by_default",
    phrase: "no Monday live writes by default"
  },
  {
    id: "monday_live_write_gate_blocked",
    phrase: "Monday live write remains blocked unless explicit board/column/rollback/broker gates are satisfied"
  }
];

const DIRECT_ACTION_FIELD_BUCKETS = {
  monday_live_writes_executed: "monday_live_writes",
  monday_write_executed: "monday_live_writes",
  monday_writes_executed: "monday_live_writes",
  gmail_mutations_executed: "gmail_writes_or_sends",
  gmail_sends_executed: "gmail_writes_or_sends",
  gmail_write_executed: "gmail_writes_or_sends",
  titlepro_pulls_executed: "titlepro_pulls",
  titlepro_pull_executed: "titlepro_pulls",
  paid_actions_executed: "titlepro_pulls",
  paid_action_executed: "titlepro_pulls",
  browser_actions_executed: "titlepro_pulls",
  browser_action_executed: "titlepro_pulls",
  pull_executed: "titlepro_pulls",
  realnex_writes_executed: "realnex_writes",
  realnex_write_executed: "realnex_writes",
  provider_backfills_executed: "provider_backfills",
  provider_backfill_executed: "provider_backfills",
  control_claim_promotions: "control_claim_promotions"
};

const GENERIC_EXTERNAL_ACTION_FIELDS = new Set([
  "external_write_executed",
  "external_writes_executed",
  "outreach_executed",
  "outreach_actions_executed",
  "external_lookup_executed",
  "external_lookups_executed",
  "rocketreach_reveal_executed",
  "rocketreach_reveals_executed"
]);

function buildSafetyAudit({ proofRoot, goalMd, requiredCommands = REQUIRED_SAFETY_PROOF_COMMANDS }) {
  if (!proofRoot) throw new Error("safety-audit requires --proof-root OUTPUT_ROOT");
  if (!goalMd) throw new Error("safety-audit requires --goal-md GOAL.md");

  const root = path.resolve(proofRoot);
  const goalPath = path.resolve(goalMd);
  const generatedAt = nowIso();
  const goalText = fs.existsSync(goalPath) ? fs.readFileSync(goalPath, "utf8") : "";
  const proofRuns = requiredCommands.map((command) => inspectProofRun(root, command));
  const artifactScans = [];
  const aggregateForbidden = zeroForbiddenCounts();
  const directExternalActionHits = [];

  for (const run of proofRuns) {
    const runPath = path.join(root, run.run_folder || "");
    const scans = fs.existsSync(runPath) && fs.statSync(runPath).isDirectory()
      ? scanJsonArtifacts(runPath, run)
      : [];
    run.json_artifact_count = scans.length;
    artifactScans.push(...scans);
    for (const scan of scans) {
      addForbiddenCounts(aggregateForbidden, scan.forbidden_actions);
      directExternalActionHits.push(...scan.direct_external_action_hits);
    }
  }

  const goalSafetyChecks = REQUIRED_GOAL_PHRASES.map((row) => ({
    id: row.id,
    status: goalText.includes(row.phrase) ? "pass" : "fail",
    phrase: row.phrase
  }));
  const checks = [
    check("proof_root_exists", fs.existsSync(root) && fs.statSync(root).isDirectory(), "Proof root exists."),
    check("goal_markdown_exists", fs.existsSync(goalPath), "Goal markdown exists."),
    check("required_proof_reports_pass", proofRuns.every((run) => run.verification_status === "pass"), "All required proof run verification reports are PASS."),
    check("aggregate_forbidden_actions_zero", forbiddenCountsZero(aggregateForbidden), "Aggregate forbidden action counts are zero."),
    check("direct_external_action_hits_zero", directExternalActionHits.length === 0, "Direct external action execution fields have no positive values."),
    check("goal_safety_language_present", goalSafetyChecks.every((row) => row.status === "pass"), "Goal markdown preserves Monday live-write blocking language."),
    check("basename_only_sources", proofRuns.every((run) => basenameOnly(run.run_folder) && basenameOnly(run.verification_source_path || "verification_report.md")), "Proof source paths are basename-only.")
  ];

  return {
    schema_version: 1,
    mode: "safety_audit",
    generated_at: generatedAt,
    proof_root: {
      source_path: path.basename(root),
      source_path_scope: "basename_only"
    },
    goal_source: sourceDescriptor(goalPath, "goal_markdown"),
    required_proof_commands: requiredCommands,
    proof_runs: proofRuns,
    artifact_scans: artifactScans,
    aggregate_forbidden_actions: aggregateForbidden,
    direct_external_action_hits: directExternalActionHits,
    direct_external_action_hit_count: directExternalActionHits.length,
    goal_safety_checks: goalSafetyChecks,
    checks,
    passed: checks.every((row) => row.status === "pass"),
    forbidden_actions: { ...FORBIDDEN_ZERO }
  };
}

function inspectProofRun(root, command) {
  const runFolder = PROOF_RUN_FOLDERS[command] || null;
  const runPath = runFolder ? path.join(root, runFolder) : null;
  const verificationPath = runPath ? path.join(runPath, "verification_report.md") : null;
  const manifestPath = runPath ? path.join(runPath, "run_manifest.json") : null;
  const manifest = manifestPath && fs.existsSync(manifestPath) ? readJsonSafe(manifestPath) : null;
  return {
    command,
    run_folder: runFolder,
    run_folder_scope: "basename_only",
    exists: Boolean(runPath && fs.existsSync(runPath) && fs.statSync(runPath).isDirectory()),
    verification_status: readVerificationStatus(verificationPath),
    verification_source_path: verificationPath && fs.existsSync(verificationPath) ? path.basename(verificationPath) : null,
    verification_sha256: verificationPath && fs.existsSync(verificationPath) ? sha256File(verificationPath) : null,
    manifest_mode: manifest?.mode || null,
    json_artifact_count: 0
  };
}

function scanJsonArtifacts(runPath, run) {
  return fs.readdirSync(runPath)
    .filter((file) => /\.json$/i.test(file))
    .sort()
    .map((file) => {
      const fullPath = path.join(runPath, file);
      const scan = {
        command: run.command,
        run_folder: run.run_folder,
        artifact: file,
        artifact_scope: "run_folder_relative",
        valid_json: true,
        forbidden_actions: zeroForbiddenCounts(),
        direct_external_action_hits: []
      };
      const parsed = readJsonSafe(fullPath);
      if (!parsed) {
        scan.valid_json = false;
        return scan;
      }
      const collected = collectForbiddenSignals(parsed);
      scan.forbidden_actions = collected.forbidden_actions;
      scan.direct_external_action_hits = collected.direct_external_action_hits.map((hit) => ({
        command: run.command,
        run_folder: run.run_folder,
        artifact: file,
        field_path: hit.field_path,
        field_name: hit.field_name,
        bucket: hit.bucket,
        value: hit.value
      }));
      return scan;
    });
}

function collectForbiddenSignals(value) {
  const forbidden = zeroForbiddenCounts();
  const hits = [];

  function walk(current, fieldPath) {
    if (!current || typeof current !== "object") return;
    if (Array.isArray(current)) {
      current.forEach((child, index) => walk(child, `${fieldPath}[${index}]`));
      return;
    }
    for (const [key, child] of Object.entries(current)) {
      const childPath = fieldPath ? `${fieldPath}.${key}` : key;
      if (key === "forbidden_actions" && child && typeof child === "object" && !Array.isArray(child)) {
        for (const forbiddenKey of Object.keys(FORBIDDEN_ZERO)) {
          const amount = numericValue(child[forbiddenKey]);
          forbidden[forbiddenKey] += amount;
          if (amount > 0) {
            hits.push({ field_path: `${childPath}.${forbiddenKey}`, field_name: forbiddenKey, bucket: forbiddenKey, value: child[forbiddenKey] });
          }
        }
      }
      const directBucket = DIRECT_ACTION_FIELD_BUCKETS[key];
      if (directBucket && positiveValue(child)) {
        const amount = numericValue(child) || 1;
        forbidden[directBucket] += amount;
        hits.push({ field_path: childPath, field_name: key, bucket: directBucket, value: child });
      }
      if (GENERIC_EXTERNAL_ACTION_FIELDS.has(key) && positiveValue(child)) {
        hits.push({ field_path: childPath, field_name: key, bucket: "generic_external_action", value: child });
      }
      walk(child, childPath);
    }
  }

  walk(value, "");
  return {
    forbidden_actions: forbidden,
    direct_external_action_hits: hits
  };
}

function readVerificationStatus(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return "missing";
  const text = fs.readFileSync(filePath, "utf8");
  if (/Status:\s+PASS/i.test(text)) return "pass";
  if (/Status:\s+FAIL/i.test(text)) return "fail";
  return "unknown";
}

function sourceDescriptor(filePath, sourceType) {
  return {
    source_path: path.basename(path.resolve(filePath)),
    source_path_scope: "basename_only",
    source_type: sourceType,
    source_sha256: fs.existsSync(filePath) ? sha256File(filePath) : null
  };
}

function writeSafetyAuditRun(outDir, audit) {
  ensureDir(outDir);
  writeJson(path.join(outDir, "safety_audit_report.json"), audit);
  fs.writeFileSync(path.join(outDir, "safety_audit_summary.md"), renderSafetyAuditSummary(audit));
  writeJson(path.join(outDir, "run_manifest.json"), {
    run_id: path.basename(path.resolve(outDir)).replace(/[^a-zA-Z0-9_-]+/g, "_"),
    started_at: audit.generated_at,
    mode: "safety_audit",
    input_paths: [
      `proof_root:${audit.proof_root.source_path}`,
      `goal_md:${audit.goal_source.source_path}:${String(audit.goal_source.source_sha256 || "").slice(0, 16)}`
    ],
    output_path_scope: "run_folder_relative",
    output_paths: [
      "safety_audit_report.json",
      "safety_audit_summary.md",
      "run_manifest.json"
    ],
    forbidden_actions: { ...FORBIDDEN_ZERO },
    counts: {
      required_proof_runs: audit.proof_runs.length,
      failed_required_proof_runs: audit.proof_runs.filter((run) => run.verification_status !== "pass").length,
      scanned_json_artifacts: audit.artifact_scans.length,
      direct_external_action_hit_count: audit.direct_external_action_hit_count,
      failed_checks: audit.checks.filter((row) => row.status !== "pass").length
    }
  });
}

function renderSafetyAuditSummary(audit) {
  return [
    "# Safety Audit",
    "",
    `Status: ${audit.passed ? "PASS" : "FAIL"}`,
    "",
    "## Aggregate Forbidden Actions",
    ...Object.entries(audit.aggregate_forbidden_actions).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## Checks",
    ...audit.checks.map((row) => `- ${row.status.toUpperCase()}: ${row.message}`)
  ].join("\n") + "\n";
}

function zeroForbiddenCounts() {
  return Object.fromEntries(Object.keys(FORBIDDEN_ZERO).map((key) => [key, 0]));
}

function addForbiddenCounts(target, source) {
  for (const key of Object.keys(FORBIDDEN_ZERO)) {
    target[key] += numericValue(source?.[key]);
  }
}

function forbiddenCountsZero(counts) {
  return Object.keys(FORBIDDEN_ZERO).every((key) => numericValue(counts?.[key]) === 0);
}

function positiveValue(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") return /^(true|yes|1)$/i.test(value.trim()) || Number(value) > 0;
  return false;
}

function numericValue(value) {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return 0;
}

function check(id, pass, message) {
  return { id, status: pass ? "pass" : "fail", message };
}

function basenameOnly(value) {
  return Boolean(value) && !String(value).includes("/") && !String(value).includes("\\") && !String(value).includes("..");
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

module.exports = {
  REQUIRED_SAFETY_PROOF_COMMANDS,
  REQUIRED_GOAL_PHRASES,
  buildSafetyAudit,
  writeSafetyAuditRun
};
