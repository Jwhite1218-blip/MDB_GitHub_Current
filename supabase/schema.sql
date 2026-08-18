-- MDB Quotes schema (Supabase / Postgres)
--
-- This is accessed ONLY through authenticated Netlify Functions using the
-- Supabase service_role key (server-side, never exposed to the browser).
-- Row Level Security stays enabled as defense in depth and anon/authenticated
-- Data API grants are explicitly revoked.
--
-- Run this once in the Supabase SQL editor (or via `supabase db push`
-- once a CLI project is linked) to set up the tables.

-- Shared internal running record number (mirrors GP's "Master No." field).
-- Used by both quotes and, eventually, orders -- one sequence, one number
-- space, regardless of which document type draws the next value.
create sequence if not exists master_no_seq start 80000;

create table if not exists quotes (
  id text primary key,
  number text not null,
  master_no bigint not null default nextval('master_no_seq'),
  customer_id text not null default '',
  customer_po text not null default '',
  salesperson text not null default '',
  workflow text not null default 'General',
  terms text not null default 'Net 30',
  ship_via text not null default 'Best Way',
  ship_to_contact text not null default '',
  ship_to_address text not null default '',
  req_ship_date date,
  notes text not null default '',
  misc numeric not null default 0,
  freight numeric not null default 0,
  trade_discount numeric not null default 0,
  status text not null default 'Open' check (status in ('Open', 'Won', 'Lost', 'Archived')),
  originator_initials text not null default '',
  originator_name text not null default '',
  last_modified_by_initials text not null default '',
  last_modified_by_name text not null default '',
  created_at timestamptz not null default now(),
  last_modified_at timestamptz not null default now()
);

create table if not exists quote_lines (
  id bigint generated always as identity primary key,
  quote_id text not null references quotes(id) on delete cascade,
  sort_order int not null default 0,
  part text not null default '',
  description text not null default '',
  category text not null default '',
  uom text not null default 'EA',
  quantity int not null default 1 check (quantity between 1 and 5000),
  unit_price numeric not null default 0,
  discount numeric not null default 0,
  taxable boolean not null default false,
  source text not null default 'MDB demo'
);

create index if not exists quote_lines_quote_id_idx on quote_lines (quote_id);
create index if not exists quotes_status_idx on quotes (status);
create index if not exists quotes_created_at_idx on quotes (created_at desc);

-- Order numbers (GP format: ORD + digits, e.g. ORD0069246).
create sequence if not exists order_no_seq start 69000;

create table if not exists orders (
  id text primary key,
  order_number text not null default ('ORD' || lpad(nextval('order_no_seq')::text, 7, '0')),
  master_no bigint not null default nextval('master_no_seq'),
  converted_from_quote_id text,
  customer_id text not null default '',
  customer_po text not null default '',
  salesperson text not null default '',
  terms text not null default 'Net 30',
  ship_via text not null default 'Best Way',
  ship_to_contact text not null default '',
  ship_to_address text not null default '',
  req_ship_date date,
  notes text not null default '',
  misc numeric not null default 0,
  freight numeric not null default 0,
  trade_discount numeric not null default 0,
  weight_lbs numeric not null default 0,
  length_in numeric not null default 0,
  width_in numeric not null default 0,
  height_in numeric not null default 0,
  status text not null default 'Open' check (status in ('Open', 'Closed')),
  originator_initials text not null default '',
  originator_name text not null default '',
  last_modified_by_initials text not null default '',
  last_modified_by_name text not null default '',
  created_at timestamptz not null default now(),
  last_modified_at timestamptz not null default now()
);

create table if not exists order_lines (
  id bigint generated always as identity primary key,
  order_id text not null references orders(id) on delete cascade,
  sort_order int not null default 0,
  part text not null default '',
  description text not null default '',
  category text not null default '',
  uom text not null default 'EA',
  quantity int not null default 1 check (quantity between 1 and 5000),
  shipped_qty int not null default 0,
  backorder_qty int not null default 0,
  unit_price numeric not null default 0,
  discount numeric not null default 0,
  taxable boolean not null default false,
  source text not null default 'MDB demo'
);

create index if not exists order_lines_order_id_idx on order_lines (order_id);
create index if not exists order_lines_category_idx on order_lines (category);
create index if not exists orders_status_idx on orders (status);
create index if not exists orders_created_at_idx on orders (created_at desc);

-- Inventory is a SPARSE OVERRIDE table -- a part with no row here just uses
-- the existing deterministic demo seed (same fake on-hand/allocated/bin/price
-- for everyone, computed from a hash of the part number, no sync needed). A
-- row only gets created here once a rep actually edits a part's stock, which
-- is the one thing that genuinely needs to be shared across the team.
create table if not exists inventory_stock (
  part text primary key,
  on_hand numeric not null default 0,
  allocated numeric not null default 0,
  bin text not null default '',
  unit_price numeric not null default 0,
  last_modified_by_initials text not null default '',
  last_modified_by_name text not null default '',
  last_modified_at timestamptz not null default now()
);

alter table public.quotes enable row level security;
alter table public.quote_lines enable row level security;
alter table public.orders enable row level security;
alter table public.order_lines enable row level security;
alter table public.inventory_stock enable row level security;

revoke all on table public.quotes from anon, authenticated, public;
revoke all on table public.quote_lines from anon, authenticated, public;
revoke all on table public.orders from anon, authenticated, public;
revoke all on table public.order_lines from anon, authenticated, public;
revoke all on table public.inventory_stock from anon, authenticated, public;

-- service_role bypasses Row Level Security but NOT ordinary table grants.
-- Keep its grants limited to the operations used by the server-side Functions.
grant usage on schema public to service_role;
revoke all on public.quotes from service_role;
revoke all on public.quote_lines from service_role;
revoke all on public.orders from service_role;
revoke all on public.order_lines from service_role;
revoke all on public.inventory_stock from service_role;
grant select, insert, update on public.quotes to service_role;
grant select, insert, update, delete on public.quote_lines to service_role;
grant select, insert, update on public.orders to service_role;
grant select, insert, update, delete on public.order_lines to service_role;
grant select, insert, update on public.inventory_stock to service_role;
grant usage, select on all sequences in schema public to service_role;
