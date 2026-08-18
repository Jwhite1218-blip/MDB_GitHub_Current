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

-- One canonical operational record per part number. Tooling compatibility
-- remains governed by CTS/WS004; this table supplies the shared ERP facts.
create table if not exists items (
  id bigint generated always as identity primary key,
  part_number text not null unique,
  description text not null default '',
  item_class text not null default 'Other' check (item_class in ('Tooling', 'Rig Part', 'Tooling + Rig Part', 'Service', 'Assembly', 'Other')),
  category text not null default '',
  family text not null default '',
  subfamily text not null default '',
  uom text not null default 'EA',
  status text not null default 'Active' check (status in ('Active', 'Inactive', 'Blocked', 'Review')),
  revision text not null default '',
  drawing_number text not null default '',
  preferred_vendor text not null default '',
  standard_cost numeric(14,2) not null default 0 check (standard_cost >= 0),
  list_price numeric(14,2) not null default 0 check (list_price >= 0),
  weight_lbs numeric(14,4) not null default 0 check (weight_lbs >= 0),
  source_authority text not null default '',
  source_system text not null default 'MDB',
  source_updated_at timestamptz,
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint items_part_number_normalized_check check (part_number = upper(btrim(part_number)) and part_number <> '')
);

create table if not exists item_aliases (
  id bigint generated always as identity primary key,
  item_id bigint not null references items(id) on delete cascade,
  alias text not null,
  alias_type text not null default 'Search',
  source text not null default 'MDB',
  created_at timestamptz not null default now(),
  constraint item_aliases_alias_not_blank_check check (btrim(alias) <> ''),
  constraint item_aliases_item_alias_unique unique (item_id, alias)
);

create table if not exists item_source_records (
  id bigint generated always as identity primary key,
  item_id bigint not null references items(id) on delete restrict,
  source_system text not null,
  source_key text not null,
  source_authority text not null default '',
  source_record_updated_at timestamptz,
  source_payload jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  constraint item_source_records_source_not_blank_check check (btrim(source_system) <> '' and btrim(source_key) <> ''),
  constraint item_source_records_item_source_unique unique (item_id, source_system, source_key)
);

create or replace function public.mdb_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists items_set_updated_at on public.items;
create trigger items_set_updated_at
before update on public.items
for each row execute function public.mdb_set_updated_at();

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
  item_id bigint references items(id) on delete restrict,
  sort_order int not null default 0,
  part text not null default '',
  description text not null default '',
  category text not null default '',
  uom text not null default 'EA',
  quantity int not null default 1 check (quantity between 1 and 5000),
  unit_price numeric not null default 0,
  discount numeric not null default 0,
  taxable boolean not null default false,
  source text not null default 'MDB demo',
  constraint order_lines_shipped_within_ordered_check check (shipped_qty >= 0 and shipped_qty <= quantity),
  constraint order_lines_reserved_within_remaining_check check (reserved_qty >= 0 and reserved_qty + shipped_qty <= quantity),
  constraint order_lines_to_ship_within_reserved_check check (qty_to_ship >= 0 and qty_to_ship <= reserved_qty),
  constraint order_lines_invoiced_within_shipped_check check (invoiced_qty >= 0 and invoiced_qty <= shipped_qty),
  constraint order_lines_to_invoice_within_shipped_check check (qty_to_invoice >= 0 and qty_to_invoice + invoiced_qty <= shipped_qty),
  constraint order_lines_backorder_within_remaining_check check (backorder_qty >= 0 and backorder_qty <= quantity - shipped_qty)
);

create index if not exists quote_lines_quote_id_idx on quote_lines (quote_id);
create index if not exists quote_lines_item_id_idx on quote_lines (item_id) where item_id is not null;
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
  location_code text not null default 'MAIN',
  status text not null default 'Open' check (status in ('Open', 'Released', 'Closed')),
  released_at timestamptz,
  released_by_initials text not null default '',
  released_by_name text not null default '',
  closed_at timestamptz,
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
  item_id bigint references items(id) on delete restrict,
  sort_order int not null default 0,
  part text not null default '',
  description text not null default '',
  category text not null default '',
  uom text not null default 'EA',
  quantity int not null default 1 check (quantity between 1 and 5000),
  reserved_qty int not null default 0 check (reserved_qty >= 0),
  qty_to_ship int not null default 0 check (qty_to_ship >= 0),
  shipped_qty int not null default 0,
  qty_to_invoice int not null default 0 check (qty_to_invoice >= 0),
  invoiced_qty int not null default 0 check (invoiced_qty >= 0),
  backorder_qty int not null default 0,
  unit_price numeric not null default 0,
  discount numeric not null default 0,
  taxable boolean not null default false,
  source text not null default 'MDB demo'
);

create table if not exists order_events (
  event_key text primary key,
  order_id text not null references orders(id) on delete cascade,
  event_type text not null check (event_type in ('Created', 'Released', 'Reopened', 'Reserved', 'Shipment', 'Invoice', 'Closed', 'Edited')),
  summary text not null,
  detail text not null default '',
  actor_initials text not null default '',
  actor_name text not null default '',
  created_at timestamptz not null default now(),
  constraint order_events_summary_not_blank_check check (btrim(summary) <> '')
);

create index if not exists order_lines_order_id_idx on order_lines (order_id);
create index if not exists order_lines_item_id_idx on order_lines (item_id) where item_id is not null;
create index if not exists order_lines_category_idx on order_lines (category);
create index if not exists orders_status_idx on orders (status);
create index if not exists orders_created_at_idx on orders (created_at desc);
create index if not exists orders_location_status_idx on orders (location_code, status);
create index if not exists order_events_order_created_idx on order_events (order_id, created_at desc);

-- Inventory is a SPARSE OVERRIDE table -- a part with no row here just uses
-- the existing deterministic demo seed (same fake on-hand/allocated/bin/price
-- for everyone, computed from a hash of the part number, no sync needed). A
-- row only gets created here once a rep actually edits a part's stock, which
-- is the one thing that genuinely needs to be shared across the team.
create table if not exists inventory_stock (
  part text primary key,
  item_id bigint references items(id) on delete restrict,
  on_hand numeric not null default 0,
  allocated numeric not null default 0,
  bin text not null default '',
  unit_price numeric not null default 0,
  last_modified_by_initials text not null default '',
  last_modified_by_name text not null default '',
  last_modified_at timestamptz not null default now()
);

create index if not exists items_class_status_idx on items (item_class, status);
create index if not exists items_family_idx on items (family) where family <> '';
create index if not exists items_updated_at_idx on items (updated_at desc);
create index if not exists item_aliases_item_id_idx on item_aliases (item_id);
create index if not exists item_aliases_alias_idx on item_aliases (lower(alias));
create index if not exists item_source_records_item_id_idx on item_source_records (item_id);
create index if not exists item_source_records_source_idx on item_source_records (source_system, source_key);
create index if not exists inventory_stock_item_id_idx on inventory_stock (item_id) where item_id is not null;

alter table public.items enable row level security;
alter table public.item_aliases enable row level security;
alter table public.item_source_records enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_lines enable row level security;
alter table public.orders enable row level security;
alter table public.order_lines enable row level security;
alter table public.order_events enable row level security;
alter table public.inventory_stock enable row level security;

revoke all on table public.items from anon, authenticated, public;
revoke all on table public.item_aliases from anon, authenticated, public;
revoke all on table public.item_source_records from anon, authenticated, public;
revoke all on function public.mdb_set_updated_at() from anon, authenticated, public;
revoke all on table public.quotes from anon, authenticated, public;
revoke all on table public.quote_lines from anon, authenticated, public;
revoke all on table public.orders from anon, authenticated, public;
revoke all on table public.order_lines from anon, authenticated, public;
revoke all on table public.order_events from anon, authenticated, public;
revoke all on table public.inventory_stock from anon, authenticated, public;

-- service_role bypasses Row Level Security but NOT ordinary table grants.
-- Keep its grants limited to the operations used by the server-side Functions.
grant usage on schema public to service_role;
revoke all on public.items from service_role;
revoke all on public.item_aliases from service_role;
revoke all on public.item_source_records from service_role;
revoke all on public.quotes from service_role;
revoke all on public.quote_lines from service_role;
revoke all on public.orders from service_role;
revoke all on public.order_lines from service_role;
revoke all on public.order_events from service_role;
revoke all on public.inventory_stock from service_role;
grant select, insert, update on public.items to service_role;
grant select, insert, update, delete on public.item_aliases to service_role;
grant select, insert, update on public.item_source_records to service_role;
grant select, insert, update on public.quotes to service_role;
grant select, insert, update, delete on public.quote_lines to service_role;
grant select, insert, update on public.orders to service_role;
grant select, insert, update, delete on public.order_lines to service_role;
grant select, insert, update on public.order_events to service_role;
grant select, insert, update on public.inventory_stock to service_role;
grant usage, select on sequence public.master_no_seq to service_role;
grant usage, select on sequence public.order_no_seq to service_role;
grant usage, select on sequence public.items_id_seq to service_role;
grant usage, select on sequence public.item_aliases_id_seq to service_role;
grant usage, select on sequence public.item_source_records_id_seq to service_role;
grant usage, select on sequence public.quote_lines_id_seq to service_role;
grant usage, select on sequence public.order_lines_id_seq to service_role;
