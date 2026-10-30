# Production opportunity: material readiness before scheduling

Related Scout Two finds: [BOM import traceability and revision-impact preview](BOM_SCOUT_OPPORTUNITIES.md). Saved concepts with proposed experiments; neither has runtime verification yet.

Status: **tested external mechanisms; proposed MDB integration, not implemented**. Prepared 2026-09-09 against GitHub main `8dad0b638e0afcb1997ae8f793f7d43844185b79`. This is an engineering handoff, not a change to production authority or controlled BOM/CTS rules.

## Why this deserves attention

Gubbins has reusable discrete-parts logic that calculates how many units can be built from a component graph, identifies limiting parts, and plans subassembly draws without double-counting shared raw material. PyJobShop can then sequence material-feasible work against machine constraints. Together they could help MDB answer: **what can we build, what is stopping more, and how might we schedule it?**

Synthetic evidence: 12 shafts, 70 flights and 18 bearings; each test auger needs one shaft, six flights and two bearings. Gubbins correctly returned nine units limited by bearings. Increasing bearings to 24 shifted the ceiling to eleven units limited by flights. These are invented quantities and a simplified example, not an approved MDB auger BOM.

The actual nine-unit result fed a PyJobShop experiment with 27 operations. Prep/weld/inspection took assumed 2/4/1 arbitrary time units, and the solver reached the independently known optimum of 39 with no machine overlaps. This does not establish actual shop throughput or savings.

## Start small inside the existing workflow

Keep the current chain: Sales Order line → Build Request → Build Order → inventory postings. Operations Job continues to own shared schedule/capacity visibility. GP remains transactional authority under the existing reconciliation contract.

**First deliverable: an advisory Material readiness panel on the existing open Build Order.** Start with one controller-approved auger BOM and discrete whole-unit parts. No new standalone inventory app, reservations, auto-release, or scheduling service in this first slice.

Suggested panel content:

> Material readiness — advisory snapshot
>
> Requested: 10 · Buildable from available components: 9
>
> Bearings: need 20, available 18, shortage 2
>
> Snapshot checked at [time]. Components are not reserved by this preview.

Show **Needs verification** rather than a buildable number if BOM authority, part mapping, unit compatibility, stock freshness or required quantities are missing. A missing stock record is unknown, not automatically zero. Do not label this “Ready to release”; the real release transaction must recheck stock and permissions.

## Concrete code touchpoints

- `site/app.js`: existing Build Order rendering and controller actions. Add the small panel here when implementing; avoid a new parallel production screen.
- `netlify/functions/production-control.mts`: existing authenticated operations include `update_build_draft`, `transition_build`, and `post_progress`. A future read-only readiness operation is a proposal, not an endpoint that currently exists. Authorize it server-side for existing allowed viewers.
- `netlify/functions/_production-control.js`: shared production role/lifecycle rules. Preserve controller release authority.
- Existing release RPC `mdb_transition_build_order_v1` calculates available stock as on-hand minus allocated, reserves components, and authorizes shop execution. Do not replace or bypass it with client-side preview math.
- `test/production-control.test.js`, `test/production-control-foundation.test.js`, and `test/production-control-database.test.js`: regression coverage touchpoints for the eventual integration, not newly passed tests in this handoff.

The proposed adapter should accept an already-authorized snapshot containing Build Order ID, requested quantity, BOM/source revision, stock timestamp and per-component stable part IDs, per-output quantity, on-hand and allocated quantities. Compute from available-to-this-order stock, with explicit handling of this order's own reservations if released orders are supported later. Start with open, unreserved orders to avoid that ambiguity.

Return advisory buildable quantity, limiting parts, per-part needed/available/shortfall and verification issues. Reject cycles, duplicate or inconsistent part definitions, non-finite/negative values, and incompatible units at the boundary. Capture the stock/BOM provenance in the result so stale previews can be recognized.

## Acceptance criteria for the first implementation

1. The nine-unit fixture above passes; requesting ten shows a two-bearing shortage.
2. Allocations to other orders reduce availability. Two previews cannot promise the same stock as two reservations; release remains authoritative and rechecks concurrent changes.
3. A changed BOM or stale/unverified stock snapshot invalidates the preview. Reopening does not silently reuse an old result.
4. Missing parts/mappings and fractional or incompatible units show Needs verification, never a confident readiness result.
5. Viewing/calculating readiness does not mutate Build Orders, stock, reservations, dates or ledger entries. Existing role and posting tests remain green.
6. The controller can compare the preview with one representative shop worksheet before wider rollout.

## Grow only when the workflow earns it

1. **Material preview:** direct components, one verified BOM, read-only stock snapshot; compare with manual decisions.
2. **Nested assemblies:** add the shared-part roll-up after one real nested case validates its need. Preserve item/BOM revision and location constraints; independently reconcile totals.
3. **Schedule suggestions:** use reviewed routings, durations, machines, workers, shifts, breaks and setup times. Feed feasible quantities to an isolated PyJobShop adapter. Return a proposed schedule for controller review; never overwrite committed dates automatically. Explain infeasible cases and bottlenecks.
4. **Lots and consumption:** evaluate Gubbins' batch planners only when authorized data supports them. Earliest expiry selection is not an expired-stock safety gate. Actual consumption and output remain MDB's existing transactional postings.

Before an operational pilot, choose authoritative stock freshness rules, one approved auger configuration, and the actual routing with the production controller. Measure preview/manual agreement, shortages caught, and planning effort; do not promise ROI from synthetic tests.

## Evidence and restrictions

- Gubbins https://github.com/BootBlock/Gubbins pinned at `71ffeafc14fa53459be6bb9c3c1042a835d18af2`; package.json says 0.32.0 while README says 0.3.0. Upstream Joe Cox/contributors, MIT. Preserve license/attribution if adopting source; Localis does not own upstream code.
- Tested unchanged pure modules: `src/features/inventory/kit-availability.ts`, `kits.ts`, `stock.ts`, `batches.ts`. Twelve of thirteen scenario checks passed; one included 100 shared-material cases. No Gubbins UI/database/sync/upgrade verification.
- **Confirmed defect:** nested roll-up reports one output for 1 kg stock with a 0.25 kg requirement although the assembly planner accepts four. Do not use fractional/gauge roll-up without a fix and regression tests.
- README warns pre-1.0 schema changes may require resetting local data. Borrow tested logic through a narrow adapter; importing Gubbins' entire app/database is not the proposed starting point.
- PyJobShop 0.0.9 / OR-Tools was used in the synthetic handoff; it is not installed in MDB and is not ready to be placed into a Netlify request handler without a runtime/latency decision.
- Attached [test results](../evidence/scout-gubbins/gubbins-results.json) and [material-to-schedule output](../evidence/scout-gubbins/material-to-schedule.json). Full [round report](../evidence/scout-gubbins/ROUND-004-RESULTS.md) preserves scope. Reproducible harness source accompanies those files; restore the pinned upstream checkout and round-001 dependencies as described in its provenance note.

Rollback for the future first slice is removal/disablement of the advisory panel and read-only endpoint. No schema or posting behavior should need rollback. This handoff itself changes documentation only.
