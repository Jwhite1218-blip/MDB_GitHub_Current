import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PRIVATE_INTAKE_ROOT, resolvePrivatePath } from "./intake-inventory.mjs";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const text = (value) => value == null ? "" : String(value).trim();
const FIELDS = {
  customers: {
    customerNumber: [true, "customer number", "customer no", "customer id", "customernumber", "customerid", "custnmbr", "account number"],
    customerName: [true, "customer name", "customer", "name", "company name", "account name", "custname"],
    status: [false, "status", "customer status", "account status"],
    city: [false, "city"], state: [false, "state", "province"],
    postalCode: [false, "zip", "zip code", "postal code"],
    country: [false, "country", "country code"],
    phone: [false, "phone", "phone number"], email: [false, "email", "email address"],
    lastActivityDate: [false, "last activity", "last activity date", "last sale date", "last order date"],
  },
  sales: {
    partNumber: [true, "part number", "part no", "part", "item number", "item no", "item", "itemnmbr", "itemnbr", "sku"],
    description: [false, "description", "item description", "part description", "itemdesc"],
    customerNumber: [false, "customer number", "customer no", "customer id", "customerid", "custnmbr"],
    customerName: [false, "customer name", "customer", "company name", "account name"],
    documentNumber: [false, "document number", "invoice number", "invoice no", "invoice", "order number", "sopnumbe"],
    documentDate: [false, "document date", "invoice date", "order date", "sale date", "date"],
    documentType: [false, "document type", "doc type", "sop type"],
    quantity: [false, "quantity", "qty", "quantity sold", "qty sold", "xtndqty"],
    extendedAmount: [false, "extended amount", "extended price", "net sales", "net amount", "sales amount", "revenue", "line total", "xtndprce"],
    unitPrice: [false, "unit price", "price"], itemClass: [false, "item class", "class", "item type"],
    category: [false, "category", "product category"], uom: [false, "uom", "unit of measure"],
  },
};
const SUPPLEMENT_PART_FIELDS = ["part", "complete", "completeMud", "head", "mudHead", "barrel", "wasteBarrel", "shoeSharp", "shoeBlunt"];

export const normalizeHeader = (value) => text(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
export const normalizeIdentifier = (value) => text(value).toUpperCase().replace(/\s+/g, " ").trim();
export const normalizeName = (value) => text(value).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ")
  .replace(/\b(?:incorporated|corporation|company|limited|inc|corp|co|llc|ltd)\b/g, " ").replace(/\s+/g, " ").trim();

function levenshtein(left, right) {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1));
    previous = current;
  }
  return previous[right.length];
}

export function textSimilarity(a, b) {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const edit = 1 - levenshtein(left, right) / Math.max(left.length, right.length);
  const leftTokens = new Set(left.split(" "));
  const rightTokens = new Set(right.split(" "));
  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return Math.max(edit, shared / new Set([...leftTokens, ...rightTokens]).size);
}

export function parseDelimited(source) {
  const input = String(source || "").replace(/^\uFEFF/, "");
  const first = input.split(/\r?\n/, 1)[0];
  const count = (delimiter) => first.split(delimiter).length - 1;
  const delimiter = [",", "\t", ";", "|"].sort((a, b) => count(b) - count(a))[0];
  const matrix = [];
  let row = [], value = "", quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted && character === '"' && input[index + 1] === '"') { value += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (!quoted && character === delimiter) { row.push(value); value = ""; }
    else if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some(text)) matrix.push(row);
      row = []; value = "";
    } else value += character;
  }
  if (quoted) throw new Error("Delimited file ends inside a quoted value.");
  row.push(value);
  if (row.some(text)) matrix.push(row);
  if (!matrix.length) return { headers: [], rows: [] };
  const headers = matrix[0].map(text);
  if (headers.some((header) => !header) || new Set(headers.map(normalizeHeader)).size !== headers.length) throw new Error("Headers must be non-blank and unique after normalization.");
  return { headers, rows: matrix.slice(1).map((cells, index) => ({ ...Object.fromEntries(headers.map((header, column) => [header, text(cells[column])])), __rowNumber: index + 2 })) };
}

export async function readTabularFile(candidatePath) {
  const resolved = resolvePrivatePath(candidatePath, "Customer and sales dumps must be copied beneath the Git-ignored private-intake directory.");
  const extension = path.extname(resolved).toLowerCase();
  if ([".xlsx", ".xls", ".xlsm", ".ods"].includes(extension)) throw new Error("Export the selected workbook sheet as UTF-8 CSV beneath private-intake before comparison.");
  const contents = await readFile(resolved, "utf8");
  if ([".csv", ".tsv", ".txt"].includes(extension)) return parseDelimited(contents);
  if (extension !== ".json") throw new Error("Supported inputs are UTF-8 CSV, TSV, TXT, and JSON.");
  const raw = JSON.parse(contents);
  const rows = Array.isArray(raw) ? raw : raw.rows || raw.records;
  if (!Array.isArray(rows)) throw new Error("JSON input must be an array or contain rows/records.");
  const normalized = rows.map((entry, index) => ({ ...entry, __rowNumber: index + 1 }));
  return { headers: [...new Set(normalized.flatMap((entry) => Object.keys(entry).filter((key) => key !== "__rowNumber")))], rows: normalized };
}

export function resolveMapping(headers, kind, config = null) {
  const source = new Map(headers.map((header) => [normalizeHeader(header), header]));
  const overrides = config?.[kind] || {};
  const result = { mapping: {}, missingRequired: [], ambiguous: [] };
  for (const [field, [required, ...aliases]] of Object.entries(FIELDS[kind])) {
    if (overrides[field]) {
      if (!headers.includes(overrides[field])) throw new Error(`${kind}.${field} maps to missing header: ${overrides[field]}`);
      result.mapping[field] = overrides[field];
      continue;
    }
    const matches = [...new Set(aliases.map((alias) => source.get(normalizeHeader(alias))).filter(Boolean))];
    if (matches.length === 1) result.mapping[field] = matches[0];
    else if (matches.length > 1) result.ambiguous.push({ field, candidates: matches });
    else if (required) result.missingRequired.push(field);
  }
  return result;
}

const mappedRows = (table, mapping) => table.rows.map((row) => ({ __rowNumber: row.__rowNumber, ...Object.fromEntries(Object.entries(mapping).map(([field, header]) => [field, text(row[header])])) }));

export function extractKnownCustomers(sql) {
  return [...String(sql).matchAll(/\(\s*'((?:''|[^'])*)'\s*,\s*'((?:''|[^'])*)'\s*,/g)]
    .map((match) => ({ customerNumber: match[1].replace(/''/g, "'"), customerName: match[2].replace(/''/g, "'") }));
}

function addPart(index, rawPart, record) {
  const partNumber = normalizeIdentifier(rawPart);
  if (!partNumber || ["N/A", "NONE"].includes(partNumber)) return;
  if (!index.has(partNumber)) index.set(partNumber, []);
  index.get(partNumber).push({ partNumber, ...record });
}

export function buildPartIndex(tooling, rig) {
  const index = new Map();
  for (const item of tooling.items || []) {
    const record = { domain: "Tooling", sourceKind: "tooling-primary", description: item.officialDescription || item.description || "" };
    addPart(index, item.part, record);
    addPart(index, item.alternatePart, { ...record, sourceKind: "tooling-alternate" });
  }
  for (const [family, records] of Object.entries(tooling.supplements || {})) for (const record of records) for (const field of SUPPLEMENT_PART_FIELDS) {
    addPart(index, record[field], { domain: "Tooling", sourceKind: `tooling-supplement:${family}:${field}`, description: record.description || record.outcome || [record.style, record.size, record.kind, record.model].filter(Boolean).join(" ") });
  }
  for (const item of rig.items || []) addPart(index, item.part, { domain: "Rig Part", sourceKind: "serial-bom", description: item.cleanDescription || item.description || "" });
  return index;
}

export async function loadCurrentBaseline() {
  const [sql, toolingSource, rigSource] = await Promise.all([
    readFile(path.join(ROOT, "supabase/migrations/0006_known_customers.sql"), "utf8"),
    readFile(path.join(ROOT, "site/data/tooling.json"), "utf8"),
    readFile(path.join(ROOT, "site/data/rig-parts.json"), "utf8"),
  ]);
  const tooling = JSON.parse(toolingSource);
  const rig = JSON.parse(rigSource);
  const customers = extractKnownCustomers(sql);
  const parts = buildPartIndex(tooling, rig);
  return { customers, parts, metrics: { knownCustomers: customers.length, toolingRows: tooling.items.length, toolingSupplementRows: Object.values(tooling.supplements).reduce((sum, rows) => sum + rows.length, 0), rigPartRows: rig.items.length, uniquePartNumbers: parts.size } };
}

function bestCandidate(value, records, field) {
  let best = null;
  for (const record of records) {
    const score = textSimilarity(value, record[field]);
    if (!best || score > best.score) best = { ...record, score };
  }
  return best;
}

function reconcileCustomers(rows, baseline) {
  const byNumber = new Map(baseline.map((customer) => [normalizeIdentifier(customer.customerNumber), customer]));
  const byName = new Map();
  baseline.forEach((customer) => {
    const name = normalizeName(customer.customerName);
    byName.set(name, [...(byName.get(name) || []), customer]);
  });
  const dumpCounts = new Map();
  rows.forEach((row) => dumpCounts.set(normalizeIdentifier(row.customerNumber), (dumpCounts.get(normalizeIdentifier(row.customerNumber)) || 0) + 1));
  return rows.map((row) => {
    const customerNumber = normalizeIdentifier(row.customerNumber);
    const customerName = text(row.customerName);
    const common = { rowNumber: row.__rowNumber, customerNumber, customerName, duplicateNumberInDump: (dumpCounts.get(customerNumber) || 0) > 1 };
    if (!customerNumber || !customerName) return { ...common, classification: "invalid", note: "Customer number and name are required." };
    const exact = byNumber.get(customerNumber);
    if (exact) {
      const similarity = textSimilarity(customerName, exact.customerName);
      return { ...common, classification: similarity === 1 ? "exact_number_same_name" : "exact_number_name_changed", baselineCustomerNumber: exact.customerNumber, baselineCustomerName: exact.customerName, similarity, note: similarity === 1 ? "Exact GP customer identity." : "Exact number with a changed/variant name; review display facts." };
    }
    const sameNames = byName.get(normalizeName(customerName)) || [];
    if (sameNames.length) return { ...common, classification: "new_number_existing_name", baselineCustomerNumber: sameNames.map((item) => item.customerNumber).join(" | "), baselineCustomerName: sameNames.map((item) => item.customerName).join(" | "), similarity: 1, note: "Possible branch, duplicate, or identifier change." };
    const candidate = bestCandidate(customerName, baseline, "customerName");
    if (candidate?.score >= 0.82) return { ...common, classification: "possible_name_match", baselineCustomerNumber: candidate.customerNumber, baselineCustomerName: candidate.customerName, similarity: candidate.score, note: "Review hint only; do not merge automatically." };
    return { ...common, classification: "new_customer", similarity: candidate?.score || 0, note: "No controlled identity match." };
  });
}

function numeric(value) {
  const cleaned = text(value).replace(/[$,%\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (!cleaned) return { value: 0, valid: true };
  const number = Number(cleaned);
  return { value: Number.isFinite(number) ? number : 0, valid: Number.isFinite(number) };
}

function sourceDate(value) {
  const source = text(value);
  if (!source) return null;
  if (/^\d+(?:\.\d+)?$/.test(source) && Number(source) > 20000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(source)) * 86400000);
  const timestamp = Date.parse(source);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

function reconcileSales(rows, partIndex, year) {
  const groups = new Map();
  const quality = [];
  for (const row of rows) {
    const partNumber = normalizeIdentifier(row.partNumber);
    if (!partNumber) { quality.push({ dataset: "sales", rowNumber: row.__rowNumber, issue: "missing_part_number", detail: "Cannot compare row." }); continue; }
    if (!groups.has(partNumber)) groups.set(partNumber, { partNumber, description: text(row.description), rowCount: 0, quantity: 0, netSales: 0, outsideAnalysisYearRows: 0 });
    const group = groups.get(partNumber);
    group.rowCount += 1;
    if (!group.description && row.description) group.description = text(row.description);
    const quantity = numeric(row.quantity);
    const amount = numeric(row.extendedAmount);
    if (quantity.valid) group.quantity += quantity.value; else quality.push({ dataset: "sales", rowNumber: row.__rowNumber, issue: "invalid_quantity", detail: text(row.quantity) });
    if (amount.valid) group.netSales += amount.value; else quality.push({ dataset: "sales", rowNumber: row.__rowNumber, issue: "invalid_extended_amount", detail: text(row.extendedAmount) });
    if (Object.hasOwn(row, "documentDate") && text(row.documentDate)) {
      const date = sourceDate(row.documentDate);
      if (!date) quality.push({ dataset: "sales", rowNumber: row.__rowNumber, issue: "invalid_document_date", detail: text(row.documentDate) });
      else if (date.getUTCFullYear() !== year) group.outsideAnalysisYearRows += 1;
    }
  }
  const knownDescriptions = [...partIndex.entries()].flatMap(([partNumber, records]) => records.map((record) => ({ partNumber, ...record })));
  const parts = [...groups.values()].map((group) => {
    const matches = partIndex.get(group.partNumber) || [];
    if (matches.length) return { ...group, classification: "exact_part_number", matchedDomains: [...new Set(matches.map((item) => item.domain))].join(" | "), matchedSources: [...new Set(matches.map((item) => item.sourceKind))].join(" | "), candidatePartNumber: "", candidateDescription: "", candidateScore: 0, note: "Exact identity coverage; compatibility/serial gates still apply." };
    const candidate = group.description ? bestCandidate(group.description, knownDescriptions, "description") : null;
    const possible = candidate?.score >= 0.72;
    return { ...group, classification: possible ? "possible_description_match" : "not_in_current_catalog", matchedDomains: "", matchedSources: "", candidatePartNumber: possible ? candidate.partNumber : "", candidateDescription: possible ? candidate.description : "", candidateScore: possible ? candidate.score : 0, note: possible ? "Review hint only; never substitute identifiers automatically." : "Sold identifier is absent from the current baseline." };
  });
  return { parts, quality };
}

function countBy(records, field) {
  const counts = new Map();
  records.forEach((record) => counts.set(text(record[field]) || "[blank]", (counts.get(text(record[field]) || "[blank]") || 0) + 1));
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

export function compareDataDumps({ customerRows, salesRows, baseline, analysisYear = new Date().getUTCFullYear(), mappings = {} }) {
  const customers = reconcileCustomers(customerRows, baseline.customers);
  const { parts, quality } = reconcileSales(salesRows, baseline.parts, analysisYear);
  customers.filter((item) => item.classification === "invalid").forEach((item) => quality.push({ dataset: "customers", rowNumber: item.rowNumber, issue: "missing_customer_identity", detail: item.note }));
  const exact = parts.filter((item) => item.classification === "exact_part_number");
  const totalSales = parts.reduce((sum, item) => sum + item.netSales, 0);
  const exactSales = exact.reduce((sum, item) => sum + item.netSales, 0);
  const totalQuantity = parts.reduce((sum, item) => sum + item.quantity, 0);
  const exactQuantity = exact.reduce((sum, item) => sum + item.quantity, 0);
  const customerDumpNumbers = new Set(customerRows.map((row) => normalizeIdentifier(row.customerNumber)).filter(Boolean));
  const salesCustomerNumbers = salesRows.map((row) => normalizeIdentifier(row.customerNumber)).filter(Boolean);
  const orphanSalesCustomerNumbers = new Set(salesCustomerNumbers.filter((number) => !customerDumpNumbers.has(number)));
  return { summary: {
    schemaVersion: 1, generatedAt: new Date().toISOString(), analysisYear,
    authority: "Comparison only. GP remains transactional authority; CTS/WS004 and serial BOM rules remain compatibility/Where Used authority.",
    promotionPolicy: "Exact identifiers establish coverage. Similarity creates review candidates only.",
    privacyBoundary: "Inputs and detailed outputs remain beneath Git-ignored private-intake.",
    baseline: baseline.metrics, inputs: { customerRows: customerRows.length, salesRows: salesRows.length, mappings },
    customerReconciliation: { counts: countBy(customers, "classification"), duplicateCustomerNumbersInDump: new Set(customers.filter((item) => item.duplicateNumberInDump).map((item) => item.customerNumber)).size },
    salesCustomerIntegrity: {
      uniqueCustomerNumbersInSales: new Set(salesCustomerNumbers).size,
      salesRowsWithoutCustomerNumber: salesRows.length - salesCustomerNumbers.length,
      salesCustomerNumbersMissingFromCustomerDump: orphanSalesCustomerNumbers.size,
    },
    partCoverage: {
      counts: countBy(parts, "classification"), uniqueSoldPartNumbers: parts.length,
      exactIdentifierCoveragePercent: parts.length ? Number((100 * exact.length / parts.length).toFixed(2)) : 0,
      rowsRepresentedByExactIdentifiers: exact.reduce((sum, item) => sum + item.rowCount, 0), totalSalesRows: salesRows.length,
      netSalesObserved: Number(totalSales.toFixed(2)), netSalesOnExactIdentifiers: Number(exactSales.toFixed(2)),
      netSalesCoveragePercent: totalSales ? Number((100 * exactSales / totalSales).toFixed(2)) : null,
      quantityObserved: Number(totalQuantity.toFixed(4)), quantityOnExactIdentifiers: Number(exactQuantity.toFixed(4)),
      quantityCoveragePercent: totalQuantity ? Number((100 * exactQuantity / totalQuantity).toFixed(2)) : null,
      salesRowsOutsideAnalysisYear: parts.reduce((sum, item) => sum + item.outsideAnalysisYearRows, 0),
    },
    dataQualityIssues: countBy(quality, "issue"),
    nextGates: ["Reconcile source row counts/totals.", "Review customer identity conflicts.", "Classify unmatched parts.", "Route Tooling through CTS/WS004 and Rig Parts through serial/BOM review.", "Approve a versioned GP mapping before promotion."],
  }, customers, parts, qualityIssues: quality };
}

const csvCell = (value) => /[",\r\n]/.test(String(value ?? "")) ? `"${String(value ?? "").replace(/"/g, '""')}"` : String(value ?? "");
const toCsv = (records, columns) => `${[columns.join(","), ...records.map((record) => columns.map((column) => csvCell(record[column])).join(","))].join("\r\n")}\r\n`;

export async function saveComparison(result, output = "") {
  const directory = resolvePrivatePath(output || path.join(PRIVATE_INTAKE_ROOT, "comparisons", new Date().toISOString().replace(/[:.]/g, "-")), "Comparison reports must stay inside the Git-ignored private-intake directory.");
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(path.join(directory, "summary.json"), `${JSON.stringify(result.summary, null, 2)}\n`),
    writeFile(path.join(directory, "customer-reconciliation.csv"), toCsv(result.customers, ["rowNumber", "customerNumber", "customerName", "classification", "duplicateNumberInDump", "baselineCustomerNumber", "baselineCustomerName", "similarity", "note"])),
    writeFile(path.join(directory, "part-coverage.csv"), toCsv(result.parts, ["partNumber", "description", "classification", "matchedDomains", "matchedSources", "candidatePartNumber", "candidateDescription", "candidateScore", "rowCount", "quantity", "netSales", "outsideAnalysisYearRows", "note"])),
    writeFile(path.join(directory, "data-quality.csv"), toCsv(result.qualityIssues, ["dataset", "rowNumber", "issue", "detail"])),
  ]);
  return directory;
}

function parseArguments(values) {
  const options = { command: "", year: new Date().getUTCFullYear() };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!options.command && ["preflight", "compare"].includes(value)) options.command = value;
    else if (value === "--help" || value === "-h") options.help = true;
    else if (["--customers", "--sales", "--mapping", "--output", "--year"].includes(value)) { options[value.slice(2)] = value === "--year" ? Number(values[index + 1]) : values[index + 1]; index += 1; }
    else throw new Error(`Unexpected argument: ${value}`);
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help || !options.command) { console.log("Usage: npm run compare:dumps -- <preflight|compare> --customers <private CSV/JSON> --sales <private CSV/JSON> [--mapping <private JSON>] [--year 2026]"); process.exitCode = options.help ? 0 : 2; return; }
  if (!options.customers || !options.sales) throw new Error("--customers and --sales are required.");
  const [customerTable, salesTable, config] = await Promise.all([
    readTabularFile(options.customers), readTabularFile(options.sales),
    options.mapping ? readFile(resolvePrivatePath(options.mapping, "Working mappings must stay beneath private-intake."), "utf8").then(JSON.parse) : null,
  ]);
  const customerMapping = resolveMapping(customerTable.headers, "customers", config);
  const salesMapping = resolveMapping(salesTable.headers, "sales", config);
  console.log(JSON.stringify({ customers: { rows: customerTable.rows.length, headers: customerTable.headers, ...customerMapping }, sales: { rows: salesTable.rows.length, headers: salesTable.headers, ...salesMapping }, controls: { dateScopeAvailable: Boolean(salesMapping.mapping.documentDate), revenueCoverageAvailable: Boolean(salesMapping.mapping.extendedAmount), quantityCoverageAvailable: Boolean(salesMapping.mapping.quantity) } }, null, 2));
  if (options.command === "preflight") return;
  for (const [label, mapping] of [["Customer", customerMapping], ["Sales", salesMapping]]) if (mapping.missingRequired.length || mapping.ambiguous.length) throw new Error(`${label} mapping is not ready. Missing: ${mapping.missingRequired.join(", ") || "none"}; ambiguous: ${mapping.ambiguous.map((item) => item.field).join(", ") || "none"}.`);
  const result = compareDataDumps({ customerRows: mappedRows(customerTable, customerMapping.mapping), salesRows: mappedRows(salesTable, salesMapping.mapping), baseline: await loadCurrentBaseline(), analysisYear: options.year, mappings: { customers: customerMapping.mapping, sales: salesMapping.mapping } });
  const directory = await saveComparison(result, options.output);
  console.log(`Comparison complete: ${result.summary.inputs.customerRows} customers and ${result.summary.inputs.salesRows} sales rows.`);
  console.log(`Private report: ${directory}`);
}

if ((process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "") === import.meta.url) main().catch((error) => { console.error(`Data dump comparison failed: ${error.message}`); process.exitCode = 1; });
