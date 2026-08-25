import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
export const PRIVATE_INTAKE_ROOT = path.join(repositoryRoot, "private-intake");

const DOCUMENT_EXTENSIONS = new Set([
  ".csv", ".doc", ".docx", ".eml", ".html", ".htm", ".json", ".md",
  ".msg", ".ods", ".pdf", ".rtf", ".txt", ".xls", ".xlsm", ".xlsx", ".xml",
]);
const IMAGE_EXTENSIONS = new Set([".bmp", ".gif", ".heic", ".jpeg", ".jpg", ".png", ".tif", ".tiff", ".webp"]);
const ARCHIVE_EXTENSIONS = new Set([".7z", ".gz", ".rar", ".tar", ".zip"]);
const MAILBOX_EXTENSIONS = new Set([".ost", ".pst"]);

const FLAG_PATTERNS = [
  ["potential_credentials", /(?:api[-_ ]?key|credential|login|password|secret|token)/i],
  ["hr_or_payroll", /(?:benefit|employee[-_ ]?review|human[-_ ]?resources|payroll|personnel)/i],
  ["legal_or_contract", /(?:attorney|contract|lawsuit|legal|nda|settlement)/i],
];

export function categoryForExtension(extension) {
  if (MAILBOX_EXTENSIONS.has(extension)) return "mailbox-container";
  if (ARCHIVE_EXTENSIONS.has(extension)) return "archive";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (DOCUMENT_EXTENSIONS.has(extension)) return "document";
  return "other";
}

export function flagsForPath(relativePath) {
  const extension = path.extname(relativePath).toLowerCase();
  const flags = FLAG_PATTERNS
    .filter(([, pattern]) => pattern.test(relativePath))
    .map(([flag]) => flag);
  if (MAILBOX_EXTENSIONS.has(extension)) flags.push("mailbox_container_review_required");
  if (ARCHIVE_EXTENSIONS.has(extension)) flags.push("archive_review_required");
  if (/^(?:~\$|\.~)|\.(?:lock|tmp)$/i.test(path.basename(relativePath))) flags.push("temporary_or_lock_file");
  return [...new Set(flags)].sort();
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export function resolvePrivatePath(candidatePath, errorMessage = "Path must stay inside private-intake.") {
  const resolved = path.resolve(candidatePath);
  if (!isInside(PRIVATE_INTAKE_ROOT, resolved)) throw new Error(errorMessage);
  return resolved;
}

export function resolvePrivateOutput(outputPath) {
  return resolvePrivatePath(outputPath || path.join(
    PRIVATE_INTAKE_ROOT,
    "manifests",
    `intake-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  ), "Inventory manifests must stay inside the Git-ignored private-intake directory.");
}

async function sha256(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

function sortObject(object) {
  return Object.fromEntries(Object.entries(object).sort(([left], [right]) => left.localeCompare(right)));
}

export async function buildInventory(sourceRoot, { hashFiles = false } = {}) {
  const resolvedRoot = path.resolve(sourceRoot);
  const rootStat = await stat(resolvedRoot);
  if (!rootStat.isDirectory()) throw new Error("The intake source must be a directory.");

  const files = [];
  const skipped = [];

  async function walk(directory, relativeDirectory = "") {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      skipped.push({ relativePath: relativeDirectory || ".", reason: error.code || "unreadable_directory" });
      return;
    }

    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relativePath = path.join(relativeDirectory, entry.name);
      const normalizedPath = relativePath.split(path.sep).join("/");
      const absolutePath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        skipped.push({ relativePath: normalizedPath, reason: "symbolic_link_not_followed" });
        continue;
      }
      if (entry.isDirectory()) {
        await walk(absolutePath, relativePath);
        continue;
      }
      if (!entry.isFile()) {
        skipped.push({ relativePath: normalizedPath, reason: "unsupported_filesystem_entry" });
        continue;
      }

      try {
        const fileStat = await stat(absolutePath);
        const extension = path.extname(entry.name).toLowerCase() || "[none]";
        files.push({
          relativePath: normalizedPath,
          extension,
          category: categoryForExtension(extension),
          bytes: fileStat.size,
          modifiedAt: fileStat.mtime.toISOString(),
          sha256: hashFiles ? await sha256(absolutePath) : null,
          flags: flagsForPath(normalizedPath),
        });
      } catch (error) {
        skipped.push({ relativePath: normalizedPath, reason: error.code || "unreadable_file" });
      }
    }
  }

  await walk(resolvedRoot);
  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  const byExtension = {};
  const byCategory = {};
  const flagCounts = {};
  let totalBytes = 0;
  for (const file of files) {
    totalBytes += file.bytes;
    byExtension[file.extension] = (byExtension[file.extension] || 0) + 1;
    byCategory[file.category] = (byCategory[file.category] || 0) + 1;
    for (const flag of file.flags) flagCounts[flag] = (flagCounts[flag] || 0) + 1;
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceLabel: path.basename(resolvedRoot),
    sourcePathStored: false,
    contentOpened: Boolean(hashFiles),
    hashesIncluded: Boolean(hashFiles),
    totals: {
      files: files.length,
      bytes: totalBytes,
      skipped: skipped.length,
    },
    byExtension: sortObject(byExtension),
    byCategory: sortObject(byCategory),
    flagCounts: sortObject(flagCounts),
    files,
    skipped,
  };
}

export async function saveInventory(inventory, outputPath) {
  const resolvedOutput = resolvePrivateOutput(outputPath);
  await mkdir(path.dirname(resolvedOutput), { recursive: true });
  await writeFile(resolvedOutput, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
  return resolvedOutput;
}

function usage() {
  return [
    "Usage: npm run intake:inventory -- <source-directory> [--hash] [--output <private-intake path>]",
    "",
    "The default pass reads metadata only. --hash opens file bytes and may download OneDrive online-only files.",
    "All manifests are forced into the Git-ignored private-intake directory.",
  ].join("\n");
}

function parseArguments(argumentsList) {
  const options = { hashFiles: false, outputPath: "", sourceRoot: "" };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--hash") options.hashFiles = true;
    else if (argument === "--output") {
      const nextValue = argumentsList[index + 1];
      if (!nextValue || nextValue.startsWith("--")) throw new Error("--output requires a path.");
      options.outputPath = nextValue;
      index += 1;
    }
    else if (argument === "--help" || argument === "-h") options.help = true;
    else if (!options.sourceRoot) options.sourceRoot = argument;
    else throw new Error(`Unexpected argument: ${argument}`);
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help || !options.sourceRoot) {
    console.log(usage());
    process.exitCode = options.help ? 0 : 2;
    return;
  }
  const inventory = await buildInventory(options.sourceRoot, { hashFiles: options.hashFiles });
  const outputPath = await saveInventory(inventory, options.outputPath);
  console.log(`Inventory complete: ${inventory.totals.files.toLocaleString()} files, ${inventory.totals.bytes.toLocaleString()} bytes, ${inventory.totals.skipped.toLocaleString()} skipped.`);
  console.log(`Private manifest: ${outputPath}`);
  if (Object.keys(inventory.flagCounts).length) {
    console.log("Review flagged groups before content analysis; no flagged file contents were opened by the default pass.");
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(`Intake inventory failed: ${error.message}`);
    process.exitCode = 1;
  });
}
