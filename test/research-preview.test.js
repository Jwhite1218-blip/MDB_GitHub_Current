"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const app = fs.readFileSync(require("node:path").join(__dirname, "../site/app.js"), "utf8");

test("draft research exercises are available only in the portfolio sandbox", () => {
  const source = app.slice(app.indexOf("const calibrationTrainingScenarios ="), app.indexOf("const workspaceEntries ="));
  for (const isPublicDemo of [true, false]) {
    const context = vm.createContext({ isPublicDemo });
    const scenarios = vm.runInContext(`${source}\ncalibrationTrainingScenarios`, context);
    const previews = scenarios.filter((scenario) => scenario.researchPreview);
    assert.equal(previews.length, isPublicDemo ? 3 : 0);
    assert.equal(new Set(scenarios.map((scenario) => scenario.id)).size, scenarios.length);
  }
});

test("service handoff preserves selected context and safely keeps ordinary intake unchanged", async () => {
  const source = app.slice(app.indexOf("async function createServiceRequestFromForm("), app.indexOf("async function transitionServiceRequest("));
  for (const withContext of [true, false]) {
    const state = { serviceRequests: [], serviceRequestEvents: [] };
    let saved = false;
    const fields = withContext ? [
      { value: "10–12 ft; sand entered after withdrawal", dataset: { contextLabel: "Observed borehole conditions" } },
      { value: "  ", dataset: { contextLabel: "Unknown detail" } },
    ] : [];
    const form = {
      querySelectorAll: (selector) => { assert.equal(selector, "[data-context-label]:not(:disabled)"); return fields; },
      querySelector: () => ({ textContent: "Sand entry / HSA sampling" }),
    };
    const context = vm.createContext({
      state, isPublicDemo: true,
      FormData: class { entries() { return Object.entries({ assetId: "PREVIEW-TEST", complaint: "Sand in stem", requestedWork: "Review interval", drillingContextKind: "hsa" }); } },
      saveOperationsSnapshot: () => { saved = true; }, renderServiceRequestsWorkspace() {}, showToast() {},
    });
    await vm.runInContext(`${source}\ncreateServiceRequestFromForm`, context)(form);
    assert.ok(saved);
    assert.equal(state.serviceRequests.length, 1);
    const request = state.serviceRequests[0];
    assert.equal(request.requested_work, "Review interval");
    if (withContext) {
      assert.match(request.complaint, /Sand in stem\n\nDrilling context/);
      assert.match(request.complaint, /10–12 ft; sand entered after withdrawal/);
      assert.doesNotMatch(request.complaint, /Unknown detail/);
    } else assert.equal(request.complaint, "Sand in stem");
  }
});
