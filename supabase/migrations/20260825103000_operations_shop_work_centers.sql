begin;

-- These are controlled routing destinations on the shared Operations Job.
-- Capacity starts at one until observed shop concurrency is validated with MDB.
insert into public.work_centers (id, code, name, center_type, capacity, is_active)
values
  ('machine-shop', 'MACHINE', 'Machine Shop', 'shop_cell', 1, true),
  ('preassembly-work-bay', 'PREASM', 'Preassembly Work Bay', 'build_bay', 1, true)
on conflict (id) do update set
  code = excluded.code,
  name = excluded.name,
  center_type = excluded.center_type,
  is_active = true;

-- Preserve the Operations Job's time-specific commitment when a routing RPC
-- mirrors its due date back to the specialized Build Order. The earlier trigger
-- converted that date to midnight and could invalidate an afternoon route.
create or replace function public.mdb_sync_build_operations_job_v1()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_job_id text;
  v_job_status text;
  v_existing_status text;
  v_existing_committed_due_at timestamptz;
begin
  v_job_id := coalesce(new.operations_job_id, 'opj-build-' || new.id);
  select status, committed_due_at
  into v_existing_status, v_existing_committed_due_at
  from public.operations_jobs
  where id = v_job_id;

  v_job_status := case
    when new.status = 'Finished' then 'Closed'
    when new.status = 'Cancelled' then 'Cancelled'
    when new.status = 'Released' and (new.built_qty > 0 or new.actual_started_at is not null) then 'In Progress'
    when new.status = 'Released' then 'Released'
    when new.status = 'Open' and v_existing_status = 'Scheduled' then 'Scheduled'
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
    coalesce(v_existing_committed_due_at, coalesce(new.committed_due_date, new.due_date)::timestamptz),
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

commit;
