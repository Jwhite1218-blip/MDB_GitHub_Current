-- Run this once against the already-live database (SQL Editor) to add the
-- new Orders tables. Safe to re-run -- every statement is idempotent.

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
create index if not exists orders_status_idx on orders (status);
create index if not exists orders_created_at_idx on orders (created_at desc);

grant all on public.orders to service_role;
grant all on public.order_lines to service_role;
grant usage, select on all sequences in schema public to service_role;
