"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "site", "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "site", "app.js"), "utf8");
const css = fs.readFileSync(path.join(root, "site", "styles.css"), "utf8");
const mergeRecord = fs.readFileSync(path.join(root, "docs", "architecture", "OPERATIONS_PORTFOLIO_MERGE.md"), "utf8");

test("unified navigation exposes the three production responsibilities", () => {
  assert.match(html, /data-open="buildRequests"/);
  assert.match(html, /data-open="productionControl"/);
  assert.match(html, /data-open="builds"/);
  assert.match(app, /Build Requests/);
  assert.match(app, /Production Control/);
});

test("sales demand stays linked to an exact Sales Order line", () => {
  assert.match(app, /sourceOrderId: source\.order\.id/);
  assert.match(app, /sourceOrderLineKey: source\.line\.lineKey/);
  assert.match(app, /quantity > source\.remaining/);
  assert.match(app, /Submitted to Production Control/);
});

test("gatekeeper owns acceptance, assignment, and shop release", () => {
  assert.match(app, /function canControlBuild\(\)/);
  assert.match(app, /Only Production Control can release work to the shop/);
  assert.match(app, /Commit a completion date and initial work-center route before accepting/);
  assert.match(app, /data-request-accept/);
  assert.match(app, /data-request-return/);
});

test("release and posting move component reservations and fulfill demand", () => {
  assert.match(app, /stock\.allocated = Number\(stock\.allocated\) \+ needed/);
  assert.match(app, /line\.qtyReserved = Math\.max\(0, Number\(line\.qtyReserved\) - consume\)/);
  assert.match(app, /request\.status = "Fulfilled"/);
  assert.match(app, /unused reservations were released/i);
});

test("sales tracking and production execution are visually distinct", () => {
  assert.match(app, /Sales Tracking/);
  assert.match(app, /Shop Floor/);
  assert.match(app, /Lifecycle tracking only/);
  assert.match(css, /\.production-boundary/);
  assert.match(css, /\.request-lifecycle/);
  assert.match(css, /\.build-role-switch/);
});

test("merge provenance freezes the audited standalone artifact", () => {
  assert.match(mergeRecord, /mdb-operations-portfolio/);
  assert.match(mergeRecord, /6a8258d7395d972421dfd4f3/);
  assert.match(mergeRecord, /F71D67D1D4D7EAD6BD0A95BCCB3F4922E36F24A60713F3992A40B824E4C7C104/);
  assert.match(mergeRecord, /No live Supabase schema or data was changed/);
});
