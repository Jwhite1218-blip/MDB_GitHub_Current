-- Unified Sales + Operations production-control foundation.
--
-- This migration is additive so the public portfolio remains compatible while
-- the authenticated operational application is built. Server-side RPCs own
-- request transitions, component reservation, and inventory posting.

begin;

create extension if not exists pgcrypto;

-- Supabase/Postgres grants EXECUTE on new functions to PUBLIC by default.
-- Operational RPCs are service-only, so make the secure default explicit.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

-- Stable document-line identities are required before another operational
-- document can safely point at an exact sales or component line.
alter table public.order_lines
  add column if not exists line_key text;

update public.order_lines
set line_key = gen_random_uuid()::text
where line_key is null or btrim(line_key) = '';

alter table public.order_lines
  alter column line_key set default (gen_random_uuid()::text),
  alter column line_key set not null;

create unique index if not exists order_lines_order_line_key_uidx
  on public.order_lines (order_id, line_key);

alter table public.build_order_components
  add column if not exists component_key text,
  add column if not exists qty_reserved numeric not null default 0 check (qty_reserved >= 0);

update public.build_order_components
set component_key = gen_random_uuid()::text
where component_key is null or btrim(component_key) = '';

alter table public.build_order_components
  alter column component_key set default (gen_random_uuid()::text),
  alter column component_key set not null;

create unique index if not exists build_components_order_component_key_uidx
  on public.build_order_components (build_order_id, component_key);

alter table public.build_order_components
  drop constraint if exists build_order_components_consumed_within_required_check,
  drop constraint if exists build_order_components_quantities_within_required_check;

alter table public.build_order_components
  add constraint build_order_components_quantities_within_required_check
    check (qty_consumed + qty_reserved <= qty_required);

-- Netlify Identity proves who the employee is. These tables decide what that
-- verified identity is allowed to do inside MDB.
create table if not exists public.operational_users (
  id uuid primary key default gen_random_uuid(),
  identity_subject text not null unique,
  email text not null default '',
  display_name text not null,
  initials text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_users_subject_not_blank_check check (btrim(identity_subject) <> ''),
  constraint operational_users_name_not_blank_check check (btrim(display_name) <> '')
);

create unique index if not exists operational_users_email_uidx
  on public.operational_users (lower(email))
  where email <> '';

create table if not exists public.operational_user_roles (
  user_id uuid not null references public.operational_users(id) on delete cascade,
  role text not null check (role in (
    'sales', 'production_controller', 'shop', 'inventory_controller', 'admin'
  )),
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.operational_users(id) on delete restrict,
  primary key (user_id, role)
);

create sequence if not exists public.build_request_no_seq start 1000;

create table if not exists public.build_requests (
  id text primary key,
  request_number text not null default ('BRQ' || lpad(nextval('public.build_request_no_seq')::text, 6, '0')),
  source_order_id text not null,
  source_order_line_key text not null,
  originator_user_id uuid not null references public.operational_users(id) on delete restrict,
  gatekeeper_user_id uuid references public.operational_users(id) on delete restrict,
  item_id bigint references public.items(id) on delete restrict,
  part text not null,
  description text not null default '',
  uom text not null default 'EA',
  requested_quantity int not null check (requested_quantity between 1 and 5000),
  requested_ship_date date,
  customer_requirements text not null default '',
  status text not null default 'Draft' check (status in (
    'Draft', 'Submitted', 'Returned', 'Accepted', 'Fulfilled', 'Cancelled'
  )),
  returned_reason text not null default '',
  submitted_at timestamptz,
  accepted_at timestamptz,
  fulfilled_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint build_requests_source_line_fk
    foreign key (source_order_id, source_order_line_key)
    references public.order_lines(order_id, line_key)
    on update cascade on delete restrict,
  constraint build_requests_part_not_blank_check check (btrim(part) <> '')
);

create table if not exists public.build_request_events (
  event_key text primary key,
  build_request_id text not null references public.build_requests(id) on delete cascade,
  event_type text not null check (event_type in (
    'Created', 'Submitted', 'Returned', 'Accepted', 'Cancelled', 'Fulfilled',
    'Commented', 'ChangeRequested'
  )),
  summary text not null,
  detail text not null default '',
  actor_user_id uuid references public.operational_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint build_request_events_summary_not_blank_check check (btrim(summary) <> '')
);

create index if not exists build_requests_status_created_idx
  on public.build_requests (status, created_at desc);
create index if not exists build_requests_originator_created_idx
  on public.build_requests (originator_user_id, created_at desc);
create index if not exists build_requests_source_line_idx
  on public.build_requests (source_order_id, source_order_line_key);
create index if not exists build_request_events_request_created_idx
  on public.build_request_events (build_request_id, created_at desc);

drop trigger if exists build_requests_set_updated_at on public.build_requests;
create trigger build_requests_set_updated_at
before update on public.build_requests
for each row execute function public.mdb_set_updated_at();

-- Build Orders remain internal execution documents. The request link supplies
-- sales context without copying pricing or customer fields onto the build.
alter table public.build_orders
  add column if not exists build_request_id text references public.build_requests(id) on delete restrict,
  add column if not exists controller_user_id uuid references public.operational_users(id) on delete restrict,
  add column if not exists shop_assignee_user_id uuid references public.operational_users(id) on delete restrict,
  add column if not exists priority smallint not null default 3 check (priority between 1 and 5),
  add column if not exists requested_due_date date,
  add column if not exists committed_due_date date,
  add column if not exists actual_started_at timestamptz,
  add column if not exists posted_at timestamptz,
  add column if not exists posted_by_user_id uuid references public.operational_users(id) on delete restrict,
  add column if not exists exception_code text check (exception_code is null or exception_code in (
    'needs_information', 'blocked', 'on_hold', 'customer_change', 'at_risk'
  )),
  add column if not exists exception_detail text not null default '',
  add column if not exists bom_snapshot jsonb not null default '[]'::jsonb,
  add column if not exists revision int not null default 1 check (revision > 0);

alter table public.build_orders
  drop constraint if exists build_orders_status_check;

alter table public.build_orders
  add constraint build_orders_status_check
    check (status in ('Open', 'Released', 'Finished', 'Cancelled'));

create index if not exists build_orders_request_idx
  on public.build_orders (build_request_id) where build_request_id is not null;
create index if not exists build_orders_controller_status_idx
  on public.build_orders (controller_user_id, status);
create index if not exists build_orders_assignee_status_idx
  on public.build_orders (shop_assignee_user_id, status);
create index if not exists build_orders_committed_due_idx
  on public.build_orders (committed_due_date) where status in ('Open', 'Released');

alter table public.build_order_events
  drop constraint if exists build_order_events_event_type_check;

alter table public.build_order_events
  add constraint build_order_events_event_type_check check (event_type in (
    'Created', 'Scheduled', 'Assigned', 'Released', 'Started', 'Blocked', 'Held',
    'Resumed', 'Rescheduled', 'Consumed', 'Posted', 'Finished', 'Reopened',
    'Cancelled', 'Edited'
  ));

-- Posting batches provide network-retry idempotency. Ledger entries are
-- append-only facts; corrections use reversal entries instead of mutation.
create table if not exists public.inventory_posting_batches (
  batch_key text primary key,
  build_order_id text not null references public.build_orders(id) on delete restrict,
  actor_user_id uuid not null references public.operational_users(id) on delete restrict,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint inventory_posting_batches_key_not_blank_check check (btrim(batch_key) <> '')
);

create table if not exists public.inventory_ledger_entries (
  id bigint generated always as identity primary key,
  entry_key text not null unique,
  posting_batch_key text not null references public.inventory_posting_batches(batch_key) on delete restrict,
  entry_sequence int not null check (entry_sequence > 0),
  entry_type text not null check (entry_type in (
    'Build Consumption', 'Build Output', 'Reservation', 'Reservation Release',
    'Shipment', 'Adjustment', 'Reversal'
  )),
  item_id bigint references public.items(id) on delete restrict,
  part text not null,
  location_code text not null default 'MAIN',
  quantity_delta numeric not null check (quantity_delta <> 0),
  build_order_id text references public.build_orders(id) on delete restrict,
  build_component_key text,
  order_id text references public.orders(id) on delete restrict,
  order_line_key text,
  actor_user_id uuid not null references public.operational_users(id) on delete restrict,
  reversal_of_entry_id bigint references public.inventory_ledger_entries(id) on delete restrict,
  detail jsonb not null default '{}'::jsonb,
  posted_at timestamptz not null default now(),
  unique (posting_batch_key, entry_sequence),
  constraint inventory_ledger_entries_part_not_blank_check check (btrim(part) <> '')
);

create index if not exists inventory_ledger_item_posted_idx
  on public.inventory_ledger_entries (item_id, posted_at desc);
create index if not exists inventory_ledger_part_posted_idx
  on public.inventory_ledger_entries (part, posted_at desc);
create index if not exists inventory_ledger_build_posted_idx
  on public.inventory_ledger_entries (build_order_id, posted_at desc);

create table if not exists public.integration_outbox (
  id bigint generated always as identity primary key,
  destination text not null check (destination in ('Salesforce', 'GP')),
  aggregate_type text not null,
  aggregate_id text not null,
  event_type text not null,
  idempotency_key text not null unique,
  payload jsonb not null,
  status text not null default 'Pending' check (status in ('Pending', 'Sending', 'Sent', 'Failed')),
  attempt_count int not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  sent_at timestamptz,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_outbox_aggregate_not_blank_check check (
    btrim(aggregate_type) <> '' and btrim(aggregate_id) <> '' and btrim(event_type) <> ''
  )
);

create index if not exists integration_outbox_pending_idx
  on public.integration_outbox (status, available_at, id)
  where status in ('Pending', 'Failed');

drop trigger if exists integration_outbox_set_updated_at on public.integration_outbox;
create trigger integration_outbox_set_updated_at
before update on public.integration_outbox
for each row execute function public.mdb_set_updated_at();

-- Operational tables stay behind server-side functions. Browser clients never
-- receive the Supabase service role key and have no direct Data API access.
alter table public.operational_users enable row level security;
alter table public.operational_user_roles enable row level security;
alter table public.build_requests enable row level security;
alter table public.build_request_events enable row level security;
alter table public.inventory_posting_batches enable row level security;
alter table public.inventory_ledger_entries enable row level security;
alter table public.integration_outbox enable row level security;

revoke all on table public.operational_users from anon, authenticated, public;
revoke all on table public.operational_user_roles from anon, authenticated, public;
revoke all on table public.build_requests from anon, authenticated, public;
revoke all on table public.build_request_events from anon, authenticated, public;
revoke all on table public.inventory_posting_batches from anon, authenticated, public;
revoke all on table public.inventory_ledger_entries from anon, authenticated, public;
revoke all on table public.integration_outbox from anon, authenticated, public;

revoke all on public.operational_users from service_role;
revoke all on public.operational_user_roles from service_role;
revoke all on public.build_requests from service_role;
revoke all on public.build_request_events from service_role;
revoke all on public.inventory_posting_batches from service_role;
revoke all on public.inventory_ledger_entries from service_role;
revoke all on public.integration_outbox from service_role;

grant select, insert, update on public.operational_users to service_role;
grant select, insert, update, delete on public.operational_user_roles to service_role;
grant select, insert, update on public.build_requests to service_role;
grant select, insert on public.build_request_events to service_role;
grant select, insert, update on public.inventory_posting_batches to service_role;
grant select, insert on public.inventory_ledger_entries to service_role;
grant select, insert, update on public.integration_outbox to service_role;
grant usage, select on sequence public.build_request_no_seq to service_role;
grant usage, select on sequence public.inventory_ledger_entries_id_seq to service_role;
grant usage, select on sequence public.integration_outbox_id_seq to service_role;

create or replace function public.mdb_actor_has_role(
  p_actor_user_id uuid,
  p_roles text[]
)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.operational_users u
    join public.operational_user_roles r on r.user_id = u.id
    where u.id = p_actor_user_id
      and u.is_active
      and r.role = any(p_roles)
  );
$$;

revoke all on function public.mdb_actor_has_role(uuid, text[]) from public, anon, authenticated;
grant execute on function public.mdb_actor_has_role(uuid, text[]) to service_role;

create or replace function public.mdb_create_build_request_v1(
  p_actor_user_id uuid,
  p_source_order_id text,
  p_source_order_line_key text,
  p_requested_quantity int,
  p_requested_ship_date date default null,
  p_customer_requirements text default '',
  p_submit boolean default false,
  p_request_id text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor public.operational_users%rowtype;
  v_line public.order_lines%rowtype;
  v_order public.orders%rowtype;
  v_existing_quantity numeric;
  v_remaining_quantity numeric;
  v_request_id text;
  v_status text;
begin
  if not public.mdb_actor_has_role(p_actor_user_id, array['sales', 'production_controller', 'admin']) then
    raise exception 'Actor is not allowed to create Build Requests';
  end if;

  select * into v_actor
  from public.operational_users
  where id = p_actor_user_id and is_active;

  select * into v_line
  from public.order_lines
  where order_id = p_source_order_id and line_key = p_source_order_line_key
  for share;
  if not found then
    raise exception 'Source Sales Order line was not found';
  end if;

  select * into v_order
  from public.orders
  where id = p_source_order_id
  for share;
  if not found then
    raise exception 'Source Sales Order was not found';
  end if;

  if p_requested_quantity is null or p_requested_quantity < 1 or p_requested_quantity > 5000 then
    raise exception 'Requested quantity must be between 1 and 5000';
  end if;
  if btrim(v_line.part) = '' then
    raise exception 'Source Sales Order line has no item';
  end if;

  select coalesce(sum(requested_quantity), 0)
  into v_existing_quantity
  from public.build_requests
  where source_order_id = p_source_order_id
    and source_order_line_key = p_source_order_line_key
    and status <> 'Cancelled';

  v_remaining_quantity := greatest(0, v_line.quantity - v_line.shipped_qty);
  if v_existing_quantity + p_requested_quantity > v_remaining_quantity then
    raise exception 'Active Build Requests would exceed the unshipped Sales Order quantity';
  end if;

  v_request_id := coalesce(nullif(btrim(p_request_id), ''), 'brq-' || gen_random_uuid()::text);
  v_status := case when p_submit then 'Submitted' else 'Draft' end;

  insert into public.build_requests (
    id, source_order_id, source_order_line_key, originator_user_id,
    item_id, part, description, uom, requested_quantity,
    requested_ship_date, customer_requirements, status, submitted_at
  ) values (
    v_request_id, p_source_order_id, p_source_order_line_key, p_actor_user_id,
    v_line.item_id, v_line.part, v_line.description, v_line.uom, p_requested_quantity,
    coalesce(p_requested_ship_date, v_order.req_ship_date), coalesce(p_customer_requirements, ''),
    v_status, case when p_submit then now() else null end
  );

  insert into public.build_request_events (
    event_key, build_request_id, event_type, summary, detail, actor_user_id
  ) values (
    'bre-' || gen_random_uuid()::text, v_request_id, 'Created',
    'Build Request created', 'Created from Sales Order ' || coalesce(v_order.order_number, p_source_order_id),
    p_actor_user_id
  );

  if p_submit then
    insert into public.build_request_events (
      event_key, build_request_id, event_type, summary, detail, actor_user_id
    ) values (
      'bre-' || gen_random_uuid()::text, v_request_id, 'Submitted',
      'Submitted to Production Control', '', p_actor_user_id
    );
  end if;

  return jsonb_build_object(
    'request', (select to_jsonb(r) from public.build_requests r where r.id = v_request_id)
  );
end;
$$;

revoke all on function public.mdb_create_build_request_v1(uuid, text, text, int, date, text, boolean, text) from public, anon, authenticated;
grant execute on function public.mdb_create_build_request_v1(uuid, text, text, int, date, text, boolean, text) to service_role;

create or replace function public.mdb_transition_build_request_v1(
  p_actor_user_id uuid,
  p_build_request_id text,
  p_action text,
  p_note text default '',
  p_committed_due_date date default null,
  p_priority smallint default null,
  p_shop_assignee_user_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_request public.build_requests%rowtype;
  v_actor public.operational_users%rowtype;
  v_originator public.operational_users%rowtype;
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_is_controller boolean;
  v_is_originator boolean;
  v_build_id text;
  v_priority smallint;
begin
  select * into v_actor
  from public.operational_users
  where id = p_actor_user_id and is_active;
  if not found then raise exception 'Active operational user was not found'; end if;

  select * into v_request
  from public.build_requests
  where id = p_build_request_id
  for update;
  if not found then raise exception 'Build Request was not found'; end if;

  v_is_controller := public.mdb_actor_has_role(p_actor_user_id, array['production_controller', 'admin']);
  v_is_originator := v_request.originator_user_id = p_actor_user_id;

  if v_action = 'submit' then
    if v_request.status not in ('Draft', 'Returned') then
      raise exception 'Only Draft or Returned requests can be submitted';
    end if;
    if not (v_is_originator or v_is_controller) then
      raise exception 'Only the originator or Production Control can submit this request';
    end if;
    update public.build_requests
    set status = 'Submitted', submitted_at = now(), returned_reason = ''
    where id = v_request.id;
    insert into public.build_request_events values (
      'bre-' || gen_random_uuid()::text, v_request.id, 'Submitted',
      'Submitted to Production Control', coalesce(p_note, ''), p_actor_user_id, now()
    );

  elsif v_action = 'return' then
    if v_request.status <> 'Submitted' or not v_is_controller then
      raise exception 'Only Production Control can return a Submitted request';
    end if;
    if btrim(coalesce(p_note, '')) = '' then raise exception 'A return reason is required'; end if;
    update public.build_requests
    set status = 'Returned', returned_reason = p_note, gatekeeper_user_id = p_actor_user_id
    where id = v_request.id;
    insert into public.build_request_events values (
      'bre-' || gen_random_uuid()::text, v_request.id, 'Returned',
      'Returned for information', p_note, p_actor_user_id, now()
    );

  elsif v_action = 'accept' then
    if v_request.status <> 'Submitted' or not v_is_controller then
      raise exception 'Only Production Control can accept a Submitted request';
    end if;
    if p_committed_due_date is null then raise exception 'A committed completion date is required'; end if;
    v_priority := coalesce(p_priority, 3);
    if v_priority < 1 or v_priority > 5 then raise exception 'Priority must be between 1 and 5'; end if;
    if p_shop_assignee_user_id is not null and not public.mdb_actor_has_role(
      p_shop_assignee_user_id, array['shop', 'production_controller', 'admin']
    ) then
      raise exception 'Shop assignee is not an active production user';
    end if;

    select * into v_originator from public.operational_users where id = v_request.originator_user_id;
    v_build_id := 'build-' || gen_random_uuid()::text;

    update public.build_requests
    set status = 'Accepted', accepted_at = now(), gatekeeper_user_id = p_actor_user_id,
        returned_reason = ''
    where id = v_request.id;

    insert into public.build_orders (
      id, item_id, part, description, uom, quantity, built_qty, due_date,
      location_code, status, notes, originator_initials, originator_name,
      last_modified_by_initials, last_modified_by_name, created_at, last_modified_at,
      build_request_id, controller_user_id, shop_assignee_user_id, priority,
      requested_due_date, committed_due_date
    ) values (
      v_build_id, v_request.item_id, v_request.part, v_request.description, v_request.uom,
      v_request.requested_quantity, 0, p_committed_due_date, 'MAIN', 'Open',
      v_request.customer_requirements, coalesce(v_originator.initials, ''),
      coalesce(v_originator.display_name, ''), v_actor.initials, v_actor.display_name,
      now(), now(), v_request.id, p_actor_user_id, p_shop_assignee_user_id,
      v_priority, v_request.requested_ship_date, p_committed_due_date
    );

    insert into public.build_request_events values (
      'bre-' || gen_random_uuid()::text, v_request.id, 'Accepted',
      'Accepted and scheduled by Production Control', coalesce(p_note, ''), p_actor_user_id, now()
    );
    insert into public.build_order_events values (
      'event-' || gen_random_uuid()::text, v_build_id, 'Scheduled',
      'Build Order scheduled', 'Created from ' || v_request.request_number,
      v_actor.initials, v_actor.display_name, now()
    );

  elsif v_action = 'cancel' then
    if v_request.status in ('Fulfilled', 'Cancelled') then
      raise exception 'This request is already terminal';
    end if;
    if not v_is_controller and not (
      v_is_originator and v_request.status in ('Draft', 'Submitted', 'Returned')
    ) then
      raise exception 'This actor cannot cancel the request at its current stage';
    end if;
    if exists (
      select 1 from public.build_orders b
      where b.build_request_id = v_request.id and b.status = 'Released'
    ) then
      raise exception 'Cancel the Released Build Order through Production Control so reservations are released';
    end if;
    if exists (
      select 1 from public.build_orders b
      where b.build_request_id = v_request.id
        and (b.built_qty > 0 or exists (
          select 1 from public.build_order_components c
          where c.build_order_id = b.id and c.qty_consumed > 0
        ))
    ) then
      raise exception 'A request with posted production activity cannot be cancelled';
    end if;
    update public.build_orders
    set status = 'Cancelled', exception_detail = coalesce(p_note, ''), revision = revision + 1
    where build_request_id = v_request.id and status = 'Open';
    update public.build_requests
    set status = 'Cancelled', cancelled_at = now()
    where id = v_request.id;
    insert into public.build_request_events values (
      'bre-' || gen_random_uuid()::text, v_request.id, 'Cancelled',
      'Build Request cancelled', coalesce(p_note, ''), p_actor_user_id, now()
    );
  elsif v_action = 'request_change' then
    if v_request.status <> 'Accepted' or not (v_is_originator or v_is_controller) then
      raise exception 'Only the originator or Production Control can request a change to accepted demand';
    end if;
    if btrim(coalesce(p_note, '')) = '' then raise exception 'A requested change needs a reason'; end if;
    update public.build_orders
    set exception_code = 'customer_change', exception_detail = p_note, revision = revision + 1
    where build_request_id = v_request.id and status in ('Open', 'Released');
    insert into public.build_request_events values (
      'bre-' || gen_random_uuid()::text, v_request.id, 'ChangeRequested',
      'Change requested', p_note, p_actor_user_id, now()
    );
  else
    raise exception 'Unsupported Build Request action: %', v_action;
  end if;

  return jsonb_build_object(
    'request', (select to_jsonb(r) from public.build_requests r where r.id = v_request.id),
    'buildOrderId', v_build_id
  );
end;
$$;

revoke all on function public.mdb_transition_build_request_v1(uuid, text, text, text, date, smallint, uuid) from public, anon, authenticated;
grant execute on function public.mdb_transition_build_request_v1(uuid, text, text, text, date, smallint, uuid) to service_role;

create or replace function public.mdb_transition_build_order_v1(
  p_actor_user_id uuid,
  p_build_order_id text,
  p_action text,
  p_note text default '',
  p_committed_due_date date default null,
  p_priority smallint default null,
  p_shop_assignee_user_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_build public.build_orders%rowtype;
  v_actor public.operational_users%rowtype;
  v_request public.build_requests%rowtype;
  v_component public.build_order_components%rowtype;
  v_stock public.inventory_stock%rowtype;
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_is_controller boolean;
  v_can_progress boolean;
  v_needed numeric;
  v_available numeric;
  v_snapshot jsonb;
begin
  select * into v_actor from public.operational_users
  where id = p_actor_user_id and is_active;
  if not found then raise exception 'Active operational user was not found'; end if;

  select * into v_build from public.build_orders where id = p_build_order_id for update;
  if not found then raise exception 'Build Order was not found'; end if;

  v_is_controller := public.mdb_actor_has_role(p_actor_user_id, array['production_controller', 'admin']);
  v_can_progress := public.mdb_actor_has_role(
    p_actor_user_id, array['shop', 'production_controller', 'inventory_controller', 'admin']
  );

  if v_action = 'assign' then
    if not v_is_controller then raise exception 'Only Production Control can assign shop work'; end if;
    if p_shop_assignee_user_id is null or not public.mdb_actor_has_role(
      p_shop_assignee_user_id, array['shop', 'production_controller', 'admin']
    ) then raise exception 'An active shop assignee is required'; end if;
    update public.build_orders
    set shop_assignee_user_id = p_shop_assignee_user_id, revision = revision + 1
    where id = v_build.id;
    insert into public.build_order_events values (
      'event-' || gen_random_uuid()::text, v_build.id, 'Assigned', 'Shop assignment changed',
      coalesce(p_note, ''), v_actor.initials, v_actor.display_name, now()
    );

  elsif v_action = 'reschedule' then
    if not v_is_controller then raise exception 'Only Production Control can reschedule work'; end if;
    if p_committed_due_date is null then raise exception 'A committed completion date is required'; end if;
    if p_priority is not null and (p_priority < 1 or p_priority > 5) then
      raise exception 'Priority must be between 1 and 5';
    end if;
    update public.build_orders
    set committed_due_date = p_committed_due_date, due_date = p_committed_due_date,
        priority = coalesce(p_priority, priority), revision = revision + 1
    where id = v_build.id;
    insert into public.build_order_events values (
      'event-' || gen_random_uuid()::text, v_build.id, 'Rescheduled', 'Production commitment changed',
      coalesce(p_note, ''), v_actor.initials, v_actor.display_name, now()
    );

  elsif v_action = 'release' then
    if not v_is_controller then raise exception 'Only Production Control can release work'; end if;
    if v_build.status <> 'Open' then raise exception 'Only Open Build Orders can be released'; end if;
    if btrim(v_build.part) = '' or v_build.quantity < 1 then raise exception 'Build item and quantity are required'; end if;
    if v_build.build_request_id is not null then
      select * into v_request from public.build_requests where id = v_build.build_request_id for share;
      if v_request.status <> 'Accepted' then raise exception 'The linked Build Request is not accepted'; end if;
    end if;

    for v_component in
      select * from public.build_order_components
      where build_order_id = v_build.id
      order by sort_order
      for update
    loop
      v_needed := v_component.qty_required - v_component.qty_consumed - v_component.qty_reserved;
      if v_needed > 0 then
        select * into v_stock from public.inventory_stock
        where part = v_component.part for update;
        if not found then raise exception 'No operational inventory record exists for component %', v_component.part; end if;
        v_available := v_stock.on_hand - v_stock.allocated;
        if v_available < v_needed then
          raise exception 'Component % is short by %', v_component.part, v_needed - greatest(0, v_available);
        end if;
        update public.inventory_stock
        set allocated = allocated + v_needed,
            last_modified_by_initials = v_actor.initials,
            last_modified_by_name = v_actor.display_name,
            last_modified_at = now()
        where part = v_component.part;
        update public.build_order_components
        set qty_reserved = qty_reserved + v_needed
        where id = v_component.id;
      end if;
    end loop;

    select coalesce(jsonb_agg(jsonb_build_object(
      'componentKey', component_key, 'itemId', item_id, 'part', part,
      'description', description, 'uom', uom, 'quantityRequired', qty_required
    ) order by sort_order), '[]'::jsonb)
    into v_snapshot
    from public.build_order_components where build_order_id = v_build.id;

    update public.build_orders
    set status = 'Released', released_at = now(), released_by_initials = v_actor.initials,
        released_by_name = v_actor.display_name, controller_user_id = p_actor_user_id,
        bom_snapshot = v_snapshot, revision = revision + 1
    where id = v_build.id;
    insert into public.build_order_events values (
      'event-' || gen_random_uuid()::text, v_build.id, 'Released', 'Build Order released',
      'Components reserved; shop execution is authorized.', v_actor.initials, v_actor.display_name, now()
    );

  elsif v_action = 'reopen' then
    if not v_is_controller then raise exception 'Only Production Control can reopen work'; end if;
    if v_build.status <> 'Released' or v_build.built_qty > 0 or exists (
      select 1 from public.build_order_components where build_order_id = v_build.id and qty_consumed > 0
    ) then raise exception 'Only untouched Released Build Orders can be reopened'; end if;
    for v_component in
      select * from public.build_order_components
      where build_order_id = v_build.id and qty_reserved > 0 for update
    loop
      update public.inventory_stock
      set allocated = greatest(0, allocated - v_component.qty_reserved),
          last_modified_by_initials = v_actor.initials,
          last_modified_by_name = v_actor.display_name,
          last_modified_at = now()
      where part = v_component.part;
      update public.build_order_components set qty_reserved = 0 where id = v_component.id;
    end loop;
    update public.build_orders
    set status = 'Open', released_at = null, released_by_initials = '', released_by_name = '',
        revision = revision + 1
    where id = v_build.id;
    insert into public.build_order_events values (
      'event-' || gen_random_uuid()::text, v_build.id, 'Reopened', 'Build Order reopened',
      coalesce(p_note, ''), v_actor.initials, v_actor.display_name, now()
    );

  elsif v_action = 'start' then
    if not v_can_progress then raise exception 'Actor cannot start production work'; end if;
    if v_build.status <> 'Released' then raise exception 'Only Released Build Orders can be started'; end if;
    if not v_is_controller
      and not public.mdb_actor_has_role(p_actor_user_id, array['inventory_controller'])
      and v_build.shop_assignee_user_id is distinct from p_actor_user_id then
      raise exception 'Shop work is assigned to another employee';
    end if;
    update public.build_orders
    set actual_started_at = coalesce(actual_started_at, now()), revision = revision + 1
    where id = v_build.id;
    insert into public.build_order_events values (
      'event-' || gen_random_uuid()::text, v_build.id, 'Started', 'Shop work started',
      coalesce(p_note, ''), v_actor.initials, v_actor.display_name, now()
    );

  elsif v_action in ('block', 'hold') then
    if v_action = 'hold' and not v_is_controller then raise exception 'Only Production Control can place work on hold'; end if;
    if v_action = 'block' and not v_can_progress then raise exception 'Actor cannot report a production blocker'; end if;
    if v_action = 'block' and not v_is_controller
      and not public.mdb_actor_has_role(p_actor_user_id, array['inventory_controller'])
      and v_build.shop_assignee_user_id is distinct from p_actor_user_id then
      raise exception 'Shop work is assigned to another employee';
    end if;
    if btrim(coalesce(p_note, '')) = '' then raise exception 'An exception reason is required'; end if;
    update public.build_orders
    set exception_code = case when v_action = 'hold' then 'on_hold' else 'blocked' end,
        exception_detail = p_note, revision = revision + 1
    where id = v_build.id;
    insert into public.build_order_events values (
      'event-' || gen_random_uuid()::text, v_build.id,
      case when v_action = 'hold' then 'Held' else 'Blocked' end,
      case when v_action = 'hold' then 'Build Order placed on hold' else 'Production blocker reported' end,
      p_note, v_actor.initials, v_actor.display_name, now()
    );

  elsif v_action = 'clear_exception' then
    if not v_is_controller then raise exception 'Only Production Control can clear an exception'; end if;
    update public.build_orders
    set exception_code = null, exception_detail = '', revision = revision + 1
    where id = v_build.id;
    insert into public.build_order_events values (
      'event-' || gen_random_uuid()::text, v_build.id, 'Resumed', 'Production exception cleared',
      coalesce(p_note, ''), v_actor.initials, v_actor.display_name, now()
    );

  elsif v_action = 'cancel' then
    if not v_is_controller then raise exception 'Only Production Control can cancel a Build Order'; end if;
    if v_build.status not in ('Open', 'Released') or v_build.built_qty > 0 or exists (
      select 1 from public.build_order_components where build_order_id = v_build.id and qty_consumed > 0
    ) then raise exception 'Build Orders with posted activity cannot be cancelled'; end if;
    for v_component in
      select * from public.build_order_components
      where build_order_id = v_build.id and qty_reserved > 0 for update
    loop
      update public.inventory_stock
      set allocated = greatest(0, allocated - v_component.qty_reserved),
          last_modified_by_initials = v_actor.initials,
          last_modified_by_name = v_actor.display_name,
          last_modified_at = now()
      where part = v_component.part;
      update public.build_order_components set qty_reserved = 0 where id = v_component.id;
    end loop;
    update public.build_orders
    set status = 'Cancelled', exception_detail = coalesce(p_note, ''), revision = revision + 1
    where id = v_build.id;
    if v_build.build_request_id is not null then
      update public.build_requests set status = 'Cancelled', cancelled_at = now()
      where id = v_build.build_request_id and status <> 'Fulfilled';
      insert into public.build_request_events (
        event_key, build_request_id, event_type, summary, detail, actor_user_id
      ) values (
        'bre-' || gen_random_uuid()::text, v_build.build_request_id, 'Cancelled',
        'Production work cancelled', coalesce(p_note, ''), p_actor_user_id
      );
    end if;
    insert into public.build_order_events values (
      'event-' || gen_random_uuid()::text, v_build.id, 'Cancelled', 'Build Order cancelled',
      coalesce(p_note, ''), v_actor.initials, v_actor.display_name, now()
    );
  else
    raise exception 'Unsupported Build Order action: %', v_action;
  end if;

  return jsonb_build_object(
    'buildOrder', (select to_jsonb(b) from public.build_orders b where b.id = v_build.id)
  );
end;
$$;

revoke all on function public.mdb_transition_build_order_v1(uuid, text, text, text, date, smallint, uuid) from public, anon, authenticated;
grant execute on function public.mdb_transition_build_order_v1(uuid, text, text, text, date, smallint, uuid) to service_role;

create or replace function public.mdb_update_build_draft_v1(
  p_actor_user_id uuid,
  p_build_order_id text,
  p_components jsonb default '[]'::jsonb,
  p_notes text default '',
  p_committed_due_date date default null,
  p_priority smallint default null,
  p_shop_assignee_user_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_build public.build_orders%rowtype;
  v_actor public.operational_users%rowtype;
  v_item public.items%rowtype;
  v_entry jsonb;
  v_component_key text;
  v_part text;
  v_quantity numeric;
  v_sort_order int := 0;
  v_component_keys text[] := array[]::text[];
begin
  if not public.mdb_actor_has_role(p_actor_user_id, array['production_controller', 'admin']) then
    raise exception 'Only Production Control can prepare a controlled Build Order';
  end if;
  if jsonb_typeof(coalesce(p_components, '[]'::jsonb)) <> 'array' then
    raise exception 'Components must be a JSON array';
  end if;
  if p_priority is not null and (p_priority < 1 or p_priority > 5) then
    raise exception 'Priority must be between 1 and 5';
  end if;
  if p_shop_assignee_user_id is not null and not public.mdb_actor_has_role(
    p_shop_assignee_user_id, array['shop', 'production_controller', 'admin']
  ) then raise exception 'Shop assignee is not an active production user'; end if;

  select * into v_actor from public.operational_users
  where id = p_actor_user_id and is_active;
  select * into v_build from public.build_orders where id = p_build_order_id for update;
  if not found then raise exception 'Build Order was not found'; end if;
  if v_build.status <> 'Open' then raise exception 'Only Open Build Orders can be prepared'; end if;

  for v_entry in select value from jsonb_array_elements(coalesce(p_components, '[]'::jsonb))
  loop
    v_component_key := btrim(coalesce(v_entry->>'componentKey', ''));
    v_part := upper(btrim(coalesce(v_entry->>'part', '')));
    begin
      v_quantity := (v_entry->>'quantityRequired')::numeric;
    exception when others then
      raise exception 'Each component needs a numeric quantityRequired';
    end;
    if v_component_key = '' or v_component_key = any(v_component_keys) then
      raise exception 'Each component needs a unique stable componentKey';
    end if;
    if v_part = '' or v_quantity <= 0 then
      raise exception 'Each component needs an Item Master part and positive quantity';
    end if;
    select * into v_item from public.items where part_number = v_part;
    if not found then raise exception 'Component % was not found in the Item Master', v_part; end if;

    v_component_keys := array_append(v_component_keys, v_component_key);
    insert into public.build_order_components (
      build_order_id, component_key, item_id, sort_order, part, description, uom,
      qty_required, qty_reserved, qty_consumed
    ) values (
      v_build.id, v_component_key, v_item.id, v_sort_order, v_item.part_number,
      v_item.description, v_item.uom, v_quantity, 0, 0
    )
    on conflict (build_order_id, component_key) do update
    set item_id = excluded.item_id,
        sort_order = excluded.sort_order,
        part = excluded.part,
        description = excluded.description,
        uom = excluded.uom,
        qty_required = excluded.qty_required;
    v_sort_order := v_sort_order + 1;
  end loop;

  delete from public.build_order_components
  where build_order_id = v_build.id
    and not (component_key = any(v_component_keys));

  update public.build_orders
  set notes = coalesce(p_notes, ''),
      committed_due_date = coalesce(p_committed_due_date, committed_due_date),
      due_date = coalesce(p_committed_due_date, due_date),
      priority = coalesce(p_priority, priority),
      shop_assignee_user_id = coalesce(p_shop_assignee_user_id, shop_assignee_user_id),
      controller_user_id = p_actor_user_id,
      last_modified_by_initials = v_actor.initials,
      last_modified_by_name = v_actor.display_name,
      last_modified_at = now(),
      revision = revision + 1
  where id = v_build.id;

  insert into public.build_order_events values (
    'event-' || gen_random_uuid()::text, v_build.id, 'Edited', 'Build Order prepared by Production Control',
    'Component plan and production commitment reviewed.', v_actor.initials, v_actor.display_name, now()
  );

  return jsonb_build_object(
    'buildOrder', (select to_jsonb(b) from public.build_orders b where b.id = v_build.id),
    'components', (select coalesce(jsonb_agg(to_jsonb(c) order by c.sort_order), '[]'::jsonb)
                   from public.build_order_components c where c.build_order_id = v_build.id)
  );
end;
$$;

revoke all on function public.mdb_update_build_draft_v1(uuid, text, jsonb, text, date, smallint, uuid) from public, anon, authenticated;
grant execute on function public.mdb_update_build_draft_v1(uuid, text, jsonb, text, date, smallint, uuid) to service_role;

create or replace function public.mdb_post_build_progress_v1(
  p_actor_user_id uuid,
  p_build_order_id text,
  p_batch_key text,
  p_consumptions jsonb default '[]'::jsonb,
  p_output_quantity numeric default 0
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_build public.build_orders%rowtype;
  v_actor public.operational_users%rowtype;
  v_component public.build_order_components%rowtype;
  v_entry jsonb;
  v_component_key text;
  v_quantity numeric;
  v_output numeric := coalesce(p_output_quantity, 0);
  v_consumed_total numeric := 0;
  v_sequence int := 0;
  v_result jsonb;
  v_finished boolean := false;
begin
  if btrim(coalesce(p_batch_key, '')) = '' then raise exception 'A posting idempotency key is required'; end if;
  if jsonb_typeof(coalesce(p_consumptions, '[]'::jsonb)) <> 'array' then
    raise exception 'Consumptions must be a JSON array';
  end if;
  if v_output < 0 then raise exception 'Output quantity cannot be negative'; end if;

  select result into v_result from public.inventory_posting_batches where batch_key = p_batch_key;
  if found then return v_result || jsonb_build_object('idempotentReplay', true); end if;

  select * into v_actor from public.operational_users
  where id = p_actor_user_id and is_active;
  if not found or not public.mdb_actor_has_role(
    p_actor_user_id, array['shop', 'production_controller', 'inventory_controller', 'admin']
  ) then raise exception 'Actor is not allowed to post Build Order progress'; end if;

  select * into v_build from public.build_orders where id = p_build_order_id for update;
  if not found then raise exception 'Build Order was not found'; end if;
  if v_build.status <> 'Released' then raise exception 'Only Released Build Orders can post progress'; end if;
  if not public.mdb_actor_has_role(p_actor_user_id, array['production_controller', 'inventory_controller', 'admin'])
    and v_build.shop_assignee_user_id is distinct from p_actor_user_id then
    raise exception 'Shop work is assigned to another employee';
  end if;

  begin
    insert into public.inventory_posting_batches (batch_key, build_order_id, actor_user_id)
    values (p_batch_key, v_build.id, p_actor_user_id);
  exception when unique_violation then
    select result into v_result from public.inventory_posting_batches where batch_key = p_batch_key;
    return v_result || jsonb_build_object('idempotentReplay', true);
  end;

  for v_entry in select value from jsonb_array_elements(coalesce(p_consumptions, '[]'::jsonb))
  loop
    v_component_key := btrim(coalesce(v_entry->>'componentKey', ''));
    begin
      v_quantity := (v_entry->>'quantity')::numeric;
    exception when others then
      raise exception 'Each component consumption needs a numeric quantity';
    end;
    if v_component_key = '' or v_quantity <= 0 then
      raise exception 'Each component consumption needs a component key and positive quantity';
    end if;

    select * into v_component
    from public.build_order_components
    where build_order_id = v_build.id and component_key = v_component_key
    for update;
    if not found then raise exception 'Build component % was not found', v_component_key; end if;
    if v_quantity > v_component.qty_reserved then
      raise exception 'Consumption for % exceeds its reserved quantity', v_component.part;
    end if;

    update public.inventory_stock
    set on_hand = on_hand - v_quantity,
        allocated = greatest(0, allocated - v_quantity),
        last_modified_by_initials = v_actor.initials,
        last_modified_by_name = v_actor.display_name,
        last_modified_at = now()
    where part = v_component.part and on_hand >= v_quantity;
    if not found then raise exception 'Operational inventory for % is insufficient', v_component.part; end if;

    update public.build_order_components
    set qty_reserved = qty_reserved - v_quantity,
        qty_consumed = qty_consumed + v_quantity
    where id = v_component.id;

    v_sequence := v_sequence + 1;
    v_consumed_total := v_consumed_total + v_quantity;
    insert into public.inventory_ledger_entries (
      entry_key, posting_batch_key, entry_sequence, entry_type, item_id, part,
      location_code, quantity_delta, build_order_id, build_component_key, actor_user_id
    ) values (
      p_batch_key || ':consumption:' || v_sequence, p_batch_key, v_sequence,
      'Build Consumption', v_component.item_id, v_component.part, v_build.location_code,
      -v_quantity, v_build.id, v_component.component_key, p_actor_user_id
    );
  end loop;

  if v_output > 0 then
    if v_output > v_build.quantity - v_build.built_qty then
      raise exception 'Output exceeds the remaining Build Order quantity';
    end if;
    insert into public.inventory_stock (
      part, item_id, on_hand, allocated, bin, unit_price,
      last_modified_by_initials, last_modified_by_name, last_modified_at
    ) values (
      v_build.part, v_build.item_id, v_output, 0, '', 0,
      v_actor.initials, v_actor.display_name, now()
    )
    on conflict (part) do update
    set on_hand = public.inventory_stock.on_hand + excluded.on_hand,
        item_id = coalesce(public.inventory_stock.item_id, excluded.item_id),
        last_modified_by_initials = excluded.last_modified_by_initials,
        last_modified_by_name = excluded.last_modified_by_name,
        last_modified_at = now();

    v_sequence := v_sequence + 1;
    insert into public.inventory_ledger_entries (
      entry_key, posting_batch_key, entry_sequence, entry_type, item_id, part,
      location_code, quantity_delta, build_order_id, actor_user_id
    ) values (
      p_batch_key || ':output:' || v_sequence, p_batch_key, v_sequence,
      'Build Output', v_build.item_id, v_build.part, v_build.location_code,
      v_output, v_build.id, p_actor_user_id
    );
  end if;

  if v_sequence = 0 then raise exception 'Enter a component consumption or output quantity'; end if;

  v_finished := v_build.built_qty + v_output >= v_build.quantity;
  update public.build_orders
  set built_qty = built_qty + v_output,
      actual_started_at = coalesce(actual_started_at, now()),
      status = case when v_finished then 'Finished' else status end,
      finished_at = case when v_finished then now() else finished_at end,
      posted_at = case when v_finished then now() else posted_at end,
      posted_by_user_id = case when v_finished then p_actor_user_id else posted_by_user_id end,
      exception_code = case when v_finished then null else exception_code end,
      exception_detail = case when v_finished then '' else exception_detail end,
      revision = revision + 1
  where id = v_build.id;

  if v_finished then
    for v_component in
      select * from public.build_order_components
      where build_order_id = v_build.id and qty_reserved > 0 for update
    loop
      update public.inventory_stock
      set allocated = greatest(0, allocated - v_component.qty_reserved),
          last_modified_by_initials = v_actor.initials,
          last_modified_by_name = v_actor.display_name,
          last_modified_at = now()
      where part = v_component.part;
      update public.build_order_components set qty_reserved = 0 where id = v_component.id;
    end loop;

    insert into public.build_order_events values (
      'event-' || gen_random_uuid()::text, v_build.id, 'Finished', 'Build Order completed and posted',
      v_output || ' ' || v_build.uom || ' output posted.', v_actor.initials, v_actor.display_name, now()
    );
    if v_build.build_request_id is not null then
      update public.build_requests
      set status = 'Fulfilled', fulfilled_at = now()
      where id = v_build.build_request_id and status = 'Accepted';
      insert into public.build_request_events (
        event_key, build_request_id, event_type, summary, detail, actor_user_id
      ) values (
        'bre-' || gen_random_uuid()::text, v_build.build_request_id, 'Fulfilled',
        'Production completed', 'Finished by ' || v_build.build_number, p_actor_user_id
      );
    end if;
  else
    insert into public.build_order_events values (
      'event-' || gen_random_uuid()::text, v_build.id, 'Posted', 'Build progress posted',
      v_consumed_total || ' component units consumed; ' || v_output || ' ' || v_build.uom || ' output posted.',
      v_actor.initials, v_actor.display_name, now()
    );
  end if;

  v_result := jsonb_build_object(
    'posted', true,
    'buildOrderId', v_build.id,
    'consumedQuantity', v_consumed_total,
    'outputQuantity', v_output,
    'finished', v_finished,
    'idempotentReplay', false
  );
  update public.inventory_posting_batches set result = v_result where batch_key = p_batch_key;
  return v_result;
end;
$$;

revoke all on function public.mdb_post_build_progress_v1(uuid, text, text, jsonb, numeric) from public, anon, authenticated;
grant execute on function public.mdb_post_build_progress_v1(uuid, text, text, jsonb, numeric) to service_role;

commit;
