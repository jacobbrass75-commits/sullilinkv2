const { highestPriority, hasCurrentStatusHardHold } = require("./priority");
const { nextBusinessDayIso } = require("./runtime");

function eventFingerprint(row) {
  return JSON.stringify({
    radar_id: row.radar_id,
    street: row.street,
    city: row.city,
    zip: row.zip,
    state: row.state,
    property_type: row.property_type,
    sq_ft: row.sq_ft,
    est_value: row.est_value,
    change_lines: row.change_lines
  });
}

function dedupeLeads(parsedRows, options = {}) {
  const groups = new Map();
  for (const row of parsedRows) {
    const key = row.radar_id ? `radar_id:${row.radar_id}` : `address:${row.street}:${row.city}:${row.zip}`.toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const leads = [];
  const auditEvents = [];
  for (const [dedupeKey, rows] of groups.entries()) {
    const first = rows[0];
    const seenEvents = new Map();
    let exactDuplicateCount = 0;
    for (const row of rows) {
      const fingerprint = eventFingerprint(row);
      if (seenEvents.has(fingerprint)) {
        exactDuplicateCount += 1;
        auditEvents.push({
          event_type: "exact_duplicate",
          lead_key: dedupeKey,
          summary: `${row.radar_id || dedupeKey} duplicate source row ${row.source_row_index}`
        });
      } else {
        seenEvents.set(fingerprint, {
          source_row_index: row.source_row_index,
          what_changed: row.what_changed,
          change_lines: row.change_lines,
          evidence_id: `${row.source_id}:row:${row.source_row_index}`
        });
      }
    }

    const sourceEvents = Array.from(seenEvents.values());
    const priority = highestPriority(rows);
    const hardHold = sourceEvents.some(hasCurrentStatusHardHold);
    const summary = sourceEvents[0]?.change_lines?.[0] || first.what_changed || "PropertyRadar update";
    const lead = {
      dedupe_key: dedupeKey,
      radar_id: first.radar_id || null,
      item_name: `${first.radar_id || "Missing Radar ID"} - ${first.street}, ${first.city} - ${summary}`,
      action: first.radar_id ? "create" : "exception",
      raw_row_count: rows.length,
      exact_duplicate_count: exactDuplicateCount,
      source_events: sourceEvents,
      priority,
      stage: "New Lead / Research",
      current_status: hardHold ? "Current status QA hold - verify bankruptcy/postponement" : "Unknown - verify",
      owner_confidence: "Unknown",
      llc_disambiguation: "Not started",
      official_provider_status: "Not checked",
      niche_research_status: "Not checked",
      relationship_context_status: "Not checked",
      suppression_status: "Not checked",
      outreach_readiness: "Blocked",
      broker_packet_status: "Not started",
      evidence_link: "source_emails.json",
      allowed_action: "Research approval only",
      blocked_action: "No outreach; No paid pull; No owner/control claim; No current-status urgency claim",
      blocked_action_detail: "Digest rows are intake evidence only; verify current status and ownership/control before outreach or paid pulls.",
      hard_hold: hardHold,
      hard_hold_reason: hardHold ? "Bankruptcy or postponement language requires current-status verification before broker action." : "None",
      stale_after: nextBusinessDayIso(),
      next_action: "Verify current notice/status, identify title owner/control, and decide TitlePro need.",
      street: first.street,
      city: first.city,
      zip: first.zip,
      state: first.state,
      property_type: first.property_type,
      sq_ft: first.sq_ft,
      est_value: first.est_value,
      what_changed: sourceEvents.map((event) => event.change_lines.join("; ")).join(" | ")
    };
    leads.push(lead);
  }

  return { leads, auditEvents };
}

module.exports = {
  dedupeLeads,
  eventFingerprint
};
