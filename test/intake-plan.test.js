"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const planUrl = pathToFileURL(path.join(root, "scripts", "intake-plan.mjs")).href;
const MEBIBYTE = 1024 * 1024;

function file(relativePath, extension, bytes, category = "document", flags = [], modifiedAt = "2026-08-24T00:00:00Z") {
  return { relativePath, extension, bytes, category, flags, modifiedAt, sha256: null };
}

test("analysis planner creates route-specific bounded batches and quarantines flagged material", async () => {
  const { buildAnalysisPlan } = await import(planUrl);
  const inventory = {
    schemaVersion: 1,
    generatedAt: "2026-08-24T01:00:00Z",
    sourceLabel: "MDB GP Discovery",
    files: [
      file("GP/items.xlsx", ".xlsx", 15 * MEBIBYTE),
      file("GP/inventory.csv", ".csv", 10 * MEBIBYTE),
      file("Service/parts-request.eml", ".eml", 2000),
      file("Reference/manual.pdf", ".pdf", 25 * MEBIBYTE),
      file("password-list.txt", ".txt", 100, "document", ["potential_credentials"]),
      file("mailbox.pst", ".pst", 200 * MEBIBYTE, "mailbox-container", ["mailbox_container_review_required"]),
      file("archive.zip", ".zip", 30 * MEBIBYTE, "archive", ["archive_review_required"]),
      file("unknown.exe", ".exe", 500, "other"),
    ],
  };

  const plan = buildAnalysisPlan(inventory, { maxFiles: 25, maxBytes: 20 * MEBIBYTE });

  assert.equal(plan.sourcePathStored, false);
  assert.equal(plan.totals.eligibleFiles, 4);
  assert.equal(plan.totals.reviewRequiredFiles, 4);
  assert.equal(plan.batches.length, 4);
  assert.deepEqual(plan.batches.map((batch) => batch.route), [
    "structured-data", "structured-data", "email", "document",
  ]);
  assert.deepEqual(
    plan.batches.slice(0, 2).map((batch) => batch.totalBytes).sort((left, right) => left - right),
    [10 * MEBIBYTE, 15 * MEBIBYTE],
  );
  assert.equal(plan.batches[3].oversized, true);
  assert.equal(plan.batches.flatMap((batch) => batch.files).some((entry) => entry.relativePath === "password-list.txt"), false);
  assert.deepEqual(
    plan.reviewRequired.map((entry) => entry.reason).sort(),
    [
      "archive_requires_manual_review",
      "mailbox_container_requires_selected_export",
      "sensitive_filename_flag_requires_review",
      "unsupported_file_type",
    ].sort(),
  );
});

test("analysis planner validates manifest and limits", async () => {
  const { buildAnalysisPlan } = await import(planUrl);
  assert.throws(() => buildAnalysisPlan({ files: [] }), /schemaVersion 1/);
  assert.throws(() => buildAnalysisPlan({ schemaVersion: 1, files: [] }, { maxFiles: 0 }), /maxFiles/);
  assert.throws(() => buildAnalysisPlan({ schemaVersion: 1, files: [] }, { maxBytes: 0 }), /maxBytes/);
});
