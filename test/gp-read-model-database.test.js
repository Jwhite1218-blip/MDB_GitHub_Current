"use strict";

const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const schemaPath = path.join(root, "supabase", "schema.sql");
const productionMigrationPath = path.join(
  root,
  "supabase",
  "migrations",
  "20260821143000_production_control_foundation.sql",
);
const gpMigrationPath = path.join(
  root,
  "supabase",
  "migrations",
  "20260824050559_gp_read_model_foundation.sql",
);
const gpScaleMigrationPath = path.join(
  root,
  "supabase",
  "migrations",
  "20260824060551_gp_read_model_scale_foundation.sql",
);

async function first(db, sql, parameters = []) {
  const result = await db.query(sql, parameters);
  return result.rows[0];
}

async function bootstrapDatabase() {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  await db.exec(`
    create role anon noinherit;
    create role authenticated noinherit;
    create role service_role noinherit bypassrls;
  `);
  await db.exec(await readFile(schemaPath, "utf8"));
  const productionMigration = (await readFile(productionMigrationPath, "utf8")).replace(
    /^create extension if not exists pgcrypto;$/m,
    "-- pgcrypto is preinstalled by Supabase and omitted from the embedded test engine.",
  );
  await db.exec(productionMigration);
  await db.exec(await readFile(gpMigrationPath, "utf8"));
  await db.exec(await readFile(gpScaleMigrationPath, "utf8"));
  return db;
}

function item(externalId, description, sourceModifiedAt = "2026-08-24T04:00:00Z") {
  return {
    externalId,
    sourceModifiedAt,
    deleted: false,
    payload: { ITEMNMBR: externalId, ITEMDESC: description },
    normalized: { partNumber: externalId, description },
  };
}

test("GP read model accepts idempotent inbound batches and advances cursors only on success", async (t) => {
  const db = await bootstrapDatabase();
  t.after(() => db.close());

  const started = await first(
    db,
    `select public.mdb_gp_sync_start_v1(
       'gp-run-001', 'MDB-TEST', 'normalized_export', array['Item'], '{"fixture":true}'::jsonb
     ) as result`,
  );
  assert.equal(started.result.readOnly, true);
  assert.equal(started.result.idempotentReplay, false);
  const runId = started.result.runId;

  const replayedStart = await first(
    db,
    `select public.mdb_gp_sync_start_v1(
       'gp-run-001', 'MDB-TEST', 'normalized_export', array['Item'], '{}'::jsonb
     ) as result`,
  );
  assert.equal(replayedStart.result.runId, runId);
  assert.equal(replayedStart.result.idempotentReplay, true);

  await assert.rejects(
    db.query(
      `select public.mdb_gp_sync_start_v1(
         'gp-run-001', 'MDB-TEST', 'normalized_export', array['Inventory'], '{}'::jsonb
       )`,
    ),
    /different requestedEntities/,
  );

  const firstRecords = [item("GP-100", "Original part"), item("GP-200", "Stable part")];
  const ingested = await first(
    db,
    `select public.mdb_gp_sync_ingest_batch_v1($1::uuid, 'items-001', 'Item', $2::jsonb) as result`,
    [runId, JSON.stringify(firstRecords)],
  );
  assert.deepEqual(
    {
      recordCount: ingested.result.recordCount,
      inserted: ingested.result.inserted,
      updated: ingested.result.updated,
      unchanged: ingested.result.unchanged,
      idempotentReplay: ingested.result.idempotentReplay,
    },
    { recordCount: 2, inserted: 2, updated: 0, unchanged: 0, idempotentReplay: false },
  );

  const replayedBatch = await first(
    db,
    `select public.mdb_gp_sync_ingest_batch_v1($1::uuid, 'items-001', 'Item', $2::jsonb) as result`,
    [runId, JSON.stringify(firstRecords)],
  );
  assert.equal(replayedBatch.result.idempotentReplay, true);

  await assert.rejects(
    db.query(
      `select public.mdb_gp_sync_ingest_batch_v1($1::uuid, 'inventory-001', 'Inventory', $2::jsonb)`,
      [runId, JSON.stringify([{ externalId: "MAIN:GP-100", payload: { QTYONHND: 5 } }])],
    ),
    /not opened for entity type Inventory/,
  );

  await assert.rejects(
    db.query(
      `select public.mdb_gp_sync_ingest_batch_v1($1::uuid, 'items-001', 'Item', $2::jsonb)`,
      [runId, JSON.stringify([item("GP-100", "Different content")])],
    ),
    /batchKey was already used with different content/,
  );

  const sourceBefore = await first(
    db,
    `select source_changed_at from public.gp_source_records
     where company_id = 'MDB-TEST' and entity_type = 'Item' and external_id = 'GP-200'`,
  );
  const secondRecords = [
    item("GP-100", "Revised part", "2026-08-24T05:00:00Z"),
    item("GP-200", "Stable part"),
  ];
  const secondBatch = await first(
    db,
    `select public.mdb_gp_sync_ingest_batch_v1($1::uuid, 'items-002', 'Item', $2::jsonb) as result`,
    [runId, JSON.stringify(secondRecords)],
  );
  assert.deepEqual(
    {
      inserted: secondBatch.result.inserted,
      updated: secondBatch.result.updated,
      unchanged: secondBatch.result.unchanged,
    },
    { inserted: 0, updated: 1, unchanged: 1 },
  );
  const stableSource = await first(
    db,
    `select source_changed_at from public.gp_source_records
     where company_id = 'MDB-TEST' and entity_type = 'Item' and external_id = 'GP-200'`,
  );
  assert.equal(stableSource.source_changed_at.toISOString(), sourceBefore.source_changed_at.toISOString());

  await assert.rejects(
    db.query(
      "select public.mdb_gp_sync_finish_v1($1::uuid, 'Succeeded', null, '')",
      [runId],
    ),
    /requires a source watermark/,
  );

  const finished = await first(
    db,
    `select public.mdb_gp_sync_finish_v1(
       $1::uuid, 'Succeeded', '2026-08-24T05:00:00Z', ''
     ) as result`,
    [runId],
  );
  assert.equal(finished.result.status, "Succeeded");
  assert.equal(finished.result.readOnly, true);
  assert.equal(finished.result.recordsSeen, 4);
  assert.equal(finished.result.inserted, 2);
  assert.equal(finished.result.updated, 1);
  assert.equal(finished.result.unchanged, 1);

  const cursor = await first(
    db,
    `select source_watermark, last_successful_run_id::text
     from public.gp_sync_cursors where company_id = 'MDB-TEST' and entity_type = 'Item'`,
  );
  assert.deepEqual(cursor, {
    source_watermark: "2026-08-24T05:00:00Z",
    last_successful_run_id: runId,
  });

  const replayedFinish = await first(
    db,
    `select public.mdb_gp_sync_finish_v1(
       $1::uuid, 'Succeeded', '2026-08-24T05:00:00Z', ''
     ) as result`,
    [runId],
  );
  assert.equal(replayedFinish.result.idempotentReplay, true);

  await assert.rejects(
    db.query(
      `select public.mdb_gp_sync_finish_v1(
         $1::uuid, 'Succeeded', 'different-watermark', ''
       )`,
      [runId],
    ),
    /different source watermark/,
  );

  await assert.rejects(
    db.query(
      `select public.mdb_gp_sync_ingest_batch_v1($1::uuid, 'items-003', 'Item', $2::jsonb)`,
      [runId, JSON.stringify([item("GP-300", "Late record")])],
    ),
    /already Succeeded/,
  );
});

test("GP contract v2 tracks independent entity completeness, cursors, and changed source history", async (t) => {
  const db = await bootstrapDatabase();
  t.after(() => db.close());

  const plans = [
    { entityType: "Item", syncMode: "Delta" },
    { entityType: "Inventory", syncMode: "Snapshot" },
  ];
  const started = await first(
    db,
    `select public.mdb_gp_sync_start_v2(
       'gp-v2-run-001', 'MDB-TEST', 'gp_read_view', 'mdb-gp-map-1', $1::jsonb, '{"fixture":true}'::jsonb
     ) as result`,
    [JSON.stringify(plans)],
  );
  const runId = started.result.runId;
  assert.equal(started.result.contractVersion, 2);
  assert.equal(started.result.mappingVersion, "mdb-gp-map-1");
  assert.deepEqual(
    started.result.entities.map((entity) => ({
      entityType: entity.entityType,
      syncMode: entity.syncMode,
      startingWatermark: entity.startingWatermark,
    })),
    [
      { entityType: "Inventory", syncMode: "Snapshot", startingWatermark: null },
      { entityType: "Item", syncMode: "Delta", startingWatermark: null },
    ],
  );

  const itemRecords = [item("GP-100", "Original part"), item("GP-200", "Stable part")];
  const itemBatch = await first(
    db,
    `select public.mdb_gp_sync_ingest_batch_v2(
       $1::uuid, 'items-001', 1, 'Item', $2::jsonb
     ) as result`,
    [runId, JSON.stringify(itemRecords)],
  );
  assert.deepEqual(
    {
      batchSequence: itemBatch.result.batchSequence,
      inserted: itemBatch.result.inserted,
      updated: itemBatch.result.updated,
      unchanged: itemBatch.result.unchanged,
    },
    { batchSequence: 1, inserted: 2, updated: 0, unchanged: 0 },
  );

  await assert.rejects(
    db.query(
      `select public.mdb_gp_sync_ingest_batch_v2(
         $1::uuid, 'items-duplicate', 2, 'Item', $2::jsonb
       )`,
      [runId, JSON.stringify([item("GP-100", "Original part")])],
    ),
    /cannot appear in more than one batch/,
  );

  const inventoryRecord = (externalId, partNumber, locationCode) => ({
    externalId,
    sourceModifiedAt: null,
    deleted: false,
    payload: { ITEMNMBR: partNumber, LOCNCODE: locationCode, QTYONHND: "5.00000" },
    normalized: { partNumber, locationCode, quantityOnHand: "5.00000" },
  });
  await first(
    db,
    `select public.mdb_gp_sync_ingest_batch_v2(
       $1::uuid, 'inventory-002', 2, 'Inventory', $2::jsonb
     ) as result`,
    [runId, JSON.stringify([inventoryRecord("MAIN:GP-100", "GP-100", "MAIN")])],
  );

  const prematureResults = [
    { entityType: "Item", endingWatermark: "item-end-1", expectedRecordCount: 2 },
    { entityType: "Inventory", endingWatermark: "inventory-end-1", expectedRecordCount: 1 },
  ];
  await assert.rejects(
    db.query(
      `select public.mdb_gp_sync_finish_v2($1::uuid, 'Succeeded', $2::jsonb, '')`,
      [runId, JSON.stringify(prematureResults)],
    ),
    /missing batchSequence/,
  );

  await first(
    db,
    `select public.mdb_gp_sync_ingest_batch_v2(
       $1::uuid, 'inventory-001', 1, 'Inventory', $2::jsonb
     ) as result`,
    [runId, JSON.stringify([inventoryRecord("WEST:GP-100", "GP-100", "WEST")])],
  );

  await assert.rejects(
    db.query(
      `select public.mdb_gp_sync_finish_v2($1::uuid, 'Succeeded', $2::jsonb, '')`,
      [runId, JSON.stringify([
        { entityType: "Item", endingWatermark: "item-end-1", expectedRecordCount: 1 },
        { entityType: "Inventory", endingWatermark: "inventory-end-1", expectedRecordCount: 2 },
      ])],
    ),
    /expectedRecordCount does not match/,
  );

  const completeResults = [
    { entityType: "Item", endingWatermark: "item-end-1", expectedRecordCount: 2 },
    { entityType: "Inventory", endingWatermark: "inventory-end-1", expectedRecordCount: 2 },
  ];
  const finished = await first(
    db,
    `select public.mdb_gp_sync_finish_v2($1::uuid, 'Succeeded', $2::jsonb, '') as result`,
    [runId, JSON.stringify(completeResults)],
  );
  assert.equal(finished.result.status, "Succeeded");
  assert.equal(finished.result.recordsSeen, 4);
  assert.deepEqual(
    finished.result.entities.map((entity) => ({
      entityType: entity.entityType,
      endingWatermark: entity.endingWatermark,
      recordsSeen: entity.recordsSeen,
    })),
    [
      { entityType: "Inventory", endingWatermark: "inventory-end-1", recordsSeen: 2 },
      { entityType: "Item", endingWatermark: "item-end-1", recordsSeen: 2 },
    ],
  );

  const replayedFinish = await first(
    db,
    `select public.mdb_gp_sync_finish_v2($1::uuid, 'Succeeded', $2::jsonb, '') as result`,
    [runId, JSON.stringify(completeResults)],
  );
  assert.equal(replayedFinish.result.idempotentReplay, true);

  const secondStart = await first(
    db,
    `select public.mdb_gp_sync_start_v2(
       'gp-v2-run-002', 'MDB-TEST', 'gp_read_view', 'mdb-gp-map-1',
       '[{"entityType":"Item","syncMode":"Delta"}]'::jsonb, '{}'::jsonb
     ) as result`,
  );
  assert.equal(secondStart.result.entities[0].startingWatermark, "item-end-1");
  const secondRunId = secondStart.result.runId;
  await first(
    db,
    `select public.mdb_gp_sync_ingest_batch_v2(
       $1::uuid, 'items-001', 1, 'Item', $2::jsonb
     ) as result`,
    [secondRunId, JSON.stringify([item("GP-100", "Original part")])],
  );
  await first(
    db,
    `select public.mdb_gp_sync_finish_v2(
       $1::uuid, 'Succeeded',
       '[{"entityType":"Item","endingWatermark":"item-end-2","expectedRecordCount":1}]'::jsonb,
       ''
     ) as result`,
    [secondRunId],
  );
  const unchangedVersions = await first(
    db,
    `select count(*)::int as count
     from public.gp_source_record_versions version
     join public.gp_source_records source on source.id = version.source_record_id
     where source.company_id = 'MDB-TEST' and source.entity_type = 'Item' and source.external_id = 'GP-100'`,
  );
  assert.equal(unchangedVersions.count, 1, "unchanged observations must not inflate source history");

  const thirdStart = await first(
    db,
    `select public.mdb_gp_sync_start_v2(
       'gp-v2-run-003', 'MDB-TEST', 'gp_read_view', 'mdb-gp-map-1',
       '[{"entityType":"Item","syncMode":"Delta"}]'::jsonb, '{}'::jsonb
     ) as result`,
  );
  const thirdRunId = thirdStart.result.runId;
  await first(
    db,
    `select public.mdb_gp_sync_ingest_batch_v2(
       $1::uuid, 'items-001', 1, 'Item', $2::jsonb
     ) as result`,
    [thirdRunId, JSON.stringify([item("GP-100", "Revised part", "2026-08-24T06:00:00Z")])],
  );
  const changedVersions = await first(
    db,
    `select count(*)::int as count
     from public.gp_source_record_versions version
     join public.gp_source_records source on source.id = version.source_record_id
     where source.company_id = 'MDB-TEST' and source.entity_type = 'Item' and source.external_id = 'GP-100'`,
  );
  assert.equal(changedVersions.count, 2);

  const staleStart = await first(
    db,
    `select public.mdb_gp_sync_start_v2(
       'gp-v2-run-004', 'MDB-TEST', 'gp_read_view', 'mdb-gp-map-1',
       '[{"entityType":"Item","syncMode":"Delta"}]'::jsonb, '{}'::jsonb
     ) as result`,
  );
  await assert.rejects(
    db.query(
      `select public.mdb_gp_sync_ingest_batch_v2(
         $1::uuid, 'items-001', 1, 'Item', $2::jsonb
       )`,
      [staleStart.result.runId, JSON.stringify([item("GP-100", "Stale rewrite", "2026-08-24T05:30:00Z")])],
    ),
    /equal or newer source version/,
  );
});

test("GP read model is server-only, RLS-backed, and has no write-back function", async (t) => {
  const db = await bootstrapDatabase();
  t.after(() => db.close());

  const functions = await db.query(`
    select
      p.proname,
      p.prosecdef,
      has_function_privilege('public', p.oid, 'execute') as public_execute,
      has_function_privilege('anon', p.oid, 'execute') as anon_execute,
      has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute,
      has_function_privilege('service_role', p.oid, 'execute') as service_execute
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'mdb_gp_%'
    order by p.proname
  `);
  assert.deepEqual(
    functions.rows.map((fn) => fn.proname),
    [
      "mdb_gp_sync_finish_v1",
      "mdb_gp_sync_finish_v2",
      "mdb_gp_sync_ingest_batch_v1",
      "mdb_gp_sync_ingest_batch_v2",
      "mdb_gp_sync_start_v1",
      "mdb_gp_sync_start_v2",
    ],
  );
  for (const fn of functions.rows) {
    assert.equal(fn.prosecdef, false, `${fn.proname} must be SECURITY INVOKER`);
    assert.equal(fn.public_execute, false, `${fn.proname} must not be executable by PUBLIC`);
    assert.equal(fn.anon_execute, false, `${fn.proname} must not be executable by anon`);
    assert.equal(fn.authenticated_execute, false, `${fn.proname} must not be executable by authenticated`);
    assert.equal(fn.service_execute, true, `${fn.proname} must be executable by service_role`);
    assert.doesNotMatch(fn.proname, /write|push|export/i);
  }

  const protectedTables = [
    "gp_sync_runs",
    "gp_sync_batches",
    "gp_source_records",
    "gp_source_record_versions",
    "gp_reconciliation_issues",
    "gp_sync_cursors",
    "gp_sync_run_entities",
  ];
  const rls = await db.query(
    `select relname, relrowsecurity
     from pg_class
     where relnamespace = 'public'::regnamespace and relname = any($1::text[])
     order by relname`,
    [protectedTables],
  );
  assert.equal(rls.rows.length, protectedTables.length);
  for (const table of rls.rows) {
    assert.equal(table.relrowsecurity, true, `${table.relname} must have RLS enabled`);
  }

  for (const role of ["public", "anon", "authenticated"]) {
    const privilege = await first(
      db,
      `select
         has_table_privilege($1, 'public.gp_source_records', 'select,insert,update,delete') as source_access,
         has_table_privilege($1, 'public.gp_sync_runs', 'select,insert,update,delete') as run_access`,
      [role],
    );
    assert.equal(privilege.source_access, false, `${role} must not access GP payloads directly`);
    assert.equal(privilege.run_access, false, `${role} must not access GP runs directly`);
  }

  const servicePrivileges = await first(
    db,
    `select
       has_table_privilege('service_role', 'public.gp_sync_batches', 'select') as can_select,
       has_table_privilege('service_role', 'public.gp_sync_batches', 'insert') as can_insert,
       has_table_privilege('service_role', 'public.gp_sync_batches', 'update') as can_update,
       has_table_privilege('service_role', 'public.gp_sync_batches', 'delete') as can_delete`,
  );
  assert.deepEqual(servicePrivileges, {
    can_select: true,
    can_insert: true,
    can_update: false,
    can_delete: false,
  });
});
