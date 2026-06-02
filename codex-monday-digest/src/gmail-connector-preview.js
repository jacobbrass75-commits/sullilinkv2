const fs = require("fs");
const path = require("path");
const { parseDigestText } = require("./parse-digest");
const { hash16, sha256File } = require("./runtime");

function readGmailConnectorPreviewFile(filePath, options = {}) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const messages = extractMessages(raw).map(normalizeMessage).filter((message) => message.body || message.snippet);
  const parsedRows = [];
  const needsReview = [];
  const sourceEmails = [];
  const label = options.label || "CRE/PropertyRadar Alerts";
  const since = options.since || "2d";
  const query = options.query || `label:"${label}" newer_than:${since}`;

  messages.forEach((message, index) => {
    const sourcePath = `gmail_connector_message_${message.id || index + 1}.html`;
    const parsed = parseDigestText(messageText(message), sourcePath);
    const sourceId = `gmail:${message.id || hash16(`${message.subject}|${message.received_at}|${message.body}`)}`;
    const fromContactHash = contactHash(message.from);
    const toContactHash = contactHash(message.to);
    const source = {
      ...parsed.source,
      source_id: sourceId,
      source_path: sourcePath,
      gmail_message_id: message.id,
      gmail_thread_id: message.thread_id,
      subject: message.subject || parsed.source.subject,
      from: redactContact(message.from || parsed.source.from),
      to: redactContact(message.to),
      from_contact_hash: fromContactHash,
      to_contact_hash: toContactHash,
      received_at: message.received_at || parsed.source.received_at,
      collection_mode: "gmail_connector_preview",
      gmail_selector_label: label,
      gmail_selector_since: since,
      gmail_query: query,
      connector_record_index: index + 1,
      body_hash: hash16(message.body || message.snippet || "")
    };
    sourceEmails.push(source);
    if (!parsed.parsedRows.length) {
      needsReview.push({
        source_id: source.source_id,
        gmail_message_id: source.gmail_message_id,
        reason: "no_propertyradar_table_found",
        severity: "warning",
        summary: "Gmail connector message did not parse into PropertyRadar digest rows."
      });
    }
    for (const row of parsed.parsedRows) {
      parsedRows.push({
        ...row,
        source_id: source.source_id,
        source_email_id: source.source_id,
        source_subject: source.subject,
        source_alert_name: source.alert_name,
        source_received_at: source.received_at
      });
    }
    for (const review of parsed.needsReview || []) {
      needsReview.push({ ...review, source_id: source.source_id, gmail_message_id: source.gmail_message_id });
    }
  });

  return {
    sourceEmails,
    parsedRows,
    needsReview,
    sourceProfile: {
      source_path: path.basename(filePath),
      source_path_scope: "basename_only",
      source_sha256: sha256File(filePath),
      source_format: path.extname(filePath).toLowerCase().replace(/^\./, "") || "json",
      collection_mode: "gmail_connector_preview",
      gmail_selector_label: label,
      gmail_selector_since: since,
      gmail_query: query,
      connector_record_count: extractMessages(raw).length,
      parsed_message_count: messages.length,
      parsed_row_count: parsedRows.length,
      unmatched_message_count: sourceEmails.filter((source) => {
        return !parsedRows.some((row) => row.source_id === source.source_id);
      }).length,
      gmail_mutations_executed: 0,
      gmail_sends_executed: 0,
      external_writes_executed: 0
    }
  };
}

function extractMessages(raw) {
  if (Array.isArray(raw)) return raw;
  for (const key of ["emails", "messages", "results", "items", "data"]) {
    if (Array.isArray(raw?.[key])) return raw[key];
  }
  if (raw && typeof raw === "object" && (raw.body || raw.snippet || raw.subject)) return [raw];
  return [];
}

function normalizeMessage(message) {
  const body = bodyFromMessage(message);
  return {
    id: stringValue(message.id || message.message_id || message.messageId),
    thread_id: stringValue(message.thread_id || message.threadId || message.gmail_thread_id),
    subject: stringValue(message.subject),
    from: stringValue(message.from || message.sender),
    to: stringValue(message.to || message.recipient),
    received_at: normalizeDate(message.date || message.timestamp || message.received_at || message.internal_date || message.internalDate),
    snippet: stringValue(message.snippet),
    body
  };
}

function bodyFromMessage(message) {
  const direct = message.body || message.html || message.text || message.plain_text || message.body_text || message.body_html;
  if (typeof direct === "string") return direct;
  if (direct && typeof direct === "object") {
    return direct.html || direct.text || direct.plain || direct.value || "";
  }
  return "";
}

function normalizeDate(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" || /^\d+$/.test(String(value))) {
    const number = Number(value);
    const millis = number > 1000000000000 ? number : number * 1000;
    return new Date(millis).toISOString();
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function messageText(message) {
  return [
    `Subject: ${message.subject || "PropertyRadar digest"}`,
    `From: ${redactContact(message.from) || "Gmail connector"}`,
    `Message timestamp: ${message.received_at || new Date(0).toISOString()}`,
    "",
    message.body || message.snippet || ""
  ].join("\n");
}

function stringValue(value) {
  return value === null || value === undefined ? null : String(value);
}

function contactHash(value) {
  const text = stringValue(value);
  return text ? hash16(text.trim().toLowerCase()) : null;
}

function redactContact(value) {
  const digest = contactHash(value);
  return digest ? `redacted_contact:${digest}` : null;
}

module.exports = {
  readGmailConnectorPreviewFile
};
