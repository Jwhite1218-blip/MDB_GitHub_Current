begin;

-- Contract v2 keeps the transport read-only while making completeness,
-- incremental cursors, mapping revisions, and source history explicit per
-- entity. V1 remains installed for compatibility; new extractors use v2.
alter table public.gp_sync_runs
  add column if not exists contract_version smallint not null default 1,
  add column if not exists mapping_version text not null default '';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'gp_sync_runs_contract_version_check'
      and conrelid = 'public.gp_sync_runs'::regclass
  ) then
    alter table public.gp_sync_runs
      add constraint gp_sync_runs_contract_version_check
      check (contract_version in (1, 2));
  end if;
end;
$$;

alter table public.gp_sync_batches
  add column if not exists batch_sequence int;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'gp_sync_batches_sequence_check'
      and conrelid = 'public.gp_sync_batches'::regclass
  ) then
    alter table public.gp_sync_batches
      add constraint gp_sync_batches_sequence_check
      check (batch_sequence is null or batch_sequence > 0);
  end if;
end;
$$;

alter table public.gp_source_records
  add column if not exists mapping_version text not null default '',
  add column if not exists change_sequence bigint not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'gp_source_records_change_sequence_check'
      and conrelid = 'public.gp_source_records'::regclass
  ) then
    alter table public.gp_source_records
      add constraint gp_source_records_change_sequence_check
      check (change_sequence > 0);
  end if;
end;
$$;

create table if not exists public.gp_sync_run_entities (
  sync_run_id uuid not null references public.gp_sync_runs(id) on delete restrict,
  entity_type text not null check (entity_type in (
    'Customer', 'Item', 'Inventory', 'SalesOrder', 'SalesOrderLine', 'Invoice', 'InvoiceLine'
  )),
  sync_mode text not null check (sync_mode in ('Delta', 'Snapshot')),
  status text not null default 'Running' check (status in ('Running', 'Succeeded', 'Failed')),
  starting_watermark text,
  ending_watermark text,
  expected_record_count bigint check (expected_record_count is null or expected_record_count >= 0),
  records_seen bigint not null default 0 check (records_seen >= 0),
  records_inserted bigint not null default 0 check (records_inserted >= 0),
  records_updated bigint not null default 0 check (records_updated >= 0),
  records_unchanged bigint not null default 0 check (records_unchanged >= 0),
  batches_seen int not null default 0 check (batches_seen >= 0),
  last_batch_sequence int not null default 0 check (last_batch_sequence >= 0),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (sync_run_id, entity_type),
  constraint gp_sync_run_entities_finish_state_check check (
    (status = 'Running' and finished_at is null)
    or (status in ('Succeeded', 'Failed') and finished_at is not null)
  )
);

-- Only changed source states are retained. change_sequence lets a record
-- safely return to an older content hash without losing the later transition.
create table if not exists public.gp_source_record_versions (
  id bigint generated always as identity primary key,
  source_record_id bigint not null references public.gp_source_records(id) on delete restrict,
  change_sequence bigint not null check (change_sequence > 0),
  sync_run_id uuid not null references public.gp_sync_runs(id) on delete restrict,
  company_id text not null,
  entity_type text not null check (entity_type in (
    'Customer', 'Item', 'Inventory', 'SalesOrder', 'SalesOrderLine', 'Invoice', 'InvoiceLine'
  )),
  external_id text not null,
  mapping_version text not null,
  source_modified_at timestamptz,
  source_deleted boolean not null,
  source_payload jsonb not null,
  normalized_payload jsonb not null,
  content_hash text not null,
  observed_at timestamptz not null default now(),
  unique (source_record_id, change_sequence),
  constraint gp_source_record_versions_company_not_blank_check check (btrim(company_id) <> ''),
  constraint gp_source_record_versions_external_id_not_blank_check check (btrim(external_id) <> ''),
  constraint gp_source_record_versions_mapping_not_blank_check check (btrim(mapping_version) <> ''),
  constraint gp_source_record_versions_hash_not_blank_check check (btrim(content_hash) <> '')
);

create unique index if not exists gp_sync_batches_run_entity_sequence_idx
  on public.gp_sync_batches (sync_run_id, entity_type, batch_sequence)
  where batch_sequence is not null;
create index if not exists gp_sync_run_entities_attention_idx
  on public.gp_sync_run_entities (status, started_at desc)
  where status in ('Running', 'Failed');
create index if not exists gp_source_record_versions_source_idx
  on public.gp_source_record_versions (source_record_id, change_sequence desc);
create index if not exists gp_source_record_versions_run_idx
  on public.gp_source_record_versions (sync_run_id, entity_type, id);
create index if not exists gp_source_records_entity_modified_idx
  on public.gp_source_records (company_id, entity_type, source_modified_at, external_id)
  where source_deleted = false;

drop trigger if exists gp_sync_run_entities_set_updated_at on public.gp_sync_run_entities;
create trigger gp_sync_run_entities_set_updated_at
before update on public.gp_sync_run_entities
for each row execute function public.mdb_set_updated_at();

alter table public.gp_sync_run_entities enable row level security;
alter table public.gp_source_record_versions enable row level security;

revoke all on table public.gp_sync_run_entities from anon, authenticated, public;
revoke all on table public.gp_source_record_versions from anon, authenticated, public;
revoke all on public.gp_sync_run_entities from service_role;
revoke all on public.gp_source_record_versions from service_role;
grant select, insert, update on public.gp_sync_run_entities to service_role;
grant select, insert on public.gp_source_record_versions to service_role;
grant usage, select on sequence public.gp_source_record_versions_id_seq to service_role;

-- Preserve the current state of any records received through contract v1.
insert into public.gp_source_record_versions (
  source_record_id, change_sequence, sync_run_id, company_id, entity_type,
  external_id, mapping_version, source_modified_at, source_deleted,
  source_payload, normalized_payload, content_hash, observed_at
)
select
  source.id, source.change_sequence, source.last_seen_run_id, source.company_id,
  source.entity_type, source.external_id, 'legacy-v1', source.source_modified_at,
  source.source_deleted, source.source_payload, source.normalized_payload,
  source.content_hash, source.source_changed_at
from public.gp_source_records source
on conflict (source_record_id, change_sequence) do nothing;

create or replace function public.mdb_gp_sync_start_v2(
  p_run_key text,
  p_company_id text,
  p_connector text,
  p_mapping_version text,
  p_entity_plans jsonb,
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
  v_requested_entities text[];
  v_entities jsonb;
begin
  if btrim(coalesce(p_run_key, '')) = '' then raise exception 'runKey is required'; end if;
  if btrim(coalesce(p_company_id, '')) = '' then raise exception 'companyId is required'; end if;
  if btrim(coalesce(p_connector, '')) = '' then raise exception 'connector is required'; end if;
  if btrim(coalesce(p_mapping_version, '')) = '' then raise exception 'mappingVersion is required'; end if;
  if p_entity_plans is null or jsonb_typeof(p_entity_plans) <> 'array'
    or jsonb_array_length(p_entity_plans) < 1 or jsonb_array_length(p_entity_plans) > 7 then
    raise exception 'entityPlans must contain between 1 and 7 entities';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_entity_plans) plan
    where jsonb_typeof(plan) <> 'object'
      or coalesce(plan->>'entityType', '') not in (
        'Customer', 'Item', 'Inventory', 'SalesOrder', 'SalesOrderLine', 'Invoice', 'InvoiceLine'
      )
      or coalesce(plan->>'syncMode', '') not in ('Delta', 'Snapshot')
  ) then
    raise exception 'Every entity plan requires a supported entityType and Delta or Snapshot syncMode';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_entity_plans) plan
    group by plan->>'entityType'
    having count(*) > 1
  ) then
    raise exception 'entityPlans cannot contain duplicate entityType values';
  end if;

  select array_agg(plan->>'entityType' order by plan->>'entityType')
  into v_requested_entities
  from jsonb_array_elements(p_entity_plans) plan;

  insert into public.gp_sync_runs (
    run_key, company_id, connector, contract_version, mapping_version,
    requested_entities, metadata
  ) values (
    btrim(p_run_key), btrim(p_company_id), btrim(p_connector), 2,
    btrim(p_mapping_version), v_requested_entities, coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (run_key) do nothing
  returning * into v_run;

  if found then
    v_created := true;
    insert into public.gp_sync_run_entities (
      sync_run_id, entity_type, sync_mode, starting_watermark
    )
    select
      v_run.id,
      plan->>'entityType',
      plan->>'syncMode',
      cursor.source_watermark
    from jsonb_array_elements(p_entity_plans) plan
    left join public.gp_sync_cursors cursor
      on cursor.company_id = v_run.company_id
     and cursor.entity_type = plan->>'entityType';
  else
    select * into strict v_run
    from public.gp_sync_runs
    where run_key = btrim(p_run_key);
    if v_run.contract_version <> 2
      or v_run.company_id <> btrim(p_company_id)
      or v_run.connector <> btrim(p_connector)
      or v_run.mapping_version <> btrim(p_mapping_version) then
      raise exception 'runKey already belongs to a different GP sync contract';
    end if;
    if v_run.requested_entities <> v_requested_entities then
      raise exception 'runKey was already used with different entityPlans';
    end if;
    if exists (
      select 1
      from public.gp_sync_run_entities entity
      join jsonb_array_elements(p_entity_plans) plan
        on plan->>'entityType' = entity.entity_type
      where entity.sync_run_id = v_run.id
        and entity.sync_mode <> plan->>'syncMode'
    ) then
      raise exception 'runKey was already used with different entityPlans';
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'entityType', entity.entity_type,
    'syncMode', entity.sync_mode,
    'startingWatermark', entity.starting_watermark,
    'status', entity.status
  ) order by entity.entity_type), '[]'::jsonb)
  into v_entities
  from public.gp_sync_run_entities entity
  where entity.sync_run_id = v_run.id;

  return jsonb_build_object(
    'contractVersion', 2,
    'runId', v_run.id,
    'status', v_run.status,
    'mappingVersion', v_run.mapping_version,
    'entities', v_entities,
    'readOnly', true,
    'idempotentReplay', not v_created
  );
end;
$$;

create or replace function public.mdb_gp_sync_ingest_batch_v2(
  p_run_id uuid,
  p_batch_key text,
  p_batch_sequence int,
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
  v_entity public.gp_sync_run_entities%rowtype;
  v_existing_batch public.gp_sync_batches%rowtype;
  v_payload_hash text;
  v_record_count int;
  v_inserted int := 0;
  v_updated int := 0;
  v_unchanged int := 0;
begin
  if btrim(coalesce(p_batch_key, '')) = '' then raise exception 'batchKey is required'; end if;
  if coalesce(p_batch_sequence, 0) < 1 then raise exception 'batchSequence must be a positive integer'; end if;
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
    where jsonb_typeof(record) <> 'object'
      or btrim(coalesce(record->>'externalId', '')) = ''
      or length(record->>'externalId') > 256
      or jsonb_typeof(coalesce(record->'payload', '{}'::jsonb)) <> 'object'
      or jsonb_typeof(coalesce(record->'normalized', '{}'::jsonb)) <> 'object'
      or (record ? 'deleted' and jsonb_typeof(record->'deleted') <> 'boolean')
  ) then
    raise exception 'Every GP record requires a bounded externalId plus object payload and normalized values';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_records) record
    group by btrim(record->>'externalId')
    having count(*) > 1
  ) then
    raise exception 'A GP batch cannot contain duplicate externalId values';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_records) record
    where not coalesce((record->>'deleted')::boolean, false)
      and case p_entity_type
        when 'Customer' then btrim(coalesce(record->'normalized'->>'customerNumber', '')) = ''
        when 'Item' then btrim(coalesce(record->'normalized'->>'partNumber', '')) = ''
        when 'Inventory' then btrim(coalesce(record->'normalized'->>'partNumber', '')) = ''
          or btrim(coalesce(record->'normalized'->>'locationCode', '')) = ''
        when 'SalesOrder' then btrim(coalesce(record->'normalized'->>'orderNumber', '')) = ''
        when 'SalesOrderLine' then btrim(coalesce(record->'normalized'->>'orderNumber', '')) = ''
          or btrim(coalesce(record->'normalized'->>'lineNumber', '')) = ''
        when 'Invoice' then btrim(coalesce(record->'normalized'->>'invoiceNumber', '')) = ''
        when 'InvoiceLine' then btrim(coalesce(record->'normalized'->>'invoiceNumber', '')) = ''
          or btrim(coalesce(record->'normalized'->>'lineNumber', '')) = ''
        else true
      end
  ) then
    raise exception 'A non-deleted GP record is missing its normalized entity identity';
  end if;

  select * into v_run
  from public.gp_sync_runs
  where id = p_run_id
  for update;
  if not found then raise exception 'GP sync run not found'; end if;
  if v_run.contract_version <> 2 then raise exception 'GP sync run does not use contract version 2'; end if;
  if v_run.status <> 'Running' then raise exception 'GP sync run is already %', v_run.status; end if;

  select * into v_entity
  from public.gp_sync_run_entities
  where sync_run_id = p_run_id and entity_type = p_entity_type
  for update;
  if not found then raise exception 'GP sync run was not opened for entity type %', p_entity_type; end if;
  if v_entity.status <> 'Running' then raise exception 'GP entity sync is already %', v_entity.status; end if;
  if v_entity.sync_mode = 'Delta' and exists (
    select 1 from jsonb_array_elements(p_records) record
    where btrim(coalesce(record->>'sourceModifiedAt', '')) = ''
  ) then
    raise exception 'Delta GP records require sourceModifiedAt';
  end if;

  v_payload_hash := md5(p_records::text);
  select * into v_existing_batch
  from public.gp_sync_batches
  where sync_run_id = p_run_id and batch_key = btrim(p_batch_key);

  if found then
    if v_existing_batch.payload_hash <> v_payload_hash
      or v_existing_batch.entity_type <> p_entity_type
      or v_existing_batch.batch_sequence <> p_batch_sequence then
      raise exception 'batchKey was already used with different content';
    end if;
    return jsonb_build_object(
      'contractVersion', 2,
      'runId', p_run_id,
      'batchKey', btrim(p_batch_key),
      'batchSequence', p_batch_sequence,
      'recordCount', v_existing_batch.record_count,
      'inserted', v_existing_batch.inserted_count,
      'updated', v_existing_batch.updated_count,
      'unchanged', v_existing_batch.unchanged_count,
      'idempotentReplay', true
    );
  end if;

  if exists (
    select 1 from public.gp_sync_batches
    where sync_run_id = p_run_id
      and entity_type = p_entity_type
      and batch_sequence = p_batch_sequence
  ) then
    raise exception 'batchSequence was already used for this entity';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_records) record
    join public.gp_source_records source
      on source.company_id = v_run.company_id
     and source.entity_type = p_entity_type
     and source.external_id = btrim(record->>'externalId')
    where source.last_seen_run_id = p_run_id
  ) then
    raise exception 'A GP record cannot appear in more than one batch in the same run';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_records) record
    join public.gp_source_records source
      on source.company_id = v_run.company_id
     and source.entity_type = p_entity_type
     and source.external_id = btrim(record->>'externalId')
    where nullif(record->>'sourceModifiedAt', '')::timestamptz <= source.source_modified_at
      and md5(concat_ws(
        '|',
        coalesce((record->>'deleted')::boolean, false)::text,
        coalesce(record->'payload', '{}'::jsonb)::text
      )) <> md5(concat_ws('|', source.source_deleted::text, source.source_payload::text))
  ) then
    raise exception 'A GP record conflicts with an equal or newer source version already received';
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
      md5(concat_ws(
        '|', incoming.source_deleted::text, incoming.source_payload::text,
        incoming.normalized_payload::text, v_run.mapping_version
      )) as content_hash,
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
    source_payload, normalized_payload, content_hash, mapping_version,
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
      coalesce(record->'normalized', '{}'::jsonb)::text,
      v_run.mapping_version
    )),
    v_run.mapping_version,
    p_run_id,
    p_run_id
  from jsonb_array_elements(p_records) record
  on conflict (company_id, entity_type, external_id) do update set
    source_modified_at = coalesce(excluded.source_modified_at, public.gp_source_records.source_modified_at),
    source_deleted = excluded.source_deleted,
    source_payload = excluded.source_payload,
    normalized_payload = excluded.normalized_payload,
    content_hash = excluded.content_hash,
    mapping_version = excluded.mapping_version,
    change_sequence = case
      when public.gp_source_records.content_hash <> excluded.content_hash
        then public.gp_source_records.change_sequence + 1
      else public.gp_source_records.change_sequence
    end,
    last_seen_run_id = excluded.last_seen_run_id,
    last_seen_at = now(),
    source_changed_at = case
      when public.gp_source_records.content_hash <> excluded.content_hash then now()
      else public.gp_source_records.source_changed_at
    end;

  insert into public.gp_source_record_versions (
    source_record_id, change_sequence, sync_run_id, company_id, entity_type,
    external_id, mapping_version, source_modified_at, source_deleted,
    source_payload, normalized_payload, content_hash
  )
  select
    source.id, source.change_sequence, p_run_id, source.company_id,
    source.entity_type, source.external_id, source.mapping_version,
    source.source_modified_at, source.source_deleted, source.source_payload,
    source.normalized_payload, source.content_hash
  from jsonb_array_elements(p_records) record
  join public.gp_source_records source
    on source.company_id = v_run.company_id
   and source.entity_type = p_entity_type
   and source.external_id = btrim(record->>'externalId')
  on conflict (source_record_id, change_sequence) do nothing;

  insert into public.gp_sync_batches (
    sync_run_id, batch_key, batch_sequence, entity_type, payload_hash,
    record_count, inserted_count, updated_count, unchanged_count
  ) values (
    p_run_id, btrim(p_batch_key), p_batch_sequence, p_entity_type,
    v_payload_hash, v_record_count, v_inserted, v_updated, v_unchanged
  );

  update public.gp_sync_run_entities set
    records_seen = records_seen + v_record_count,
    records_inserted = records_inserted + v_inserted,
    records_updated = records_updated + v_updated,
    records_unchanged = records_unchanged + v_unchanged,
    batches_seen = batches_seen + 1,
    last_batch_sequence = greatest(last_batch_sequence, p_batch_sequence)
  where sync_run_id = p_run_id and entity_type = p_entity_type;

  update public.gp_sync_runs set
    records_seen = records_seen + v_record_count,
    records_inserted = records_inserted + v_inserted,
    records_updated = records_updated + v_updated,
    records_unchanged = records_unchanged + v_unchanged
  where id = p_run_id;

  return jsonb_build_object(
    'contractVersion', 2,
    'runId', p_run_id,
    'batchKey', btrim(p_batch_key),
    'batchSequence', p_batch_sequence,
    'recordCount', v_record_count,
    'inserted', v_inserted,
    'updated', v_updated,
    'unchanged', v_unchanged,
    'idempotentReplay', false
  );
end;
$$;

create or replace function public.mdb_gp_sync_finish_v2(
  p_run_id uuid,
  p_status text,
  p_entity_results jsonb default '[]'::jsonb,
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
  v_entities jsonb;
  v_plan_count int;
  v_result_count int;
begin
  if p_status not in ('Succeeded', 'Failed') then
    raise exception 'GP sync finish status must be Succeeded or Failed';
  end if;
  if p_entity_results is null or jsonb_typeof(p_entity_results) <> 'array' then
    raise exception 'entityResults must be a JSON array';
  end if;

  select * into v_run
  from public.gp_sync_runs
  where id = p_run_id
  for update;
  if not found then raise exception 'GP sync run not found'; end if;
  if v_run.contract_version <> 2 then raise exception 'GP sync run does not use contract version 2'; end if;

  select count(*)::int into v_plan_count
  from public.gp_sync_run_entities where sync_run_id = p_run_id;
  v_result_count := jsonb_array_length(p_entity_results);

  if p_status = 'Succeeded' then
    if v_result_count <> v_plan_count then
      raise exception 'A successful GP sync requires one result for every entity plan';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_entity_results) result
      where jsonb_typeof(result) <> 'object'
        or btrim(coalesce(result->>'entityType', '')) = ''
        or btrim(coalesce(result->>'endingWatermark', '')) = ''
        or not (result ? 'expectedRecordCount')
        or (result->>'expectedRecordCount')::bigint < 0
    ) then
      raise exception 'Every successful entity result requires entityType, endingWatermark, and expectedRecordCount';
    end if;
    if (
      select count(distinct result->>'entityType')
      from jsonb_array_elements(p_entity_results) result
    ) <> v_result_count then
      raise exception 'entityResults cannot contain duplicate entityType values';
    end if;
    if exists (
      select 1
      from (
        select * from public.gp_sync_run_entities where sync_run_id = p_run_id
      ) entity
      full join jsonb_array_elements(p_entity_results) result
        on result->>'entityType' = entity.entity_type
      where entity.sync_run_id is null or result is null
    ) then
      raise exception 'entityResults do not match the entity plans for this run';
    end if;
    if exists (
      select 1
      from public.gp_sync_run_entities entity
      join jsonb_array_elements(p_entity_results) result
        on result->>'entityType' = entity.entity_type
      where entity.sync_run_id = p_run_id
        and entity.records_seen <> (result->>'expectedRecordCount')::bigint
    ) then
      raise exception 'An entity expectedRecordCount does not match the unique records received';
    end if;
    if exists (
      select 1 from public.gp_sync_run_entities entity
      where entity.sync_run_id = p_run_id
        and entity.batches_seen <> entity.last_batch_sequence
    ) then
      raise exception 'An entity has a missing batchSequence and cannot be completed';
    end if;
  end if;

  if v_run.status <> 'Running' then
    if v_run.status <> p_status then raise exception 'GP sync run is already %', v_run.status; end if;
    if p_status = 'Succeeded' and exists (
      select 1
      from public.gp_sync_run_entities entity
      join jsonb_array_elements(p_entity_results) result
        on result->>'entityType' = entity.entity_type
      where entity.sync_run_id = p_run_id
        and (
          entity.ending_watermark <> btrim(result->>'endingWatermark')
          or entity.expected_record_count <> (result->>'expectedRecordCount')::bigint
        )
    ) then
      raise exception 'GP sync run was already finished with different entity results';
    end if;
    v_replay := true;
  elsif p_status = 'Failed' then
    update public.gp_sync_run_entities set
      status = 'Failed',
      finished_at = now()
    where sync_run_id = p_run_id;

    update public.gp_sync_runs set
      status = 'Failed',
      source_watermark = null,
      error_summary = btrim(coalesce(p_error_summary, '')),
      finished_at = now()
    where id = p_run_id
    returning * into v_run;
  else
    update public.gp_sync_run_entities entity set
      status = 'Succeeded',
      ending_watermark = btrim(result.value->>'endingWatermark'),
      expected_record_count = (result.value->>'expectedRecordCount')::bigint,
      finished_at = now()
    from jsonb_array_elements(p_entity_results) result(value)
    where entity.sync_run_id = p_run_id
      and entity.entity_type = result.value->>'entityType';

    insert into public.gp_sync_cursors (
      company_id, entity_type, source_watermark,
      last_successful_run_id, last_successful_at
    )
    select
      v_run.company_id, entity.entity_type, entity.ending_watermark,
      v_run.id, entity.finished_at
    from public.gp_sync_run_entities entity
    where entity.sync_run_id = p_run_id
    on conflict (company_id, entity_type) do update set
      source_watermark = excluded.source_watermark,
      last_successful_run_id = excluded.last_successful_run_id,
      last_successful_at = excluded.last_successful_at;

    update public.gp_sync_runs set
      status = 'Succeeded',
      source_watermark = case when v_plan_count = 1 then (
        select entity.ending_watermark
        from public.gp_sync_run_entities entity
        where entity.sync_run_id = p_run_id
      ) else null end,
      error_summary = '',
      finished_at = now()
    where id = p_run_id
    returning * into v_run;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'entityType', entity.entity_type,
    'syncMode', entity.sync_mode,
    'status', entity.status,
    'startingWatermark', entity.starting_watermark,
    'endingWatermark', entity.ending_watermark,
    'expectedRecordCount', entity.expected_record_count,
    'recordsSeen', entity.records_seen,
    'inserted', entity.records_inserted,
    'updated', entity.records_updated,
    'unchanged', entity.records_unchanged,
    'batchesSeen', entity.batches_seen
  ) order by entity.entity_type), '[]'::jsonb)
  into v_entities
  from public.gp_sync_run_entities entity
  where entity.sync_run_id = p_run_id;

  return jsonb_build_object(
    'contractVersion', 2,
    'runId', v_run.id,
    'status', v_run.status,
    'mappingVersion', v_run.mapping_version,
    'recordsSeen', v_run.records_seen,
    'inserted', v_run.records_inserted,
    'updated', v_run.records_updated,
    'unchanged', v_run.records_unchanged,
    'entities', v_entities,
    'readOnly', true,
    'idempotentReplay', v_replay
  );
end;
$$;

revoke all on function public.mdb_gp_sync_start_v2(text, text, text, text, jsonb, jsonb) from anon, authenticated, public;
revoke all on function public.mdb_gp_sync_ingest_batch_v2(uuid, text, int, text, jsonb) from anon, authenticated, public;
revoke all on function public.mdb_gp_sync_finish_v2(uuid, text, jsonb, text) from anon, authenticated, public;
grant execute on function public.mdb_gp_sync_start_v2(text, text, text, text, jsonb, jsonb) to service_role;
grant execute on function public.mdb_gp_sync_ingest_batch_v2(uuid, text, int, text, jsonb) to service_role;
grant execute on function public.mdb_gp_sync_finish_v2(uuid, text, jsonb, text) to service_role;

commit;
