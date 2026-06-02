const fs = require("fs");
const path = require("path");
const { hash16 } = require("./runtime");
const { extractRadar, normalizeParsedRow } = require("./normalize-row");

function findMetadata(lines, inputPath) {
  const subject = valueAfter(lines, /^Subject:\s*(.+)$/i) || "PropertyRadar digest";
  const from = valueAfter(lines, /^From:\s*(.+)$/i) || "PropertyRadar Alerts";
  const originalSender = valueAfter(lines, /^Original sender:\s*(.+)$/i);
  const receivedAt = valueAfter(lines, /^Message timestamp:\s*(.+)$/i) || new Date(0).toISOString();
  const alertFromSubject = subject.match(/Daily Digest Alert:\s*(.+)$/i);
  const alertFromBody = lines.join("\n").match(/daily digest alert,\s*(.+?),\s*found matches/i);
  const alertName = (alertFromSubject && alertFromSubject[1]) || (alertFromBody && alertFromBody[1]) || "PropertyRadar Alert";
  const base = inputPath ? path.basename(inputPath, path.extname(inputPath)) : "pasted_digest";
  return {
    source_id: `source:${base}:${hash16(subject + receivedAt)}`,
    gmail_message_id: null,
    gmail_thread_id: null,
    subject,
    from,
    original_sender: originalSender || null,
    received_at: receivedAt,
    alert_name: alertName.trim(),
    source_path: inputPath || null
  };
}

function valueAfter(lines, regex) {
  for (const line of lines) {
    const match = line.match(regex);
    if (match) return match[1].trim();
  }
  return null;
}

function isCurrencyLine(line) {
  return /^\$?\s*-?[\d,]+(?:\.\d+)?$/.test(String(line).trim()) && String(line).includes("$");
}

function isRadarLine(line) {
  return Boolean(extractRadar(line));
}

function parseDigestText(text, inputPath = null) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const source = findMetadata(lines, inputPath);
  const whatChangedIndex = lines.findIndex((line, idx) => line.trim() === "What Changed" && idx > 0);
  if (whatChangedIndex === -1) {
    return { source, parsedRows: [], needsReview: [{ source_id: source.source_id, reason: "no_table_found", severity: "blocker" }] };
  }

  const parsedRows = [];
  const needsReview = [];
  let i = whatChangedIndex + 1;
  while (i < lines.length && !isRadarLine(lines[i])) i += 1;

  while (i < lines.length) {
    if (!isRadarLine(lines[i])) {
      i += 1;
      continue;
    }

    const radar = extractRadar(lines[i]);
    const raw = {
      source_row_index: parsedRows.length + 1,
      radar_id: radar.radar_id,
      propertyradar_url: radar.propertyradar_url
    };
    i += 1;

    const fixed = [];
    while (i < lines.length && fixed.length < 6) {
      const trimmed = lines[i].trim();
      if (trimmed) fixed.push(trimmed);
      i += 1;
    }
    [raw.street, raw.city, raw.zip, raw.state, raw.property_type, raw.sq_ft] = fixed;

    const bedBathOrBlank = [];
    while (i < lines.length && !isCurrencyLine(lines[i]) && !isRadarLine(lines[i])) {
      const trimmed = lines[i].trim();
      if (trimmed) bedBathOrBlank.push(trimmed);
      i += 1;
    }
    raw.beds = bedBathOrBlank[0] || null;
    raw.baths = bedBathOrBlank[1] || null;

    if (i < lines.length && isCurrencyLine(lines[i])) {
      raw.est_value = lines[i].trim();
      i += 1;
    } else {
      raw.est_value = null;
    }

    const changeLines = [];
    while (i < lines.length && !isRadarLine(lines[i])) {
      const trimmed = lines[i].trim();
      if (trimmed) changeLines.push(trimmed);
      i += 1;
    }
    raw.change_lines = changeLines;

    const row = normalizeParsedRow(raw, source);
    if (!row.radar_id) {
      needsReview.push({ source_id: source.source_id, lead_key: null, reason: "missing_radar_id", severity: "blocker" });
    }
    if (!row.street || !row.city) {
      needsReview.push({ source_id: source.source_id, lead_key: row.radar_id ? `radar_id:${row.radar_id}` : null, reason: "missing_address_or_city", severity: "blocker" });
    }
    parsedRows.push(row);
  }

  return { source, parsedRows, needsReview };
}

function parseDigestFile(inputPath) {
  return parseDigestText(fs.readFileSync(inputPath, "utf8"), inputPath);
}

module.exports = {
  parseDigestText,
  parseDigestFile
};
