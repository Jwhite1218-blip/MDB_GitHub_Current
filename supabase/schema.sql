-- MDB Quotes schema (Supabase / Postgres)
--
-- This is accessed ONLY through Netlify Functions using the Supabase
-- service_role key (server-side, never exposed to the browser). There
-- is no per-user auth model here, so Row Level Security is left off
-- deliberately -- the Netlify Function is the only door in, and it
-- validates/shapes everything before it touches this table.
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

-- service_role bypasses Row Level Security but NOT ordinary table grants --
-- these are required even for the service key to read/write these tables.
grant usage on schema public to service_role;
grant all on public.quotes to service_role;
grant all on public.quote_lines to service_role;
grant usage, select on all sequences in schema public to service_role;
