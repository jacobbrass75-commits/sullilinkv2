const fs = require("fs");
const path = require("path");

const SAFE_DEFAULTS = Object.freeze({
  CRE_GLOBAL_DRY_RUN: "true",
  ALLOW_EXTERNAL_WRITES: "false",
  ALLOW_MONDAY_WRITES: "false",
  ALLOW_PAID_PULLS: "false",
  ALLOW_GMAIL_SEND: "false",
  ALLOW_REALNEX_WRITES: "false",
  ALLOW_PROVIDER_BACKFILL: "false",
  TITLEPRO247_ALLOW_PROFILE_PULLS: "false",
  TITLEPRO247_ALLOW_PAID_PULLS: "false",
  OFFICIAL_NOD_ALLOW_BACKFILL: "false",
  MONDAY_DRY_RUN: "true",
  REALNEX_DRY_RUN: "true",
  GMAIL_DRAFTS_ONLY: "true"
});

const FORBIDDEN_ZERO = Object.freeze({
  monday_live_writes: 0,
  gmail_writes_or_sends: 0,
  titlepro_pulls: 0,
  realnex_writes: 0,
  provider_backfills: 0,
  control_claim_promotions: 0
});

function safeFlag(name) {
  return process.env[name] ?? SAFE_DEFAULTS[name];
}

function liveWriteGates() {
  return {
    CRE_GLOBAL_DRY_RUN: safeFlag("CRE_GLOBAL_DRY_RUN") === "false",
    ALLOW_EXTERNAL_WRITES: safeFlag("ALLOW_EXTERNAL_WRITES") === "true",
    ALLOW_MONDAY_WRITES: safeFlag("ALLOW_MONDAY_WRITES") === "true",
    MONDAY_DRY_RUN: safeFlag("MONDAY_DRY_RUN") === "false"
  };
}

function liveWriteGateFailures() {
  return Object.entries(liveWriteGates())
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function appendJsonl(file, rows) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
}

function sha256File(file) {
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function hash16(value) {
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
}

function nowIso() {
  return new Date().toISOString();
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function nextBusinessDayIso(start = new Date()) {
  const date = new Date(start);
  date.setDate(date.getDate() + 1);
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() + 1);
  }
  return date.toISOString().slice(0, 10);
}

module.exports = {
  SAFE_DEFAULTS,
  FORBIDDEN_ZERO,
  safeFlag,
  liveWriteGateFailures,
  ensureDir,
  readJson,
  writeJson,
  appendJsonl,
  sha256File,
  hash16,
  nowIso,
  slugify,
  nextBusinessDayIso
};
