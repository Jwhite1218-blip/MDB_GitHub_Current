"use strict";

const assert = require("node:assert/strict");
const { mkdir, mkdtemp, readFile, rm, writeFile } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const inventoryUrl = pathToFileURL(path.join(root, "scripts", "intake-inventory.mjs")).href;

test("metadata-first intake inventory classifies files without retaining the source root", async (t) => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "mdb-intake-"));
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }));
  await mkdir(path.join(fixtureRoot, "Service"));
  await writeFile(path.join(fixtureRoot, "Service", "parts-request.eml"), "synthetic email fixture");
  await writeFile(path.join(fixtureRoot, "password-list.txt"), "synthetic sensitive-name fixture");
  await writeFile(path.join(fixtureRoot, "archive.zip"), "not a real archive");
  await writeFile(path.join(fixtureRoot, "mailbox.pst"), "not a real mailbox");

  const { buildInventory } = await import(inventoryUrl);
  const inventory = await buildInventory(fixtureRoot);

  assert.equal(inventory.schemaVersion, 1);
  assert.equal(inventory.sourceLabel, path.basename(fixtureRoot));
  assert.equal(inventory.sourcePathStored, false);
  assert.equal(inventory.contentOpened, false);
  assert.equal(inventory.hashesIncluded, false);
  assert.equal(inventory.totals.files, 4);
  assert.equal(inventory.byCategory.document, 2);
  assert.equal(inventory.byCategory.archive, 1);
  assert.equal(inventory.byCategory["mailbox-container"], 1);
  assert.equal(inventory.files.every((file) => !path.isAbsolute(file.relativePath)), true);
  assert.equal(inventory.files.every((file) => file.sha256 === null), true);
  assert.deepEqual(
    inventory.files.find((file) => file.relativePath === "password-list.txt").flags,
    ["potential_credentials"],
  );
  assert.match(
    inventory.files.find((file) => file.relativePath === "mailbox.pst").flags.join(" "),
    /mailbox_container_review_required/,
  );
});

test("inventory manifests write inside private-intake and cannot escape it", async (t) => {
  const { PRIVATE_INTAKE_ROOT, resolvePrivateOutput, saveInventory } = await import(inventoryUrl);
  const outputPath = path.join(PRIVATE_INTAKE_ROOT, "test-manifests", `test-${process.pid}-${Date.now()}.json`);
  t.after(() => rm(outputPath, { force: true }));
  assert.equal(resolvePrivateOutput(outputPath).startsWith(PRIVATE_INTAKE_ROOT), true);
  const savedPath = await saveInventory({ schemaVersion: 1, files: [] }, outputPath);
  assert.equal(savedPath, outputPath);
  assert.deepEqual(JSON.parse(await readFile(savedPath, "utf8")), { schemaVersion: 1, files: [] });
  assert.throws(
    () => resolvePrivateOutput(path.join(root, "tracked-manifest.json")),
    /must stay inside the Git-ignored private-intake directory/,
  );
});
