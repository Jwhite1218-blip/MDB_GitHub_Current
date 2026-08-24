# GP Reconnaissance & Read-Only Sync Prep

**Status:** discovery / staging only. No write-back to GP in this phase.
**Date opened:** 2026-08-24

MDB is the operational layer over Dynamics GP. GP remains the system of record.
Phase A is read-only: pull a snapshot of GP data into MDB staging tables, build
crosswalks to the MDB Item Master and customers, and verify matches before any
write-back is considered (Phase B+).

## Recon checklist (do these before any extract)

1. **GP version + build** - confirm the exact Dynamics GP version and service pack.
2. **Integration path** - eConnect, GP Web Services, or OData over SQL. Prefer
   structured APIs over direct DB writes.
3. **Read-only SQL access** - provision a GP SQL login with SELECT only, no DML.
4. **Field keys** - capture customer number, item number, site/warehouse, price
   level, UoM, and the GP-to-MDB field map for each entity.
5. **Identity / auth** - document the Entra/AD service account and credentials store.
6. **Network path** - VPN/firewall route from Netlify Functions to GP. Netlify is
   serverless, so a GP-side endpoint (API gateway / tunnel) is required; Netlify
   cannot reach a LAN-only SQL box directly.
7. **Dry-run extract** - order: customers -> items -> inventory -> pricing.
   Stage each into the `_staging` tables and record a `gp_sync_runs` row.
8. **Crosswalks** - suggest matches, then a human verifies before status moves to
   `verified`. Only verified crosswalks feed operational tables.

## Staging schema (see migration `20260824030000_gp_sync_foundation.sql`)

- `gp_sync_runs` - one row per sync attempt (status, counts, summary).
- `gp_customers_staging`, `gp_items_staging`, `gp_inventory_staging`,
  `gp_pricing_staging` - raw GP snapshots, append-only per run.
- `customer_gp_crosswalk`, `item_gp_crosswalk` - GP key <-> MDB key links with
  `match_status` (pending / suggested / verified / rejected) and `confidence`.

All staging/crosswalk tables are RLS-locked to the service role, identical to the
operational tables. The browser never touches them.

## Recon function

`netlify/functions/gp-sync-recon.js` (GET) returns the checklist plus current
staged-table counts. Fail-closed behind `MDB_INTERNAL_API_TOKEN`.

## Integration boundary (non-negotiable)

- Read-only first. No GP writes until Phase B and only after crosswalks verified.
- Prefer GP Web Services / eConnect over direct SQL writes.
- GP remains transactional authority for pricing, inventory, orders, invoices.
- MDB suggests; GP confirms.

## Phases

- **Phase A (this prep):** read-only staging + crosswalks. No operational impact.
- **Phase B:** one controlled write-back (MDB Quote Draft -> GP Quote, capture GP doc number).
- **Phase C:** expand to orders / ship / invoice only after Phase B proven stable.