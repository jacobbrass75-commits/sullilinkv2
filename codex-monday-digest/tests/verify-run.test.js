const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parseCommand, verifyCommand } = require("../src/cli");

test("verify passes the local Ken Kahan run artifacts", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "codex-monday-"));
  const fixture = path.join(__dirname, "..", "fixtures", "ken_kahan_digest_2026-05-30.txt");
  parseCommand({ input: fixture, mode: "local_dry_run", out });
  verifyCommand({ run: out });
  const report = fs.readFileSync(path.join(out, "verification_report.md"), "utf8");
  assert.match(report, /Status: PASS/);
});
