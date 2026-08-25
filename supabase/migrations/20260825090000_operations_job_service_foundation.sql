-- Shared Operations Job and Service workflow foundation.
--
-- Requests remain separate from execution documents. Build Orders and Service
-- Work Orders link to a shared Operations Job for gatekeeper scheduling,
-- work-center capacity, checkpoints, tasks, exceptions, and audit events.

begin;

alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

alter table public.operational_user_roles
  drop constraint if exists operational_user_roles_role_check;

alter table public.operational_user_roles
  add constraint operational_user_roles_role_check check (role in (
    'sales', 'production_controller', 'shop', 'inventory_controller',
    'service_controller', 'service_technician', 'admin'
  ));

create sequence if not exists public.operations_job_no_seq start 1000;
create sequence if not exists public.service_request_no_seq start 1000;
create sequence if not exists public.service_work_order_no_seq start 1000;

create table if not exists public.work_centers (
  id text primary key,
  code text not null unique,
  name text not null,
  center_type text not null check (center_type in (
    'build_bay', 'service_bay', 'field', 'shop_cell', 'inspection', 'other'
  )),
  capacity smallint not null default 1 check (capacity between 1 and 50),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_centers_code_not_blank_check check (btrim(code) <> ''),
  constraint work_centers_name_not_blank_check check (btrim(name) <> '')
);

create table if not exists public.operations_jobs (
  id text primary key,
  job_number text not null unique default (
    'OPJ' || lpad(nextval('public.operations_job_no_seq')::text, 6, '0')
  ),
  job_type text not null check (job_type in (
    'component_build', 'rig_build', 'service_job'
  )),
  status text not null default 'Planning' check (status in (
    'Planning', 'Order Setup Pending', 'Scheduled', 'Released', 'In Progress',
    'Work Complete', 'Signoff Complete', 'Closed', 'Cancelled'
  )),
  title text not null,
  controller_user_id uuid references public.operational_users(id) on delete restrict,
  assignee_user_id uuid references public.operational_users(id) on delete restrict,
  priority smallint not null default 3 check (priority between 1 and 5),
  work_center_id text references public.work_centers(id) on delete restrict,
  planned_start_at timestamptz,
  committed_due_at timestamptz,
  actual_started_at timestamptz,
  work_completed_at timestamptz,
  signoff_completed_at timestamptz,
  closed_at timestamptz,
  cancelled_at timestamptz,
  exception_code text check (exception_code is null or exception_code in (
    'needs_information', 'awaiting_parts', 'awaiting_customer', 'blocked',
    'on_hold', 'customer_change', 'warranty_review', 'at_risk'
  )),
  exception_detail text not null default '',
  gp_link_status text not null default 'Pending' check (gp_link_status in (
    'Pending', 'Linked', 'Not Required', 'Conflict'
  )),
  external_gp_company_id text,
  external_gp_order_number text,
  external_gp_mo_number text,
  created_by_user_id uuid references public.operational_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operations_jobs_title_not_blank_check check (btrim(title) <> ''),
  constraint operations_jobs_schedule_window_check check (
    planned_start_at is null or committed_due_at is null or planned_start_at < committed_due_at
  )
);

create table if not exists public.operations_job_assignments (
  id bigint generated always as identity primary key,
  job_id text not null references public.operations_jobs(id) on delete restrict,
  work_center_id text not null references public.work_centers(id) on delete restrict,
  slot_number smallint not null default 1 check (slot_number between 1 and 50),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  revision int not null check (revision > 0),
  reason text not null,
  created_by_user_id uuid not null references public.operational_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  superseded_at timestamptz,
  superseded_by_user_id uuid references public.operational_users(id) on delete restrict,
  constraint operations_job_assignments_window_check check (starts_at < ends_at),
  constraint operations_job_assignments_reason_not_blank_check check (btrim(reason) <> ''),
  unique (job_id, revision)
);

create unique index if not exists operations_job_assignments_active_job_uidx
  on public.operations_job_assignments (job_id)
  where superseded_at is null;

create index if not exists operations_job_assignments_center_window_idx
  on public.operations_job_assignments (work_center_id, slot_number, starts_at, ends_at)
  where superseded_at is null;

create table if not exists public.operations_job_events (
  event_key text primary key,
  job_id text not null references public.operations_jobs(id) on delete restrict,
  event_type text not null check (event_type in (
    'Created', 'OrderSetupPending', 'Scheduled', 'ScheduleRevised', 'Assigned',
    'Released', 'Started', 'CheckpointUpdated', 'ScopeRevised', 'SignoffRecorded',
    'Blocked', 'Held', 'Resumed', 'WorkCompleted', 'SignoffCompleted', 'Closed',
    'Reopened', 'Cancelled', 'ExceptionCleared', 'GPLinked', 'Commented'
  )),
  summary text not null,
  detail text not null default '',
  actor_user_id uuid references public.operational_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint operations_job_events_summary_not_blank_check check (btrim(summary) <> '')
);

create table if not exists public.operations_checkpoint_definitions (
  checkpoint_key text not null,
  version int not null default 1 check (version > 0),
  applies_to_job_type text not null check (applies_to_job_type in (
    'all', 'component_build', 'rig_build', 'service_job'
  )),
  name text not null,
  sequence int not null default 0,
  owner_role text,
  requires_evidence boolean not null default false,
  is_required boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (checkpoint_key, version),
  constraint operations_checkpoint_key_not_blank_check check (btrim(checkpoint_key) <> ''),
  constraint operations_checkpoint_name_not_blank_check check (btrim(name) <> '')
);

create table if not exists public.operations_job_checkpoints (
  job_id text not null references public.operations_jobs(id) on delete restrict,
  checkpoint_key text not null,
  checkpoint_version int not null,
  status text not null default 'Pending' check (status in (
    'Pending', 'Ready', 'Blocked', 'Complete', 'Waived'
  )),
  owner_role text,
  assignee_user_id uuid references public.operational_users(id) on delete restrict,
  substitute_user_id uuid references public.operational_users(id) on delete restrict,
  due_at timestamptz,
  completed_at timestamptz,
  evidence_note text not null default '',
  blocker_detail text not null default '',
  updated_by_user_id uuid references public.operational_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (job_id, checkpoint_key, checkpoint_version),
  constraint operations_job_checkpoint_definition_fk
    foreign key (checkpoint_key, checkpoint_version)
    references public.operations_checkpoint_definitions(checkpoint_key, version)
    on update restrict on delete restrict
);

create table if not exists public.service_requests (
  id text primary key,
  request_number text not null unique default (
    'SRQ' || lpad(nextval('public.service_request_no_seq')::text, 6, '0')
  ),
  source_channel text not null default 'Desktop' check (source_channel in (
    'Desktop', 'Mobile', 'NFC', 'Email', 'Import'
  )),
  requester_user_id uuid not null references public.operational_users(id) on delete restrict,
  gatekeeper_user_id uuid references public.operational_users(id) on delete restrict,
  urgency text not null default 'Routine' check (urgency in (
    'Routine', 'Priority', 'Urgent', 'Machine Down', 'Safety'
  )),
  customer_id text,
  customer_name_snapshot text not null default '',
  service_location text not null default '',
  customer_contact_snapshot text not null default '',
  asset_id text,
  production_serial text,
  rig_model text not null default '',
  drill_hours numeric check (drill_hours is null or drill_hours >= 0),
  complaint text not null default '',
  requested_work text not null default '',
  financial_class text not null default 'Unknown' check (financial_class in (
    'Unknown', 'Warranty', 'Billable'
  )),
  service_mode text not null default 'Unknown' check (service_mode in (
    'Unknown', 'In House', 'Field', 'Outside'
  )),
  status text not null default 'Draft' check (status in (
    'Draft', 'Submitted', 'Needs Information', 'Returned', 'Triaged',
    'Accepted', 'Converted', 'Resolved', 'Cancelled'
  )),
  returned_reason text not null default '',
  source_evidence_type text,
  source_evidence_id text,
  submitted_at timestamptz,
  triaged_at timestamptz,
  accepted_at timestamptz,
  converted_at timestamptz,
  resolved_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_requests_work_description_check check (
    btrim(complaint) <> '' or btrim(requested_work) <> ''
  ),
  constraint service_requests_asset_context_check check (
    coalesce(btrim(asset_id), '') <> '' or coalesce(btrim(production_serial), '') <> ''
  )
);

create table if not exists public.service_request_events (
  event_key text primary key,
  service_request_id text not null references public.service_requests(id) on delete restrict,
  event_type text not null check (event_type in (
    'Created', 'Submitted', 'NeedsInformation', 'Returned', 'Triaged',
    'Accepted', 'Converted', 'Resolved', 'Cancelled', 'Commented'
  )),
  summary text not null,
  detail text not null default '',
  actor_user_id uuid references public.operational_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint service_request_events_summary_not_blank_check check (btrim(summary) <> '')
);

create table if not exists public.service_work_orders (
  id text primary key,
  work_order_number text not null unique default (
    'SWRK' || lpad(nextval('public.service_work_order_no_seq')::text, 6, '0')
  ),
  service_request_id text not null unique references public.service_requests(id) on delete restrict,
  operations_job_id text not null unique references public.operations_jobs(id) on delete restrict,
  scope_version int not null default 0 check (scope_version >= 0),
  scope_summary text not null default '',
  external_gp_service_order_number text,
  external_gp_warranty_order_number text,
  external_gp_mo_number text,
  external_gp_po_number text,
  external_gp_invoice_number text,
  gp_verified_at timestamptz,
  created_by_user_id uuid not null references public.operational_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_scope_items (
  id bigint generated always as identity primary key,
  service_work_order_id text not null references public.service_work_orders(id) on delete restrict,
  scope_version int not null check (scope_version > 0),
  sequence int not null check (sequence > 0),
  section text not null check (section in (
    'Preparation', 'Complaint', 'Cause', 'Correction', 'Inspection',
    'Technician Findings', 'Completion', 'Declined Work', 'Other'
  )),
  detail text not null,
  status text not null default 'Pending' check (status in (
    'Pending', 'In Progress', 'Blocked', 'Complete', 'Declined', 'Waived'
  )),
  is_required boolean not null default true,
  assignee_user_id uuid references public.operational_users(id) on delete restrict,
  completed_at timestamptz,
  evidence_note text not null default '',
  created_at timestamptz not null default now(),
  unique (service_work_order_id, scope_version, sequence),
  constraint service_scope_items_detail_not_blank_check check (btrim(detail) <> '')
);

create table if not exists public.service_documents (
  id bigint generated always as identity primary key,
  service_work_order_id text not null references public.service_work_orders(id) on delete restrict,
  category text not null check (category in (
    'Scope of Work', 'Before Photo', 'After Photo', 'Inspection',
    'Signed Completion', 'Shipping', 'Customer Evidence', 'Other'
  )),
  object_key text not null,
  file_name text not null,
  media_type text not null,
  byte_size bigint not null check (byte_size >= 0),
  sha256 text not null,
  source_evidence_id text,
  uploaded_by_user_id uuid not null references public.operational_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (service_work_order_id, sha256),
  constraint service_documents_object_key_not_blank_check check (btrim(object_key) <> ''),
  constraint service_documents_sha256_check check (sha256 ~ '^[0-9a-fA-F]{64}$')
);

create table if not exists public.service_signoffs (
  signoff_key text primary key,
  service_work_order_id text not null references public.service_work_orders(id) on delete restrict,
  scope_version int not null check (scope_version > 0),
  party_type text not null check (party_type in ('Internal', 'Customer')),
  representative_name text not null,
  decision text not null check (decision in (
    'Accepted', 'Accepted With Exceptions', 'Declined'
  )),
  notes text not null default '',
  captured_by_user_id uuid not null references public.operational_users(id) on delete restrict,
  signed_at timestamptz not null default now(),
  unique (service_work_order_id, scope_version, party_type),
  constraint service_signoffs_representative_not_blank_check check (btrim(representative_name) <> '')
);

create table if not exists public.workflow_tasks (
  id text primary key,
  job_id text references public.operations_jobs(id) on delete restrict,
  service_request_id text references public.service_requests(id) on delete restrict,
  service_work_order_id text references public.service_work_orders(id) on delete restrict,
  task_type text not null check (task_type in (
    'order_setup', 'po_decision', 'part_number_router', 'parts_identification',
    'customer_clarification', 'accounting_closeout', 'document_followup', 'other'
  )),
  title text not null,
  status text not null default 'Open' check (status in (
    'Open', 'In Progress', 'Blocked', 'Complete', 'Cancelled'
  )),
  owner_role text,
  assigned_user_id uuid references public.operational_users(id) on delete restrict,
  due_at timestamptz,
  completed_at timestamptz,
  detail text not null default '',
  created_by_user_id uuid not null references public.operational_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workflow_tasks_link_check check (
    job_id is not null or service_request_id is not null or service_work_order_id is not null
  ),
  constraint workflow_tasks_title_not_blank_check check (btrim(title) <> '')
);

create table if not exists public.notification_outbox (
  id bigint generated always as identity primary key,
  aggregate_type text not null,
  aggregate_id text not null,
  event_type text not null,
  recipient_role text,
  recipient_user_id uuid references public.operational_users(id) on delete restrict,
  idempotency_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'Pending' check (status in (
    'Pending', 'Sending', 'Sent', 'Failed', 'Cancelled'
  )),
  attempt_count int not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  sent_at timestamptz,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_outbox_aggregate_check check (
    btrim(aggregate_type) <> '' and btrim(aggregate_id) <> '' and btrim(event_type) <> ''
  )
);

create index if not exists operations_jobs_queue_idx
  on public.operations_jobs (status, priority, committed_due_at, created_at);
create index if not exists operations_jobs_assignee_idx
  on public.operations_jobs (assignee_user_id, status);
create index if not exists operations_job_events_job_created_idx
  on public.operations_job_events (job_id, created_at desc);
create index if not exists operations_job_checkpoints_status_due_idx
  on public.operations_job_checkpoints (status, due_at);
create index if not exists service_requests_queue_idx
  on public.service_requests (status, urgency, created_at);
create index if not exists service_requests_requester_idx
  on public.service_requests (requester_user_id, created_at desc);
create index if not exists service_request_events_request_created_idx
  on public.service_request_events (service_request_id, created_at desc);
create index if not exists service_scope_items_order_version_idx
  on public.service_scope_items (service_work_order_id, scope_version, sequence);
create index if not exists workflow_tasks_queue_idx
  on public.workflow_tasks (status, owner_role, due_at);
create index if not exists notification_outbox_pending_idx
  on public.notification_outbox (status, available_at, id)
  where status in ('Pending', 'Failed');

drop trigger if exists work_centers_set_updated_at on public.work_centers;
create trigger work_centers_set_updated_at
before update on public.work_centers
for each row execute function public.mdb_set_updated_at();

drop trigger if exists operations_jobs_set_updated_at on public.operations_jobs;
create trigger operations_jobs_set_updated_at
before update on public.operations_jobs
for each row execute function public.mdb_set_updated_at();

drop trigger if exists operations_job_checkpoints_set_updated_at on public.operations_job_checkpoints;
create trigger operations_job_checkpoints_set_updated_at
before update on public.operations_job_checkpoints
for each row execute function public.mdb_set_updated_at();

drop trigger if exists service_requests_set_updated_at on public.service_requests;
create trigger service_requests_set_updated_at
before update on public.service_requests
for each row execute function public.mdb_set_updated_at();

drop trigger if exists service_work_orders_set_updated_at on public.service_work_orders;
create trigger service_work_orders_set_updated_at
before update on public.service_work_orders
for each row execute function public.mdb_set_updated_at();

drop trigger if exists workflow_tasks_set_updated_at on public.workflow_tasks;
create trigger workflow_tasks_set_updated_at
before update on public.workflow_tasks
for each row execute function public.mdb_set_updated_at();

drop trigger if exists notification_outbox_set_updated_at on public.notification_outbox;
create trigger notification_outbox_set_updated_at
before update on public.notification_outbox
for each row execute function public.mdb_set_updated_at();

create or replace function public.mdb_enforce_work_center_capacity_v1()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_capacity smallint;
begin
  select capacity into v_capacity
  from public.work_centers
  where id = new.work_center_id and is_active;

  if v_capacity is null then
    raise exception 'Work center is missing or inactive';
  end if;
  if new.slot_number > v_capacity then
    raise exception 'Slot % exceeds work center capacity %', new.slot_number, v_capacity;
  end if;
  if new.starts_at >= new.ends_at then
    raise exception 'Schedule end must be after its start';
  end if;
  if new.superseded_at is null and exists (
    select 1
    from public.operations_job_assignments existing
    where existing.work_center_id = new.work_center_id
      and existing.slot_number = new.slot_number
      and existing.superseded_at is null
      and existing.id <> coalesce(new.id, 0)
      and tstzrange(existing.starts_at, existing.ends_at, '[)')
          && tstzrange(new.starts_at, new.ends_at, '[)')
  ) then
    raise exception 'Work center slot is already committed during that window';
  end if;
  return new;
end;
$$;

drop trigger if exists operations_job_assignments_capacity_guard on public.operations_job_assignments;
create trigger operations_job_assignments_capacity_guard
before insert or update on public.operations_job_assignments
for each row execute function public.mdb_enforce_work_center_capacity_v1();

insert into public.operations_checkpoint_definitions (
  checkpoint_key, version, applies_to_job_type, name, sequence, owner_role,
  requires_evidence, is_required
) values
  ('parts_staged', 1, 'rig_build', 'Parts staged', 10, 'inventory_controller', false, true),
  ('build_book_digital', 1, 'rig_build', 'Digital build book ready', 20, 'production_controller', true, true),
  ('build_book_physical', 1, 'rig_build', 'Physical build book ready', 30, 'production_controller', true, true),
  ('final_inspection', 1, 'rig_build', 'Final inspection complete', 40, 'production_controller', true, true),
  ('punch_list', 1, 'rig_build', 'Punch list complete', 50, 'production_controller', true, true),
  ('customer_manual_digital', 1, 'rig_build', 'Digital customer manual ready', 60, 'production_controller', true, true),
  ('customer_manual_physical', 1, 'rig_build', 'Physical customer manual ready', 70, 'production_controller', true, true),
  ('good_to_go', 1, 'rig_build', 'Good-to-go gate complete', 80, 'production_controller', true, true),
  ('before_photos', 1, 'service_job', 'Before photos captured', 10, 'service_technician', true, true),
  ('safety_functions', 1, 'service_job', 'Safety functions confirmed', 20, 'service_technician', true, true),
  ('service_inspection', 1, 'service_job', 'Inspection complete', 30, 'service_technician', true, true),
  ('after_photos', 1, 'service_job', 'Repair evidence captured', 40, 'service_technician', true, true),
  ('final_clean', 1, 'service_job', 'Final clean complete', 50, 'service_technician', false, true),
  ('shipping_pickup', 1, 'service_job', 'Shipping or pickup ready', 60, 'service_controller', false, true)
on conflict (checkpoint_key, version) do nothing;

-- Build Orders keep production-specific quantities and posting. The common job
-- link adds shared scheduling, checkpoints, and gatekeeper visibility.
alter table public.build_orders
  add column if not exists operations_job_id text references public.operations_jobs(id) on delete restrict,
  add column if not exists work_type text not null default 'component_build' check (work_type in (
    'component_build', 'rig_build'
  )),
  add column if not exists production_serial text,
  add column if not exists rig_model text,
  add column if not exists base_carrier text;

insert into public.operations_jobs (
  id, job_number, job_type, status, title, controller_user_id, assignee_user_id,
  priority, planned_start_at, committed_due_at, actual_started_at,
  work_completed_at, closed_at, cancelled_at, created_at, updated_at
)
select
  'opj-build-' || b.id,
  'OPJ-B-' || b.id,
  b.work_type,
  case
    when b.status = 'Finished' then 'Closed'
    when b.status = 'Cancelled' then 'Cancelled'
    when b.status = 'Released' and (b.built_qty > 0 or b.actual_started_at is not null) then 'In Progress'
    when b.status = 'Released' then 'Released'
    when b.build_request_id is not null then 'Scheduled'
    else 'Planning'
  end,
  coalesce(nullif(b.description, ''), nullif(b.part, ''), b.build_number),
  b.controller_user_id,
  b.shop_assignee_user_id,
  b.priority,
  null,
  coalesce(b.committed_due_date, b.due_date)::timestamptz,
  b.actual_started_at,
  b.finished_at,
  b.finished_at,
  case when b.status = 'Cancelled' then b.last_modified_at else null end,
  b.created_at,
  b.last_modified_at
from public.build_orders b
where b.operations_job_id is null
on conflict (id) do nothing;

update public.build_orders
set operations_job_id = 'opj-build-' || id
where operations_job_id is null;

create unique index if not exists build_orders_operations_job_uidx
  on public.build_orders (operations_job_id)
  where operations_job_id is not null;

create or replace function public.mdb_sync_build_operations_job_v1()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_job_id text;
  v_job_status text;
begin
  v_job_id := coalesce(new.operations_job_id, 'opj-build-' || new.id);
  v_job_status := case
    when new.status = 'Finished' then 'Closed'
    when new.status = 'Cancelled' then 'Cancelled'
    when new.status = 'Released' and (new.built_qty > 0 or new.actual_started_at is not null) then 'In Progress'
    when new.status = 'Released' then 'Released'
    when new.build_request_id is not null then 'Scheduled'
    else 'Planning'
  end;

  insert into public.operations_jobs (
    id, job_number, job_type, status, title, controller_user_id, assignee_user_id,
    priority, committed_due_at, actual_started_at, work_completed_at, closed_at,
    cancelled_at, created_by_user_id, created_at, updated_at
  ) values (
    v_job_id,
    'OPJ-B-' || new.id,
    new.work_type,
    v_job_status,
    coalesce(nullif(new.description, ''), nullif(new.part, ''), new.build_number),
    new.controller_user_id,
    new.shop_assignee_user_id,
    new.priority,
    coalesce(new.committed_due_date, new.due_date)::timestamptz,
    new.actual_started_at,
    new.finished_at,
    new.finished_at,
    case when new.status = 'Cancelled' then now() else null end,
    new.controller_user_id,
    new.created_at,
    new.last_modified_at
  )
  on conflict (id) do update set
    job_type = excluded.job_type,
    status = excluded.status,
    title = excluded.title,
    controller_user_id = excluded.controller_user_id,
    assignee_user_id = excluded.assignee_user_id,
    priority = excluded.priority,
    committed_due_at = excluded.committed_due_at,
    actual_started_at = excluded.actual_started_at,
    work_completed_at = excluded.work_completed_at,
    closed_at = excluded.closed_at,
    cancelled_at = excluded.cancelled_at;

  new.operations_job_id := v_job_id;
  return new;
end;
$$;

drop trigger if exists build_orders_operations_job_sync on public.build_orders;
create trigger build_orders_operations_job_sync
before insert or update of status, build_request_id, controller_user_id,
  shop_assignee_user_id, priority, committed_due_date, due_date, actual_started_at,
  built_qty, finished_at, description, part, work_type, production_serial,
  rig_model, base_carrier
on public.build_orders
for each row execute function public.mdb_sync_build_operations_job_v1();

-- Capacity checks and every operational command remain server-only.
alter table public.work_centers enable row level security;
alter table public.operations_jobs enable row level security;
alter table public.operations_job_assignments enable row level security;
alter table public.operations_job_events enable row level security;
alter table public.operations_checkpoint_definitions enable row level security;
alter table public.operations_job_checkpoints enable row level security;
alter table public.service_requests enable row level security;
alter table public.service_request_events enable row level security;
alter table public.service_work_orders enable row level security;
alter table public.service_scope_items enable row level security;
alter table public.service_documents enable row level security;
alter table public.service_signoffs enable row level security;
alter table public.workflow_tasks enable row level security;
alter table public.notification_outbox enable row level security;

revoke all on table public.work_centers from anon, authenticated, public;
revoke all on table public.operations_jobs from anon, authenticated, public;
revoke all on table public.operations_job_assignments from anon, authenticated, public;
revoke all on table public.operations_job_events from anon, authenticated, public;
revoke all on table public.operations_checkpoint_definitions from anon, authenticated, public;
revoke all on table public.operations_job_checkpoints from anon, authenticated, public;
revoke all on table public.service_requests from anon, authenticated, public;
revoke all on table public.service_request_events from anon, authenticated, public;
revoke all on table public.service_work_orders from anon, authenticated, public;
revoke all on table public.service_scope_items from anon, authenticated, public;
revoke all on table public.service_documents from anon, authenticated, public;
revoke all on table public.service_signoffs from anon, authenticated, public;
revoke all on table public.workflow_tasks from anon, authenticated, public;
revoke all on table public.notification_outbox from anon, authenticated, public;

revoke all on public.work_centers from service_role;
revoke all on public.operations_jobs from service_role;
revoke all on public.operations_job_assignments from service_role;
revoke all on public.operations_job_events from service_role;
revoke all on public.operations_checkpoint_definitions from service_role;
revoke all on public.operations_job_checkpoints from service_role;
revoke all on public.service_requests from service_role;
revoke all on public.service_request_events from service_role;
revoke all on public.service_work_orders from service_role;
revoke all on public.service_scope_items from service_role;
revoke all on public.service_documents from service_role;
revoke all on public.service_signoffs from service_role;
revoke all on public.workflow_tasks from service_role;
revoke all on public.notification_outbox from service_role;

grant select, insert, update on public.work_centers to service_role;
grant select, insert, update on public.operations_jobs to service_role;
grant select, insert, update on public.operations_job_assignments to service_role;
grant select, insert on public.operations_job_events to service_role;
grant select, insert, update on public.operations_checkpoint_definitions to service_role;
grant select, insert, update on public.operations_job_checkpoints to service_role;
grant select, insert, update on public.service_requests to service_role;
grant select, insert on public.service_request_events to service_role;
grant select, insert, update on public.service_work_orders to service_role;
grant select, insert, update on public.service_scope_items to service_role;
grant select, insert on public.service_documents to service_role;
grant select, insert on public.service_signoffs to service_role;
grant select, insert, update on public.workflow_tasks to service_role;
grant select, insert, update on public.notification_outbox to service_role;

grant usage, select on sequence public.operations_job_no_seq to service_role;
grant usage, select on sequence public.service_request_no_seq to service_role;
grant usage, select on sequence public.service_work_order_no_seq to service_role;
grant usage, select on sequence public.operations_job_assignments_id_seq to service_role;
grant usage, select on sequence public.service_scope_items_id_seq to service_role;
grant usage, select on sequence public.service_documents_id_seq to service_role;
grant usage, select on sequence public.notification_outbox_id_seq to service_role;

create or replace function public.mdb_create_service_request_v1(
  p_actor_user_id uuid,
  p_source_channel text,
  p_urgency text,
  p_customer_name text,
  p_service_location text,
  p_customer_contact text,
  p_asset_id text,
  p_production_serial text,
  p_rig_model text,
  p_drill_hours numeric,
  p_complaint text,
  p_requested_work text,
  p_financial_class text default 'Unknown',
  p_service_mode text default 'Unknown',
  p_submit boolean default false,
  p_request_id text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_request_id text := coalesce(nullif(btrim(p_request_id), ''), 'srvreq-' || gen_random_uuid()::text);
  v_existing public.service_requests%rowtype;
begin
  if not public.mdb_actor_has_role(p_actor_user_id, array[
    'sales', 'shop', 'service_technician', 'service_controller',
    'production_controller', 'admin'
  ]) then
    raise exception 'Actor is not allowed to create Service Requests';
  end if;
  if coalesce(btrim(p_asset_id), '') = '' and coalesce(btrim(p_production_serial), '') = '' then
    raise exception 'An asset or production serial is required';
  end if;
  if coalesce(btrim(p_complaint), '') = '' and coalesce(btrim(p_requested_work), '') = '' then
    raise exception 'A complaint or requested work description is required';
  end if;

  select * into v_existing from public.service_requests where id = v_request_id;
  if found then
    if v_existing.requester_user_id <> p_actor_user_id then
      raise exception 'Request identifier already belongs to another actor';
    end if;
    return jsonb_build_object('request', to_jsonb(v_existing), 'idempotentReplay', true);
  end if;

  insert into public.service_requests (
    id, source_channel, requester_user_id, urgency, customer_name_snapshot,
    service_location, customer_contact_snapshot, asset_id, production_serial,
    rig_model, drill_hours, complaint, requested_work, financial_class,
    service_mode, status, submitted_at
  ) values (
    v_request_id, p_source_channel, p_actor_user_id, p_urgency,
    coalesce(p_customer_name, ''), coalesce(p_service_location, ''),
    coalesce(p_customer_contact, ''), nullif(btrim(p_asset_id), ''),
    nullif(btrim(p_production_serial), ''), coalesce(p_rig_model, ''),
    p_drill_hours, coalesce(p_complaint, ''), coalesce(p_requested_work, ''),
    p_financial_class, p_service_mode,
    case when p_submit then 'Submitted' else 'Draft' end,
    case when p_submit then now() else null end
  );

  insert into public.service_request_events (
    event_key, service_request_id, event_type, summary, actor_user_id
  ) values (
    'sre-' || gen_random_uuid()::text, v_request_id, 'Created',
    'Service Request created', p_actor_user_id
  );
  if p_submit then
    insert into public.service_request_events (
      event_key, service_request_id, event_type, summary, actor_user_id
    ) values (
      'sre-' || gen_random_uuid()::text, v_request_id, 'Submitted',
      'Submitted for service triage', p_actor_user_id
    );
    insert into public.notification_outbox (
      aggregate_type, aggregate_id, event_type, recipient_role,
      idempotency_key, payload
    ) values (
      'ServiceRequest', v_request_id, 'Submitted', 'service_controller',
      'service-request:' || v_request_id || ':submitted',
      jsonb_build_object('serviceRequestId', v_request_id, 'urgency', p_urgency)
    );
  end if;

  return jsonb_build_object(
    'request', (select to_jsonb(r) from public.service_requests r where r.id = v_request_id),
    'idempotentReplay', false
  );
end;
$$;

create or replace function public.mdb_transition_service_request_v1(
  p_actor_user_id uuid,
  p_service_request_id text,
  p_action text,
  p_note text default '',
  p_financial_class text default null,
  p_service_mode text default null,
  p_priority smallint default null,
  p_controller_user_id uuid default null,
  p_assignee_user_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_request public.service_requests%rowtype;
  v_action text := lower(btrim(p_action));
  v_is_controller boolean;
  v_is_owner boolean;
  v_job_id text;
  v_work_order_id text;
  v_event_type text;
  v_event_summary text;
begin
  select * into v_request
  from public.service_requests
  where id = p_service_request_id
  for update;
  if not found then raise exception 'Service Request not found'; end if;

  v_is_controller := public.mdb_actor_has_role(p_actor_user_id, array[
    'service_controller', 'production_controller', 'admin'
  ]);
  v_is_owner := v_request.requester_user_id = p_actor_user_id;

  if v_action = 'submit' then
    if v_request.status not in ('Draft', 'Returned', 'Needs Information') or not (v_is_owner or v_is_controller) then
      raise exception 'Service Request cannot be submitted by this actor';
    end if;
    update public.service_requests
    set status = 'Submitted', returned_reason = '', submitted_at = now()
    where id = v_request.id;
    v_event_type := 'Submitted';
    v_event_summary := 'Submitted for service triage';

  elsif v_action = 'triage' then
    if v_request.status <> 'Submitted' or not v_is_controller then
      raise exception 'Only a service gatekeeper can triage submitted requests';
    end if;
    update public.service_requests
    set status = 'Triaged', triaged_at = now(),
        gatekeeper_user_id = coalesce(p_controller_user_id, p_actor_user_id),
        financial_class = coalesce(p_financial_class, financial_class),
        service_mode = coalesce(p_service_mode, service_mode)
    where id = v_request.id;
    v_event_type := 'Triaged';
    v_event_summary := 'Service Request triaged';

  elsif v_action in ('needs_information', 'return') then
    if v_request.status not in ('Submitted', 'Triaged') or not v_is_controller then
      raise exception 'Only a service gatekeeper can return a request for information';
    end if;
    if btrim(coalesce(p_note, '')) = '' then raise exception 'A return reason is required'; end if;
    update public.service_requests
    set status = case when v_action = 'return' then 'Returned' else 'Needs Information' end,
        returned_reason = p_note,
        gatekeeper_user_id = coalesce(p_controller_user_id, p_actor_user_id)
    where id = v_request.id;
    v_event_type := case when v_action = 'return' then 'Returned' else 'NeedsInformation' end;
    v_event_summary := 'Service gatekeeper needs more information';

  elsif v_action = 'accept' then
    if v_request.status <> 'Triaged' or not v_is_controller then
      raise exception 'Only a service gatekeeper can accept triaged requests';
    end if;
    update public.service_requests
    set status = 'Accepted', accepted_at = now(),
        gatekeeper_user_id = coalesce(p_controller_user_id, p_actor_user_id),
        financial_class = coalesce(p_financial_class, financial_class),
        service_mode = coalesce(p_service_mode, service_mode)
    where id = v_request.id;
    v_event_type := 'Accepted';
    v_event_summary := 'Service Request accepted';

  elsif v_action = 'convert' then
    if v_request.status = 'Converted' then
      select operations_job_id, id into v_job_id, v_work_order_id
      from public.service_work_orders where service_request_id = v_request.id;
      return jsonb_build_object(
        'request', (select to_jsonb(r) from public.service_requests r where r.id = v_request.id),
        'operationsJobId', v_job_id,
        'serviceWorkOrderId', v_work_order_id,
        'idempotentReplay', true
      );
    end if;
    if v_request.status <> 'Accepted' or not v_is_controller then
      raise exception 'Only an accepted request can become a Service Work Order';
    end if;
    if p_assignee_user_id is not null and not public.mdb_actor_has_role(p_assignee_user_id, array[
      'service_technician', 'shop', 'service_controller', 'production_controller', 'admin'
    ]) then
      raise exception 'Assigned employee is not eligible for service execution';
    end if;

    v_job_id := 'opj-service-' || gen_random_uuid()::text;
    v_work_order_id := 'swo-' || gen_random_uuid()::text;
    insert into public.operations_jobs (
      id, job_type, status, title, controller_user_id, assignee_user_id,
      priority, gp_link_status, created_by_user_id
    ) values (
      v_job_id, 'service_job', 'Order Setup Pending',
      'Service - ' || coalesce(
        nullif(v_request.production_serial, ''), nullif(v_request.asset_id, ''),
        nullif(v_request.rig_model, ''), v_request.request_number
      ),
      coalesce(p_controller_user_id, p_actor_user_id), p_assignee_user_id,
      coalesce(p_priority, 3), 'Pending', p_actor_user_id
    );
    insert into public.operations_job_events (
      event_key, job_id, event_type, summary, detail, actor_user_id
    ) values (
      'oje-' || gen_random_uuid()::text, v_job_id, 'Created',
      'Service Operations Job created', 'Converted from ' || v_request.request_number,
      p_actor_user_id
    );
    insert into public.service_work_orders (
      id, service_request_id, operations_job_id, scope_summary, created_by_user_id
    ) values (
      v_work_order_id, v_request.id, v_job_id, v_request.requested_work, p_actor_user_id
    );
    insert into public.operations_job_checkpoints (
      job_id, checkpoint_key, checkpoint_version, owner_role
    )
    select v_job_id, d.checkpoint_key, d.version, d.owner_role
    from public.operations_checkpoint_definitions d
    where d.is_active and d.applies_to_job_type in ('all', 'service_job');
    insert into public.workflow_tasks (
      id, job_id, service_request_id, service_work_order_id, task_type, title,
      owner_role, created_by_user_id
    ) values (
      'task-' || gen_random_uuid()::text, v_job_id, v_request.id, v_work_order_id,
      'order_setup', 'Create or link the official service order',
      'service_controller', p_actor_user_id
    );
    update public.service_requests
    set status = 'Converted', converted_at = now()
    where id = v_request.id;
    v_event_type := 'Converted';
    v_event_summary := 'Converted to a controlled Service Work Order';

  elsif v_action = 'cancel' then
    if v_request.status in ('Converted', 'Resolved', 'Cancelled')
       or not (v_is_owner or v_is_controller) then
      raise exception 'Service Request cannot be cancelled by this actor';
    end if;
    update public.service_requests set status = 'Cancelled', cancelled_at = now()
    where id = v_request.id;
    v_event_type := 'Cancelled';
    v_event_summary := 'Service Request cancelled';

  else
    raise exception 'Unsupported Service Request action: %', p_action;
  end if;

  insert into public.service_request_events (
    event_key, service_request_id, event_type, summary, detail, actor_user_id
  ) values (
    'sre-' || gen_random_uuid()::text, v_request.id, v_event_type,
    v_event_summary, coalesce(p_note, ''), p_actor_user_id
  );
  insert into public.notification_outbox (
    aggregate_type, aggregate_id, event_type, recipient_user_id,
    idempotency_key, payload
  ) values (
    'ServiceRequest', v_request.id, v_event_type, v_request.requester_user_id,
    'service-request:' || v_request.id || ':' || lower(v_event_type) || ':' || gen_random_uuid()::text,
    jsonb_build_object('serviceRequestId', v_request.id, 'status', v_event_type)
  );

  return jsonb_build_object(
    'request', (select to_jsonb(r) from public.service_requests r where r.id = v_request.id),
    'operationsJobId', v_job_id,
    'serviceWorkOrderId', v_work_order_id,
    'idempotentReplay', false
  );
end;
$$;

create or replace function public.mdb_schedule_operations_job_v1(
  p_actor_user_id uuid,
  p_operations_job_id text,
  p_work_center_id text,
  p_slot_number smallint,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_reason text,
  p_priority smallint default null,
  p_assignee_user_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_job public.operations_jobs%rowtype;
  v_revision int;
  v_assignment_id bigint;
  v_event_type text;
begin
  select * into v_job from public.operations_jobs
  where id = p_operations_job_id for update;
  if not found then raise exception 'Operations Job not found'; end if;
  if v_job.status in ('Released', 'In Progress', 'Work Complete', 'Signoff Complete', 'Closed', 'Cancelled') then
    raise exception 'Operations Job cannot be scheduled from status %', v_job.status;
  end if;
  if v_job.job_type = 'service_job' then
    if not public.mdb_actor_has_role(p_actor_user_id, array[
      'service_controller', 'production_controller', 'admin'
    ]) then raise exception 'Only a service gatekeeper can schedule service work'; end if;
  elsif not public.mdb_actor_has_role(p_actor_user_id, array['production_controller', 'admin']) then
    raise exception 'Only Production Control can schedule build work';
  end if;
  if p_assignee_user_id is not null and not public.mdb_actor_has_role(p_assignee_user_id, array[
    'service_technician', 'shop', 'service_controller', 'production_controller', 'admin'
  ]) then
    raise exception 'Assigned employee is not eligible for operations execution';
  end if;
  if p_starts_at >= p_ends_at then raise exception 'Schedule end must be after its start'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'A schedule reason is required'; end if;

  select coalesce(max(revision), 0) + 1 into v_revision
  from public.operations_job_assignments where job_id = v_job.id;

  update public.operations_job_assignments
  set superseded_at = now(), superseded_by_user_id = p_actor_user_id
  where job_id = v_job.id and superseded_at is null;

  insert into public.operations_job_assignments (
    job_id, work_center_id, slot_number, starts_at, ends_at, revision,
    reason, created_by_user_id
  ) values (
    v_job.id, p_work_center_id, p_slot_number, p_starts_at, p_ends_at,
    v_revision, p_reason, p_actor_user_id
  ) returning id into v_assignment_id;

  update public.operations_jobs
  set status = 'Scheduled', work_center_id = p_work_center_id,
      planned_start_at = p_starts_at, committed_due_at = p_ends_at,
      priority = coalesce(p_priority, priority),
      assignee_user_id = coalesce(p_assignee_user_id, assignee_user_id),
      controller_user_id = coalesce(controller_user_id, p_actor_user_id),
      exception_code = null, exception_detail = ''
  where id = v_job.id;

  update public.build_orders
  set committed_due_date = p_ends_at::date,
      priority = coalesce(p_priority, priority),
      shop_assignee_user_id = coalesce(p_assignee_user_id, shop_assignee_user_id)
  where operations_job_id = v_job.id;

  v_event_type := case when v_revision = 1 then 'Scheduled' else 'ScheduleRevised' end;
  insert into public.operations_job_events (
    event_key, job_id, event_type, summary, detail, actor_user_id
  ) values (
    'oje-' || gen_random_uuid()::text, v_job.id, v_event_type,
    case when v_revision = 1 then 'Operations Job scheduled' else 'Operations schedule revised' end,
    p_reason, p_actor_user_id
  );
  insert into public.notification_outbox (
    aggregate_type, aggregate_id, event_type, recipient_user_id,
    idempotency_key, payload
  ) values (
    'OperationsJob', v_job.id, v_event_type,
    coalesce(p_assignee_user_id, v_job.assignee_user_id),
    'operations-job:' || v_job.id || ':schedule:' || v_revision,
    jsonb_build_object('jobId', v_job.id, 'revision', v_revision,
      'startsAt', p_starts_at, 'endsAt', p_ends_at)
  );

  return jsonb_build_object(
    'job', (select to_jsonb(j) from public.operations_jobs j where j.id = v_job.id),
    'assignment', (select to_jsonb(a) from public.operations_job_assignments a where a.id = v_assignment_id)
  );
end;
$$;

create or replace function public.mdb_replace_service_scope_v1(
  p_actor_user_id uuid,
  p_service_work_order_id text,
  p_scope_items jsonb,
  p_scope_summary text default ''
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_work_order public.service_work_orders%rowtype;
  v_job public.operations_jobs%rowtype;
  v_item jsonb;
  v_version int;
  v_sequence int := 0;
  v_detail text;
  v_section text;
begin
  if not public.mdb_actor_has_role(p_actor_user_id, array[
    'service_controller', 'production_controller', 'admin'
  ]) then raise exception 'Only a service gatekeeper can revise the scope'; end if;
  if jsonb_typeof(p_scope_items) <> 'array' or jsonb_array_length(p_scope_items) < 1
     or jsonb_array_length(p_scope_items) > 250 then
    raise exception 'Scope must contain between 1 and 250 items';
  end if;

  select * into v_work_order from public.service_work_orders
  where id = p_service_work_order_id for update;
  if not found then raise exception 'Service Work Order not found'; end if;
  select * into v_job from public.operations_jobs
  where id = v_work_order.operations_job_id for update;
  if v_job.status not in ('Planning', 'Order Setup Pending', 'Scheduled') then
    raise exception 'Scope cannot be replaced after service work is released';
  end if;

  v_version := v_work_order.scope_version + 1;
  for v_item in select value from jsonb_array_elements(p_scope_items)
  loop
    v_sequence := v_sequence + 1;
    v_detail := btrim(coalesce(v_item->>'detail', ''));
    v_section := coalesce(nullif(btrim(v_item->>'section'), ''), 'Other');
    if v_detail = '' then raise exception 'Every scope item requires detail'; end if;
    insert into public.service_scope_items (
      service_work_order_id, scope_version, sequence, section, detail,
      is_required, assignee_user_id
    ) values (
      v_work_order.id, v_version, v_sequence, v_section, v_detail,
      coalesce((v_item->>'isRequired')::boolean, true),
      nullif(v_item->>'assigneeUserId', '')::uuid
    );
  end loop;

  update public.service_work_orders
  set scope_version = v_version, scope_summary = coalesce(p_scope_summary, '')
  where id = v_work_order.id;
  insert into public.operations_job_events (
    event_key, job_id, event_type, summary, detail, actor_user_id
  ) values (
    'oje-' || gen_random_uuid()::text, v_job.id, 'ScopeRevised',
    'Service scope version ' || v_version || ' created',
    coalesce(p_scope_summary, ''), p_actor_user_id
  );

  return jsonb_build_object(
    'serviceWorkOrder', (select to_jsonb(w) from public.service_work_orders w where w.id = v_work_order.id),
    'scopeItems', (select jsonb_agg(to_jsonb(s) order by s.sequence)
      from public.service_scope_items s
      where s.service_work_order_id = v_work_order.id and s.scope_version = v_version)
  );
end;
$$;

create or replace function public.mdb_update_operations_checkpoint_v1(
  p_actor_user_id uuid,
  p_operations_job_id text,
  p_checkpoint_key text,
  p_checkpoint_version int,
  p_status text,
  p_evidence_note text default '',
  p_blocker_detail text default ''
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_job public.operations_jobs%rowtype;
  v_definition public.operations_checkpoint_definitions%rowtype;
  v_is_controller boolean;
  v_is_assigned boolean;
  v_is_role_owner boolean;
begin
  select * into v_job from public.operations_jobs
  where id = p_operations_job_id for update;
  if not found then raise exception 'Operations Job not found'; end if;
  select * into v_definition from public.operations_checkpoint_definitions
  where checkpoint_key = p_checkpoint_key and version = p_checkpoint_version;
  if not found then raise exception 'Checkpoint definition not found'; end if;

  v_is_controller := public.mdb_actor_has_role(p_actor_user_id, array[
    'service_controller', 'production_controller', 'admin'
  ]);
  v_is_assigned := v_job.assignee_user_id = p_actor_user_id
    and public.mdb_actor_has_role(p_actor_user_id, array['service_technician', 'shop']);
  v_is_role_owner := v_definition.owner_role is not null
    and public.mdb_actor_has_role(p_actor_user_id, array[v_definition.owner_role])
    and (
      v_definition.owner_role not in ('service_technician', 'shop')
      or v_is_assigned
    );
  if not (v_is_controller or v_is_role_owner) then
    raise exception 'Actor is not allowed to update this checkpoint';
  end if;
  if p_status not in ('Pending', 'Ready', 'Blocked', 'Complete', 'Waived') then
    raise exception 'Unsupported checkpoint status';
  end if;
  if p_status = 'Complete' and v_definition.requires_evidence
     and btrim(coalesce(p_evidence_note, '')) = '' then
    raise exception 'This checkpoint requires evidence';
  end if;
  if p_status = 'Blocked' and btrim(coalesce(p_blocker_detail, '')) = '' then
    raise exception 'A blocker description is required';
  end if;

  insert into public.operations_job_checkpoints (
    job_id, checkpoint_key, checkpoint_version, status, owner_role,
    assignee_user_id, completed_at, evidence_note, blocker_detail,
    updated_by_user_id
  ) values (
    v_job.id, v_definition.checkpoint_key, v_definition.version, p_status,
    v_definition.owner_role, v_job.assignee_user_id,
    case when p_status = 'Complete' then now() else null end,
    coalesce(p_evidence_note, ''), coalesce(p_blocker_detail, ''), p_actor_user_id
  )
  on conflict (job_id, checkpoint_key, checkpoint_version) do update set
    status = excluded.status,
    completed_at = excluded.completed_at,
    evidence_note = excluded.evidence_note,
    blocker_detail = excluded.blocker_detail,
    updated_by_user_id = excluded.updated_by_user_id;

  insert into public.operations_job_events (
    event_key, job_id, event_type, summary, detail, actor_user_id
  ) values (
    'oje-' || gen_random_uuid()::text, v_job.id, 'CheckpointUpdated',
    v_definition.name || ': ' || p_status,
    coalesce(nullif(p_blocker_detail, ''), p_evidence_note, ''), p_actor_user_id
  );

  return (select to_jsonb(c) from public.operations_job_checkpoints c
    where c.job_id = v_job.id and c.checkpoint_key = p_checkpoint_key
      and c.checkpoint_version = p_checkpoint_version);
end;
$$;

create or replace function public.mdb_record_service_signoff_v1(
  p_actor_user_id uuid,
  p_service_work_order_id text,
  p_signoff_key text,
  p_party_type text,
  p_representative_name text,
  p_decision text,
  p_notes text default ''
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_work_order public.service_work_orders%rowtype;
  v_job public.operations_jobs%rowtype;
  v_existing public.service_signoffs%rowtype;
  v_allowed boolean;
begin
  select * into v_existing from public.service_signoffs where signoff_key = p_signoff_key;
  if found then return jsonb_build_object('signoff', to_jsonb(v_existing), 'idempotentReplay', true); end if;
  select * into v_work_order from public.service_work_orders
  where id = p_service_work_order_id;
  if not found then raise exception 'Service Work Order not found'; end if;
  select * into v_job from public.operations_jobs
  where id = v_work_order.operations_job_id for update;
  if v_job.status <> 'Work Complete' then
    raise exception 'Signoff can be recorded only after work completion';
  end if;
  if v_work_order.scope_version < 1 then raise exception 'A versioned service scope is required'; end if;

  v_allowed := public.mdb_actor_has_role(p_actor_user_id, array[
    'service_controller', 'production_controller', 'admin'
  ]) or (
    v_job.assignee_user_id = p_actor_user_id
    and public.mdb_actor_has_role(p_actor_user_id, array['service_technician', 'shop'])
  );
  if not v_allowed then raise exception 'Actor is not allowed to capture service signoff'; end if;

  insert into public.service_signoffs (
    signoff_key, service_work_order_id, scope_version, party_type,
    representative_name, decision, notes, captured_by_user_id
  ) values (
    p_signoff_key, v_work_order.id, v_work_order.scope_version, p_party_type,
    p_representative_name, p_decision, coalesce(p_notes, ''), p_actor_user_id
  );
  insert into public.operations_job_events (
    event_key, job_id, event_type, summary, detail, actor_user_id
  ) values (
    'oje-' || gen_random_uuid()::text, v_job.id, 'SignoffRecorded',
    p_party_type || ' signoff recorded', p_decision, p_actor_user_id
  );

  return jsonb_build_object(
    'signoff', (select to_jsonb(s) from public.service_signoffs s where s.signoff_key = p_signoff_key),
    'idempotentReplay', false
  );
end;
$$;

create or replace function public.mdb_transition_service_job_v1(
  p_actor_user_id uuid,
  p_operations_job_id text,
  p_action text,
  p_note text default ''
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_job public.operations_jobs%rowtype;
  v_work_order public.service_work_orders%rowtype;
  v_request public.service_requests%rowtype;
  v_action text := lower(btrim(p_action));
  v_is_controller boolean;
  v_is_assigned boolean;
  v_event_type text;
  v_summary text;
  v_target_status text;
  v_signoff_count int;
begin
  select * into v_job from public.operations_jobs
  where id = p_operations_job_id for update;
  if not found or v_job.job_type <> 'service_job' then raise exception 'Service Operations Job not found'; end if;
  select * into v_work_order from public.service_work_orders
  where operations_job_id = v_job.id;
  select * into v_request from public.service_requests
  where id = v_work_order.service_request_id for update;

  v_is_controller := public.mdb_actor_has_role(p_actor_user_id, array[
    'service_controller', 'production_controller', 'admin'
  ]);
  v_is_assigned := v_job.assignee_user_id = p_actor_user_id
    and public.mdb_actor_has_role(p_actor_user_id, array['service_technician', 'shop']);

  if v_action = 'release' then
    if v_job.status <> 'Scheduled' or not v_is_controller then
      raise exception 'Only a service gatekeeper can release scheduled work';
    end if;
    if exists (
      select 1 from public.operations_job_checkpoints
      where job_id = v_job.id and status = 'Blocked'
    ) then raise exception 'Blocked checkpoints prevent release'; end if;
    v_target_status := 'Released'; v_event_type := 'Released'; v_summary := 'Service work released';

  elsif v_action = 'start' then
    if v_job.status <> 'Released' or not (v_is_controller or v_is_assigned) then
      raise exception 'Only the assigned technician or service gatekeeper can start released work';
    end if;
    v_target_status := 'In Progress'; v_event_type := 'Started'; v_summary := 'Service work started';

  elsif v_action = 'block' then
    if v_job.status <> 'In Progress' or not (v_is_controller or v_is_assigned) then
      raise exception 'Only active assigned service work can be blocked';
    end if;
    if btrim(coalesce(p_note, '')) = '' then raise exception 'A blocker description is required'; end if;
    update public.operations_jobs
    set exception_code = 'blocked', exception_detail = p_note
    where id = v_job.id;
    v_target_status := v_job.status; v_event_type := 'Blocked'; v_summary := 'Service work blocked';

  elsif v_action = 'hold' then
    if v_job.status not in ('Scheduled', 'Released', 'In Progress') or not v_is_controller then
      raise exception 'Only a service gatekeeper can place work on hold';
    end if;
    if btrim(coalesce(p_note, '')) = '' then raise exception 'A hold reason is required'; end if;
    update public.operations_jobs
    set exception_code = 'on_hold', exception_detail = p_note
    where id = v_job.id;
    v_target_status := v_job.status; v_event_type := 'Held'; v_summary := 'Service work placed on hold';

  elsif v_action = 'resume' then
    if v_job.exception_code is null or not v_is_controller then
      raise exception 'Only a service gatekeeper can resume exception work';
    end if;
    update public.operations_jobs set exception_code = null, exception_detail = ''
    where id = v_job.id;
    v_target_status := v_job.status; v_event_type := 'Resumed'; v_summary := 'Service exception cleared';

  elsif v_action = 'complete_work' then
    if v_job.status <> 'In Progress' or not (v_is_controller or v_is_assigned) then
      raise exception 'Only assigned active service work can be completed';
    end if;
    if exists (
      select 1 from public.operations_job_checkpoints c
      join public.operations_checkpoint_definitions d
        on d.checkpoint_key = c.checkpoint_key and d.version = c.checkpoint_version
      where c.job_id = v_job.id and d.is_required and c.status not in ('Complete', 'Waived')
    ) then raise exception 'Required service checkpoints are incomplete'; end if;
    v_target_status := 'Work Complete'; v_event_type := 'WorkCompleted'; v_summary := 'Service work completed';

  elsif v_action = 'complete_signoff' then
    if v_job.status <> 'Work Complete' or not v_is_controller then
      raise exception 'Only a service gatekeeper can complete signoff';
    end if;
    select count(distinct party_type) into v_signoff_count
    from public.service_signoffs
    where service_work_order_id = v_work_order.id
      and scope_version = v_work_order.scope_version
      and decision in ('Accepted', 'Accepted With Exceptions');
    if v_signoff_count < 2 then raise exception 'Internal and customer signoff are required'; end if;
    v_target_status := 'Signoff Complete'; v_event_type := 'SignoffCompleted'; v_summary := 'Service signoff completed';

  elsif v_action = 'close' then
    if v_job.status <> 'Signoff Complete' or not v_is_controller then
      raise exception 'Only a service gatekeeper can close signed service work';
    end if;
    v_target_status := 'Closed'; v_event_type := 'Closed'; v_summary := 'Service Work Order closed';
    update public.service_requests set status = 'Resolved', resolved_at = now()
    where id = v_request.id;
    insert into public.service_request_events (
      event_key, service_request_id, event_type, summary, detail, actor_user_id
    ) values (
      'sre-' || gen_random_uuid()::text, v_request.id, 'Resolved',
      'Service Request resolved by completed work', coalesce(p_note, ''), p_actor_user_id
    );

  elsif v_action = 'reopen' then
    if v_job.status not in ('Released', 'Work Complete', 'Signoff Complete') or not v_is_controller then
      raise exception 'Only a service gatekeeper can reopen eligible work';
    end if;
    v_target_status := case when v_job.status = 'Released' then 'Planning' else 'In Progress' end;
    v_event_type := 'Reopened'; v_summary := 'Service work reopened';

  elsif v_action = 'cancel' then
    if v_job.status not in ('Planning', 'Order Setup Pending', 'Scheduled', 'Released')
       or v_job.actual_started_at is not null or not v_is_controller then
      raise exception 'Only unstarted service work can be cancelled';
    end if;
    v_target_status := 'Cancelled'; v_event_type := 'Cancelled'; v_summary := 'Service work cancelled';
    update public.service_requests set status = 'Cancelled', cancelled_at = now()
    where id = v_request.id;
    update public.operations_job_assignments
    set superseded_at = now(), superseded_by_user_id = p_actor_user_id
    where job_id = v_job.id and superseded_at is null;

  else
    raise exception 'Unsupported Service Operations action: %', p_action;
  end if;

  update public.operations_jobs
  set status = v_target_status,
      actual_started_at = case when v_target_status = 'In Progress' and actual_started_at is null then now() else actual_started_at end,
      work_completed_at = case when v_target_status = 'Work Complete' then now() when v_target_status = 'In Progress' then null else work_completed_at end,
      signoff_completed_at = case when v_target_status = 'Signoff Complete' then now() when v_target_status = 'In Progress' then null else signoff_completed_at end,
      closed_at = case when v_target_status = 'Closed' then now() else closed_at end,
      cancelled_at = case when v_target_status = 'Cancelled' then now() else cancelled_at end
  where id = v_job.id;

  insert into public.operations_job_events (
    event_key, job_id, event_type, summary, detail, actor_user_id
  ) values (
    'oje-' || gen_random_uuid()::text, v_job.id, v_event_type,
    v_summary, coalesce(p_note, ''), p_actor_user_id
  );
  insert into public.notification_outbox (
    aggregate_type, aggregate_id, event_type, recipient_user_id,
    idempotency_key, payload
  ) values (
    'OperationsJob', v_job.id, v_event_type, v_request.requester_user_id,
    'operations-job:' || v_job.id || ':' || lower(v_event_type) || ':' || gen_random_uuid()::text,
    jsonb_build_object('jobId', v_job.id, 'status', v_target_status)
  );

  return jsonb_build_object(
    'job', (select to_jsonb(j) from public.operations_jobs j where j.id = v_job.id),
    'serviceRequest', (select to_jsonb(r) from public.service_requests r where r.id = v_request.id),
    'serviceWorkOrder', to_jsonb(v_work_order)
  );
end;
$$;

revoke all on function public.mdb_enforce_work_center_capacity_v1() from public, anon, authenticated;
revoke all on function public.mdb_sync_build_operations_job_v1() from public, anon, authenticated;
revoke all on function public.mdb_create_service_request_v1(
  uuid, text, text, text, text, text, text, text, text, numeric, text, text,
  text, text, boolean, text
) from public, anon, authenticated;
revoke all on function public.mdb_transition_service_request_v1(
  uuid, text, text, text, text, text, smallint, uuid, uuid
) from public, anon, authenticated;
revoke all on function public.mdb_schedule_operations_job_v1(
  uuid, text, text, smallint, timestamptz, timestamptz, text, smallint, uuid
) from public, anon, authenticated;
revoke all on function public.mdb_replace_service_scope_v1(uuid, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.mdb_update_operations_checkpoint_v1(
  uuid, text, text, int, text, text, text
) from public, anon, authenticated;
revoke all on function public.mdb_record_service_signoff_v1(
  uuid, text, text, text, text, text, text
) from public, anon, authenticated;
revoke all on function public.mdb_transition_service_job_v1(uuid, text, text, text) from public, anon, authenticated;

grant execute on function public.mdb_create_service_request_v1(
  uuid, text, text, text, text, text, text, text, text, numeric, text, text,
  text, text, boolean, text
) to service_role;
grant execute on function public.mdb_transition_service_request_v1(
  uuid, text, text, text, text, text, smallint, uuid, uuid
) to service_role;
grant execute on function public.mdb_schedule_operations_job_v1(
  uuid, text, text, smallint, timestamptz, timestamptz, text, smallint, uuid
) to service_role;
grant execute on function public.mdb_replace_service_scope_v1(uuid, text, jsonb, text) to service_role;
grant execute on function public.mdb_update_operations_checkpoint_v1(
  uuid, text, text, int, text, text, text
) to service_role;
grant execute on function public.mdb_record_service_signoff_v1(
  uuid, text, text, text, text, text, text
) to service_role;
grant execute on function public.mdb_transition_service_job_v1(uuid, text, text, text) to service_role;

-- Trigger helpers are not externally callable.
revoke execute on function public.mdb_enforce_work_center_capacity_v1() from service_role;
revoke execute on function public.mdb_sync_build_operations_job_v1() from service_role;

commit;
