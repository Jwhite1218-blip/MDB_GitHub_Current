"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "site", "app.js"), "utf8");
const index = fs.readFileSync(path.join(root, "site", "index.html"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

test("optional browser file storage cannot hold core MDB startup open", () => {
  assert.match(app, /request\.onblocked = \(\) => finish\(null\)/);
  assert.match(app, /setTimeout\(\(\) => finish\(null\), 1800\)/);
  assert.match(app, /loadRigQuoteFiles\(\)\.then/);
  const startupBatch = app.match(/await Promise\.all\(\[([\s\S]*?)\]\);/)?.[1] || "";
  assert.doesNotMatch(startupBatch, /rigQuoteFiles/);
});

test("Explore has an explicit zero-install HTTP entry point", () => {
  assert.equal(packageJson.scripts.dev, "node scripts/serve-demo.mjs");
  assert.equal(packageJson.scripts.start, "node scripts/serve-demo.mjs");
});

test("Explore can bootstrap approved catalogs without file-protocol fetch", () => {
  assert.match(index, /data\/rig-parts\.js\?v=/);
  assert.match(index, /data\/tooling\.js\?v=/);
  assert.match(app, /window\.MDB_BOOTSTRAP_DATA\?\.\[bootstrapKey\]/);
  assert.match(app, /dataset\.catalogSource = "bootstrap"/);
  assert.equal(packageJson.scripts["build:catalog-bootstrap"], "node scripts/build-catalog-bootstrap.mjs");
});

test("generated bootstrap catalogs exactly match normalized JSON sources", () => {
  const context = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(path.join(root, "site", "data", "rig-parts.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(root, "site", "data", "tooling.js"), "utf8"), context);
  assert.equal(
    JSON.stringify(context.window.MDB_BOOTSTRAP_DATA.rig),
    JSON.stringify(JSON.parse(fs.readFileSync(path.join(root, "site", "data", "rig-parts.json"), "utf8"))),
  );
  assert.equal(
    JSON.stringify(context.window.MDB_BOOTSTRAP_DATA.tooling),
    JSON.stringify(JSON.parse(fs.readFileSync(path.join(root, "site", "data", "tooling.json"), "utf8"))),
  );
});

test("local demo server publishes only the browser-safe site directory", async (t) => {
  const child = spawn(process.execPath, ["scripts/serve-demo.mjs", "--port=0"], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => { if (!child.killed) child.kill(); });

  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Local demo server did not start")), 5000);
    const onData = (chunk) => {
      const match = String(chunk).match(/http:\/\/127\.0\.0\.1:\d+\//);
      if (!match) return;
      clearTimeout(timer);
      child.stdout.off("data", onData);
      resolve(match[0]);
    };
    child.stdout.on("data", onData);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => {
      if (code && code !== 0) { clearTimeout(timer); reject(new Error(`Local demo server exited with ${code}`)); }
    });
  });

  const [indexResponse, dataResponse, bootstrapResponse, privateResponse] = await Promise.all([
    fetch(url),
    fetch(`${url}data/tooling.json`, { method: "HEAD" }),
    fetch(`${url}data/tooling.js`, { method: "HEAD" }),
    fetch(`${url}docs/architecture/OPERATIONS_JOB_AND_SERVICE_FOUNDATION.md`),
  ]);
  assert.equal(indexResponse.status, 200);
  assert.match(indexResponse.headers.get("content-type") || "", /text\/html/);
  assert.equal(dataResponse.status, 200);
  assert.match(dataResponse.headers.get("content-type") || "", /application\/json/);
  assert.equal(bootstrapResponse.status, 200);
  assert.match(bootstrapResponse.headers.get("content-type") || "", /text\/javascript/);
  assert.equal(privateResponse.status, 404);
});
