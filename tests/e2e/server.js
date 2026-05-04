/**
 * Minimal static HTTP server used by the ZAP DAST baseline scan.
 * Serves the extension's popup and options HTML pages so ZAP can scan
 * them for common security-header issues without requiring a real
 * Thunderbird environment.
 */

"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 3456;
const ROOT = path.resolve(__dirname, "../..");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
};

// Strict whitelist of paths the server is allowed to serve.
// Only these exact paths are reachable — no arbitrary file access.
const ALLOWED_PATHS = {
  "/":                     path.join(ROOT, "popup", "teams.html"),
  "/popup/teams.html":     path.join(ROOT, "popup", "teams.html"),
  "/popup/teams.css":      path.join(ROOT, "popup", "teams.css"),
  "/popup/teams.js":       path.join(ROOT, "popup", "teams.js"),
  "/options/options.html": path.join(ROOT, "options", "options.html"),
  "/options/options.css":  path.join(ROOT, "options", "options.css"),
  "/options/options.js":   path.join(ROOT, "options", "options.js"),
};

const server = http.createServer((req, res) => {
  // Strip query string and look up in the strict whitelist — no dynamic path building.
  const urlPath = (req.url || "/").split("?")[0];
  const filePath = ALLOWED_PATHS[urlPath];

  if (!filePath) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
});

server.listen(PORT, () => {
  if (process.env.CI) {
    process.stdout.write(`Static server running on http://localhost:${PORT}\n`);
  }
});

module.exports = server;
