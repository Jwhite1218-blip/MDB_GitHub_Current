# GP Discovery and Reconciliation Checklist

Status: read-only discovery and staging. GP remains the transactional authority.

The implementation contract is maintained in
`docs/architecture/GP_READ_ONLY_SYNC_FOUNDATION.md`. This checklist records the
company-specific facts required before the existing receiver can accept live
GP data.

## Environment discovery

- Confirm the exact Dynamics GP version, build, company databases, and active
  companies.
- Identify the company-approved read path: read-only SQL views, API, or bounded
  export.
- Provision a dedicated read-only identity. Do not reuse employee credentials,
  the Supabase service key, or an MDB browser token.
- Confirm the GP-side extractor host, outbound HTTPS route, credential store,
  retry storage, and operating owner.
- Record the approved synchronization window, maximum acceptable lag, and
  escalation path when the extractor or GP source is unavailable.

## Source behavior

- Capture row counts and change rates by company and entity.
- Identify stable keys, source-modified timestamps, timezone behavior, and
  decimal precision.
- Document inactive, discontinued, void, close, delete, and snapshot-absence
  semantics.
- Confirm location/site identity and units of measure.
- Determine which fields are authoritative in GP and which remain controlled
  by CTS, WS004, serial BOM, or MDB workflows.

## Pilot data

1. Produce redacted Item and Inventory samples first.
2. Freeze the initial versioned mapping as `mdb-gp-map-1`.
3. Run a full snapshot and reconcile source counts to landing counts.
4. Run a no-change repeat and confirm it creates no false history.
5. Run changed, stale, duplicate, malformed, batch-gap, and replay cases.
6. Validate multi-company isolation, locations, decimals, timestamps, voids,
   and delete behavior.
7. Promote only reconciled Item and Inventory facts into typed read models.
8. Add Customer, Sales Order, and Invoice entities only after the pilot is
   signed off.

## Non-negotiable boundary

- No browser connection to GP.
- No inbound exposure of GP SQL to Netlify or the public internet.
- No automatic landing-to-canonical promotion.
- No inference that a missing snapshot row means deleted.
- No GP create, edit, post, delete, or write-back operation.
