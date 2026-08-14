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

- Search first, then progressively narrow
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

The ENA/progressive-entry demo proves the front-door reasoning pattern:

1. One universal entry
2. Intent detection and workspace routing
3. Progressive narrowing with one useful question at a time
4. Source-authority and compatibility guardrails
5. Tooling, Rig Parts, Rig Sales, Troubleshooting, Calibration, and Reference paths
6. Clear possible-match, verification-required, stop, and escalation states

The browser demo uses safe, built-in example responses. It does not load or expose the raw files in `docs/` or `data/`, and it does not claim live pricing, inventory, serial-BOM, or quote-ready truth.

## Run the demo

Open `site/index.html` directly in a browser or serve the `site/` directory with any static web server. No build step is required.
