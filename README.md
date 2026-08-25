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

## Item Master foundation

MDB uses one canonical Item record per normalized part number for shared operational facts such as description, class, UoM, status, revision, drawing, vendor, cost, price, weight, source authority, and source lineage. Tooling and serial BOM records are linked into that Item Master without being flattened into one compatibility system.

- CTS and WS004 still decide tooling compatibility and quote readiness.
- Serial BOMs still decide confirmed rig usage and Where Used paths.
- The Item Master supplies the common part identity used by Inventory, Quotes, Orders, Tooling, and Rig/BOM.
- Existing text part-number fields remain in place during rollout, so linking an `item_id` is additive rather than a destructive conversion.
- `item_source_records` preserves the source-system record and payload needed for later GP reconciliation instead of silently overwriting competing source facts.

## Demo scope

## Production Control foundation

The unified Sales + Operations workflow is defined in
`docs/architecture/PRODUCTION_CONTROL_FOUNDATION.md`. Its additive database
foundation is implemented by
`supabase/migrations/20260821143000_production_control_foundation.sql`.

The standalone Operations portfolio audit and its disposition into this
canonical project are recorded in
`docs/architecture/OPERATIONS_PORTFOLIO_MERGE.md`. The unified demo now exposes
Sales Build Requests, the Production Control gatekeeper inbox, controlled Build
Orders, a Shop Floor execution view, and read-only production tracking for the
originating Sales representative. The historical portfolio is a frozen
comparison artifact rather than a second development track.

The operational path requires Netlify Identity with invite-only registration.
An authenticated Identity account must also be provisioned in
`operational_users` and assigned server-controlled roles in
`operational_user_roles`. The browser identity picker remains demo attribution
only and is never authorization evidence.

The new `production-control` Netlify Function owns Build Request creation,
gatekeeper transitions, controlled Build Order preparation, release, assignment,
exceptions, and idempotent consumption/output posting. The existing public demo
continues to use browser-local data and does not call this operational path.

For a new operational database, apply the baseline schema and then all migrations
in filename order. For a linked Supabase project, use the normal migration push
workflow so the production-control RPCs and grants are installed together.

Run `npm test` before applying operational migrations. The database tests execute
the production-control migration and complete Build Request-to-finished-goods
lifecycle in an isolated PostgreSQL-compatible engine, including role grants,
RLS, inventory reservation, shortage rollback, and idempotent posting.

## Shared Operations Job and Service foundation

The combined production/service control plane is defined in
`docs/architecture/OPERATIONS_JOB_AND_SERVICE_FOUNDATION.md` and implemented by
`supabase/migrations/20260825090000_operations_job_service_foundation.sql`.

Service Requests, Service Work Orders, Build Orders, and the shared Operations
Job remain separate records with explicit links. The Operations Board gives the
gatekeeper one capacity, assignment, checkpoint, exception, and closeout queue
without flattening specialized production and service behavior. The requester
view tracks the controlled lifecycle without granting execution authority.

The authenticated `/api/operations/jobs` endpoint is the only browser write
path for this foundation. It resolves the signed-in employee server-side and
calls role-checked transactional RPCs. The public portfolio uses browser-local
simulation only and includes narrow Mobile/NFC intake channels as a future
Mobile Lite seam, not as a mobile ERP.

## GP read-only sync preparation

The inbound-only GP staging contract is documented in
`docs/architecture/GP_READ_ONLY_SYNC_FOUNDATION.md` and implemented by the v1
and v2 GP migrations plus the `gp-read-sync` and `gp-sync-status` Netlify
Functions. Contract v2 adds per-entity delta/snapshot modes, independent
cursors, mapping versions, batch continuity, exact completion counts, stale
source protection, and changed-state lineage without adding any GP write-back
path.

This is preparation, not a live GP connection. The real connector remains
blocked on the company's exact GP version, approved read path, company IDs,
watermark semantics, and representative sample records. The public portfolio
deployment never contacts GP or exposes raw GP payloads.

The conversion from the current in-browser/full-list envelope to GP-sized read
models is sequenced in
`docs/architecture/SCALABILITY_AND_GP_INGESTION_PLAN.md`. GP landing,
reconciliation, canonical facts, search projections, and audited workflows stay
separate so growing the dataset does not bypass compatibility or Production
Control rules.

## Installable application shell

The deployable site includes a PWA manifest, branded app icons, service worker,
install prompt, online/offline indicator, controlled update prompt, and a visible
System & Sync workspace. See
`docs/architecture/PWA_APPLICATION_SHELL.md` for the exact cache and update
boundaries.

Operational APIs are never cached. Static shell and source-derived catalog data
can support an offline view only after they have been loaded once. A supporting
browser can install the app from HTTPS or localhost and open it in a standalone
window.

## Future Mobile Lite service concept

Mobile remains a narrow, authorized service and escalation surface rather than
a small-screen copy of the entire ERP. The future NFC-assisted rig profile,
field-service request, office triage, and parts-escalation concept is recorded in
`docs/architecture/MOBILE_LITE_SERVICE_CONCEPT.md`. An NFC scan supplies rig
context only; it never serves as authentication or creates a GP order directly.

## Controlled evidence intake

Large OneDrive or selected-email exports must remain outside source control.
`private-intake/` is Git-ignored. `npm run intake:inventory -- <folder>` creates
a private metadata-first manifest, and `npm run intake:plan -- <manifest>`
turns it into bounded, type-specific analysis batches before any document
contents are opened. The handling and review gates are defined in
`docs/architecture/CONTROLLED_EVIDENCE_INTAKE.md`.

### Public portfolio boundary

The deployed public site is a sandbox, not an operational login surface:

- A four-digit feedback PIN limits casual access to the portfolio demo and is remembered locally for 14 days; because the gate runs in the public browser, it is not treated as security for confidential data.
- Quotes, Orders, Inventory overrides, reports, email, shipping rates, and the real known-customer duplicate-check do not connect to the shared backend.
- Public edits persist only in that visitor's browser under portfolio-specific storage keys.
- The public JavaScript contains no employee roster or browser-side admin credential.
- Operational Netlify Functions deny requests unless internal authentication is configured.
- The included Supabase migration enables RLS and explicitly revokes `anon` and `authenticated` Data API access on operational tables when it is applied to the project.

An internal deployment must use real authentication before shared backend access is re-enabled. Never place an internal API token or service-role credential in `site/` or any other browser-delivered file.

The current operational demo proves the daily-work foundation:

1. Compact universal entry with typo-tolerant search
2. Direct access to Customer, Items, Tooling, Quotes, Orders, Inventory, and Rig/BOM workspaces
3. A streamlined Customer Profile with customer facts, complete purchase history, confirmed rigs, Tooling DNA, calibration history, and interactions
4. Direct serial-to-BOM navigation
5. Workspace overlays that preserve the employee's place
6. Full B57 `2025023` and B37X `2025028` serial BOM navigation: 25 sections, 162 assemblies, 1,400 relationships, 980 searchable rig items, and Where Used detail
7. Full flexible tooling search: 1,253 indexed records plus current WS004 supplements for Drive Caps, Split Spoons, HEX-COR / STD Duty, and Moyno
8. Executable family controls for Drive Cap, HSA Auger, Split Spoon, HEX-COR / STD Duty, and Moyno
9. Editable public-sandbox fields for on-hand, allocated, bin, and unit price across Inventory, BOM detail, and Tooling detail; these edits stay on the visitor's device
10. A source-derived Item List and Item Card that connect Tooling, Inventory, Quotes, Orders, and serial BOM Where Used records through the same part identity
11. Calibration-to-quote handoff and persistent browser-local Quote and Order workspaces with quantity, price, discount, freight, and totals
12. Business Central-style order execution with visible Open, Release, Reserve, Reopen, Ship, Invoice, and Close actions; ordered, available, reserved, shipped, invoiced, and shortage quantities remain distinct
13. An order activity timeline that records who released, reserved, shipped, invoiced, reopened, or closed the order without changing GP's role as transactional authority

Order entry never deducts inventory. Releasing an order reserves available stock; posting a shipment moves reserved quantity out of on-hand inventory; and invoicing is limited to quantity already shipped. Partial shipments, partial invoices, and shortages stay visible until the order is complete.

The browser demo uses normalized records generated from the repository source set. The B57/B37X BOM hierarchy and tooling catalog depth are real source-derived demo data; current GP verification is still pending wherever the source says so. Inventory quantities, prices, quote values, and customer details remain editable demo values and are not production truth. The site does not load or expose the raw files in repository-level `docs/` or `data/`, and it does not claim live GP pricing, inventory, ordering, or invoicing.

Training and Knowledge Chapter surfaces are intentionally separate from the normal operational workspace. Current CTS, WS004, compatibility, safety, and authority rules remain execution controls behind the interface rather than user-facing training steps.

Tooling free-text ranking and its direct connection to the compatibility-guided
Browse Tooling selectors are frozen in
`docs/architecture/TOOLING_SEARCH_RANKING.md`. Exact part identity and direct
descriptions outrank family and alias evidence; source authority and active-part
status break close ties. Clear family intent such as `auger`, `drive cap`, or
`split spoon` routes into the existing controlled selector instead of producing
an unstructured result dump.

## Run the demo

Run `npm run dev`, then open `http://127.0.0.1:4173/`. The included
zero-dependency server publishes only `site/`, supplies the required content
types, and disables stale shell caching during local exploration. No build step
is required.

The approved normalized catalogs also have generated JavaScript bootstrap copies
so repository Explore/file preview can start without browser permission to fetch
local JSON. Run `npm run build:catalog-bootstrap` after changing either normalized
JSON catalog. Hosted and GP-connected environments can still use the JSON/API
paths; this bootstrap is only the static demo seed. Optional IndexedDB quote-file
storage is fail-open and no longer blocks the core MDB startup path.

