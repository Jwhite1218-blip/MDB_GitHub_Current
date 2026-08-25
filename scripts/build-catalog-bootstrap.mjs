import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const siteRoot = resolve(process.cwd(), "site");
const catalogs = [
  { source: "data/rig-parts.json", target: "data/rig-parts.js", key: "rig" },
  { source: "data/tooling.json", target: "data/tooling.js", key: "tooling" },
];

for (const catalog of catalogs) {
  const sourcePath = resolve(siteRoot, catalog.source);
  const targetPath = resolve(siteRoot, catalog.target);
  const parsed = JSON.parse(await readFile(sourcePath, "utf8"));
  const serialized = JSON.stringify(parsed);
  const output = [
    '"use strict";',
    "window.MDB_BOOTSTRAP_DATA = window.MDB_BOOTSTRAP_DATA || {};",
    `window.MDB_BOOTSTRAP_DATA.${catalog.key} = ${serialized};`,
    "",
  ].join("\n");
  await writeFile(targetPath, output, "utf8");
  console.log(`Built ${catalog.target} from ${catalog.source}`);
}
