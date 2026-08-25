# Tooling Search Ranking Contract

## Purpose

The Tooling search bar is the fast entrance to the same controlled structure
exposed by **Browse Tooling**. Free-text retrieval must not flatten source
authority, product-family intent, compatibility rules, and weak aliases into an
equal-score result list.

## Guided intent routing

These descriptions route directly into the matching compatibility-controlled
selector:

- Drive Cap
- HSA Auger, including plain `auger` and descriptive auger-section searches
- Split Spoon / Split Sampler
- HEX-COR / STD Duty / Solid Stem
- Moyno and known pump models

The routed screen uses the same builder identifiers and rendering functions as
the Browse Tooling buttons. Search does not maintain a second copy of the
compatibility rules.

An auger component search such as `auger bushing`, `auger coupling`, `auger
shoe`, or `auger repair key` remains a ranked catalog search. A query containing
a long part-number token also remains a catalog search so exact identity wins.

## Catalog relevance order

When the query remains in the catalog, the ranking order is:

1. Exact active part number
2. Active part-number prefix
3. Direct description
4. Controlled subtype
5. Product family
6. Controlled attributes such as size, length, connection, thread, and style
7. Alias-only evidence

Current CTS/WS004 and confirmed source authority break close ties. An actionable
active part receives a small preference over a reference-only row with equal
text relevance. Blocked records remain discoverable—especially by exact part
number—but do not outrank an equally relevant current, quoteable record.

No source fact is deleted or hidden from the full result set merely because it
ranks lower. The ranking decides first-screen usefulness, while the controlled
status still decides whether the item can be quoted.

## Regression examples

- `150632` must lead with `150632 — Auger Section 5' long`; suffix variants
  follow exact-part records.
- `auger` must open the HSA Auger selector without requiring Browse Tooling plus
  HSA Auger clicks.
- `auger bushing` must lead with direct HSA auger-bushing descriptions and must
  not open the Auger Section selector.
- A direct description match must outrank a record that mentions the same word
  only in aliases.
- For otherwise equal descriptions, an active part must precede a no-active-PN
  reference row.

These rules are covered by `test/tooling-search.test.js` against focused
fixtures and the real structured tooling source.
