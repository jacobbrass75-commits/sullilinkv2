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
    source_path: inputPath ? path.basename(inputPath) : null,
    source_path_scope: inputPath ? "basename_only" : null
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

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
}

function stripHtml(value) {
  return decodeHtmlEntities(String(value || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function extractRadarFromHtmlCell(cellHtml, fallbackText) {
  const href = String(cellHtml || "").match(/href=["']([^"']+)["']/i);
  const radar = extractRadar(fallbackText);
  if (!radar) return null;
  return {
    radar_id: radar.radar_id,
    propertyradar_url: href ? decodeHtmlEntities(href[1]) : radar.propertyradar_url
  };
}

function parseDigestHtmlRows(html, source, needsReview = []) {
  const rows = String(html || "").match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const parsedRows = [];
  let inTable = false;
  let htmlTableRowIndex = 0;

  for (const rowHtml of rows) {
    const cells = Array.from(rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi));
    const values = cells.map((match) => stripHtml(match[1]));
    if (!values.some(Boolean)) continue;

    if (!inTable) {
      inTable = values.some((cell) => /^radar id$/i.test(cell)) && values.some((cell) => /^street$/i.test(cell));
      continue;
    }

    htmlTableRowIndex += 1;
    if (values.length < 11) {
      needsReview.push({
        source_id: source.source_id,
        reason: "malformed_html_table_row",
        severity: "warning",
        html_table_row_index: htmlTableRowIndex,
        summary: `Expected at least 11 PropertyRadar table cells, found ${values.length}.`
      });
      continue;
    }
    const radar = extractRadarFromHtmlCell(cells[0][1], values[0]);
    const raw = {
      source_row_index: parsedRows.length + 1,
      radar_id: radar?.radar_id || values[0],
      propertyradar_url: radar?.propertyradar_url,
      street: values[1],
      city: values[2],
      zip: values[3],
      state: values[4],
      property_type: values[5],
      sq_ft: values[6],
      beds: values[7],
      baths: values[8],
      est_value: values[9],
      change_lines: values.slice(10)
    };
    parsedRows.push(normalizeParsedRow(raw, source));
  }

  return parsedRows;
}

function parseDigestText(text, inputPath = null) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const source = findMetadata(lines, inputPath);
  const needsReview = [];
  const htmlRows = parseDigestHtmlRows(text, source, needsReview);
  if (htmlRows.length) {
    return { source, parsedRows: htmlRows, needsReview };
  }

  const whatChangedIndex = lines.findIndex((line, idx) => line.trim() === "What Changed" && idx > 0);
  if (whatChangedIndex === -1) {
    return { source, parsedRows: [], needsReview: [...needsReview, { source_id: source.source_id, reason: "no_table_found", severity: "blocker" }] };
  }

  const parsedRows = [];
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
  parseDigestFile,
  parseDigestHtmlRows
};
