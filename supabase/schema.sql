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

create table if not exists quotes (
  id text primary key,
  number text not null,
  customer_id text not null default '',
  customer_po text not null default '',
  salesperson text not null default '',
  workflow text not null default 'General',
  terms text not null default 'Net 30',
  ship_via text not null default 'Best way',
  notes text not null default '',
  freight numeric not null default 0,
  tax_rate numeric not null default 0,
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
  quantity int not null default 1 check (quantity between 1 and 5000),
  unit_price numeric not null default 0,
  discount numeric not null default 0,
  taxable boolean not null default false,
  source text not null default 'MDB demo'
);

create index if not exists quote_lines_quote_id_idx on quote_lines (quote_id);
create index if not exists quotes_status_idx on quotes (status);
create index if not exists quotes_created_at_idx on quotes (created_at desc);
