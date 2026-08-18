-- Business Central-style sales order execution foundation.
--
-- Orders remain editable while Open. Releasing an order makes it available
-- for inventory reservation and shipment activity. Shipment and invoice
-- quantities are tracked separately so partial fulfillment stays visible.

alter table public.orders
  drop constraint if exists orders_status_check;

alter table public.orders
  add constraint orders_status_check
    check (status in ('Open', 'Released', 'Closed')),
  add column if not exists location_code text not null default 'MAIN',
  add column if not exists released_at timestamptz,
  add column if not exists released_by_initials text not null default '',
  add column if not exists released_by_name text not null default '',
  add column if not exists closed_at timestamptz;

alter table public.order_lines
  add column if not exists reserved_qty int not null default 0 check (reserved_qty >= 0),
  add column if not exists qty_to_ship int not null default 0 check (qty_to_ship >= 0),
  add column if not exists qty_to_invoice int not null default 0 check (qty_to_invoice >= 0),
  add column if not exists invoiced_qty int not null default 0 check (invoiced_qty >= 0);

create table if not exists public.order_events (
  event_key text primary key,
  order_id text not null references public.orders(id) on delete cascade,
  event_type text not null check (event_type in (
    'Created', 'Released', 'Reopened', 'Reserved', 'Shipment', 'Invoice', 'Closed', 'Edited'
  )),
  summary text not null,
  detail text not null default '',
  actor_initials text not null default '',
  actor_name text not null default '',
  created_at timestamptz not null default now(),
  constraint order_events_summary_not_blank_check check (btrim(summary) <> '')
);

create index if not exists orders_location_status_idx
  on public.orders (location_code, status);

create index if not exists order_events_order_created_idx
  on public.order_events (order_id, created_at desc);

alter table public.order_events enable row level security;

revoke all on table public.order_events from anon, authenticated, public;
revoke all on table public.order_events from service_role;
grant select, insert, update on table public.order_events to service_role;
