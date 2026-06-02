const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { parseCsv } = require("./batch-owner-clusters");
const { extractRadar } = require("./normalize-row");
const { sha256File } = require("./runtime");

const RADAR_HEADERS = ["Radar ID", "RadarID", "PropertyRadar ID", "Property Radar ID", "radar_id"];
const ITEM_ID_HEADERS = ["Item ID", "Item Id", "ID", "Id", "item_id", "monday_item_id"];
const ITEM_NAME_HEADERS = ["Name", "Item Name", "Item", "item_name"];
const BOARD_HEADERS = ["Board ID", "Board Id", "board_id"];
const GROUP_HEADERS = ["Group ID", "Group Id", "Group", "group_id"];

function pythonBin() {
  return process.env.CODEX_PYTHON_BIN || "python3";
}

function normalizeHeader(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function findHeader(headers, aliases) {
  const wanted = new Set(aliases.map(normalizeHeader));
  return headers.find((header) => wanted.has(normalizeHeader(header))) || null;
}

function normalizeRadarId(value) {
  const radar = extractRadar(String(value || ""));
  return radar?.radar_id || "";
}

function rowObject(headers, row) {
  const result = {};
  headers.forEach((header, index) => {
    result[header] = row[index] === undefined || row[index] === "" ? null : row[index];
  });
  return result;
}

function readTabularRows(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".json") return readJsonRecords(filePath);
  if (extension === ".xlsx" || extension === ".xlsm" || extension === ".xls") return readXlsxRecords(filePath);

  const rows = parseCsv(fs.readFileSync(filePath, "utf8"));
  const headers = rows[0] || [];
  return rows.slice(1)
    .filter((row) => row.length > 1 || row[0])
    .map((row) => recordFromObject(rowObject(headers, row), { source_format: "csv" }))
    .filter(Boolean);
}

function readXlsxRecords(filePath) {
  const script = String.raw`
import json, sys
from openpyxl import load_workbook

workbook = load_workbook(sys.argv[1], read_only=True, data_only=True)
sheet = workbook.active
rows = []
for row in sheet.iter_rows(values_only=True):
    rows.append(["" if value is None else str(value) for value in row])
print(json.dumps(rows))
`;
  const result = spawnSync(pythonBin(), ["-c", script, filePath], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`Monday lookup xlsx read failed: ${result.stderr || result.stdout}`);
  }
  const rows = JSON.parse(result.stdout || "[]");
  const headers = rows[0] || [];
  return rows.slice(1)
    .filter((row) => row.length > 1 || row[0])
    .map((row) => recordFromObject(rowObject(headers, row), { source_format: "xlsx" }))
    .filter(Boolean);
}

function readJsonRecords(filePath) {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (Array.isArray(parsed)) {
    return parsed.map((item) => recordFromObject(item, { source_format: "json" })).filter(Boolean);
  }
  const items = [];
  collectMondayItems(parsed, items);
  return items.map((item) => recordFromMondayItem(item)).filter(Boolean);
}

function collectMondayItems(value, items) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectMondayItems(item, items));
    return;
  }
  if ((value.id || value.item_id) && (value.name || value.column_values || value.columns)) {
    items.push(value);
  }
  Object.values(value).forEach((child) => collectMondayItems(child, items));
}

function valueFromHeaders(row, aliases) {
  const header = findHeader(Object.keys(row), aliases);
  return header ? row[header] : null;
}

function recordFromObject(row, extra = {}) {
  const itemName = valueFromHeaders(row, ITEM_NAME_HEADERS);
  const radarId = normalizeRadarId(valueFromHeaders(row, RADAR_HEADERS)) || normalizeRadarId(itemName);
  if (!radarId) return null;
  return {
    radar_id: radarId,
    item_id: valueFromHeaders(row, ITEM_ID_HEADERS) || null,
    item_name: itemName || null,
    board_id: valueFromHeaders(row, BOARD_HEADERS) || null,
    group_id: valueFromHeaders(row, GROUP_HEADERS) || null,
    source_format: extra.source_format || "tabular"
  };
}

function recordFromMondayItem(item) {
  const radarColumnId = process.env.MONDAY_RADAR_ID_COLUMN_ID || null;
  const columns = item.column_values || item.columns || [];
  const columnRadar = Array.isArray(columns) ? columns.map((column) => {
    const title = column.title || column.column?.title || column.id || "";
    const text = column.text || column.value || "";
    const idMatch = radarColumnId && column.id === radarColumnId;
    const titleMatch = /radar\s*id/i.test(title);
    return idMatch || titleMatch ? normalizeRadarId(text) : "";
  }).find(Boolean) : "";
  const radarId = columnRadar || normalizeRadarId(item.radar_id) || normalizeRadarId(item.name);
  if (!radarId) return null;
  return {
    radar_id: radarId,
    item_id: item.id || item.item_id || null,
    item_name: item.name || item.item_name || null,
    board_id: item.board?.id || item.board_id || null,
    group_id: item.group?.id || item.group_id || null,
    source_format: "json"
  };
}

function buildLookupIndex(records) {
  const index = new Map();
  for (const record of records) {
    if (!index.has(record.radar_id)) index.set(record.radar_id, []);
    index.get(record.radar_id).push(record);
  }
  return index;
}

function lookupLeads(leads, records, mode = "monday_lookup_file") {
  const index = buildLookupIndex(records);
  return leads.map((lead) => {
    const radarId = normalizeRadarId(lead.radar_id);
    if (!radarId) {
      return lookupResult(lead, mode, [], "skipped_missing_radar_id", "Lead has no Radar ID.");
    }
    const matches = index.get(radarId) || [];
    if (!matches.length) return lookupResult(lead, mode, matches, "not_found", null);
    return lookupResult(lead, mode, matches, matches.length === 1 ? "matched" : "duplicate_match", null);
  });
}

function lookupResult(lead, mode, matches, result, error) {
  return {
    dedupe_key: lead.dedupe_key,
    radar_id: lead.radar_id || null,
    lookup_mode: mode,
    result,
    match_count: matches.length,
    existing_item_id: matches[0]?.item_id || null,
    existing_item_ids: matches.map((match) => match.item_id).filter(Boolean),
    existing_item_name: matches[0]?.item_name || null,
    existing_item_names: matches.map((match) => match.item_name).filter(Boolean),
    board_id: matches[0]?.board_id || null,
    group_id: matches[0]?.group_id || null,
    error
  };
}

function readLookupFile(filePath) {
  const records = readTabularRows(filePath);
  return {
    source_path: filePath,
    source_sha256: sha256File(filePath),
    source_format: path.extname(filePath).toLowerCase().replace(/^\./, "") || "csv",
    records
  };
}

module.exports = {
  lookupLeads,
  normalizeRadarId,
  readLookupFile
};
