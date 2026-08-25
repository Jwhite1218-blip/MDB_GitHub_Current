"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const contractUrl = pathToFileURL(path.join(
  __dirname,
  "..",
  "netlify",
  "functions",
  "_gp-read-sync-contract.mjs",
)).href;

test("GP sync machine token comparison fails closed", async () => {
  const { isAuthorizedGpSyncToken } = await import(contractUrl);
  assert.equal(isAuthorizedGpSyncToken("correct-token", "correct-token"), true);
  assert.equal(isAuthorizedGpSyncToken("wrong-token", "correct-token"), false);
  assert.equal(isAuthorizedGpSyncToken("", "correct-token"), false);
  assert.equal(isAuthorizedGpSyncToken("correct-token", ""), false);
});

test("GP sync contract normalizes only read-model operations", async () => {
  const {
    normalizeBatchRequest,
    normalizeFinishRequest,
    normalizeStartRequest,
  } = await import(contractUrl);

  assert.deepEqual(normalizeStartRequest({
    contractVersion: 2,
    runKey: " run-1 ",
    companyId: " MDB ",
    mappingVersion: " gp-map-1 ",
    entityPlans: [
      { entityType: "Item", syncMode: "Delta" },
      { entityType: "Inventory", syncMode: "Snapshot" },
    ],
    metadata: { source: "fixture" },
  }), {
    p_run_key: "run-1",
    p_company_id: "MDB",
    p_connector: "normalized_export",
    p_mapping_version: "gp-map-1",
    p_entity_plans: [
      { entityType: "Item", syncMode: "Delta" },
      { entityType: "Inventory", syncMode: "Snapshot" },
    ],
    p_metadata: { source: "fixture" },
  });

  assert.deepEqual(normalizeBatchRequest({
    contractVersion: 2,
    runId: "run-id",
    batchKey: "batch-1",
    batchSequence: 1,
    entityType: "Item",
    records: [{
      externalId: "ITEM-1",
      sourceModifiedAt: "2026-08-24T05:00:00Z",
      payload: {},
      normalized: { partNumber: "ITEM-1" },
    }],
  }).p_entity_type, "Item");

  assert.deepEqual(normalizeFinishRequest({
    contractVersion: 2,
    runId: "run-id",
    status: "Failed",
    errorSummary: " extractor stopped ",
  }), {
    p_run_id: "run-id",
    p_status: "Failed",
    p_entity_results: [],
    p_error_summary: "extractor stopped",
  });

  assert.throws(() => normalizeStartRequest({
    contractVersion: 2,
    runKey: "run-2",
    companyId: "MDB",
    mappingVersion: "gp-map-1",
    entityPlans: [{ entityType: "VendorWriteBack", syncMode: "Delta" }],
  }), /Unsupported GP entity/);
  assert.throws(() => normalizeBatchRequest({
    contractVersion: 2,
    runId: "run-id",
    batchKey: "batch-2",
    batchSequence: 1,
    entityType: "Item",
    records: [],
  }), /between 1 and 500/);
  assert.throws(() => normalizeBatchRequest({
    contractVersion: 2,
    runId: "run-id",
    batchKey: "batch-3",
    batchSequence: 1,
    entityType: "Inventory",
    records: [{ externalId: "MAIN:ITEM-1", normalized: { partNumber: "ITEM-1" } }],
  }), /locationCode/);
  assert.throws(() => normalizeFinishRequest({
    contractVersion: 2,
    runId: "run-id",
    status: "Running",
  }), /Succeeded or Failed/);
});
