import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  PRIVATE_INTAKE_ROOT,
  resolvePrivatePath,
} from "./intake-inventory.mjs";

const MEBIBYTE = 1024 * 1024;
const ROUTES = ["structured-data", "email", "document", "plain-text", "image"];
const ROUTE_EXTENSIONS = new Map([
  [".csv", "structured-data"], [".json", "structured-data"], [".ods", "structured-data"],
  [".xls", "structured-data"], [".xlsm", "structured-data"], [".xlsx", "structured-data"],
  [".xml", "structured-data"],
  [".eml", "email"], [".msg", "email"],
  [".doc", "document"], [".docx", "document"], [".pdf", "document"],
  [".html", "plain-text"], [".htm", "plain-text"], [".md", "plain-text"],
  [".rtf", "plain-text"], [".txt", "plain-text"],
  [".bmp", "image"], [".gif", "image"], [".heic", "image"], [".jpeg", "image"],
  [".jpg", "image"], [".png", "image"], [".tif", "image"], [".tiff", "image"],
  [".webp", "image"],
]);

function routeForFile(file) {
  return ROUTE_EXTENSIONS.get(String(file.extension || "").toLowerCase()) || "";
}

function reviewReason(file) {
  if (!file || typeof file !== "object" || !file.relativePath) return "invalid_manifest_record";
  const flags = Array.isArray(file.flags) ? file.flags : [];
  if (flags.includes("temporary_or_lock_file")) return "temporary_or_lock_file";
  if (file.category === "mailbox-container") return "mailbox_container_requires_selected_export";
  if (file.category === "archive") return "archive_requires_manual_review";
  if (flags.length) return "sensitive_filename_flag_requires_review";
  if (!routeForFile(file)) return "unsupported_file_type";
  return "";
}

function safeFileRecord(file) {
  return {
    relativePath: String(file.relativePath),
    extension: String(file.extension || "[none]"),
    bytes: Math.max(0, Number(file.bytes) || 0),
    modifiedAt: file.modifiedAt || null,
    sha256: file.sha256 || null,
  };
}

export function buildAnalysisPlan(inventory, { maxFiles = 25, maxBytes = 20 * MEBIBYTE } = {}) {
  if (!inventory || inventory.schemaVersion !== 1 || !Array.isArray(inventory.files)) {
    throw new Error("A schemaVersion 1 intake inventory is required.");
  }
  if (!Number.isSafeInteger(maxFiles) || maxFiles < 1 || maxFiles > 500) {
    throw new Error("maxFiles must be an integer between 1 and 500.");
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error("maxBytes must be a positive safe integer.");
  }

  const eligibleByRoute = Object.fromEntries(ROUTES.map((route) => [route, []]));
  const reviewRequired = [];

  for (const file of inventory.files) {
    const reason = reviewReason(file);
    if (reason) {
      reviewRequired.push({
        ...safeFileRecord(file),
        flags: Array.isArray(file.flags) ? [...file.flags].sort() : [],
        reason,
      });
      continue;
    }
    eligibleByRoute[routeForFile(file)].push(safeFileRecord(file));
  }

  const batches = [];
  for (const route of ROUTES) {
    const routeFiles = eligibleByRoute[route].sort((left, right) => {
      const modified = String(right.modifiedAt || "").localeCompare(String(left.modifiedAt || ""));
      return modified || left.relativePath.localeCompare(right.relativePath);
    });
    let current = null;
    let routeBatchNumber = 0;
    const startBatch = () => {
      routeBatchNumber += 1;
      current = {
        id: `${route}-${String(routeBatchNumber).padStart(3, "0")}`,
        route,
        files: [],
        totalBytes: 0,
        oversized: false,
      };
      batches.push(current);
    };

    for (const file of routeFiles) {
      const exceedsCurrent = current && (
        current.files.length >= maxFiles || current.totalBytes + file.bytes > maxBytes
      );
      if (!current || exceedsCurrent) startBatch();
      current.files.push(file);
      current.totalBytes += file.bytes;
      if (file.bytes > maxBytes) current.oversized = true;
      if (current.oversized) current = null;
    }
  }

  reviewRequired.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  const eligibleFiles = batches.reduce((total, batch) => total + batch.files.length, 0);
  const eligibleBytes = batches.reduce((total, batch) => total + batch.totalBytes, 0);
  const reviewBytes = reviewRequired.reduce((total, file) => total + file.bytes, 0);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    inventoryGeneratedAt: inventory.generatedAt || null,
    sourceLabel: inventory.sourceLabel || "intake",
    sourcePathStored: false,
    limits: { maxFiles, maxBytes },
    totals: {
      inventoryFiles: inventory.files.length,
      eligibleFiles,
      eligibleBytes,
      reviewRequiredFiles: reviewRequired.length,
      reviewRequiredBytes: reviewBytes,
      batches: batches.length,
    },
    batches,
    reviewRequired,
  };
}

function defaultPlanPath() {
  return path.join(
    PRIVATE_INTAKE_ROOT,
    "plans",
    `analysis-plan-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
}

export async function loadPrivateInventory(manifestPath) {
  const resolved = resolvePrivatePath(
    manifestPath,
    "The inventory manifest must be inside the Git-ignored private-intake directory.",
  );
  return JSON.parse(await readFile(resolved, "utf8"));
}

export async function saveAnalysisPlan(plan, outputPath = "") {
  const resolved = resolvePrivatePath(
    outputPath || defaultPlanPath(),
    "Analysis plans must stay inside the Git-ignored private-intake directory.",
  );
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  return resolved;
}

function usage() {
  return [
    "Usage: npm run intake:plan -- <private manifest> [--max-files 25] [--max-batch-mb 20] [--output <private path>]",
    "",
    "The planner reads only the private metadata manifest. It does not open source files.",
    "Flagged files, archives, unsupported types, and full mailbox containers stay in manual review.",
  ].join("\n");
}

function parsePositiveInteger(value, label, maximum = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) {
    throw new Error(`${label} must be an integer between 1 and ${maximum}.`);
  }
  return number;
}

function parseArguments(argumentsList) {
  const options = { manifestPath: "", maxFiles: 25, maxBytes: 20 * MEBIBYTE, outputPath: "" };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    const next = argumentsList[index + 1];
    if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--max-files") {
      options.maxFiles = parsePositiveInteger(next, "--max-files", 500);
      index += 1;
    } else if (argument === "--max-batch-mb") {
      options.maxBytes = parsePositiveInteger(next, "--max-batch-mb", 1024) * MEBIBYTE;
      index += 1;
    } else if (argument === "--output") {
      if (!next || next.startsWith("--")) throw new Error("--output requires a path.");
      options.outputPath = next;
      index += 1;
    } else if (!options.manifestPath) options.manifestPath = argument;
    else throw new Error(`Unexpected argument: ${argument}`);
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help || !options.manifestPath) {
    console.log(usage());
    process.exitCode = options.help ? 0 : 2;
    return;
  }
  const inventory = await loadPrivateInventory(options.manifestPath);
  const plan = buildAnalysisPlan(inventory, options);
  const outputPath = await saveAnalysisPlan(plan, options.outputPath);
  console.log(`Analysis plan complete: ${plan.totals.eligibleFiles.toLocaleString()} eligible files in ${plan.totals.batches.toLocaleString()} batches; ${plan.totals.reviewRequiredFiles.toLocaleString()} held for review.`);
  console.log(`Private plan: ${outputPath}`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(`Intake planning failed: ${error.message}`);
    process.exitCode = 1;
  });
}
