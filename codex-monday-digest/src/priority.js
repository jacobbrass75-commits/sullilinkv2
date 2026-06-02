const FORECLOSURE_TERMS = /New Notice|New Notice of Default|New Notice of Trustee Sale|Sale Date|Opening Bid|Winning Bid|Postponed|Bankruptcy/i;

const PRIORITY_RANK = {
  High: 3,
  "Medium-High": 2,
  Medium: 1,
  Low: 0
};

function priorityForRow(row) {
  const whatChanged = row.what_changed || "";
  const value = row.est_value || 0;
  const sqFt = row.sq_ft || 0;
  if (FORECLOSURE_TERMS.test(whatChanged)) {
    return value >= 5000000 ? "High" : "Medium-High";
  }
  if (/^New Matches$/i.test(whatChanged.trim())) {
    return value >= 2000000 ? "Medium-High" : "Medium";
  }
  return "Medium";
}

function highestPriority(rows) {
  return rows.map(priorityForRow).sort((a, b) => PRIORITY_RANK[b] - PRIORITY_RANK[a])[0] || "Medium";
}

function hasCurrentStatusHardHold(rowOrLead) {
  const text = Array.isArray(rowOrLead.change_lines)
    ? rowOrLead.change_lines.join("\n")
    : (rowOrLead.source_events || []).flatMap((event) => event.change_lines || []).join("\n");
  return /Bankruptcy|Postponed/i.test(text);
}

function leadTypeForChange(whatChanged) {
  if (/New Notice/i.test(whatChanged)) return "Foreclosure / New Notice";
  if (/Opening Bid|Winning Bid|Sale Date|Postponed|Bankruptcy/i.test(whatChanged)) return "Foreclosure / Current Status";
  if (/ShortSale/i.test(whatChanged)) return "Short sale / transfer";
  if (/Listing Status/i.test(whatChanged)) return "Listing status change";
  return "PropertyRadar Match";
}

module.exports = {
  priorityForRow,
  highestPriority,
  hasCurrentStatusHardHold,
  leadTypeForChange,
  PRIORITY_RANK
};
