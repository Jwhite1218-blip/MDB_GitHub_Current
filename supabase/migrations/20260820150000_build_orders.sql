-- Build Orders: shop-fabrication tracking for items the shop makes in-house
-- (cutterheads, augers, drive caps, etc.), separate from Quotes/Orders which
-- are customer-facing sales documents. Lifecycle mirrors Orders' proven
-- Open -> Released -> Closed pattern (here: Open -> Released -> Finished),
-- with an activity timeline and partial-completion support, but with no
-- customer/pricing/tax fields since a build order is purely internal.

create sequence if not exists build_no_seq start 1000;

create table if not exists build_orders (
  id text primary key,
  build_number text not null default ('BLD' || lpad(nextval('build_no_seq')::text, 6, '0')),
  item_id bigint references items(id) on delete restrict,
  part text not null default '',
  description text not null default '',
  uom text not null default 'EA',
  quantity int not null check (quantity between 1 and 5000),
  built_qty int not null default 0 check (built_qty >= 0),
  due_date date,
  location_code text not null default 'MAIN',
  status text not null default 'Open' check (status in ('Open', 'Released', 'Finished')),
  notes text not null default '',
  released_at timestamptz,
  released_by_initials text not null default '',
  released_by_name text not null default '',
  finished_at timestamptz,
  originator_initials text not null default '',
  originator_name text not null default '',
  last_modified_by_initials text not null default '',
  last_modified_by_name text not null default '',
  created_at timestamptz not null default now(),
  last_modified_at timestamptz not null default now(),
  constraint build_orders_built_within_quantity_check check (built_qty <= quantity)
);

create table if not exists build_order_components (
  id bigint generated always as identity primary key,
  build_order_id text not null references build_orders(id) on delete cascade,
  item_id bigint references items(id) on delete restrict,
  sort_order int not null default 0,
  part text not null default '',
  description text not null default '',
  uom text not null default 'EA',
  qty_required numeric not null default 0 check (qty_required >= 0),
  qty_consumed numeric not null default 0 check (qty_consumed >= 0),
  constraint build_order_components_consumed_within_required_check check (qty_consumed <= qty_required)
);

create table if not exists build_order_events (
  event_key text primary key,
  build_order_id text not null references build_orders(id) on delete cascade,
  event_type text not null check (event_type in ('Created', 'Released', 'Consumed', 'Finished', 'Reopened', 'Edited')),
  summary text not null,
  detail text not null default '',
  actor_initials text not null default '',
  actor_name text not null default '',
  created_at timestamptz not null default now(),
  constraint build_order_events_summary_not_blank_check check (btrim(summary) <> '')
);

create index if not exists build_orders_status_idx on build_orders (status);
create index if not exists build_orders_created_at_idx on build_orders (created_at desc);
create index if not exists build_orders_item_id_idx on build_orders (item_id) where item_id is not null;
create index if not exists build_order_components_build_order_id_idx on build_order_components (build_order_id);
create index if not exists build_order_components_item_id_idx on build_order_components (item_id) where item_id is not null;
create index if not exists build_order_events_build_order_created_idx on build_order_events (build_order_id, created_at desc);

alter table public.build_orders enable row level security;
alter table public.build_order_components enable row level security;
alter table public.build_order_events enable row level security;

revoke all on table public.build_orders from anon, authenticated, public;
revoke all on table public.build_order_components from anon, authenticated, public;
revoke all on table public.build_order_events from anon, authenticated, public;

revoke all on public.build_orders from service_role;
revoke all on public.build_order_components from service_role;
revoke all on public.build_order_events from service_role;

grant select, insert, update on public.build_orders to service_role;
grant select, insert, update, delete on public.build_order_components to service_role;
grant select, insert, update on public.build_order_events to service_role;
grant usage, select on sequence public.build_no_seq to service_role;
grant usage, select on sequence public.build_order_components_id_seq to service_role;
