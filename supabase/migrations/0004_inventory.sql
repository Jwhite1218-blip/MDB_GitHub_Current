-- Run this once against the already-live database (SQL Editor) to add the
-- Inventory overrides table. Safe to re-run -- every statement is idempotent.

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

grant all on public.inventory_stock to service_role;
