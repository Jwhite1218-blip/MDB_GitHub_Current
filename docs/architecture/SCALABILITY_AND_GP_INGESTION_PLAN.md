# Scalability and GP Ingestion Plan

## Outcome

MDB should scale by separating five workloads that are currently close together:

```text
GP landing -> reconciliation -> canonical operational records -> read/search projections -> user workflows
```

Raw GP payloads are evidence. Canonical records are controlled business facts.
Search projections are disposable, rebuildable read models. Quotes, Orders,
Production Control, and service requests are audited workflows. One table or
one browser payload should not be forced to serve all five purposes.

## Current measured envelope

As of this plan:

- Tooling contains about 1,756 searchable records and is loaded into browser
  memory from a roughly 1.81 MB JSON file.
- Rig Parts is loaded from a roughly 2.05 MB JSON file.
- `site/app.js` is roughly 323 KB and still owns most application behavior.
- Item loading pages through the entire Item table inside one function and then
  sends the combined result to the browser.
- Inventory, known-customer, Quote, Order, and Build list routes still return
  whole result sets or whole parent records with all nested detail.
- Search and most list filtering happen in browser memory.

That is appropriate for the current controlled catalog/demo envelope. It is not
the read architecture for a complete GP database. Supabase's default row limit
also means unpaged Data API calls can return a plausible-looking partial result.

## Data ownership

| Fact | Initial authority | MDB behavior |
| --- | --- | --- |
| Current GP item financial/status facts | GP | Stage, reconcile, project read-only |
| Inventory by GP location | GP | Stage and project; no browser-authored override in production |
| GP customer/order/invoice facts | GP | Stage and link to MDB workflow identity |
| Tooling compatibility | CTS / WS004 | Preserve as a separate control layer |
| Rig usage and Where Used | Serial BOM | Preserve serial/BOM authority |
| Build acceptance and shop release | MDB Production Control | Keep MDB audited gatekeeper workflow |
| Sales assistance and Quote-Prep | MDB | Use verified read models; do not silently post to GP |
| Future field-service request | MDB Mobile Lite | Create a triage request, never a direct GP order |

## Scale architecture

### 1. Landing

The v2 GP receiver uses bounded 1-500 record batches, idempotency keys,
per-entity batch sequences, per-entity cursors, expected counts, mapping
versions, and changed-state history. Landing tables are server-only.

### 2. Reconciliation

Versioned mapping rules compare source identities to MDB identities. Unknown,
ambiguous, stale, deleted, or authority-conflicting records create explicit
issues. A source row is not promoted simply because it arrived successfully.

### 3. Canonical operational records

Use typed, indexed tables for business reads. Do not query raw JSON payloads for
normal application screens. Inventory must become location-aware rather than a
single sparse part override. Canonical promotion must be idempotent and retain
the source-record link and mapping version that produced it.

### 4. Read and search projections

Move large-list behavior to server-side filtering and keyset/cursor pagination.
Return compact summaries for lists and fetch full detail only when an item,
customer, quote, order, or build is opened. Search projections may combine Item
identity, approved aliases, CTS family evidence, and serial/BOM evidence while
preserving the ranking and compatibility controls already built.

### 5. Workflow services

State-changing Quotes, Orders, Production Control, and inventory posting remain
small authenticated commands/RPCs with idempotency and audit events. They do
not accept a copied client-side object as authority for the entire record.

## Engineering tripwires

These are conversion triggers, not claims about current GP counts:

| Trigger | Required change before crossing it |
| --- | --- |
| Any list response approaches 5 MB | Summary endpoint plus detail-on-open |
| More than 10,000 searchable Items | Server search, keyset pagination, bounded client cache |
| More than 25,000 inventory-location rows | Location-aware canonical table and paged inventory API |
| More than 10,000 Quotes/Orders/Builds or 50,000 lines | Paged headers; lines/events loaded by selected document |
| Any normal query p95 exceeds 300 ms | Capture `EXPLAIN ANALYZE`, review query/index, set an SLO |
| Changed-source history reaches 5 million rows | Retention/archive and time/company partition review |
| A sync cannot finish inside its agreed window | Parallelize by entity/batch, then tune database and connector |
| Database/API payload limit is raised to make a screen work | Stop and redesign the query instead |

The real thresholds should be recalibrated after collecting GP row counts,
change rates, payload sizes, peak users, and acceptable synchronization lag.

## Read API conversion pattern

Every growing collection should converge on this contract:

- explicit `limit` with a low maximum;
- stable indexed ordering;
- opaque cursor/keyset rather than deep offset pagination;
- server-side query and status/location filters;
- compact list fields;
- `hasMore` and `nextCursor`;
- separate detail endpoint;
- cache validators for read-only facts where appropriate;
- no service-role key in the browser.

For the current UI, conversion order should be Item/Search, Inventory,
Customer duplicate-check, Quotes, Orders, then Builds. Tooling and Rig/BOM can
remain source-derived static projections until their update workflow moves into
the database; their compatibility authority must not be diluted during that
move.

## Connector deployment

The likely first extractor is a small company-managed Windows service or
scheduled task near GP. It uses an approved read-only GP login/view/export,
stores no employee credentials, sends outbound HTTPS batches, and persists its
own retry queue until the MDB endpoint confirms an idempotent receipt.

The connector needs health signals for last success, lag, row counts, rejected
batches, and credential expiry. A machine going offline must create a stale-data
warning in MDB; it must not make old inventory look current.

## Delivery sequence

### Slice A - completed foundation

- GP landing contract v2
- per-entity cursors and completeness
- stale/duplicate/gap rejection
- changed-state lineage
- controller-only status summaries

### Slice B - GP discovery and Item/Inventory pilot

- exact GP version/company/read-path worksheet
- row counts and change-rate measurements
- redacted Item and Inventory samples
- versioned `mdb-gp-map-1`
- full/no-change/change/delete test runs
- signed reconciliation report

### Slice C - canonical projections and scalable reads

- controlled Item promotion
- inventory-by-location model
- paged server Item search preserving Tooling ranking/routing
- compact Inventory list and detail endpoints
- stale-data indicators in the UI

### Slice D - Customers and documents

- Customer identity reconciliation
- Sales Order/line and Invoice/line landing
- document summary/detail APIs
- links between GP documents and MDB sales/build workflows

### Slice E - operational hardening

- non-production and production environment separation
- backup/restore rehearsal
- connector retry and credential rotation
- load tests using measured GP-sized fixtures
- query plans, index review, SLO dashboards, retention jobs

### Slice F - eventual replacement evaluation

GP write-back or replacement is a separate program with financial controls,
posting rules, approvals, audit, cutover, and rollback. Read-sync success does
not authorize that phase automatically.
