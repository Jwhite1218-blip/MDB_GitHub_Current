"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const compareUrl = pathToFileURL(path.join(root, "scripts", "data-dump-compare.mjs")).href;

test("dump parser handles quoted CSV and detects canonical headers", async () => {
  const { parseDelimited, resolveMapping } = await import(compareUrl);
  const table = parseDelimited([
    "Customer Number,Customer Name,City",
    "CUST-001,\"Atlas, Testing LLC\",Fort Wayne",
    "CUST-002,New Customer,Indianapolis",
  ].join("\n"));
  assert.equal(table.rows.length, 2);
  assert.equal(table.rows[0]["Customer Name"], "Atlas, Testing LLC");
  assert.deepEqual(resolveMapping(table.headers, "customers").missingRequired, []);
  assert.deepEqual(resolveMapping(table.headers, "customers").mapping, {
    customerNumber: "Customer Number",
    customerName: "Customer Name",
    city: "City",
  });
});

test("comparison separates exact identities from review-only similarity", async () => {
  const { buildPartIndex, compareDataDumps } = await import(compareUrl);
  const parts = buildPartIndex({
    items: [{ part: "001234", description: "Heavy duty auger head", alternatePart: "ALT-1234" }],
    supplements: { splitSpoons: [{ complete: "SS-100", outcome: "Complete split spoon" }] },
  }, { items: [{ part: "RIG-200", description: "Hydraulic feed cylinder" }] });
  const baseline = {
    customers: [
      { customerNumber: "ATLAS001", customerName: "Atlas Testing LLC" },
      { customerNumber: "MIDWEST01", customerName: "Midwest Geotechnical Inc" },
    ],
    parts,
    metrics: { knownCustomers: 2, toolingRows: 1, toolingSupplementRows: 1, rigPartRows: 1, uniquePartNumbers: parts.size },
  };
  const result = compareDataDumps({
    analysisYear: 2026,
    baseline,
    customerRows: [
      { __rowNumber: 2, customerNumber: "ATLAS001", customerName: "Atlas Testing LLC" },
      { __rowNumber: 3, customerNumber: "ATLAS002", customerName: "Atlas Testing, Inc." },
      { __rowNumber: 4, customerNumber: "NEW001", customerName: "Completely New Drilling" },
    ],
    salesRows: [
      { __rowNumber: 2, customerNumber: "ATLAS001", partNumber: "001234", description: "Heavy duty auger head", quantity: "2", extendedAmount: "$1,200.00", documentDate: "2026-03-01" },
      { __rowNumber: 3, customerNumber: "ATLAS002", partNumber: "SS-100", description: "Complete split spoon", quantity: "1", extendedAmount: "500", documentDate: "2026-04-01" },
      { __rowNumber: 4, customerNumber: "MISSING01", partNumber: "RIG-NEW", description: "Hydraulic feed cylnder", quantity: "1", extendedAmount: "750", documentDate: "2026-05-01" },
      { __rowNumber: 5, partNumber: "OTHER-9", description: "Unrelated consumable", quantity: "3", extendedAmount: "90", documentDate: "2025-12-31" },
    ],
  });
  assert.deepEqual(result.summary.customerReconciliation.counts, {
    exact_number_same_name: 1,
    new_customer: 1,
    new_number_existing_name: 1,
  });
  assert.equal(result.summary.partCoverage.counts.exact_part_number, 2);
  assert.equal(result.summary.partCoverage.counts.possible_description_match, 1);
  assert.equal(result.summary.partCoverage.counts.not_in_current_catalog, 1);
  assert.equal(result.summary.partCoverage.salesRowsOutsideAnalysisYear, 1);
  assert.deepEqual(result.summary.salesCustomerIntegrity, {
    uniqueCustomerNumbersInSales: 3,
    salesRowsWithoutCustomerNumber: 1,
    salesCustomerNumbersMissingFromCustomerDump: 1,
  });
  assert.equal(result.parts.find((part) => part.partNumber === "RIG-NEW").candidatePartNumber, "RIG-200");
});

test("part normalization preserves leading zeroes and reports cannot escape private intake", async () => {
  const { normalizeIdentifier, saveComparison } = await import(compareUrl);
  assert.equal(normalizeIdentifier(" 001234 "), "001234");
  await assert.rejects(
    () => saveComparison({ summary: {}, customers: [], parts: [], qualityIssues: [] }, path.join(root, "tracked-report")),
    /must stay inside the Git-ignored private-intake directory/,
  );
});
