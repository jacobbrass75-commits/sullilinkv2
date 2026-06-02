const fs = require("fs");
const path = require("path");
const { FORBIDDEN_ZERO, ensureDir, writeJson, sha256File, nowIso } = require("./runtime");

const REQUIRED_REFERENCES = [
  "references/runbook.md",
  "references/sullilink-reuse.md"
];

const REQUIRED_COMMAND_SNIPPETS = [
  "parse --input",
  "preview --input",
  "preview --gmail-json",
  "connector-readiness",
  "workflow-map",
  "sync --run",
  "titlepro-approve",
  "titlepro-confirm",
  "titlepro-import",
  "contact-import",
  "status-import",
  "goal-audit",
  "packet-audit",
  "source-audit",
  "verify --run"
];

const REQUIRED_PROOF_SCRIPTS = [
  "proof:preview",
  "proof:gmail-connector",
  "proof:connector-readiness",
  "proof:lookup",
  "proof:monday-connector",
  "proof:titlepro-approval",
  "proof:titlepro-confirm",
  "proof:titlepro-evidence",
  "proof:contact",
  "proof:status",
  "proof:skill-pack",
  "proof:goal-audit",
  "proof:packet-audit",
  "proof:source-audit",
  "proof:source-audit-real",
  "proof:workflow-map",
  "proof:batch"
];

const REQUIRED_SAFETY_PHRASES = [
  "no Monday live writes",
  "no Gmail sends",
  "no RealNex writes",
  "no unsupervised TitlePro paid pulls",
  "no owner/control claims from CSV owner strings alone",
  "day_of_action_recheck_required=true",
  "copy patterns only",
  "source_reuse_contract.json",
  "Daily digest parser",
  "APN dedupe",
  "TitlePro serial worker"
];

function buildSkillPackageCheck({ skillDir, packageJson, goalMd }) {
  if (!skillDir) throw new Error("skill-check requires --skill-dir SKILL_DIR");
  if (!packageJson) throw new Error("skill-check requires --package-json PACKAGE.json");
  const skillPath = path.resolve(skillDir);
  const packagePath = path.resolve(packageJson);
  const goalPath = goalMd ? path.resolve(goalMd) : null;
  const checks = [];
  const readText = (relativePath) => {
    const fullPath = path.join(skillPath, relativePath);
    return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, "utf8") : "";
  };

  const skillMdPath = path.join(skillPath, "SKILL.md");
  const agentsPath = path.join(skillPath, "agents", "openai.yaml");
  const skillMd = fs.existsSync(skillMdPath) ? fs.readFileSync(skillMdPath, "utf8") : "";
  const runbook = readText("references/runbook.md");
  const reuse = readText("references/sullilink-reuse.md");
  const openaiYaml = fs.existsSync(agentsPath) ? fs.readFileSync(agentsPath, "utf8") : "";
  const packageJsonText = fs.existsSync(packagePath) ? fs.readFileSync(packagePath, "utf8") : "";
  const packageData = packageJsonText ? JSON.parse(packageJsonText) : {};
  const goalText = goalPath && fs.existsSync(goalPath) ? fs.readFileSync(goalPath, "utf8") : "";
  const frontmatter = parseFrontmatter(skillMd);
  const scripts = packageData.scripts || {};

  addCheck(checks, "skill_md_exists", fs.existsSync(skillMdPath), "SKILL.md exists");
  addCheck(checks, "skill_name_matches_folder", frontmatter.name === path.basename(skillPath), "skill frontmatter name matches folder");
  addCheck(checks, "skill_description_targets_workflow", /Monday\.com|Monday/i.test(frontmatter.description || "") && /PropertyRadar/i.test(frontmatter.description || "") && /TitlePro/i.test(frontmatter.description || ""), "skill description triggers on Monday, PropertyRadar, and TitlePro workflow work");
  addCheck(checks, "skill_body_is_progressive", skillMd.split("\n").length <= 500, "SKILL.md stays concise enough for progressive disclosure");
  addCheck(checks, "skill_references_runbook", skillMd.includes("references/runbook.md"), "SKILL.md points to the runbook reference");
  addCheck(checks, "skill_references_sullilink", skillMd.includes("references/sullilink-reuse.md"), "SKILL.md points to the SullyLink reuse reference");
  addCheck(checks, "lower_level_skills_called_out", skillMd.includes("distressed-cre-research") && skillMd.includes("titlepro247"), "lower-level research and TitlePro skills are called out");

  for (const relativePath of REQUIRED_REFERENCES) {
    addCheck(checks, `reference_exists:${relativePath}`, fs.existsSync(path.join(skillPath, relativePath)), `${relativePath} exists`);
  }

  addCheck(checks, "agents_openai_yaml_exists", fs.existsSync(agentsPath), "agents/openai.yaml exists for skill UI metadata");
  addCheck(checks, "agents_default_prompt_mentions_skill", /\$monday-cre-workflow/.test(openaiYaml), "agents/openai.yaml default prompt explicitly mentions $monday-cre-workflow");
  addCheck(checks, "agents_short_description_length", validShortDescription(openaiYaml), "agents/openai.yaml has a 25-64 character short_description");

  for (const snippet of REQUIRED_COMMAND_SNIPPETS) {
    addCheck(checks, `runbook_command:${snippet}`, runbook.includes(snippet) || skillMd.includes(snippet), `skill docs include ${snippet}`);
  }

  for (const scriptName of REQUIRED_PROOF_SCRIPTS) {
    addCheck(checks, `proof_script:${scriptName}`, typeof scripts[scriptName] === "string" && scripts[scriptName].length > 0, `${scriptName} exists in package scripts`);
  }

  const combinedDocs = [skillMd, runbook, reuse, goalText].join("\n");
  for (const phrase of REQUIRED_SAFETY_PHRASES) {
    addCheck(checks, `safety_phrase:${phrase}`, combinedDocs.includes(phrase), `docs preserve safety phrase: ${phrase}`);
  }

  addCheck(checks, "goal_mentions_skill", goalText.includes("Codex skill") && goalText.includes("monday-cre-workflow"), "goal markdown keeps skill objective explicit");
  addCheck(checks, "goal_mentions_source_audit", goalText.includes("source-audit") && goalText.includes("SullyLink"), "goal markdown ties SullyLink reuse to source-audit");
  addCheck(checks, "no_absolute_local_paths", !hasAbsoluteLocalPath([skillMd, runbook, reuse, openaiYaml].join("\n")), "skill package text contains no absolute local paths");
  addCheck(checks, "no_secret_values", !hasSecretPattern([skillMd, runbook, reuse, openaiYaml].join("\n")), "skill package text contains no credential-like values");
  addCheck(checks, "references_one_level_deep", oneLevelReferences(skillPath), "skill bundled references are one level deep");

  const passed = checks.every((check) => check.status === "pass");
  return {
    schema_version: 1,
    mode: "skill_package_check",
    skill_name: frontmatter.name || path.basename(skillPath),
    skill_source: {
      source_path: path.basename(skillPath),
      source_path_scope: "basename_only",
      skill_md_sha256: fs.existsSync(skillMdPath) ? sha256File(skillMdPath) : null,
      openai_yaml_sha256: fs.existsSync(agentsPath) ? sha256File(agentsPath) : null
    },
    package_source: {
      source_path: path.basename(packagePath),
      source_path_scope: "basename_only",
      source_sha256: fs.existsSync(packagePath) ? sha256File(packagePath) : null
    },
    goal_source: goalPath ? {
      source_path: path.basename(goalPath),
      source_path_scope: "basename_only",
      source_sha256: fs.existsSync(goalPath) ? sha256File(goalPath) : null
    } : null,
    required_references: REQUIRED_REFERENCES,
    required_command_snippets: REQUIRED_COMMAND_SNIPPETS,
    required_proof_scripts: REQUIRED_PROOF_SCRIPTS,
    checks,
    passed,
    forbidden_actions: { ...FORBIDDEN_ZERO }
  };
}

function writeSkillPackageCheckRun(outDir, report) {
  ensureDir(outDir);
  const at = nowIso();
  const reportPath = path.join(outDir, "skill_package_report.json");
  const summaryPath = path.join(outDir, "skill_package_summary.md");
  const manifestPath = path.join(outDir, "run_manifest.json");
  writeJson(reportPath, report);
  fs.writeFileSync(summaryPath, renderSummary(report));
  writeJson(manifestPath, {
    run_id: path.basename(path.resolve(outDir)).replace(/[^a-zA-Z0-9_-]+/g, "_"),
    started_at: at,
    mode: "skill_package_check",
    output_paths: [reportPath, summaryPath],
    forbidden_actions: { ...FORBIDDEN_ZERO },
    counts: {
      checks: report.checks.length,
      failed_checks: report.checks.filter((check) => check.status !== "pass").length
    }
  });
}

function buildSkillPackageBundle({ skillDir, packageJson, goalMd }) {
  const check = buildSkillPackageCheck({ skillDir, packageJson, goalMd });
  const skillPath = path.resolve(skillDir);
  const files = collectSkillFiles(skillPath);
  return {
    schema_version: 1,
    mode: "skill_package_bundle",
    skill_name: check.skill_name,
    package_ready: check.passed,
    package_root: `${check.skill_name}/`,
    source_check: check,
    files: files.map((file) => ({
      relative_path: file.relativePath,
      size_bytes: fs.statSync(file.fullPath).size,
      sha256: sha256File(file.fullPath)
    })),
    install_target: "${CODEX_HOME:-$HOME/.codex}/skills",
    forbidden_actions: { ...FORBIDDEN_ZERO }
  };
}

function writeSkillPackageBundleRun(outDir, bundle, skillDir) {
  ensureDir(outDir);
  const at = nowIso();
  const packageRootDir = path.join(outDir, "skill_package");
  const packageDir = path.join(packageRootDir, bundle.skill_name);
  fs.rmSync(packageRootDir, { recursive: true, force: true });
  const files = collectSkillFiles(path.resolve(skillDir));
  for (const file of files) {
    const destination = path.join(packageDir, file.relativePath);
    ensureDir(path.dirname(destination));
    fs.copyFileSync(file.fullPath, destination);
  }
  const manifestPath = path.join(outDir, "skill_package_bundle_manifest.json");
  const installPath = path.join(outDir, "skill_package_install.md");
  const reportPath = path.join(outDir, "skill_package_report.json");
  const summaryPath = path.join(outDir, "skill_package_summary.md");
  writeJson(manifestPath, bundle);
  fs.writeFileSync(installPath, renderInstallGuide(bundle));
  writeJson(reportPath, bundle.source_check);
  fs.writeFileSync(summaryPath, renderSummary(bundle.source_check));
  writeJson(path.join(outDir, "run_manifest.json"), {
    run_id: path.basename(path.resolve(outDir)).replace(/[^a-zA-Z0-9_-]+/g, "_"),
    started_at: at,
    mode: "skill_package_bundle",
    output_path_scope: "run_folder_relative",
    output_paths: [
      path.basename(manifestPath),
      path.basename(installPath),
      path.basename(reportPath),
      path.basename(summaryPath),
      "skill_package"
    ],
    forbidden_actions: { ...FORBIDDEN_ZERO },
    counts: {
      package_files: bundle.files.length,
      skill_checks: bundle.source_check.checks.length,
      failed_checks: bundle.source_check.checks.filter((check) => check.status !== "pass").length
    }
  });
}

function collectSkillFiles(skillPath) {
  const files = [];
  const allowedRoots = new Set(["agents", "references", "scripts", "assets"]);
  function walk(current) {
    const relativePath = normalizeRelativePath(path.relative(skillPath, current));
    const stat = fs.statSync(current);
    if (stat.isDirectory()) {
      if (relativePath) {
        const [root] = relativePath.split("/");
        if (!allowedRoots.has(root)) return;
      }
      for (const child of fs.readdirSync(current).sort()) walk(path.join(current, child));
      return;
    }
    if (!relativePath) return;
    if (relativePath === "SKILL.md" || allowedRoots.has(relativePath.split("/")[0])) {
      files.push({ relativePath, fullPath: current });
    }
  }
  walk(skillPath);
  return files;
}

function parseFrontmatter(text) {
  const match = String(text || "").match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result = {};
  for (const line of match[1].split("\n")) {
    const parts = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (!parts) continue;
    result[parts[1]] = parts[2].replace(/^"|"$/g, "").trim();
  }
  return result;
}

function addCheck(checks, id, pass, message) {
  checks.push({
    id,
    status: pass ? "pass" : "fail",
    message
  });
}

function validShortDescription(openaiYaml) {
  const match = String(openaiYaml || "").match(/short_description:\s*"([^"]+)"/);
  if (!match) return false;
  return match[1].length >= 25 && match[1].length <= 64;
}

function oneLevelReferences(skillPath) {
  const referencesDir = path.join(skillPath, "references");
  if (!fs.existsSync(referencesDir)) return false;
  const entries = fs.readdirSync(referencesDir, { withFileTypes: true });
  return entries.every((entry) => entry.isFile());
}

function hasAbsoluteLocalPath(text) {
  return /\/Users\/[A-Za-z0-9._-]+|file:\/\/\/Users\/[A-Za-z0-9._-]+|file:\/\/[A-Za-z]:[\\/][^\s|"']+|(^|[\s"'])[A-Za-z]:[\\/][^\s"']*/.test(String(text || ""));
}

function hasSecretPattern(text) {
  return /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|Authorization:\s+(?!\|)\S+|Password\s*[:=]\s*(?!["'\\|])\S+|LeeISG4312|Today@2025/i.test(String(text || ""));
}

function renderSummary(report) {
  const failed = report.checks.filter((check) => check.status !== "pass");
  return [
    "# Monday CRE Skill Package Check",
    "",
    failed.length ? "Status: FAIL" : "Status: PASS",
    "",
    `Skill: ${report.skill_name}`,
    `Checks: ${report.checks.length}`,
    `Failed: ${failed.length}`,
    "",
    "## Checks",
    ...report.checks.map((check) => `- ${check.status === "pass" ? "PASS" : "FAIL"}: ${check.message}`)
  ].join("\n") + "\n";
}

function renderInstallGuide(bundle) {
  return [
    "# Install Monday CRE Workflow Skill",
    "",
    "This package is local-only. It contains the Codex skill files, references, UI metadata, and validation report.",
    "",
    "## Install",
    "",
    "From this package run folder:",
    "",
    "```bash",
    "mkdir -p \"${CODEX_HOME:-$HOME/.codex}/skills\"",
    `cp -R skill_package/${bundle.skill_name} \"\${CODEX_HOME:-$HOME/.codex}/skills/${bundle.skill_name}\"`,
    "```",
    "",
    "## Verify",
    "",
    "After install, run from the repo:",
    "",
    "```bash",
    "cd codex-monday-digest",
    "npm run proof:skill",
    "```",
    "",
    "## Package Contents",
    "",
    ...bundle.files.map((file) => `- ${file.relative_path} (${file.sha256.slice(0, 12)})`)
  ].join("\n") + "\n";
}

function normalizeRelativePath(value) {
  return String(value || "").replace(/\\/g, "/");
}

module.exports = {
  buildSkillPackageCheck,
  writeSkillPackageCheckRun,
  buildSkillPackageBundle,
  writeSkillPackageBundleRun
};
