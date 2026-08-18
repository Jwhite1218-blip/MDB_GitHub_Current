-- Item Master foundation
--
-- This is additive. Existing part-number text stays on quote/order/inventory
-- records so current workflows keep working while MDB begins linking those
-- records to one canonical item.

create table if not exists public.items (
  id bigint generated always as identity primary key,
  part_number text not null unique,
  description text not null default '',
  item_class text not null default 'Other'
    check (item_class in ('Tooling', 'Rig Part', 'Tooling + Rig Part', 'Service', 'Assembly', 'Other')),
  category text not null default '',
  family text not null default '',
  subfamily text not null default '',
  uom text not null default 'EA',
  status text not null default 'Active'
    check (status in ('Active', 'Inactive', 'Blocked', 'Review')),
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
  constraint items_part_number_normalized_check
    check (part_number = upper(btrim(part_number)) and part_number <> '')
);

create table if not exists public.item_aliases (
  id bigint generated always as identity primary key,
  item_id bigint not null references public.items(id) on delete cascade,
  alias text not null,
  alias_type text not null default 'Search',
  source text not null default 'MDB',
  created_at timestamptz not null default now(),
  constraint item_aliases_alias_not_blank_check check (btrim(alias) <> ''),
  constraint item_aliases_item_alias_unique unique (item_id, alias)
);

create table if not exists public.item_source_records (
  id bigint generated always as identity primary key,
  item_id bigint not null references public.items(id) on delete restrict,
  source_system text not null,
  source_key text not null,
  source_authority text not null default '',
  source_record_updated_at timestamptz,
  source_payload jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  constraint item_source_records_source_not_blank_check
    check (btrim(source_system) <> '' and btrim(source_key) <> ''),
  constraint item_source_records_item_source_unique
    unique (item_id, source_system, source_key)
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

alter table public.quote_lines add column if not exists item_id bigint;
alter table public.order_lines add column if not exists item_id bigint;
alter table public.inventory_stock add column if not exists item_id bigint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'quote_lines_item_id_fkey'
      and conrelid = 'public.quote_lines'::regclass
  ) then
    alter table public.quote_lines
      add constraint quote_lines_item_id_fkey
      foreign key (item_id) references public.items(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'order_lines_item_id_fkey'
      and conrelid = 'public.order_lines'::regclass
  ) then
    alter table public.order_lines
      add constraint order_lines_item_id_fkey
      foreign key (item_id) references public.items(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'inventory_stock_item_id_fkey'
      and conrelid = 'public.inventory_stock'::regclass
  ) then
    alter table public.inventory_stock
      add constraint inventory_stock_item_id_fkey
      foreign key (item_id) references public.items(id) on delete restrict;
  end if;
end $$;

create index if not exists items_class_status_idx on public.items (item_class, status);
create index if not exists items_family_idx on public.items (family) where family <> '';
create index if not exists items_updated_at_idx on public.items (updated_at desc);
create index if not exists item_aliases_item_id_idx on public.item_aliases (item_id);
create index if not exists item_aliases_alias_idx on public.item_aliases (lower(alias));
create index if not exists item_source_records_item_id_idx on public.item_source_records (item_id);
create index if not exists item_source_records_source_idx on public.item_source_records (source_system, source_key);
create index if not exists quote_lines_item_id_idx on public.quote_lines (item_id) where item_id is not null;
create index if not exists order_lines_item_id_idx on public.order_lines (item_id) where item_id is not null;
create index if not exists inventory_stock_item_id_idx on public.inventory_stock (item_id) where item_id is not null;

alter table public.items enable row level security;
alter table public.item_aliases enable row level security;
alter table public.item_source_records enable row level security;

revoke all on table public.items from anon, authenticated, public;
revoke all on table public.item_aliases from anon, authenticated, public;
revoke all on table public.item_source_records from anon, authenticated, public;
revoke all on function public.mdb_set_updated_at() from anon, authenticated, public;

revoke all on table public.items from service_role;
revoke all on table public.item_aliases from service_role;
revoke all on table public.item_source_records from service_role;

grant select, insert, update on table public.items to service_role;
grant select, insert, update, delete on table public.item_aliases to service_role;
grant select, insert, update on table public.item_source_records to service_role;
grant usage, select on sequence public.items_id_seq to service_role;
grant usage, select on sequence public.item_aliases_id_seq to service_role;
grant usage, select on sequence public.item_source_records_id_seq to service_role;
