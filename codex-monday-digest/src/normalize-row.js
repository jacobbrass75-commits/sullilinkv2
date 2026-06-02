function parseMoneyOrNumber(value) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replace(/[$,\s]/g, "");
  if (!cleaned || cleaned === "-") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalNumber(value) {
  const parsed = parseMoneyOrNumber(value);
  return parsed === null ? null : parsed;
}

function extractRadar(line) {
  const markdown = String(line).match(/\[(P[A-Z0-9]+)\]\(([^)]+)\)/i);
  if (markdown) {
    return { radar_id: markdown[1].toUpperCase(), propertyradar_url: markdown[2] };
  }
  const plain = String(line).match(/\b(P(?=[A-Z0-9]*\d)[A-Z0-9]{2,})\b/i);
  if (!plain) return null;
  return { radar_id: plain[1].toUpperCase(), propertyradar_url: `https://goradar.it/${plain[1].toUpperCase()}` };
}

function normalizeChangeLines(lines) {
  return lines.map((line) => String(line).trim()).filter(Boolean);
}

function normalizeParsedRow(raw, source) {
  const changeLines = normalizeChangeLines(raw.change_lines || []);
  const whatChanged = changeLines.join("\n");
  return {
    source_id: source.source_id,
    source_email_id: source.source_id,
    source_row_index: raw.source_row_index,
    source_subject: source.subject,
    source_alert_name: source.alert_name,
    source_received_at: source.received_at,
    radar_id: raw.radar_id,
    propertyradar_url: raw.propertyradar_url || `https://goradar.it/${raw.radar_id}`,
    street: String(raw.street || "").trim(),
    city: String(raw.city || "").trim(),
    zip: String(raw.zip || "").trim(),
    state: String(raw.state || "").trim(),
    property_type: String(raw.property_type || "").trim(),
    sq_ft: parseOptionalNumber(raw.sq_ft),
    beds: parseOptionalNumber(raw.beds),
    baths: parseOptionalNumber(raw.baths),
    est_value: parseOptionalNumber(raw.est_value),
    what_changed: whatChanged,
    change_lines: changeLines
  };
}

module.exports = {
  parseMoneyOrNumber,
  parseOptionalNumber,
  extractRadar,
  normalizeChangeLines,
  normalizeParsedRow
};
