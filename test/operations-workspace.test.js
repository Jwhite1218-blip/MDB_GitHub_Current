"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "site", "app.js"), "utf8");
const index = fs.readFileSync(path.join(root, "site", "index.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "site", "styles.css"), "utf8");

test("service intake and the shared operations board are first-class workspaces", () => {
  assert.match(index, /data-open="serviceRequests"/);
  assert.match(index, /data-open="operationsBoard"/);
  assert.match(index, /Operations &amp; Service/);
  assert.match(index, /data-open="serviceEstimating"/);
  assert.match(app, /renderServiceRequestsWorkspace/);
  assert.match(app, /renderOperationsBoardWorkspace/);
});

test("qualified service estimating exposes an explainable scan-and-edit matrix", () => {
  assert.match(app, /function renderServiceEstimatingWorkspace/);
  assert.match(app, /Only assigned Service Estimators build or change service quotes/);
  assert.match(app, /Cost and quote matrix/);
  assert.match(app, /Reference cost and sell rate stay visible; every override requires a reason/);
  assert.match(app, /Submit to Gatekeeper/);
  assert.match(app, /Approve Estimate &amp; Triage/);
  assert.match(app, /Estimate-to-actual cost/);
  assert.match(app, /Actual service cost added to the estimate-learning record/);
  assert.match(styles, /\.service-estimating-layout/);
  assert.match(styles, /\.service-estimate-summary/);
  assert.match(styles, /\.service-cost-tracking/);
});

test("request, shared job, and specialized work order stay visibly separate", () => {
  assert.match(app, /A request documents a need; it does not promise service work/);
  assert.match(app, /specialized Build Orders and Service Work Orders stay distinct/);
  assert.match(app, /serviceWorkOrderForRequest/);
  assert.match(app, /operationsJobForRequest/);
  assert.match(app, /GP link/);
});

test("gatekeeper and technician surfaces expose different actions", () => {
  assert.match(app, /Every tooling, rig-part, build, and service commitment passes through the gatekeeper/);
  assert.match(app, /Technicians and shop employees execute assigned work and document evidence/);
  assert.match(app, /data-job-action="release"/);
  assert.match(app, /data-job-action="start"/);
  assert.match(app, /data-checkpoint-complete/);
  assert.match(app, /data-job-signoff/);
  assert.match(app, /Resubmit to Gatekeeper/);
  assert.match(app, /Cancel Request/);
});

test("gatekeeper routes tooling and rig-part work through controlled shop centers", () => {
  assert.match(app, /Tooling &amp; Rig-Part Build Requests/);
  assert.match(app, /Machine Shop/);
  assert.match(app, /Preassembly Work Bay/);
  assert.match(app, /function operationsWorkCentersForJob/);
  assert.match(app, /function syncDemoBuildOperationsJobs/);
  assert.match(app, /Gatekeeper routing/);
  assert.match(app, /data-operations-build-open/);
  assert.match(app, /\["Planning", "Order Setup Pending", "Scheduled"\]/);
});

test("service intake keeps future Mobile Lite and NFC channels without building a mobile ERP", () => {
  assert.match(app, /<option>Mobile<\/option><option>NFC<\/option>/);
  assert.match(app, /future Mobile Lite\/NFC entry/);
});

test("operations workspaces have responsive desktop and lite-frame layouts", () => {
  assert.match(styles, /\.operations-inbox-columns/);
  assert.match(styles, /\.operations-job-card/);
  assert.match(styles, /\.checkpoint-list/);
  assert.match(styles, /\.operations-routing-history/);
  assert.match(styles, /@media \(max-width: 700px\)/);
});
