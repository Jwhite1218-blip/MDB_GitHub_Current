"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
require(path.join(root, "site", "tooling-search.js"));
const search = globalThis.MDBToolingSearch;
const toolingData = JSON.parse(fs.readFileSync(path.join(root, "site", "data", "tooling.json"), "utf8"));
const app = fs.readFileSync(path.join(root, "site", "app.js"), "utf8");

test("plain auger intent routes directly into the controlled HSA selector", () => {
  assert.equal(search.detectGuidedBuilder("auger"), "hsaAuger");
  assert.equal(search.detectGuidedBuilder("lead auger"), "hsaAuger");
  assert.equal(search.detectGuidedBuilder("hollow stem auger"), "hsaAuger");
  assert.equal(search.detectGuidedBuilder("auger section 5 ft"), "hsaAuger");
  assert.equal(search.detectGuidedBuilder("auger 4-1/4 5 ft"), "hsaAuger");
  assert.equal(search.detectGuidedBuilder("auger 150632"), "");
  assert.equal(search.detectGuidedBuilder("auger bushing"), "");
  assert.equal(search.detectGuidedBuilder("auger coupling"), "");
});

test("direct descriptions outrank alias-only noise and actionable parts outrank references", () => {
  const ranked = search.rankToolingItems("auger", [
    {
      id: "alias-noise",
      part: "67007-09",
      description: "CA Modified 8 TPI Split Spoon",
      family: "Sampling",
      subfamily: "Split Spoon",
      aliases: "used with auger work",
      sourceType: "Current CTS / WS004",
      quoteable: true,
    },
    {
      id: "reference",
      part: "",
      description: "Auger Section 5 ft",
      family: "HSA",
      subfamily: "Auger Section",
      sourceType: "Current CTS / WS004",
      quoteable: false,
    },
    {
      id: "active-auger",
      part: "150632",
      description: "Auger Section 5 ft",
      family: "HSA",
      subfamily: "Auger Section",
      sourceType: "Current CTS / WS004",
      quoteable: true,
    },
  ]);
  assert.deepEqual(ranked.map((item) => item.id), ["active-auger", "reference", "alias-noise"]);
  assert.equal(ranked[0].searchReason, "description");
});

test("exact part number wins before variants and duplicate source descriptions", () => {
  const ranked = search.rankToolingItems("150632", toolingData.items);
  assert.equal(ranked[0].part, "150632");
  assert.equal(ranked[0].description, "Auger Section 5' long");
  assert.equal(ranked[0].searchReason, "exact part");
  const firstVariant = ranked.findIndex((item) => item.part !== "150632");
  assert.ok(firstVariant > 0);
  assert.match(ranked[firstVariant].part, /^150632-/);
});

test("real catalog description search keeps the intended family at the top", () => {
  const ranked = search.rankToolingItems("auger bushing", toolingData.items).slice(0, 6);
  assert.ok(ranked.length > 0);
  for (const item of ranked.slice(0, 3)) {
    assert.match(item.description.toLowerCase(), /auger bushing/);
    assert.equal(item.family, "HSA");
  }
});

test("free-text routing and Browse Tooling use the same guided selector identifiers", () => {
  for (const [query, builder] of [
    ["drive cap", "driveCap"],
    ["auger", "hsaAuger"],
    ["split spoon", "splitSpoon"],
    ["hex-cor", "hexCor"],
    ["moyno", "moyno"],
  ]) {
    assert.equal(search.detectGuidedBuilder(query), builder);
    assert.match(app, new RegExp(`\\["${builder}",`));
  }
  assert.match(app, /Using the same compatibility-controlled rules as Browse Tooling/);
});
