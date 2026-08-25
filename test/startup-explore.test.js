"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "site", "app.js"), "utf8");
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

  const [indexResponse, dataResponse, privateResponse] = await Promise.all([
    fetch(url),
    fetch(`${url}data/tooling.json`, { method: "HEAD" }),
    fetch(`${url}docs/architecture/OPERATIONS_JOB_AND_SERVICE_FOUNDATION.md`),
  ]);
  assert.equal(indexResponse.status, 200);
  assert.match(indexResponse.headers.get("content-type") || "", /text\/html/);
  assert.equal(dataResponse.status, 200);
  assert.match(dataResponse.headers.get("content-type") || "", /application\/json/);
  assert.equal(privateResponse.status, 404);
});
