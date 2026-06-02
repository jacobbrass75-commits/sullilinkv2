const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { FORBIDDEN_ZERO, ensureDir, nowIso, sha256File, writeJson } = require("./runtime");

const REQUIRED_PACKET_FILES = [
  "broker_owner_control_report.html",
  "owner_disambiguation_packet.xlsx",
  "monday_action_queue.csv",
  "owner_disambiguation_report.md",
  "supporting/manifest.json",
  "supporting/owner_disambiguation_packets.json"
];

const FORBIDDEN_PACKET_EXTENSIONS = new Set([".pdf", ".tif", ".tiff", ".png", ".jpg", ".jpeg"]);
const SCANNED_TEXT_EXTENSIONS = new Set([".html", ".htm", ".md", ".csv", ".json", ".txt"]);

function buildPacketAudit({ packetDir }) {
  if (!packetDir) throw new Error("packet-audit requires --packet-dir PACKET_DIR");
  const root = path.resolve(packetDir);
  const generatedAt = nowIso();
  const files = listFiles(root);
  const requiredFiles = REQUIRED_PACKET_FILES.map((relativePath) => {
    const fullPath = path.join(root, relativePath);
    return {
      relative_path: relativePath,
      exists: fs.existsSync(fullPath),
      size_bytes: fs.existsSync(fullPath) ? fs.statSync(fullPath).size : 0,
      sha256: fs.existsSync(fullPath) ? sha256File(fullPath) : null
    };
  });
  const forbiddenFiles = files.filter((file) => FORBIDDEN_PACKET_EXTENSIONS.has(path.extname(file.relative_path).toLowerCase()));
  const scans = scanPacketFiles(root, files);
  const manifest = readJsonIfExists(path.join(root, "supporting", "manifest.json"));
  const packets = readJsonIfExists(path.join(root, "supporting", "owner_disambiguation_packets.json"));
  const claimAudit = auditOwnerClaims(packets);
  const checks = [
    check("required_packet_files", requiredFiles.every((file) => file.exists), "Required shareable packet files exist."),
    check("no_raw_paid_docs_in_packet_tree", forbiddenFiles.length === 0, "Packet tree contains no raw paid document/image files."),
    check("manifest_uses_raw_run_not_included", manifestUsesRawRunSentinels(manifest), "Manifest keeps raw run/evidence dirs outside the shareable packet."),
    check("no_absolute_local_paths", scans.every((scan) => scan.absolute_local_path_count === 0), "Packet files contain no absolute local paths."),
    check("no_secret_values", scans.every((scan) => scan.secret_hit_count === 0), "Packet files contain no credential-like values."),
    check("owner_packets_present", claimAudit.packet_count > 0, "Owner disambiguation packets are present."),
    check("control_claims_have_evidence", claimAudit.missing_evidence_count === 0, "Control lead rows include source summaries and saved-evidence references."),
    check("control_claims_have_confidence", claimAudit.missing_confidence_count === 0, "Control lead rows include confidence language."),
    check("beneficial_ownership_not_overclaimed", claimAudit.beneficial_owner_overclaim_count === 0, "Packets do not overclaim private beneficial ownership."),
    check("next_verification_present", claimAudit.missing_next_verification_count === 0, "Packets keep next verification steps attached to each cluster.")
  ];
  return {
    schema_version: 1,
    mode: "packet_audit",
    generated_at: generatedAt,
    packet_source: {
      source_path: path.basename(root),
      source_path_scope: "basename_only",
      file_count: files.length
    },
    required_files: requiredFiles,
    forbidden_files: forbiddenFiles.map((file) => file.relative_path),
    scans,
    claim_audit: claimAudit,
    checks,
    passed: checks.every((row) => row.status === "pass"),
    forbidden_actions: { ...FORBIDDEN_ZERO }
  };
}

function listFiles(root) {
  const files = [];
  function walk(current) {
    for (const child of fs.readdirSync(current).sort()) {
      const fullPath = path.join(current, child);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (stat.isFile()) {
        files.push({
          relative_path: normalizeRelativePath(path.relative(root, fullPath)),
          size_bytes: stat.size
        });
      }
    }
  }
  walk(root);
  return files;
}

function scanPacketFiles(root, files) {
  return files.map((file) => {
    const ext = path.extname(file.relative_path).toLowerCase();
    const fullPath = path.join(root, file.relative_path);
    const texts = [];
    if (SCANNED_TEXT_EXTENSIONS.has(ext)) {
      texts.push(fs.readFileSync(fullPath, "utf8"));
    } else if (ext === ".xlsx") {
      texts.push(...readZipTextEntries(fullPath));
    }
    const text = texts.join("\n");
    return {
      relative_path: file.relative_path,
      size_bytes: file.size_bytes,
      scanned_text_units: texts.length,
      absolute_local_path_count: countMatches(text, /\/Users\/[A-Za-z0-9._-]+|file:\/\/\/Users\/[A-Za-z0-9._-]+|file:\/\/[A-Za-z]:[\\/][^\s|"']+|(^|[\s"'])[A-Za-z]:[\\/][^\s"']*/g),
      secret_hit_count: countSecretHits(text)
    };
  });
}

function readZipTextEntries(filePath) {
  const buffer = fs.readFileSync(filePath);
  const entries = [];
  let offset = 0;
  while (offset + 30 <= buffer.length) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== 0x04034b50) break;
    const flags = buffer.readUInt16LE(offset + 6);
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.toString("utf8", offset + 30, offset + 30 + nameLength);
    const dataStart = offset + 30 + nameLength + extraLength;
    if (flags & 0x08) break;
    const dataEnd = dataStart + compressedSize;
    const data = buffer.subarray(dataStart, dataEnd);
    if (/\.(xml|rels|txt)$/i.test(name)) {
      try {
        if (method === 0) entries.push(data.toString("utf8"));
        if (method === 8) entries.push(zlib.inflateRawSync(data).toString("utf8"));
      } catch {
        // Non-critical scan unit; workbook zip integrity is still represented by required file/hash checks.
      }
    }
    offset = dataEnd;
  }
  return entries;
}

function auditOwnerClaims(source) {
  const packets = Array.isArray(source?.packets) ? source.packets : [];
  const rows = packets.map((packet) => ({
    cluster_id: packet.cluster_id,
    has_control_lead: Boolean(packet.likely_control_lead),
    has_source_summary: Boolean(packet.source_summary && String(packet.source_summary).length > 40),
    has_saved_evidence: Array.isArray(packet.saved_evidence) && packet.saved_evidence.length > 0,
    has_confidence: Boolean(packet.confidence && /\b(?:confidence|high|medium|low|proven|not proven)\b/i.test(packet.confidence)),
    beneficial_owner_status: packet.beneficial_owner_status || "",
    has_next_verification: Boolean(packet.next_verification && String(packet.next_verification).length > 20)
  }));
  return {
    packet_count: rows.length,
    rows,
    missing_evidence_count: rows.filter((row) => row.has_control_lead && (!row.has_source_summary || !row.has_saved_evidence)).length,
    missing_confidence_count: rows.filter((row) => row.has_control_lead && !row.has_confidence).length,
    beneficial_owner_overclaim_count: rows.filter((row) => row.beneficial_owner_status && !/not proven/i.test(row.beneficial_owner_status)).length,
    missing_next_verification_count: rows.filter((row) => !row.has_next_verification).length
  };
}

function manifestUsesRawRunSentinels(manifest) {
  if (!manifest || !manifest.dirs) return false;
  return Object.values(manifest.dirs).every((value) => String(value || "").startsWith("raw_run_not_included"));
}

function readJsonIfExists(filePath) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : null;
}

function check(id, pass, message) {
  return { id, status: pass ? "pass" : "fail", message };
}

function countMatches(text, regex) {
  if (!text) return 0;
  const matches = String(text).match(regex);
  return matches ? matches.length : 0;
}

function countSecretHits(text) {
  if (!text) return 0;
  const valuePatterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gi,
    /Authorization:\s+(?!\|)(?!Bearer\s+\$\{?[A-Z0-9_]+\}?)(?!Bearer\s+<)(?!Bearer\s+YOUR_)\S+/gi,
    /Password\s*[:=]\s*(?!["'\\|$<])\S+/gi,
    /LeeISG4312|Today@2025/gi,
    /\b(?:ROCKETREACH_PASSWORD|TITLEPRO247_PASSWORD|PROPERTYRADAR_PASSWORD|MONDAY_API_TOKEN)\s*[:=]\s*(?!["'\\|$<])\S+/gi
  ];
  return valuePatterns.reduce((sum, pattern) => sum + countMatches(text, pattern), 0);
}

function normalizeRelativePath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function writePacketAuditRun(outDir, audit) {
  ensureDir(outDir);
  writeJson(path.join(outDir, "packet_audit_report.json"), audit);
  fs.writeFileSync(path.join(outDir, "packet_audit_summary.md"), renderSummary(audit));
  writeJson(path.join(outDir, "run_manifest.json"), {
    run_id: path.basename(path.resolve(outDir)).replace(/[^a-zA-Z0-9_-]+/g, "_"),
    started_at: audit.generated_at,
    mode: "packet_audit",
    input_paths: [`packet_dir:${audit.packet_source.source_path}`],
    output_path_scope: "run_folder_relative",
    output_paths: [
      "packet_audit_report.json",
      "packet_audit_summary.md",
      "run_manifest.json"
    ],
    forbidden_actions: { ...FORBIDDEN_ZERO },
    counts: {
      packet_files: audit.packet_source.file_count,
      checks: audit.checks.length,
      failed_checks: audit.checks.filter((row) => row.status !== "pass").length,
      owner_packet_count: audit.claim_audit.packet_count
    }
  });
}

function renderSummary(audit) {
  return [
    "# Packet Audit",
    "",
    `Status: ${audit.passed ? "PASS" : "FAIL"}`,
    "",
    "## Checks",
    ...audit.checks.map((row) => `- ${row.status.toUpperCase()}: ${row.message}`)
  ].join("\n") + "\n";
}

module.exports = {
  REQUIRED_PACKET_FILES,
  buildPacketAudit,
  writePacketAuditRun
};
