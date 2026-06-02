#!/usr/bin/env node
const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");
const {
  DEFAULT_BATCH_CSV,
  createDigestRun,
  createBatchRun,
  listRuns,
  readRunDetails,
  downloadableFile,
  runsRoot
} = require("./run-workflows");

const PUBLIC_DIR = path.join(__dirname, "..", "public");
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 25 * 1024 * 1024);

function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      if (req.method === "GET" && url.pathname === "/") {
        return serveFile(res, path.join(PUBLIC_DIR, "index.html"), "text/html; charset=utf-8");
      }
      if (req.method === "GET" && url.pathname.startsWith("/static/")) {
        return serveStatic(res, url.pathname.replace("/static/", ""));
      }
      if (req.method === "GET" && url.pathname === "/api/health") {
        return json(res, { ok: true, runs_root: runsRoot(), default_batch_csv: DEFAULT_BATCH_CSV });
      }
      if (req.method === "GET" && url.pathname === "/api/runs") {
        return json(res, { runs: listRuns() });
      }
      const runDetails = url.pathname.match(/^\/api\/runs\/([^/]+)$/);
      if (req.method === "GET" && runDetails) {
        return json(res, readRunDetails(decodeURIComponent(runDetails[1])));
      }
      const download = url.pathname.match(/^\/api\/runs\/([^/]+)\/download\/([^/]+)$/);
      if (req.method === "GET" && download) {
        const file = downloadableFile(decodeURIComponent(download[1]), decodeURIComponent(download[2]));
        return serveDownload(res, file);
      }
      if (req.method === "POST" && url.pathname === "/api/digests") {
        const body = await readJsonBody(req);
        return json(res, createDigestRun({ text: body.text, name: body.name || "digest" }), 201);
      }
      if (req.method === "POST" && url.pathname === "/api/batch") {
        const body = await readJsonBody(req);
        return json(res, createBatchRun({ csvText: body.csvText, csvPath: body.csvPath, name: body.name || "owner-clusters" }), 201);
      }
      return json(res, { error: "Not found" }, 404);
    } catch (error) {
      return json(res, { error: error.message }, 400);
    }
  });
}

function serveStatic(res, relativePath) {
  if (!/^[a-zA-Z0-9_.-]+$/.test(relativePath)) {
    return json(res, { error: "Invalid asset path" }, 400);
  }
  const file = path.join(PUBLIC_DIR, relativePath);
  const type = relativePath.endsWith(".js") ? "text/javascript; charset=utf-8" : relativePath.endsWith(".css") ? "text/css; charset=utf-8" : "application/octet-stream";
  return serveFile(res, file, type);
}

function serveFile(res, file, contentType) {
  if (!fs.existsSync(file)) return json(res, { error: "File not found" }, 404);
  res.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-store" });
  fs.createReadStream(file).pipe(res);
}

function serveDownload(res, file) {
  const name = path.basename(file);
  const contentType = name.endsWith(".xlsx")
    ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    : name.endsWith(".md")
      ? "text/markdown; charset=utf-8"
      : "application/json; charset=utf-8";
  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${name}"`,
    "Cache-Control": "no-store"
  });
  fs.createReadStream(file).pipe(res);
}

function json(res, value, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(`${JSON.stringify(value)}\n`);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

if (require.main === module) {
  createServer().listen(PORT, HOST, () => {
    console.log(`CRE workflow dashboard running at http://localhost:${PORT}`);
    console.log(`Team/LAN bind: http://${HOST}:${PORT}`);
    console.log(`Runs root: ${runsRoot()}`);
  });
}

module.exports = {
  createServer
};
