begin;

-- GP remains the transactional authority. These tables receive read-only
-- snapshots from an external extractor and never represent writes back to GP.
create table if not exists public.gp_sync_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null unique,
  company_id text not null,
  connector text not null default 'normalized_export',
  mode text not null default 'read_only' check (mode = 'read_only'),
  status text not null default 'Running' check (status in ('Running', 'Succeeded', 'Failed')),
  requested_entities text[] not null default '{}'::text[],
  source_watermark text,
  records_seen bigint not null default 0 check (records_seen >= 0),
  records_inserted bigint not null default 0 check (records_inserted >= 0),
  records_updated bigint not null default 0 check (records_updated >= 0),
  records_unchanged bigint not null default 0 check (records_unchanged >= 0),
  error_summary text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gp_sync_runs_run_key_not_blank_check check (btrim(run_key) <> ''),
  constraint gp_sync_runs_company_not_blank_check check (btrim(company_id) <> ''),
  constraint gp_sync_runs_connector_not_blank_check check (btrim(connector) <> ''),
  constraint gp_sync_runs_finish_state_check check (
    (status = 'Running' and finished_at is null)
    or (status in ('Succeeded', 'Failed') and finished_at is not null)
  )
);

create table if not exists public.gp_sync_batches (
  id bigint generated always as identity primary key,
  sync_run_id uuid not null references public.gp_sync_runs(id) on delete restrict,
  batch_key text not null,
  entity_type text not null check (entity_type in (
    'Customer', 'Item', 'Inventory', 'SalesOrder', 'SalesOrderLine', 'Invoice', 'InvoiceLine'
  )),
  payload_hash text not null,
  record_count int not null check (record_count between 1 and 500),
  inserted_count int not null default 0 check (inserted_count >= 0),
  updated_count int not null default 0 check (updated_count >= 0),
  unchanged_count int not null default 0 check (unchanged_count >= 0),
  created_at timestamptz not null default now(),
  unique (sync_run_id, batch_key),
  constraint gp_sync_batches_key_not_blank_check check (btrim(batch_key) <> ''),
  constraint gp_sync_batches_hash_not_blank_check check (btrim(payload_hash) <> '')
);

create table if not exists public.gp_source_records (
  id bigint generated always as identity primary key,
  company_id text not null,
  entity_type text not null check (entity_type in (
    'Customer', 'Item', 'Inventory', 'SalesOrder', 'SalesOrderLine', 'Invoice', 'InvoiceLine'
  )),
  external_id text not null,
  source_modified_at timestamptz,
  source_deleted boolean not null default false,
  source_payload jsonb not null default '{}'::jsonb,
  normalized_payload jsonb not null default '{}'::jsonb,
  content_hash text not null,
  match_status text not null default 'Unmatched' check (match_status in ('Unmatched', 'Matched', 'Conflict', 'Ignored')),
  local_entity_type text,
  local_entity_id text,
  first_seen_run_id uuid not null references public.gp_sync_runs(id) on delete restrict,
  last_seen_run_id uuid not null references public.gp_sync_runs(id) on delete restrict,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  source_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, entity_type, external_id),
  constraint gp_source_records_company_not_blank_check check (btrim(company_id) <> ''),
  constraint gp_source_records_external_id_not_blank_check check (btrim(external_id) <> ''),
  constraint gp_source_records_hash_not_blank_check check (btrim(content_hash) <> ''),
  constraint gp_source_records_local_mapping_check check (
    (local_entity_type is null and local_entity_id is null and match_status <> 'Matched')
    or (local_entity_type is not null and local_entity_id is not null)
  )
);

create table if not exists public.gp_reconciliation_issues (
  id bigint generated always as identity primary key,
  source_record_id bigint not null references public.gp_source_records(id) on delete restrict,
  issue_code text not null,
  severity text not null default 'Warning' check (severity in ('Info', 'Warning', 'Blocking')),
  status text not null default 'Open' check (status in ('Open', 'Resolved', 'Ignored')),
  summary text not null,
  detail jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by_user_id uuid references public.operational_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gp_reconciliation_issue_code_not_blank_check check (btrim(issue_code) <> ''),
  constraint gp_reconciliation_summary_not_blank_check check (btrim(summary) <> ''),
  constraint gp_reconciliation_resolution_check check (
    (status = 'Open' and resolved_at is null)
    or (status in ('Resolved', 'Ignored') and resolved_at is not null)
  )
);

create table if not exists public.gp_sync_cursors (
  company_id text not null,
  entity_type text not null check (entity_type in (
    'Customer', 'Item', 'Inventory', 'SalesOrder', 'SalesOrderLine', 'Invoice', 'InvoiceLine'
  )),
  source_watermark text not null,
  last_successful_run_id uuid not null references public.gp_sync_runs(id) on delete restrict,
  last_successful_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (company_id, entity_type),
  constraint gp_sync_cursors_company_not_blank_check check (btrim(company_id) <> ''),
  constraint gp_sync_cursors_watermark_not_blank_check check (btrim(source_watermark) <> '')
);

create index if not exists gp_sync_runs_attention_idx
  on public.gp_sync_runs (status, started_at desc)
  where status in ('Running', 'Failed');
create index if not exists gp_sync_batches_run_idx
  on public.gp_sync_batches (sync_run_id, id);
create index if not exists gp_source_records_last_run_idx
  on public.gp_source_records (last_seen_run_id, entity_type);
create index if not exists gp_source_records_reconciliation_idx
  on public.gp_source_records (match_status, entity_type, source_changed_at desc)
  where match_status in ('Unmatched', 'Conflict');
create unique index if not exists gp_reconciliation_open_issue_idx
  on public.gp_reconciliation_issues (source_record_id, issue_code)
  where status = 'Open';
create index if not exists gp_reconciliation_attention_idx
  on public.gp_reconciliation_issues (severity, detected_at desc)
  where status = 'Open';

drop trigger if exists gp_sync_runs_set_updated_at on public.gp_sync_runs;
create trigger gp_sync_runs_set_updated_at
before update on public.gp_sync_runs
for each row execute function public.mdb_set_updated_at();

drop trigger if exists gp_source_records_set_updated_at on public.gp_source_records;
create trigger gp_source_records_set_updated_at
before update on public.gp_source_records
for each row execute function public.mdb_set_updated_at();

drop trigger if exists gp_reconciliation_issues_set_updated_at on public.gp_reconciliation_issues;
create trigger gp_reconciliation_issues_set_updated_at
before update on public.gp_reconciliation_issues
for each row execute function public.mdb_set_updated_at();

drop trigger if exists gp_sync_cursors_set_updated_at on public.gp_sync_cursors;
create trigger gp_sync_cursors_set_updated_at
before update on public.gp_sync_cursors
for each row execute function public.mdb_set_updated_at();

alter table public.gp_sync_runs enable row level security;
alter table public.gp_sync_batches enable row level security;
alter table public.gp_source_records enable row level security;
alter table public.gp_reconciliation_issues enable row level security;
alter table public.gp_sync_cursors enable row level security;

revoke all on table public.gp_sync_runs from anon, authenticated, public;
revoke all on table public.gp_sync_batches from anon, authenticated, public;
revoke all on table public.gp_source_records from anon, authenticated, public;
revoke all on table public.gp_reconciliation_issues from anon, authenticated, public;
revoke all on table public.gp_sync_cursors from anon, authenticated, public;

revoke all on public.gp_sync_runs from service_role;
revoke all on public.gp_sync_batches from service_role;
revoke all on public.gp_source_records from service_role;
revoke all on public.gp_reconciliation_issues from service_role;
revoke all on public.gp_sync_cursors from service_role;
grant select, insert, update on public.gp_sync_runs to service_role;
grant select, insert on public.gp_sync_batches to service_role;
grant select, insert, update on public.gp_source_records to service_role;
grant select, insert, update on public.gp_reconciliation_issues to service_role;
grant select, insert, update on public.gp_sync_cursors to service_role;
grant usage, select on sequence public.gp_sync_batches_id_seq to service_role;
grant usage, select on sequence public.gp_source_records_id_seq to service_role;
grant usage, select on sequence public.gp_reconciliation_issues_id_seq to service_role;

create or replace function public.mdb_gp_sync_start_v1(
  p_run_key text,
  p_company_id text,
  p_connector text default 'normalized_export',
  p_requested_entities text[] default '{}'::text[],
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_run public.gp_sync_runs%rowtype;
  v_created boolean := false;
  v_allowed_entities constant text[] := array[
    'Customer', 'Item', 'Inventory', 'SalesOrder', 'SalesOrderLine', 'Invoice', 'InvoiceLine'
  ];
  v_requested_entities text[];
begin
  if btrim(coalesce(p_run_key, '')) = '' then raise exception 'runKey is required'; end if;
  if btrim(coalesce(p_company_id, '')) = '' then raise exception 'companyId is required'; end if;
  if btrim(coalesce(p_connector, '')) = '' then raise exception 'connector is required'; end if;
  if exists (
    select 1 from unnest(coalesce(p_requested_entities, '{}'::text[])) entity
    where not (entity = any(v_allowed_entities))
  ) then
    raise exception 'requestedEntities contains an unsupported GP entity';
  end if;

  select coalesce(array_agg(entity order by entity), '{}'::text[])
  into v_requested_entities
  from (
    select distinct unnest(coalesce(p_requested_entities, '{}'::text[])) as entity
  ) requested;

  insert into public.gp_sync_runs (
    run_key, company_id, connector, requested_entities, metadata
  ) values (
    btrim(p_run_key), btrim(p_company_id), btrim(p_connector),
    v_requested_entities, coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (run_key) do nothing
  returning * into v_run;

  if found then
    v_created := true;
  else
    select * into strict v_run
    from public.gp_sync_runs
    where run_key = btrim(p_run_key);
    if v_run.company_id <> btrim(p_company_id) or v_run.connector <> btrim(p_connector) then
      raise exception 'runKey already belongs to a different GP sync';
    end if;
    if v_run.requested_entities <> v_requested_entities then
      raise exception 'runKey was already used with different requestedEntities';
    end if;
  end if;

  return jsonb_build_object(
    'runId', v_run.id,
    'status', v_run.status,
    'readOnly', true,
    'idempotentReplay', not v_created
  );
end;
$$;

create or replace function public.mdb_gp_sync_ingest_batch_v1(
  p_run_id uuid,
  p_batch_key text,
  p_entity_type text,
  p_records jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_run public.gp_sync_runs%rowtype;
  v_existing_batch public.gp_sync_batches%rowtype;
  v_payload_hash text;
  v_record_count int;
  v_inserted int := 0;
  v_updated int := 0;
  v_unchanged int := 0;
begin
  if btrim(coalesce(p_batch_key, '')) = '' then raise exception 'batchKey is required'; end if;
  if p_entity_type not in ('Customer', 'Item', 'Inventory', 'SalesOrder', 'SalesOrderLine', 'Invoice', 'InvoiceLine') then
    raise exception 'Unsupported GP entity type: %', coalesce(p_entity_type, '');
  end if;
  if p_records is null or jsonb_typeof(p_records) <> 'array' then
    raise exception 'records must be a JSON array';
  end if;
  v_record_count := jsonb_array_length(p_records);
  if v_record_count < 1 or v_record_count > 500 then
    raise exception 'A GP sync batch must contain between 1 and 500 records';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_records) record
    where btrim(coalesce(record->>'externalId', '')) = ''
  ) then
    raise exception 'Every GP record requires externalId';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_records) record
    group by btrim(record->>'externalId')
    having count(*) > 1
  ) then
    raise exception 'A GP batch cannot contain duplicate externalId values';
  end if;

  select * into v_run
  from public.gp_sync_runs
  where id = p_run_id
  for update;
  if not found then raise exception 'GP sync run not found'; end if;
  if v_run.status <> 'Running' then raise exception 'GP sync run is already %', v_run.status; end if;
  if cardinality(v_run.requested_entities) > 0 and not (p_entity_type = any(v_run.requested_entities)) then
    raise exception 'GP sync run was not opened for entity type %', p_entity_type;
  end if;

  v_payload_hash := md5(p_records::text);
  select * into v_existing_batch
  from public.gp_sync_batches
  where sync_run_id = p_run_id and batch_key = btrim(p_batch_key);

  if found then
    if v_existing_batch.payload_hash <> v_payload_hash
      or v_existing_batch.entity_type <> p_entity_type then
      raise exception 'batchKey was already used with different content';
    end if;
    return jsonb_build_object(
      'runId', p_run_id,
      'batchKey', btrim(p_batch_key),
      'recordCount', v_existing_batch.record_count,
      'inserted', v_existing_batch.inserted_count,
      'updated', v_existing_batch.updated_count,
      'unchanged', v_existing_batch.unchanged_count,
      'idempotentReplay', true
    );
  end if;

  with incoming as (
    select
      btrim(record->>'externalId') as external_id,
      nullif(record->>'sourceModifiedAt', '')::timestamptz as source_modified_at,
      coalesce((record->>'deleted')::boolean, false) as source_deleted,
      coalesce(record->'payload', '{}'::jsonb) as source_payload,
      coalesce(record->'normalized', '{}'::jsonb) as normalized_payload
    from jsonb_array_elements(p_records) record
  ), compared as (
    select
      incoming.*,
      md5(concat_ws('|', incoming.source_deleted::text, incoming.source_payload::text, incoming.normalized_payload::text)) as content_hash,
      existing.id as existing_id,
      existing.content_hash as existing_hash
    from incoming
    left join public.gp_source_records existing
      on existing.company_id = v_run.company_id
     and existing.entity_type = p_entity_type
     and existing.external_id = incoming.external_id
  )
  select
    count(*) filter (where existing_id is null)::int,
    count(*) filter (where existing_id is not null and existing_hash <> content_hash)::int,
    count(*) filter (where existing_id is not null and existing_hash = content_hash)::int
  into v_inserted, v_updated, v_unchanged
  from compared;

  insert into public.gp_source_records (
    company_id, entity_type, external_id, source_modified_at, source_deleted,
    source_payload, normalized_payload, content_hash,
    first_seen_run_id, last_seen_run_id
  )
  select
    v_run.company_id,
    p_entity_type,
    btrim(record->>'externalId'),
    nullif(record->>'sourceModifiedAt', '')::timestamptz,
    coalesce((record->>'deleted')::boolean, false),
    coalesce(record->'payload', '{}'::jsonb),
    coalesce(record->'normalized', '{}'::jsonb),
    md5(concat_ws(
      '|',
      coalesce((record->>'deleted')::boolean, false)::text,
      coalesce(record->'payload', '{}'::jsonb)::text,
      coalesce(record->'normalized', '{}'::jsonb)::text
    )),
    p_run_id,
    p_run_id
  from jsonb_array_elements(p_records) record
  on conflict (company_id, entity_type, external_id) do update set
    source_modified_at = excluded.source_modified_at,
    source_deleted = excluded.source_deleted,
    source_payload = excluded.source_payload,
    normalized_payload = excluded.normalized_payload,
    content_hash = excluded.content_hash,
    last_seen_run_id = excluded.last_seen_run_id,
    last_seen_at = now(),
    source_changed_at = case
      when public.gp_source_records.content_hash <> excluded.content_hash then now()
      else public.gp_source_records.source_changed_at
    end;

  insert into public.gp_sync_batches (
    sync_run_id, batch_key, entity_type, payload_hash, record_count,
    inserted_count, updated_count, unchanged_count
  ) values (
    p_run_id, btrim(p_batch_key), p_entity_type, v_payload_hash, v_record_count,
    v_inserted, v_updated, v_unchanged
  );

  update public.gp_sync_runs set
    records_seen = records_seen + v_record_count,
    records_inserted = records_inserted + v_inserted,
    records_updated = records_updated + v_updated,
    records_unchanged = records_unchanged + v_unchanged
  where id = p_run_id;

  return jsonb_build_object(
    'runId', p_run_id,
    'batchKey', btrim(p_batch_key),
    'recordCount', v_record_count,
    'inserted', v_inserted,
    'updated', v_updated,
    'unchanged', v_unchanged,
    'idempotentReplay', false
  );
end;
$$;

create or replace function public.mdb_gp_sync_finish_v1(
  p_run_id uuid,
  p_status text,
  p_source_watermark text default null,
  p_error_summary text default ''
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_run public.gp_sync_runs%rowtype;
  v_replay boolean := false;
begin
  if p_status not in ('Succeeded', 'Failed') then
    raise exception 'GP sync finish status must be Succeeded or Failed';
  end if;
  if p_status = 'Succeeded' and btrim(coalesce(p_source_watermark, '')) = '' then
    raise exception 'A successful GP sync requires a source watermark';
  end if;

  select * into v_run
  from public.gp_sync_runs
  where id = p_run_id
  for update;
  if not found then raise exception 'GP sync run not found'; end if;

  if v_run.status <> 'Running' then
    if v_run.status <> p_status then raise exception 'GP sync run is already %', v_run.status; end if;
    if p_status = 'Succeeded'
      and v_run.source_watermark <> nullif(btrim(coalesce(p_source_watermark, '')), '') then
      raise exception 'GP sync run was already finished with a different source watermark';
    end if;
    v_replay := true;
  else
    update public.gp_sync_runs set
      status = p_status,
      source_watermark = nullif(btrim(coalesce(p_source_watermark, '')), ''),
      error_summary = case when p_status = 'Failed' then btrim(coalesce(p_error_summary, '')) else '' end,
      finished_at = now()
    where id = p_run_id
    returning * into v_run;

    if p_status = 'Succeeded' then
      insert into public.gp_sync_cursors (
        company_id, entity_type, source_watermark, last_successful_run_id, last_successful_at
      )
      select distinct
        v_run.company_id, batch.entity_type, v_run.source_watermark, v_run.id, v_run.finished_at
      from public.gp_sync_batches batch
      where batch.sync_run_id = v_run.id
      on conflict (company_id, entity_type) do update set
        source_watermark = excluded.source_watermark,
        last_successful_run_id = excluded.last_successful_run_id,
        last_successful_at = excluded.last_successful_at;
    end if;
  end if;

  return jsonb_build_object(
    'runId', v_run.id,
    'status', v_run.status,
    'sourceWatermark', v_run.source_watermark,
    'recordsSeen', v_run.records_seen,
    'inserted', v_run.records_inserted,
    'updated', v_run.records_updated,
    'unchanged', v_run.records_unchanged,
    'readOnly', true,
    'idempotentReplay', v_replay
  );
end;
$$;

revoke all on function public.mdb_gp_sync_start_v1(text, text, text, text[], jsonb) from anon, authenticated, public;
revoke all on function public.mdb_gp_sync_ingest_batch_v1(uuid, text, text, jsonb) from anon, authenticated, public;
revoke all on function public.mdb_gp_sync_finish_v1(uuid, text, text, text) from anon, authenticated, public;
grant execute on function public.mdb_gp_sync_start_v1(text, text, text, text[], jsonb) to service_role;
grant execute on function public.mdb_gp_sync_ingest_batch_v1(uuid, text, text, jsonb) to service_role;
grant execute on function public.mdb_gp_sync_finish_v1(uuid, text, text, text) to service_role;

commit;
