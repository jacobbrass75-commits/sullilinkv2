const state = {
  runs: [],
  selectedRunId: null,
  batchCsvText: null,
  defaultBatchCsv: "../data/Export-20260526-091844.csv"
};

const els = {
  tabs: document.querySelectorAll(".tab"),
  digestForm: document.querySelector("#digest-form"),
  digestFile: document.querySelector("#digest-file"),
  digestText: document.querySelector("#digest-text"),
  digestName: document.querySelector("#digest-name"),
  batchForm: document.querySelector("#batch-form"),
  batchFile: document.querySelector("#batch-file"),
  batchPath: document.querySelector("#batch-path"),
  batchName: document.querySelector("#batch-name"),
  batchDefault: document.querySelector("#batch-default"),
  refreshRuns: document.querySelector("#refresh-runs"),
  runList: document.querySelector("#run-list"),
  detailTitle: document.querySelector("#detail-title"),
  downloadLinks: document.querySelector("#download-links"),
  message: document.querySelector("#message"),
  summaryGrid: document.querySelector("#summary-grid"),
  detailBody: document.querySelector("#detail-body")
};

function init() {
  for (const tab of els.tabs) {
    tab.addEventListener("click", () => selectTab(tab.dataset.tab));
  }
  els.digestFile.addEventListener("change", async () => {
    const file = els.digestFile.files[0];
    if (file) els.digestText.value = await file.text();
  });
  els.batchFile.addEventListener("change", async () => {
    const file = els.batchFile.files[0];
    state.batchCsvText = file ? await file.text() : null;
    if (file) showMessage(`Loaded CSV upload: ${file.name}`);
  });
  els.batchDefault.addEventListener("click", () => {
    state.batchCsvText = null;
    els.batchFile.value = "";
    els.batchPath.value = state.defaultBatchCsv;
    showMessage("Using the default server CSV path.");
  });
  els.digestForm.addEventListener("submit", submitDigest);
  els.batchForm.addEventListener("submit", submitBatch);
  els.refreshRuns.addEventListener("click", refreshRuns);
  loadHealth().finally(refreshRuns);
}

async function loadHealth() {
  const data = await getJson("/api/health");
  state.defaultBatchCsv = data.default_batch_csv || state.defaultBatchCsv;
  if (!els.batchPath.value || els.batchPath.value === "../data/Export-20260526-091844.csv") {
    els.batchPath.value = state.defaultBatchCsv;
  }
}

function selectTab(name) {
  for (const tab of els.tabs) tab.classList.toggle("active", tab.dataset.tab === name);
  document.querySelector("#digest-form").classList.toggle("active", name === "digest");
  document.querySelector("#batch-form").classList.toggle("active", name === "batch");
}

async function submitDigest(event) {
  event.preventDefault();
  await withBusy(event.submitter, "Generating...", async () => {
    const detail = await postJson("/api/digests", {
      name: els.digestName.value,
      text: els.digestText.value
    });
    state.selectedRunId = detail.summary.id;
    await refreshRuns();
    renderDetails(detail);
    showMessage("Digest review run created.");
  });
}

async function submitBatch(event) {
  event.preventDefault();
  await withBusy(event.submitter, "Building...", async () => {
    const body = { name: els.batchName.value };
    if (state.batchCsvText) body.csvText = state.batchCsvText;
    else body.csvPath = els.batchPath.value;
    const detail = await postJson("/api/batch", body);
    state.selectedRunId = detail.summary.id;
    await refreshRuns();
    renderDetails(detail);
    showMessage("Owner-cluster review run created.");
  });
}

async function refreshRuns() {
  try {
    const data = await getJson("/api/runs");
    state.runs = data.runs;
    renderRunList();
    if (!state.selectedRunId && state.runs[0]) {
      state.selectedRunId = state.runs[0].id;
      await loadRun(state.selectedRunId);
    }
  } catch (error) {
    showError(error.message);
  }
}

function renderRunList() {
  if (!state.runs.length) {
    els.runList.innerHTML = '<div class="message active">No runs yet.</div>';
    return;
  }
  els.runList.innerHTML = state.runs.map((run) => {
    const countText = run.type === "batch"
      ? `${run.counts.candidate_properties} candidates, ${run.counts.owner_clusters} clusters`
      : `${run.counts.deduped_leads} leads, ${run.counts.parsed_rows} rows`;
    return `
      <button class="run-row ${run.id === state.selectedRunId ? "active" : ""}" type="button" data-run-id="${escapeHtml(run.id)}">
        <strong>${escapeHtml(run.id)}</strong>
        <span class="run-meta">
          <span class="badge ${run.status === "PASS" ? "pass" : run.status === "FAIL" ? "fail" : ""}">${escapeHtml(run.status)}</span>
          <span>${escapeHtml(run.type)}</span>
          <span>${escapeHtml(countText)}</span>
        </span>
      </button>
    `;
  }).join("");
  for (const button of els.runList.querySelectorAll(".run-row")) {
    button.addEventListener("click", () => loadRun(button.dataset.runId));
  }
}

async function loadRun(id) {
  try {
    state.selectedRunId = id;
    renderRunList();
    renderDetails(await getJson(`/api/runs/${encodeURIComponent(id)}`));
  } catch (error) {
    showError(error.message);
  }
}

function renderDetails(detail) {
  const { summary } = detail;
  state.selectedRunId = summary.id;
  els.detailTitle.textContent = summary.id;
  els.downloadLinks.innerHTML = downloadLinks(summary).join("");
  els.summaryGrid.innerHTML = Object.entries(summary.counts || {}).map(([key, value]) => `
    <div class="metric"><span>${escapeHtml(labelize(key))}</span><strong>${escapeHtml(value)}</strong></div>
  `).join("");
  if (summary.type === "batch") renderBatchDetail(detail);
  else renderDigestDetail(detail);
}

function downloadLinks(summary) {
  const id = encodeURIComponent(summary.id);
  const files = summary.type === "batch"
    ? ["monday_import_preview.xlsx", "verification_report.md", "candidate_properties.json", "owner_cluster_candidates.json"]
    : ["monday_import_preview.xlsx", "verification_report.md", "deduped_leads.json", "monday_subitems_preview.json", "titlepro_approval_queue_preview.json"];
  return files.map((file) => `<a href="/api/runs/${id}/download/${encodeURIComponent(file)}">${escapeHtml(file)}</a>`);
}

function renderDigestDetail(detail) {
  const leads = detail.leads || [];
  const subitems = detail.subitems || [];
  const titleproQueue = detail.titlepro_approval_queue || [];
  els.detailBody.innerHTML = `
    <h3>Leads</h3>
    <table>
      <thead><tr><th>Radar ID</th><th>Address</th><th>Priority</th><th>Status</th><th>Events</th><th>Next Action</th></tr></thead>
      <tbody>
        ${leads.map((lead) => `
          <tr>
            <td>${escapeHtml(lead.radar_id)}</td>
            <td class="wrap">${escapeHtml(`${lead.street}, ${lead.city}`)}</td>
            <td>${escapeHtml(lead.priority)}</td>
            <td class="${lead.hard_hold ? "hold" : ""}">${escapeHtml(lead.current_status)}</td>
            <td>${lead.source_events.length} distinct / ${lead.exact_duplicate_count} duplicate</td>
            <td class="wrap">${escapeHtml(lead.next_action)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    <h3>TitlePro Approval Queue</h3>
    <table>
      <thead><tr><th>Lead</th><th>Address</th><th>Request</th><th>Status</th><th>Approval</th><th>Paid Pull</th></tr></thead>
      <tbody>
        ${titleproQueue.map((row) => `
          <tr>
            <td class="wrap">${escapeHtml(row.lead_key)}</td>
            <td class="wrap">${escapeHtml(`${row.address || ""}, ${row.city || ""}`)}</td>
            <td class="wrap">${escapeHtml(row.requested_doc_type)}</td>
            <td class="blocked">${escapeHtml(row.status)}</td>
            <td>${row.approval_required ? escapeHtml(row.approval_id) : ""}</td>
            <td class="blocked">${row.paid_action_allowed ? "allowed" : "blocked"}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    <h3>Default Work Queue</h3>
    <table>
      <thead><tr><th>Lead</th><th>Task</th><th>Owner Role</th><th>Status</th><th>Exit Criteria</th></tr></thead>
      <tbody>
        ${subitems.slice(0, 120).map((task) => `
          <tr>
            <td class="wrap">${escapeHtml(task.lead_key)}</td>
            <td>${escapeHtml(task.task)}</td>
            <td>${escapeHtml(task.owner_role)}</td>
            <td class="${task.status === "blocked" ? "blocked" : ""}">${escapeHtml(task.status)}</td>
            <td class="wrap">${escapeHtml(task.exit_criteria || "")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    <h3>Verification Report</h3>
    <pre>${escapeHtml(detail.report || "")}</pre>
  `;
}

function renderBatchDetail(detail) {
  const clusters = detail.clusters || [];
  const candidates = detail.candidates || [];
  els.detailBody.innerHTML = `
    <h3>Owner-String Candidate Clusters</h3>
    <table>
      <thead><tr><th>Owner String</th><th>Rows</th><th>Negative Equity</th><th>Total Value</th><th>Total Equity</th><th>Status</th></tr></thead>
      <tbody>
        ${clusters.map((cluster) => `
          <tr>
            <td class="wrap">${escapeHtml(cluster.owner_string)}</td>
            <td>${cluster.target_row_count}</td>
            <td>${cluster.negative_equity_count}</td>
            <td>${money(cluster.total_est_value)}</td>
            <td>${money(cluster.total_est_equity)}</td>
            <td class="blocked">${escapeHtml(cluster.verification_status)} / no control claim</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    <h3>Candidate Properties</h3>
    <table>
      <thead><tr><th>Row</th><th>Type</th><th>Address</th><th>City</th><th>Owner String</th><th>Value</th><th>Equity</th><th>Cluster</th></tr></thead>
      <tbody>
        ${candidates.slice(0, 242).map((row) => `
          <tr>
            <td>${row.source_row_index}</td>
            <td>${escapeHtml(row.type)}</td>
            <td class="wrap">${escapeHtml(row.address)}</td>
            <td>${escapeHtml(row.city)}</td>
            <td class="wrap">${escapeHtml(row.owner_string)}</td>
            <td>${money(row.est_value)}</td>
            <td>${money(row.est_equity)}</td>
            <td class="wrap">${escapeHtml(row.cluster_id || "")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    <h3>Verification Report</h3>
    <pre>${escapeHtml(detail.report || "")}</pre>
  `;
}

async function getJson(url) {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || response.statusText);
  return data;
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || response.statusText);
  return data;
}

async function withBusy(button, busyText, fn) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = busyText;
  showMessage(busyText);
  try {
    await fn();
  } catch (error) {
    showError(error.message);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function showMessage(text) {
  els.message.textContent = text;
  els.message.className = "message active";
}

function showError(text) {
  els.message.textContent = text;
  els.message.className = "message active error";
}

function money(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value));
}

function labelize(value) {
  return String(value).replace(/_/g, " ");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

init();
