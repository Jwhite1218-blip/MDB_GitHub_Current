# Save Point 001 — Mobile Drill Brain (MDB)

**Date:** 2026-08-16
**Live site:** https://mobiledrilldemo.netlify.app (now password-protected — see below)
**Repo:** github.com/Jwhite1218-blip/MDB_GitHub_Current
**Latest commit:** `bbd14a6`

Written because today closes out a major phase — MDB went from a static demo
to having its first real, shared backend — and the next session should pick
up knowing exactly where things stand.

---

## What this app actually is

Not just a demo. MDB's real, stated purpose (confirmed by the user this
session): the company runs Dynamics GP as its ERP system of record, GP is
aging and will eventually lose Microsoft support, and MDB's long-term job —
with management's explicit blessing — is to slowly absorb GP's functions and
become a free, custom, Mobile-Drill-specific replacement for it. Every
architecture decision from here on should be made with that trajectory in
mind, not just "good enough for a demo."

Stack: static HTML/CSS/JS frontend (`site/`, no build step), Netlify
Functions backend (`netlify/functions/`), Supabase (Postgres) for the first
real shared data. Everything else still runs on browser localStorage.

## What shipped this session

**Calibration Training rebuilt on real source material.** Read the actual
Module 001–010 PDFs (SPT calibration technician training curriculum) instead
of guessing. Real 8-scenario pass/fail evaluation with actual mandatory
retrain triggers, do-not-promise rules from Module 008, approved N60 field
language. Full rep roster (11 reps, 5 admin-flagged), admin PIN gate,
per-rep locking with admin-only reopen, email-on-submit via Resend (function
built and ready, `RESEND_API_KEY` still not configured — pending from user).
**Currently flagged off** (`calibIdentityGateEnabled = false` in `app.js`)
at the user's request so people pressure-testing the demo aren't blocked by
a name picker mid-evaluation. Flip that one constant when ready to run it
as real tracked training.

**Advanced Search.** Global popup (Type/Field/Condition/Value), mirrors the
Dynamics GP advanced-lookup pattern reps already use daily, so a familiar
interaction becomes the door into MDB's real search engine. Reachable from
anywhere, including from inside a customer's Tooling panel, without
disturbing what's open underneath.

**Rep identity promoted to a shared, app-wide system.** No longer
Calibration-Training-specific — it's a header-level "who am I" control
(`state.identity`) used for attribution everywhere. Per the user: this
pattern is meant to be reused anywhere MDB needs to know who's using it.

**Quotes rebuilt as a real multi-quote, multi-rep system**, then matched to
GP's actual form layout after the user shared real Quote/Order PDFs:
- Status lifecycle (Open/Won/Lost/Archived), originator + last-modified-by
  tracking, collapsible "All Open" and "Mine" lists
- Popup editor any rep can open and edit, with embedded Tooling/Rig Parts
  search-to-add (qty defaults to 1, silently clamped 1–5000)
- Ship To (separate from Bill To), Payment Terms / Shipping Method as
  defined dropdowns, Req Ship Date, Misc, Trade Discount, Master No.
  (shared running number), line UOM, line Discount as flat $ not %
- **Tax Rate removed entirely as a rep-editable field** — finance sets it
  centrally in GP based on ship-to destination, reps never see a rate in
  real life, so the summary just says "Calculated by GP"

**Orders added as its own workspace**, same shape as Quotes. Two ways in:
- **Change To → Order** on an open quote — never blocks. Silently checks
  each line against real on-hand inventory, splits shipped/backorder,
  deducts what ships, flips the quote to Won (drops off Open Quotes,
  mirrors GP's file-change-to-order), tells the rep afterward which PNs
  came out backordered.
- **Start New Order** from scratch — entering a quantity that would take
  inventory negative triggers a blocking Yes/No confirmation naming the
  specific PN. "No" reverts and returns to the form; "Yes" proceeds with
  the backorder recorded. This distinction (conversion never blocks,
  from-scratch does) was an explicit correction from the user mid-session —
  worth remembering if this area gets touched again.
- **Backorder means "production has to build it," not "partial shipment."**
  Real business meaning confirmed by the user — a signal reps act on
  outside MDB, not decoration.

**Real backend added — Supabase (Postgres), not Firebase, not Salesforce.**
Chosen deliberately because it's the same category of relational database
GP itself runs on, which matters given the GP-replacement trajectory.
Accessed *only* through Netlify Functions using the service_role key —
the browser never talks to Supabase directly. Scope: Quotes, Orders,
Inventory. Everything else (Rig Sales opportunities, Calibration results,
customer records) is still localStorage-only.

**Inventory made shared** — this was the real gap behind Orders' backorder
logic: it checks on-hand stock, but until today that stock only existed
per-browser. `inventory_stock` is a sparse override table — a part with no
row still uses the existing deterministic demo seed (same fake numbers for
everyone, hashed from the part number), so only actually-edited parts need
to sync.

**Site-wide password gate turned on**, closing the "anyone on the internet
can hit the app or its raw Function endpoints with zero credentials" gap.
Password: `MobileDrill2026`. Deliberately the fast/no-code option, not real
per-rep auth — the identity picker still lets anyone claim to be anyone once
past the gate. User chose this specifically because he'd already shared the
live link with external testers and didn't want to disrupt them with real
accounts.

## Infrastructure gotchas (don't re-debug these)

- **`service_role` bypasses Row Level Security but NOT ordinary Postgres
  table grants.** Hit this live — "permission denied for table quotes" —
  needed explicit `GRANT ... TO service_role` statements even though
  service_role is meant to be the all-access key. Baked into `schema.sql`
  now.
- **The Netlify env-var tool's `envVarIsSecret: true` flag silently drops
  the value** — tested reproducibly (set it twice, value never persisted;
  set as non-secret, worked immediately). Both `SUPABASE_URL` and
  `SUPABASE_SERVICE_KEY` are stored as regular (non-secret) env vars on the
  real site. Low risk since it's a single-member Netlify team.
- **Background "refresh on workspace open" can race a just-created
  record.** Opening Quotes/Orders kicks off a background refetch to pick up
  other reps' changes. If a new quote/order's debounced save (600ms) hadn't
  landed yet when that refetch resolved, a naive replace would silently
  wipe the unsaved record from memory. Fixed by merging — any local record
  not yet present in the server response is kept until it actually shows up
  there. Same fix applied to `loadQuotes()`, `loadOrders()`; the same
  defensive pattern was applied proactively to Inventory's merge too.
- **Master No. and Order/Quote numbers are server-assigned, never
  client-generated**, via shared Postgres sequences (`master_no_seq`,
  `order_no_seq`). The client omits these fields entirely on first save;
  Postgres applies its `nextval()` default; the resulting value comes back
  in the save response and gets remembered client-side for every later
  edit of that record. Don't let the client start inventing these again.
- **Migration order matters** if this Supabase project is ever rebuilt from
  scratch: `supabase/schema.sql`, then `migrations/0002_gp_fields.sql`,
  then `migrations/0003_orders.sql`, then `migrations/0004_inventory.sql`,
  in that order.
- **Netlify deploys aren't always picked up from `git push` alone within
  the same session** — when in doubt, trigger explicitly via
  `npx @netlify/mcp@latest --site-id <id> --proxy-path <path>` run from
  the actual repo directory (not whatever directory the shell happens to
  default to).

## Open / not yet built

- **Real per-rep authentication.** Today's password gate is a stopgap.
  Attribution (originator/last-modified) has zero enforcement — anyone past
  the password can click any rep's name.
- **Real customer data.** The customer directory is still 100% fictional
  demo names (Advanced Foundation Testing, etc.), just with GP-style
  customer codes bolted on. Won't feel real to reps until real GP customers
  are imported — a deliberately separate, bigger conversation.
- **Printable Quote/Order PDFs matching the real GP layout** — now genuinely
  buildable since we have the real PDFs as reference. Not started.
- **Resend `RESEND_API_KEY`** still not configured — Calibration Training's
  email-on-submit function is built and ready, waiting on the user to
  create a Resend account.
- **`mdb-loadtest.netlify.app`** (throwaway isolated site used for one
  OctoPerf load-testing pass) is still live. Asked about cleanup twice, no
  answer — stop asking unless it becomes relevant again.
- Inventory, Rig Sales opportunities, and Calibration Training results are
  still localStorage-only. Quotes/Orders/Inventory-stock-overrides are the
  only real shared data so far — expanding further is a real scope decision,
  not a given.

## Why this save point exists

Pausing for the day — explicit ask from the user to pick back up tomorrow.
Nothing here is blocked; this is a natural, clean stopping point after
closing out the Quotes → Orders → Inventory backend arc.
