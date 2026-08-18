# Mobile Drill Brain - Current Demo Repository

This repository contains the current MDB demo, the controlled documents used to reason about it, and the structured source data used to build it.

## Authority and precedence

`docs/architecture/Master 8-7-26.docx` is the repository-level authority. When sources disagree, apply this precedence:

1. `Master 8-7-26.docx`
2. Current family- or subject-specific CTS documents
3. `MDB_WS004_Catalog_Build_v3_28_Merged.docx`
4. `MDB_Search_and_Retrieval_Specification_v1_0_with_Compatibility_Enforcement_Layer.pdf`
5. Current family-specific structured builds, including the Moyno build
6. Current structured databases
7. Historical and supporting material

For tooling execution, current CTS documents and WS004 govern. They override stale behavior or legacy assumptions in the spreadsheets. Older repository versions do not override the current authority set.

## Repository boundaries

### `site/`

The deployable static MDB demo. Netlify must publish this directory only.

`site/data/` contains browser-ready, normalized demo records derived from the controlled source workbooks and current WS004 build. It does not contain the raw workbooks or controlled documents.

Recommended Netlify settings:

- Base directory: repository root
- Build command: none
- Publish directory: `site`

### `docs/`

Controlled reference, architecture, calibration, and tooling documents. These files are internal source material and must not be exposed by the public demo.

### `data/`

Structured MDB source data for Tooling and Rig Parts. Raw workbooks are source material; they are not automatically executable search logic and must not be deployed publicly.

Never configure Netlify to publish the repository root. Doing so could expose `docs/` or `data/`.

## Tooling execution rule

`data/MDB_Part_Number_Database_Format_v0.3_Tooling_Flexible.xlsx` contains useful structured data, but it also contains legacy assumptions. Current CTS and WS004 rules control the execution path.

Known structural requirements include:

- HSA connection-variant support
- Lead-auger handling
- Cutterhead-style neutrality
- Drive-cap selection variables
- Split-spoon shoe style
- HEX-COR and STD Duty separation
- Moyno component-model routing
- Explicit no-match terminal states
- Search Result First / BOM Expansion Second

The tooling database must never independently override current CTS logic.

## Rig Parts rule

Rig Parts use a serial/BOM-first architecture rather than a tooling-style product catalog.

Primary path:

`Universal Search -> Customer/Serial -> Rig Portal -> BOM Hierarchy -> Part Detail`

Search behavior:

- Exact part number -> Part Detail candidate
- Description -> active serial and assembly first
- Assembly or system -> matching BOM branch
- Serial number -> Rig Portal
- Model without serial -> proxy result; verification required
- Symptom -> Troubleshooting workflow first

A model-only match must never be labeled `Serial BOM Verified`.

## Search doctrine

MDB uses expert navigation rather than result dumping.

`User input -> Intent detection -> Active context -> Source authority -> Compatibility/safety gate -> Workspace routing -> Possible result + next action`

Core behavior:

- Return the strongest available result first, then narrow only when required
- Preserve active customer, fleet, serial, system, and tooling context
- Ask the smallest useful clarifying question
- Treat a search result as a possible match, not a recommendation
- Apply compatibility and source authority before quote readiness
- Never silently guess
- Never treat missing source data as proof that a product does not exist
- Keep related BOM or package branches collapsed until the user needs them
- Route symptoms through safety and system isolation before suggesting parts

Only explicitly confirmed items may enter Quote-Prep. Suggested, related, compatible, or repair-support items never auto-add. GP remains transactional authority for current pricing, inventory, orders, invoices, and other formal records.

## Demo scope

### Public portfolio boundary

The deployed public site is a sandbox, not an operational login surface:

- Quotes, Orders, Inventory overrides, reports, email, shipping rates, and the real known-customer duplicate-check do not connect to the shared backend.
- Public edits persist only in that visitor's browser under portfolio-specific storage keys.
- The public JavaScript contains no employee roster or browser-side admin credential.
- Operational Netlify Functions deny requests unless internal authentication is configured.
- The included Supabase migration enables RLS and explicitly revokes `anon` and `authenticated` Data API access on operational tables when it is applied to the project.

An internal deployment must use real authentication before shared backend access is re-enabled. Never place an internal API token or service-role credential in `site/` or any other browser-delivered file.

The current operational demo proves the daily-work foundation:

1. Compact universal entry with typo-tolerant search
2. Direct access to Customer, Tooling, Quotes, Inventory, and Rig/BOM workspaces
3. A streamlined Customer Profile with customer facts, complete purchase history, confirmed rigs, Tooling DNA, calibration history, and interactions
4. Direct serial-to-BOM navigation
5. Workspace overlays that preserve the employee's place
6. Full B57 `2025023` and B37X `2025028` serial BOM navigation: 25 sections, 162 assemblies, 1,400 relationships, 980 searchable rig items, and Where Used detail
7. Full flexible tooling search: 1,253 indexed records plus current WS004 supplements for Drive Caps, Split Spoons, HEX-COR / STD Duty, and Moyno
8. Executable family controls for Drive Cap, HSA Auger, Split Spoon, HEX-COR / STD Duty, and Moyno
9. Editable public-sandbox fields for on-hand, allocated, bin, and unit price across Inventory, BOM detail, and Tooling detail; these edits stay on the visitor's device
10. Calibration-to-quote handoff and persistent browser-local Quote and Order workspaces with quantity, price, discount, freight, and totals

The browser demo uses normalized records generated from the repository source set. The B57/B37X BOM hierarchy and tooling catalog depth are real source-derived demo data; current GP verification is still pending wherever the source says so. Inventory quantities, prices, quote values, and customer details remain editable demo values and are not production truth. The site does not load or expose the raw files in repository-level `docs/` or `data/`, and it does not claim live GP pricing, inventory, ordering, or invoicing.

Training and Knowledge Chapter surfaces are intentionally separate from the normal operational workspace. Current CTS, WS004, compatibility, safety, and authority rules remain execution controls behind the interface rather than user-facing training steps.

## Run the demo

Serve the `site/` directory with any static web server. No build step is required. Direct `file://` opening is not supported because the browser loads the normalized JSON data files at runtime.

