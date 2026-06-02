const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

test("dashboard server exposes health and creates digest runs", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "codex-monday-server-"));
  process.env.MONDAY_DIGEST_RUNS_ROOT = tmp;
  const { createServer } = require("../src/server");
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    const health = await fetchJson(`http://127.0.0.1:${port}/api/health`);
    assert.equal(health.ok, true);

    const fixture = fs.readFileSync(path.join(__dirname, "..", "fixtures", "ken_kahan_digest_2026-05-30.txt"), "utf8");
    const created = await fetchJson(`http://127.0.0.1:${port}/api/digests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "server-test", text: fixture })
    });
    assert.equal(created.summary.status, "PASS");
    assert.equal(created.summary.counts.deduped_leads, 3);
    assert.deepEqual(created.titlepro_approval_decisions, []);
    assert.deepEqual(created.titlepro_pull_requests_approved, []);

    const details = await fetchJson(`http://127.0.0.1:${port}/api/runs/${encodeURIComponent(created.summary.id)}`);
    assert.deepEqual(details.titlepro_approval_decisions, []);
    assert.deepEqual(details.titlepro_pull_requests_approved, []);

    const decisionsDownload = await fetchText(`http://127.0.0.1:${port}/api/runs/${encodeURIComponent(created.summary.id)}/download/titlepro_approval_decisions.json`);
    const pullRequestsDownload = await fetchText(`http://127.0.0.1:${port}/api/runs/${encodeURIComponent(created.summary.id)}/download/titlepro_pull_requests_approved.json`);
    assert.deepEqual(JSON.parse(decisionsDownload), []);
    assert.deepEqual(JSON.parse(pullRequestsDownload), []);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  assert.equal(response.ok, true, data.error);
  return data;
}

async function fetchText(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  assert.equal(response.ok, true, text);
  return text;
}
