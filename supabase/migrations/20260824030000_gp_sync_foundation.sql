-- GP read-only sync foundation (discovery / staging only).
-- Phase A: read-only GP -> MDB staging. No write-back to GP in this phase.
-- Tables hold a snapshot of GP data plus crosswalks linking GP keys to MDB
-- Item Master / customer records. RLS mirrors the operational lockdown: only
-- the service role (Netlify Functions) can read or write these.

create table if not exists public.gp_sync_runs (
  id bigint generated always as identity primary key,
  run_id text not null unique,
  direction text not null default "gp_to_mdb",
  status text not null default "running" check (status in ("running","succeeded","failed","partial")),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  records_staged int not null default 0,
  error text,
  summary jsonb not null default "{}"::jsonb
);
create table if not exists public.gp_customers_staging (
  id bigint generated always as identity primary key,
  sync_run_id bigint references public.gp_sync_runs(id) on delete cascade,
  gp_customer_id text not null, customer_number text, name text,
  address1 text, address2 text, city text, state text, zip text,
  source_updated_at timestamptz, staged_at timestamptz not null default now(),
  raw jsonb not null default "{}"::jsonb
);
create index if not exists gp_customers_staging_gp_id on public.gp_customers_staging(gp_customer_id);

create table if not exists public.gp_items_staging (
  id bigint generated always as identity primary key,
  sync_run_id bigint references public.gp_sync_runs(id) on delete cascade,
  gp_item_id text not null, item_number text, description text, item_class text, uom text,
  standard_cost numeric(14,4), list_price numeric(14,4),
  source_updated_at timestamptz, staged_at timestamptz not null default now(),
  raw jsonb not null default "{}"::jsonb
);
create index if not exists gp_items_staging_gp_id on public.gp_items_staging(gp_item_id);

create table if not exists public.gp_inventory_staging (
  id bigint generated always as identity primary key,
  sync_run_id bigint references public.gp_sync_runs(id) on delete cascade,
  gp_item_id text not null, item_number text, site text,
  qty_on_hand numeric(14,3) not null default 0, qty_allocated numeric(14,3) not null default 0,
  source_updated_at timestamptz, staged_at timestamptz not null default now(),
  raw jsonb not null default "{}"::jsonb
);
create index if not exists gp_inventory_staging_gp_id on public.gp_inventory_staging(gp_item_id);

create table if not exists public.gp_pricing_staging (
  id bigint generated always as identity primary key,
  sync_run_id bigint references public.gp_sync_runs(id) on delete cascade,
  gp_item_id text not null, price_level text, unit_price numeric(14,4) not null default 0,
  source_updated_at timestamptz, staged_at timestamptz not null default now(),
  raw jsonb not null default "{}"::jsonb
);
create index if not exists gp_pricing_staging_gp_id on public.gp_pricing_staging(gp_item_id);

create table if not exists public.customer_gp_crosswalk (
  id bigint generated always as identity primary key,
  mdb_customer_id bigint, gp_customer_id text not null unique, gp_customer_number text,
  match_status text not null default "pending" check (match_status in ("pending","suggested","verified","rejected")),
  confidence numeric(3,2) not null default 0, verified_by text, verified_at timestamptz, notes text
);

create table if not exists public.item_gp_crosswalk (
  id bigint generated always as identity primary key,
  mdb_item_id bigint references public.items(id) on delete cascade,
  gp_item_id text not null unique, gp_item_number text,
  match_status text not null default "pending" check (match_status in ("pending","suggested","verified","rejected")),
  confidence numeric(3,2) not null default 0, verified_by text, verified_at timestamptz, notes text
);

-- Lockdown (same pattern as operational tables).
alter table public.gp_sync_runs enable row level security;
alter table public.gp_customers_staging enable row level security;
alter table public.gp_items_staging enable row level security;
alter table public.gp_inventory_staging enable row level security;
alter table public.gp_pricing_staging enable row level security;
alter table public.customer_gp_crosswalk enable row level security;
alter table public.item_gp_crosswalk enable row level security;
revoke all on public.gp_sync_runs from anon, authenticated, public;
revoke all on public.gp_customers_staging from anon, authenticated, public;
revoke all on public.gp_items_staging from anon, authenticated, public;
revoke all on public.gp_inventory_staging from anon, authenticated, public;
revoke all on public.gp_pricing_staging from anon, authenticated, public;
revoke all on public.customer_gp_crosswalk from anon, authenticated, public;
revoke all on public.item_gp_crosswalk from anon, authenticated, public;
grant select, insert, update on public.gp_sync_runs to service_role;
grant select, insert, update, delete on public.gp_customers_staging to service_role;
grant select, insert, update, delete on public.gp_items_staging to service_role;
grant select, insert, update, delete on public.gp_inventory_staging to service_role;
grant select, insert, update, delete on public.gp_pricing_staging to service_role;
grant select, insert, update on public.customer_gp_crosswalk to service_role;
grant select, insert, update on public.item_gp_crosswalk to service_role;