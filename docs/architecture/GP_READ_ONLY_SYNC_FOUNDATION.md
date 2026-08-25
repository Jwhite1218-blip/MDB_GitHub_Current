# GP Read-Only Sync Foundation

## Decision

Microsoft Dynamics GP remains the transactional authority. MDB receives GP
facts through an inbound-only landing model, preserves their source lineage,
and reconciles them before any fact is promoted into an MDB operational model.
There is no GP create, edit, post, delete, or write-back route.

This is a production-shaped receiver, not a claim that live GP is connected.
The live connector still requires the company's exact GP version, company
databases, approved read method, source update fields, deletion/void rules, and
redacted sample records.

## Intended network topology

```text
GP SQL/views or approved export (company network, read-only account)
  -> company-managed extractor/service
  -> outbound HTTPS only
  -> MDB GP read-sync endpoint
  -> protected GP landing tables
  -> reconciliation and controlled promotion
  -> canonical MDB read models
```

The browser never connects to GP. GP SQL is never exposed inbound to Netlify or
the public internet. The extractor should run inside the company network under
a dedicated read-only identity and push bounded batches outward.

## Implemented server boundary

`POST /api/integrations/gp/read-sync` is authenticated with the server-only
`GP_SYNC_INGEST_TOKEN`. Contract version 2 retains the three-operation flow:

1. `start` creates an idempotent run with one or more entity plans. It returns
   the previous successful watermark for each entity.
2. `batch` accepts 1-500 normalized records for exactly one entity under a
   unique batch key and positive batch sequence.
3. `finish` succeeds only when every planned entity supplies its own ending
   watermark and an expected count equal to the unique records received.

The earlier v1 database functions remain installed for migration compatibility,
but the Netlify receiver now calls the v2 functions.

The employee-facing status route remains separate:

`GET /api/integrations/gp/status`

It requires Netlify Identity plus the server-managed `admin`,
`production_controller`, or `inventory_controller` role. It exposes run,
per-entity, cursor, and issue summaries but never raw GP payloads.

## V2 start contract

```json
{
  "operation": "start",
  "contractVersion": 2,
  "runKey": "MDB-ITEM-INVENTORY-2026-08-24T06:00:00Z",
  "companyId": "MDB",
  "connector": "gp_read_view",
  "mappingVersion": "mdb-gp-map-1",
  "entityPlans": [
    { "entityType": "Item", "syncMode": "Delta" },
    { "entityType": "Inventory", "syncMode": "Snapshot" }
  ],
  "metadata": { "extractorHost": "GP-CONNECTOR-01" }
}
```

`Delta` records require `sourceModifiedAt`. `Snapshot` permits a missing source
timestamp but still requires an ending watermark and exact record count at
finish. Absence from a snapshot does not automatically delete a record until
the company's GP deletion semantics are approved.

## Record envelope and identity

Raw and normalized values are retained side by side:

```json
{
  "externalId": "ITEM-100",
  "sourceModifiedAt": "2026-08-24T05:00:00Z",
  "deleted": false,
  "payload": {
    "ITEMNMBR": "ITEM-100",
    "ITEMDESC": "Source-preserved GP values"
  },
  "normalized": {
    "partNumber": "ITEM-100",
    "description": "MDB-normalized values"
  }
}
```

Non-deleted envelopes require these stable normalized identities:

| Entity | Required normalized identity |
| --- | --- |
| Customer | `customerNumber` |
| Item | `partNumber` |
| Inventory | `partNumber`, `locationCode` |
| SalesOrder | `orderNumber` |
| SalesOrderLine | `orderNumber`, `lineNumber` |
| Invoice | `invoiceNumber` |
| InvoiceLine | `invoiceNumber`, `lineNumber` |

Quantities, costs, and prices should be transported as decimal strings. That
avoids JavaScript floating-point changes before PostgreSQL applies the final
numeric type during controlled promotion.

A complete three-operation example is stored in
`docs/architecture/GP_READ_SYNC_V2_EXAMPLES.json`.

## Data model

The foundation migration adds the protected landing tables:

- `gp_sync_runs`: overall run identity, contract, mapping, and aggregate counts.
- `gp_sync_run_entities`: independent mode, starting/ending cursor, expected
  count, batch continuity, counts, and status for each entity.
- `gp_sync_batches`: immutable batch idempotency and sequence receipts.
- `gp_source_records`: latest observed source and normalized state per
  company/entity/external ID.
- `gp_source_record_versions`: append-only changed states, not a duplicate row
  for every unchanged observation.
- `gp_reconciliation_issues`: visible mapping and data-quality conflicts.
- `gp_sync_cursors`: last successful watermark per company and entity.

`20260824050559_gp_read_model_foundation.sql` installs v1. The additive
`20260824060551_gp_read_model_scale_foundation.sql` installs v2 and the scale
controls without deleting v1 receipts.

## Completeness and failure behavior

- Reusing a `runKey` is allowed only with the same company, connector, mapping,
  entity set, and entity modes.
- Reusing a batch key is allowed only with byte-equivalent normalized content,
  entity, and sequence.
- Batch sequences may arrive out of order, but a successful entity must contain
  a continuous sequence beginning at 1.
- The same external record cannot appear in different batches in one run.
- An equal or older GP source timestamp cannot replace different raw source
  content already received.
- A successful entity count must equal its unique received record count.
- Cursors advance only after all entities in the run succeed.
- Failed and incomplete runs retain their evidence and never advance cursors.
- Changed source states create history versions; unchanged re-observations do
  not inflate the history table.
- Every batch is atomic. A malformed record rejects the batch instead of
  creating a quiet partial import.

## Security boundary

All GP landing tables use RLS and explicitly revoke `anon`, `authenticated`, and
`public`. New Data API table access is explicitly granted only to
`service_role`, matching current Supabase table-exposure requirements. All GP
RPCs are `SECURITY INVOKER`; execute permission is revoked from browser roles.
The service key and GP ingest token must never appear in `site/`.

Required Netlify environment variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `GP_SYNC_INGEST_TOKEN`

Do not reuse an employee Identity token, Supabase service key, or another
internal-function token as the extractor credential.

## Controlled promotion boundary

Landing a GP record does not make it canonical MDB truth. Promotion requires a
versioned company mapping and reconciliation rules for:

- GP company and location identity
- part-number normalization and aliases
- status, inactive, discontinued, void, and deletion semantics
- units of measure and decimal precision
- customer identity and duplicate rules
- document type/status mapping
- timestamps and GP timezone behavior
- GP source authority versus CTS, WS004, serial BOM, and MDB workflow authority

Conflicts become reconciliation issues. They never silently overwrite CTS
compatibility, serial BOM usage, Production Control decisions, or MDB audit
history.

## Rollout sequence

1. Inventory the GP version, companies, counts, approved views/API/export,
   watermark fields, and delete/void rules.
2. Capture redacted examples and count totals for Item and Inventory first.
3. Freeze `mdb-gp-map-1` and test the examples against contract v2.
4. Apply both GP migrations to a non-production Supabase environment and grant
   only the explicit service-role access in the migrations.
5. Run a full snapshot, reconcile counts and values, then run no-change and
   changed delta passes.
6. Pressure-test replay, batch gaps, stale versions, malformed rows, duplicate
   pages, timezone, decimals, locations, deletions, and multi-company isolation.
7. Build controlled Item/Inventory promotion only after reconciliation is
   signed off.
8. Add Customer and sales/invoice documents after the first two entities are
   stable.

## Deliberately not implemented

- A live GP extractor or company-specific SQL/view mapping.
- Automatic landing-to-canonical promotion.
- Deletion inference from snapshot absence.
- GP scheduling or on-call notification delivery.
- Any GP write-back or replacement behavior.
