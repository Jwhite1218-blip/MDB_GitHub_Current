"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "site", "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "site", "app.js"), "utf8");
const appShell = fs.readFileSync(path.join(root, "site", "app-shell.js"), "utf8");
const worker = fs.readFileSync(path.join(root, "site", "service-worker.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "site", "manifest.webmanifest"), "utf8"));
const netlify = fs.readFileSync(path.join(root, "netlify.toml"), "utf8");

function pngDimensions(filePath) {
  const data = fs.readFileSync(filePath);
  assert.equal(data.subarray(1, 4).toString("ascii"), "PNG");
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

test("manifest and icon set satisfy the installable desktop shell contract", () => {
  assert.equal(manifest.name, "Mobile Drill Brain");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/?source=installed");
  assert.deepEqual(manifest.icons.map((icon) => icon.sizes), ["192x192", "512x512"]);
  assert.deepEqual(
    pngDimensions(path.join(root, "site", "assets", "mdb-app-icon-192.png")),
    { width: 192, height: 192 },
  );
  assert.deepEqual(
    pngDimensions(path.join(root, "site", "assets", "mdb-app-icon-512.png")),
    { width: 512, height: 512 },
  );
  assert.match(html, /rel="manifest"/);
  assert.match(html, /id="installAppButton"/);
  assert.match(html, /src="app-shell\.js/);
});

test("service worker caches static files but never operational APIs", () => {
  assert.match(worker, /url\.pathname\.startsWith\("\/\.netlify\/functions\/"\)/);
  assert.match(worker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(worker, /if \(url\.origin !== self\.location\.origin \|\| isOperationalRequest\(url\)\) return/);
  assert.match(worker, /request\.mode === "navigate"/);
  assert.match(worker, /tooling-search\.js/);
  assert.match(worker, /SKIP_WAITING/);
  assert.match(netlify, /for = "\/service-worker\.js"[\s\S]*no-cache, no-store, must-revalidate/);
});

test("desktop shell exposes connection and controlled update states", () => {
  assert.match(appShell, /beforeinstallprompt/);
  assert.match(appShell, /display-mode: standalone/);
  assert.match(appShell, /window\.addEventListener\("offline"/);
  assert.match(appShell, /registration\.waiting/);
  assert.match(appShell, /updateWasRequested/);
  assert.match(html, /id="appUpdateNotice"/);
});

test("startup parallelizes independent loads and indexes item identity", () => {
  assert.match(app, /await Promise\.all\(\[\s*loadInventory\(\),\s*loadQuotes\(\),\s*loadOrders\(\),\s*loadBuilds\(\),\s*loadItems\(\)/);
  assert.match(app, /itemsByPart: new Map\(\)/);
  assert.match(app, /state\.itemsByPart\.get\(canonicalPartNumber\(part\)\)/);
  assert.match(html, /data-open="systemSync"/);
  assert.match(app, /GP write-back disabled/);
  assert.match(app, /Entity completeness/);
  assert.match(app, /syncEntityRows\(runEntities\)/);
});
