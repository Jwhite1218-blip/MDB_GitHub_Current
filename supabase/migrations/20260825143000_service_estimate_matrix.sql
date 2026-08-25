-- Qualified Service Estimator -> Gatekeeper quote package and cost-learning spine.
--
-- A Service Estimate is a controlled commercial document. It is intentionally
-- separate from the requester-facing Service Request, the scheduling-focused
-- Operations Job, and the execution-focused Service Work Order.

begin;

alter table public.operational_user_roles
  drop constraint if exists operational_user_roles_role_check;

alter table public.operational_user_roles
  add constraint operational_user_roles_role_check check (role in (
    'sales', 'production_controller', 'shop', 'inventory_controller',
    'service_estimator', 'service_controller', 'service_technician', 'admin'
  ));

create sequence if not exists public.service_estimate_no_seq start 1000;

create table if not exists public.service_pricing_rules (
  id text primary key,
  profile_version int not null check (profile_version > 0),
  rule_code text not null,
  label text not null,
  service_family text not null default 'All',
  service_mode text not null default 'Any',
  line_type text not null check (line_type in (
    'Labor', 'Part', 'Travel', 'Outside', 'Shop Supply', 'Contingency'
  )),
  uom text not null default 'EA',
  reference_unit_cost numeric(14,4) not null default 0 check (reference_unit_cost >= 0),
  recommended_unit_price numeric(14,4) not null default 0 check (recommended_unit_price >= 0),
  evidence_count int not null default 0 check (evidence_count >= 0),
  confidence text not null default 'Low' check (confidence in ('Low', 'Medium', 'High')),
  effective_from date,
  effective_through date,
  is_active boolean not null default true,
  approved_by_user_id uuid references public.operational_users(id) on delete restrict,
  approved_at timestamptz,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_pricing_rules_code_not_blank_check check (btrim(rule_code) <> ''),
  constraint service_pricing_rules_label_not_blank_check check (btrim(label) <> ''),
  constraint service_pricing_rules_version_code_unique unique (profile_version, rule_code),
  constraint service_pricing_rules_effective_window_check check (
    effective_through is null or effective_from is null or effective_through >= effective_from
  )
);

create table if not exists public.service_estimates (
  id text primary key,
  estimate_number text not null unique default (
    'SEST' || lpad(nextval('public.service_estimate_no_seq')::text, 6, '0')
  ),
  service_request_id text not null references public.service_requests(id) on delete restrict,
  revision int not null default 1 check (revision > 0),
  status text not null default 'Draft' check (status in (
    'Draft', 'Submitted', 'Returned', 'Approved', 'Superseded', 'Cancelled'
  )),
  estimator_user_id uuid not null references public.operational_users(id) on delete restrict,
  gatekeeper_user_id uuid references public.operational_users(id) on delete restrict,
  diagnostic_family text not null default 'General / Inspection',
  customer_scope text not null default '',
  assumptions text not null default '',
  exclusions text not null default '',
  internal_note text not null default '',
  pricing_profile_version int,
  recommendation_basis text not null default '',
  recommendation_confidence text not null default 'Low' check (
    recommendation_confidence in ('Low', 'Medium', 'High')
  ),
  labor_cost numeric(14,2) not null default 0 check (labor_cost >= 0),
  material_cost numeric(14,2) not null default 0 check (material_cost >= 0),
  outside_cost numeric(14,2) not null default 0 check (outside_cost >= 0),
  travel_cost numeric(14,2) not null default 0 check (travel_cost >= 0),
  total_cost numeric(14,2) not null default 0 check (total_cost >= 0),
  quoted_price numeric(14,2) not null default 0 check (quoted_price >= 0),
  gross_profit numeric(14,2) generated always as (quoted_price - total_cost) stored,
  gross_margin_pct numeric(7,4) generated always as (
    case when quoted_price > 0 then ((quoted_price - total_cost) / quoted_price) * 100 else 0 end
  ) stored,
  return_note text not null default '',
  submitted_at timestamptz,
  returned_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_estimates_request_revision_unique unique (service_request_id, revision)
);

create table if not exists public.service_estimate_lines (
  id text primary key,
  service_estimate_id text not null references public.service_estimates(id) on delete cascade,
  sequence int not null check (sequence > 0),
  line_type text not null check (line_type in (
    'Labor', 'Part', 'Travel', 'Outside', 'Shop Supply', 'Contingency'
  )),
  code text not null default '',
  description text not null,
  quantity numeric(14,4) not null default 1 check (quantity > 0),
  uom text not null default 'EA',
  unit_cost numeric(14,4) not null default 0 check (unit_cost >= 0),
  unit_price numeric(14,4) not null default 0 check (unit_price >= 0),
  reference_unit_cost numeric(14,4) not null default 0 check (reference_unit_cost >= 0),
  reference_unit_price numeric(14,4) not null default 0 check (reference_unit_price >= 0),
  extended_cost numeric(14,2) generated always as (round(quantity * unit_cost, 2)) stored,
  extended_price numeric(14,2) generated always as (round(quantity * unit_price, 2)) stored,
  source_type text not null default 'Manual' check (source_type in (
    'Rate Card', 'GP Item', 'Historical', 'Inspection', 'Manual'
  )),
  source_reference text not null default '',
  confidence text not null default 'Low' check (confidence in ('Low', 'Medium', 'High')),
  override_reason text not null default '',
  is_optional boolean not null default false,
  created_at timestamptz not null default now(),
  constraint service_estimate_lines_description_not_blank_check check (btrim(description) <> ''),
  constraint service_estimate_lines_sequence_unique unique (service_estimate_id, sequence),
  constraint service_estimate_lines_override_reason_check check (
    (unit_cost = reference_unit_cost and unit_price = reference_unit_price)
    or btrim(override_reason) <> ''
  )
);

create table if not exists public.service_estimate_events (
  event_key text primary key,
  service_estimate_id text not null references public.service_estimates(id) on delete restrict,
  event_type text not null check (event_type in (
    'Created', 'Saved', 'Submitted', 'Returned', 'Approved', 'Superseded', 'Cancelled'
  )),
  summary text not null,
  detail text not null default '',
  actor_user_id uuid references public.operational_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint service_estimate_events_summary_not_blank_check check (btrim(summary) <> '')
);

create table if not exists public.service_actual_cost_entries (
  id bigint generated always as identity primary key,
  service_work_order_id text not null references public.service_work_orders(id) on delete restrict,
  service_estimate_line_id text references public.service_estimate_lines(id) on delete restrict,
  line_type text not null check (line_type in (
    'Labor', 'Part', 'Travel', 'Outside', 'Shop Supply', 'Contingency'
  )),
  description text not null,
  quantity numeric(14,4) not null default 1 check (quantity > 0),
  uom text not null default 'EA',
  unit_cost numeric(14,4) not null default 0 check (unit_cost >= 0),
  extended_cost numeric(14,2) generated always as (round(quantity * unit_cost, 2)) stored,
  source_type text not null default 'Manual' check (source_type in (
    'GP', 'Time Entry', 'Inventory', 'Outside Invoice', 'Manual'
  )),
  source_reference text not null default '',
  occurred_on date not null default current_date,
  recorded_by_user_id uuid not null references public.operational_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint service_actual_cost_description_not_blank_check check (btrim(description) <> '')
);

create index if not exists service_pricing_rules_lookup_idx
  on public.service_pricing_rules (is_active, service_family, service_mode, line_type, profile_version desc);
create index if not exists service_estimates_request_idx
  on public.service_estimates (service_request_id, revision desc);
create index if not exists service_estimates_estimator_status_idx
  on public.service_estimates (estimator_user_id, status, updated_at desc);
create index if not exists service_estimate_lines_estimate_idx
  on public.service_estimate_lines (service_estimate_id, sequence);
create index if not exists service_estimate_events_estimate_idx
  on public.service_estimate_events (service_estimate_id, created_at desc);
create index if not exists service_actual_cost_work_order_idx
  on public.service_actual_cost_entries (service_work_order_id, occurred_on, id);

alter table public.service_pricing_rules enable row level security;
alter table public.service_estimates enable row level security;
alter table public.service_estimate_lines enable row level security;
alter table public.service_estimate_events enable row level security;
alter table public.service_actual_cost_entries enable row level security;

revoke all on table public.service_pricing_rules from public, anon, authenticated;
revoke all on table public.service_estimates from public, anon, authenticated;
revoke all on table public.service_estimate_lines from public, anon, authenticated;
revoke all on table public.service_estimate_events from public, anon, authenticated;
revoke all on table public.service_actual_cost_entries from public, anon, authenticated;

revoke all on public.service_pricing_rules from service_role;
revoke all on public.service_estimates from service_role;
revoke all on public.service_estimate_lines from service_role;
revoke all on public.service_estimate_events from service_role;
revoke all on public.service_actual_cost_entries from service_role;
grant select, insert, update on public.service_pricing_rules to service_role;
grant select, insert, update on public.service_estimates to service_role;
grant select, insert, update, delete on public.service_estimate_lines to service_role;
grant select, insert on public.service_estimate_events to service_role;
grant select, insert on public.service_actual_cost_entries to service_role;
grant usage, select on sequence public.service_estimate_no_seq to service_role;
grant usage, select on sequence public.service_actual_cost_entries_id_seq to service_role;

create or replace function public.mdb_save_service_estimate_v1(
  p_actor_user_id uuid,
  p_service_request_id text,
  p_estimate_id text default null,
  p_diagnostic_family text default 'General / Inspection',
  p_customer_scope text default '',
  p_assumptions text default '',
  p_exclusions text default '',
  p_internal_note text default '',
  p_pricing_profile_version int default null,
  p_recommendation_basis text default '',
  p_recommendation_confidence text default 'Low',
  p_lines jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_request public.service_requests%rowtype;
  v_estimate public.service_estimates%rowtype;
  v_estimate_id text;
  v_revision int;
begin
  if not public.mdb_actor_has_role(p_actor_user_id, array['service_estimator', 'admin']) then
    raise exception 'Only a qualified Service Estimator can create or edit a Service Estimate';
  end if;
  select * into v_request from public.service_requests where id = p_service_request_id for update;
  if not found then raise exception 'Service Request not found'; end if;
  if v_request.status not in ('Submitted', 'Triaged') then
    raise exception 'Service Estimate cannot be edited while the Service Request is %', v_request.status;
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 1 or jsonb_array_length(p_lines) > 100 then
    raise exception 'Service Estimate must contain between 1 and 100 lines';
  end if;
  if p_recommendation_confidence not in ('Low', 'Medium', 'High') then
    raise exception 'Recommendation confidence is invalid';
  end if;

  v_estimate_id := coalesce(nullif(btrim(p_estimate_id), ''), 'sest-' || gen_random_uuid()::text);
  select * into v_estimate from public.service_estimates where id = v_estimate_id for update;
  if found then
    if v_estimate.service_request_id <> p_service_request_id then
      raise exception 'Service Estimate does not belong to the supplied Service Request';
    end if;
    if v_estimate.status not in ('Draft', 'Returned') then
      raise exception 'Submitted or approved Service Estimates are locked';
    end if;
    if v_estimate.estimator_user_id <> p_actor_user_id
       and not public.mdb_actor_has_role(p_actor_user_id, array['admin']) then
      raise exception 'Only the assigned qualified Service Estimator can edit this estimate';
    end if;
    update public.service_estimates set
      diagnostic_family = coalesce(nullif(btrim(p_diagnostic_family), ''), 'General / Inspection'),
      customer_scope = coalesce(p_customer_scope, ''), assumptions = coalesce(p_assumptions, ''),
      exclusions = coalesce(p_exclusions, ''), internal_note = coalesce(p_internal_note, ''),
      pricing_profile_version = p_pricing_profile_version,
      recommendation_basis = coalesce(p_recommendation_basis, ''),
      recommendation_confidence = p_recommendation_confidence,
      return_note = '', updated_at = now()
    where id = v_estimate_id;
    delete from public.service_estimate_lines where service_estimate_id = v_estimate_id;
  else
    select coalesce(max(revision), 0) + 1 into v_revision
    from public.service_estimates where service_request_id = p_service_request_id;
    insert into public.service_estimates (
      id, service_request_id, revision, estimator_user_id, diagnostic_family,
      customer_scope, assumptions, exclusions, internal_note, pricing_profile_version,
      recommendation_basis, recommendation_confidence
    ) values (
      v_estimate_id, p_service_request_id, v_revision, p_actor_user_id,
      coalesce(nullif(btrim(p_diagnostic_family), ''), 'General / Inspection'),
      coalesce(p_customer_scope, ''), coalesce(p_assumptions, ''), coalesce(p_exclusions, ''),
      coalesce(p_internal_note, ''), p_pricing_profile_version,
      coalesce(p_recommendation_basis, ''), p_recommendation_confidence
    );
  end if;

  insert into public.service_estimate_lines (
    id, service_estimate_id, sequence, line_type, code, description, quantity, uom,
    unit_cost, unit_price, reference_unit_cost, reference_unit_price,
    source_type, source_reference, confidence, override_reason, is_optional
  )
  select
    coalesce(nullif(btrim(line->>'id'), ''), 'sel-' || gen_random_uuid()::text),
    v_estimate_id, ordinal::int,
    coalesce(nullif(line->>'lineType', ''), 'Labor'),
    coalesce(line->>'code', ''), coalesce(line->>'description', ''),
    coalesce((line->>'quantity')::numeric, 1), coalesce(nullif(line->>'uom', ''), 'EA'),
    coalesce((line->>'unitCost')::numeric, 0), coalesce((line->>'unitPrice')::numeric, 0),
    coalesce((line->>'referenceUnitCost')::numeric, 0), coalesce((line->>'referenceUnitPrice')::numeric, 0),
    coalesce(nullif(line->>'sourceType', ''), 'Manual'), coalesce(line->>'sourceReference', ''),
    coalesce(nullif(line->>'confidence', ''), 'Low'), coalesce(line->>'overrideReason', ''),
    coalesce((line->>'isOptional')::boolean, false)
  from jsonb_array_elements(p_lines) with ordinality as payload(line, ordinal);

  update public.service_estimates e set
    labor_cost = totals.labor_cost,
    material_cost = totals.material_cost,
    outside_cost = totals.outside_cost,
    travel_cost = totals.travel_cost,
    total_cost = totals.total_cost,
    quoted_price = totals.quoted_price,
    updated_at = now()
  from (
    select
      coalesce(sum(extended_cost) filter (where line_type = 'Labor'), 0) as labor_cost,
      coalesce(sum(extended_cost) filter (where line_type in ('Part', 'Shop Supply')), 0) as material_cost,
      coalesce(sum(extended_cost) filter (where line_type in ('Outside', 'Contingency')), 0) as outside_cost,
      coalesce(sum(extended_cost) filter (where line_type = 'Travel'), 0) as travel_cost,
      coalesce(sum(extended_cost), 0) as total_cost,
      coalesce(sum(extended_price) filter (where not is_optional), 0) as quoted_price
    from public.service_estimate_lines where service_estimate_id = v_estimate_id
  ) totals
  where e.id = v_estimate_id;

  insert into public.service_estimate_events (
    event_key, service_estimate_id, event_type, summary, actor_user_id
  ) values (
    'see-' || gen_random_uuid()::text, v_estimate_id,
    case when v_estimate.id is null then 'Created' else 'Saved' end,
    case when v_estimate.id is null then 'Qualified Service Estimate created' else 'Qualified Service Estimate updated' end,
    p_actor_user_id
  );

  return jsonb_build_object(
    'estimate', (select to_jsonb(e) from public.service_estimates e where e.id = v_estimate_id),
    'lines', (select coalesce(jsonb_agg(to_jsonb(l) order by l.sequence), '[]'::jsonb)
              from public.service_estimate_lines l where l.service_estimate_id = v_estimate_id)
  );
end;
$$;

create or replace function public.mdb_transition_service_estimate_v1(
  p_actor_user_id uuid,
  p_service_estimate_id text,
  p_action text,
  p_note text default ''
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_estimate public.service_estimates%rowtype;
  v_request public.service_requests%rowtype;
  v_action text := lower(btrim(p_action));
  v_event_type text;
  v_summary text;
begin
  select * into v_estimate from public.service_estimates where id = p_service_estimate_id for update;
  if not found then raise exception 'Service Estimate not found'; end if;
  select * into v_request from public.service_requests where id = v_estimate.service_request_id for update;

  if v_action = 'submit' then
    if v_estimate.status not in ('Draft', 'Returned') then raise exception 'Only a draft or returned estimate can be submitted'; end if;
    if v_estimate.estimator_user_id <> p_actor_user_id
       or not public.mdb_actor_has_role(p_actor_user_id, array['service_estimator', 'admin']) then
      raise exception 'Only the assigned qualified Service Estimator can submit this estimate';
    end if;
    if btrim(v_estimate.customer_scope) = '' or v_estimate.quoted_price <= 0 then
      raise exception 'Customer scope and a positive quoted price are required before handoff';
    end if;
    update public.service_estimates set status = 'Submitted', submitted_at = now(), returned_at = null,
      return_note = '', updated_at = now() where id = v_estimate.id;
    v_event_type := 'Submitted'; v_summary := 'Submitted to Service Gatekeeper';
    insert into public.notification_outbox (
      aggregate_type, aggregate_id, event_type, recipient_role, idempotency_key, payload
    ) values (
      'ServiceEstimate', v_estimate.id, 'Submitted', 'service_controller',
      'service-estimate:' || v_estimate.id || ':submitted:' || v_estimate.revision,
      jsonb_build_object('serviceEstimateId', v_estimate.id, 'serviceRequestId', v_estimate.service_request_id)
    ) on conflict (idempotency_key) do nothing;
  elsif v_action = 'return' then
    if v_estimate.status <> 'Submitted' then raise exception 'Only a submitted estimate can be returned'; end if;
    if not public.mdb_actor_has_role(p_actor_user_id, array['service_controller', 'production_controller', 'admin']) then
      raise exception 'Only a Service Gatekeeper can return an estimate';
    end if;
    if btrim(coalesce(p_note, '')) = '' then raise exception 'A return reason is required'; end if;
    update public.service_estimates set status = 'Returned', gatekeeper_user_id = p_actor_user_id,
      return_note = p_note, returned_at = now(), updated_at = now() where id = v_estimate.id;
    v_event_type := 'Returned'; v_summary := 'Returned to qualified Service Estimator';
  elsif v_action = 'approve' then
    if v_estimate.status <> 'Submitted' then raise exception 'Only a submitted estimate can be approved'; end if;
    if not public.mdb_actor_has_role(p_actor_user_id, array['service_controller', 'production_controller', 'admin']) then
      raise exception 'Only a Service Gatekeeper can approve an estimate';
    end if;
    if v_request.status <> 'Submitted' then raise exception 'Service Request is not waiting for Gatekeeper review'; end if;
    update public.service_estimates set status = 'Approved', gatekeeper_user_id = p_actor_user_id,
      approved_at = now(), updated_at = now() where id = v_estimate.id;
    update public.service_requests set status = 'Triaged', financial_class = 'Billable',
      gatekeeper_user_id = p_actor_user_id, triaged_at = now(), updated_at = now()
    where id = v_request.id;
    insert into public.service_request_events (
      event_key, service_request_id, event_type, summary, detail, actor_user_id
    ) values (
      'sre-' || gen_random_uuid()::text, v_request.id, 'Triaged',
      'Qualified Service Estimate approved', coalesce(p_note, ''), p_actor_user_id
    );
    v_event_type := 'Approved'; v_summary := 'Approved by Service Gatekeeper';
  else
    raise exception 'Unsupported Service Estimate action: %', p_action;
  end if;

  insert into public.service_estimate_events (
    event_key, service_estimate_id, event_type, summary, detail, actor_user_id
  ) values (
    'see-' || gen_random_uuid()::text, v_estimate.id, v_event_type, v_summary,
    coalesce(p_note, ''), p_actor_user_id
  );

  return jsonb_build_object(
    'estimate', (select to_jsonb(e) from public.service_estimates e where e.id = v_estimate.id),
    'serviceRequest', (select to_jsonb(r) from public.service_requests r where r.id = v_request.id)
  );
end;
$$;

create or replace function public.mdb_record_service_actual_cost_v1(
  p_actor_user_id uuid,
  p_service_work_order_id text,
  p_line_type text,
  p_description text,
  p_quantity numeric,
  p_uom text,
  p_unit_cost numeric,
  p_source_type text default 'Manual',
  p_source_reference text default '',
  p_occurred_on date default current_date,
  p_service_estimate_line_id text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_work_order public.service_work_orders%rowtype;
  v_job public.operations_jobs%rowtype;
  v_entry_id bigint;
begin
  select * into v_work_order from public.service_work_orders where id = p_service_work_order_id;
  if not found then raise exception 'Service Work Order not found'; end if;
  select * into v_job from public.operations_jobs where id = v_work_order.operations_job_id;
  if nullif(btrim(p_service_estimate_line_id), '') is not null and not exists (
    select 1
    from public.service_estimate_lines l
    join public.service_estimates e on e.id = l.service_estimate_id
    where l.id = p_service_estimate_line_id
      and e.service_request_id = v_work_order.service_request_id
  ) then
    raise exception 'Estimate line does not belong to this Service Work Order request';
  end if;
  if not public.mdb_actor_has_role(p_actor_user_id, array[
    'service_controller', 'production_controller', 'service_technician', 'shop', 'admin'
  ]) then raise exception 'Actor is not allowed to record service cost'; end if;
  if public.mdb_actor_has_role(p_actor_user_id, array['service_technician', 'shop'])
     and not public.mdb_actor_has_role(p_actor_user_id, array['service_controller', 'production_controller', 'admin'])
     and v_job.assignee_user_id is distinct from p_actor_user_id then
    raise exception 'Only the assigned technician or Service Gatekeeper can record service cost';
  end if;
  if p_line_type not in ('Labor', 'Part', 'Travel', 'Outside', 'Shop Supply', 'Contingency') then
    raise exception 'Service cost type is invalid';
  end if;
  if btrim(coalesce(p_description, '')) = '' or p_quantity <= 0 or p_unit_cost < 0 then
    raise exception 'Service cost requires a description, positive quantity, and nonnegative unit cost';
  end if;

  insert into public.service_actual_cost_entries (
    service_work_order_id, service_estimate_line_id, line_type, description,
    quantity, uom, unit_cost, source_type, source_reference, occurred_on, recorded_by_user_id
  ) values (
    v_work_order.id, nullif(btrim(p_service_estimate_line_id), ''), p_line_type, p_description,
    p_quantity, coalesce(nullif(btrim(p_uom), ''), 'EA'), p_unit_cost, p_source_type,
    coalesce(p_source_reference, ''), coalesce(p_occurred_on, current_date), p_actor_user_id
  ) returning id into v_entry_id;

  return (select to_jsonb(c) from public.service_actual_cost_entries c where c.id = v_entry_id);
end;
$$;

revoke all on function public.mdb_save_service_estimate_v1(
  uuid, text, text, text, text, text, text, text, int, text, text, jsonb
) from public, anon, authenticated;
revoke all on function public.mdb_transition_service_estimate_v1(uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.mdb_record_service_actual_cost_v1(
  uuid, text, text, text, numeric, text, numeric, text, text, date, text
) from public, anon, authenticated;

grant execute on function public.mdb_save_service_estimate_v1(
  uuid, text, text, text, text, text, text, text, int, text, text, jsonb
) to service_role;
grant execute on function public.mdb_transition_service_estimate_v1(uuid, text, text, text)
  to service_role;
grant execute on function public.mdb_record_service_actual_cost_v1(
  uuid, text, text, text, numeric, text, numeric, text, text, date, text
) to service_role;

commit;
