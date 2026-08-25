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
const operationsMigrationPath = path.join(
  root,
  "supabase",
  "migrations",
  "20260825090000_operations_job_service_foundation.sql",
);
const shopCentersMigrationPath = path.join(
  root,
  "supabase",
  "migrations",
  "20260825103000_operations_shop_work_centers.sql",
);

const SALES = "11111111-1111-4111-8111-111111111111";
const PRODUCTION_CONTROLLER = "22222222-2222-4222-8222-222222222222";
const SERVICE_CONTROLLER = "33333333-3333-4333-8333-333333333333";
const SERVICE_TECH = "44444444-4444-4444-8444-444444444444";
const OTHER_TECH = "55555555-5555-4555-8555-555555555555";

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
  await db.exec(await readFile(operationsMigrationPath, "utf8"));
  await db.exec(await readFile(shopCentersMigrationPath, "utf8"));
  return db;
}

async function createConvertedService(db, requestId, assetId) {
  const created = await first(
    db,
    `select public.mdb_create_service_request_v1(
       $1::uuid, 'Desktop', 'Urgent', 'Customer snapshot', 'Service site',
       'Customer contact', $2, $3, 'B-Series', 1250,
       'Intermittent safety stop', 'Inspect and repair the reported condition',
       'Unknown', 'In House', true, $4
     ) as result`,
    [SALES, assetId, `SERIAL-${assetId}`, requestId],
  );
  assert.equal(created.result.request.status, "Submitted");

  await db.query(
    `select public.mdb_transition_service_request_v1(
       $1::uuid, $2, 'triage', 'Service bay review', 'Warranty', 'In House'
     )`,
    [SERVICE_CONTROLLER, requestId],
  );
  await db.query(
    `select public.mdb_transition_service_request_v1(
       $1::uuid, $2, 'accept', 'Scope authorized'
     )`,
    [SERVICE_CONTROLLER, requestId],
  );
  const converted = await first(
    db,
    `select public.mdb_transition_service_request_v1(
       $1::uuid, $2, 'convert', 'Create controlled service work',
       null, null, 2::smallint, $1::uuid, $3::uuid
     ) as result`,
    [SERVICE_CONTROLLER, requestId, SERVICE_TECH],
  );
  assert.equal(converted.result.request.status, "Converted");
  return {
    jobId: converted.result.operationsJobId,
    workOrderId: converted.result.serviceWorkOrderId,
  };
}

test("service requests convert into separately linked operations and service documents", async (t) => {
  const db = await bootstrapDatabase();
  t.after(() => db.close());

  await db.exec(`
    insert into public.operational_users (id, identity_subject, email, display_name, initials)
    values
      ('${SALES}', 'identity-sales', 'sales@example.test', 'Sales Requester', 'SR'),
      ('${PRODUCTION_CONTROLLER}', 'identity-production', 'production@example.test', 'Production Controller', 'PC'),
      ('${SERVICE_CONTROLLER}', 'identity-service-controller', 'service-controller@example.test', 'Service Controller', 'SC'),
      ('${SERVICE_TECH}', 'identity-service-tech', 'service-tech@example.test', 'Service Technician', 'ST'),
      ('${OTHER_TECH}', 'identity-other-tech', 'other-tech@example.test', 'Other Technician', 'OT');

    insert into public.operational_user_roles (user_id, role)
    values
      ('${SALES}', 'sales'),
      ('${PRODUCTION_CONTROLLER}', 'production_controller'),
      ('${SERVICE_CONTROLLER}', 'service_controller'),
      ('${SERVICE_TECH}', 'service_technician'),
      ('${OTHER_TECH}', 'service_technician');

    insert into public.work_centers (id, code, name, center_type, capacity)
    values ('wc-service-1', 'SERVICE-01', 'Service Bay 1', 'service_bay', 1);
  `);

  const created = await first(
    db,
    `select public.mdb_create_service_request_v1(
       $1::uuid, 'Desktop', 'Machine Down', 'Customer snapshot', 'Service site',
       'Customer contact', 'ASSET-001', 'SERIAL-001', 'B-Series', 900,
       'Hydraulic system stopped', 'Diagnose and repair',
       'Unknown', 'In House', true, 'service-request-1'
     ) as result`,
    [SALES],
  );
  assert.equal(created.result.request.status, "Submitted");
  assert.equal(created.result.idempotentReplay, false);

  const replay = await first(
    db,
    `select public.mdb_create_service_request_v1(
       $1::uuid, 'Desktop', 'Machine Down', 'Customer snapshot', 'Service site',
       'Customer contact', 'ASSET-001', 'SERIAL-001', 'B-Series', 900,
       'Hydraulic system stopped', 'Diagnose and repair',
       'Unknown', 'In House', true, 'service-request-1'
     ) as result`,
    [SALES],
  );
  assert.equal(replay.result.idempotentReplay, true);

  await assert.rejects(
    db.query(
      `select public.mdb_transition_service_request_v1(
         $1::uuid, 'service-request-1', 'triage'
       )`,
      [SALES],
    ),
    /Only a service gatekeeper can triage/,
  );

  await db.query(
    `select public.mdb_transition_service_request_v1(
       $1::uuid, 'service-request-1', 'triage', 'Confirmed service context',
       'Warranty', 'In House'
     )`,
    [SERVICE_CONTROLLER],
  );
  await db.query(
    `select public.mdb_transition_service_request_v1(
       $1::uuid, 'service-request-1', 'accept', 'Service scope accepted'
     )`,
    [SERVICE_CONTROLLER],
  );
  const converted = await first(
    db,
    `select public.mdb_transition_service_request_v1(
       $1::uuid, 'service-request-1', 'convert', 'Order setup required',
       null, null, 1::smallint, $1::uuid, $2::uuid
     ) as result`,
    [SERVICE_CONTROLLER, SERVICE_TECH],
  );
  const jobId = converted.result.operationsJobId;
  const workOrderId = converted.result.serviceWorkOrderId;
  assert.ok(jobId);
  assert.ok(workOrderId);

  const linked = await first(
    db,
    `select
       r.status as request_status,
       j.status as job_status,
       j.job_type,
       w.scope_version,
       (select count(*)::int from public.workflow_tasks where job_id = j.id) as tasks,
       (select count(*)::int from public.operations_job_checkpoints where job_id = j.id) as checkpoints
     from public.service_requests r
     join public.service_work_orders w on w.service_request_id = r.id
     join public.operations_jobs j on j.id = w.operations_job_id
     where r.id = 'service-request-1'`,
  );
  assert.deepEqual(linked, {
    request_status: "Converted",
    job_status: "Order Setup Pending",
    job_type: "service_job",
    scope_version: 0,
    tasks: 1,
    checkpoints: 6,
  });

  const scope = await first(
    db,
    `select public.mdb_replace_service_scope_v1(
       $1::uuid, $2, $3::jsonb, 'Inspect, diagnose, repair, and verify'
     ) as result`,
    [
      SERVICE_CONTROLLER,
      workOrderId,
      JSON.stringify([
        { section: "Complaint", detail: "Document the reported intermittent stop" },
        { section: "Cause", detail: "Record the verified root cause" },
        { section: "Correction", detail: "Complete the approved repair" },
        { section: "Inspection", detail: "Verify safety and operating functions" },
      ]),
    ],
  );
  assert.equal(scope.result.serviceWorkOrder.scope_version, 1);
  assert.equal(scope.result.scopeItems.length, 4);

  const scheduled = await first(
    db,
    `select public.mdb_schedule_operations_job_v1(
       $1::uuid, $2, 'wc-service-1', 1::smallint,
       '2026-09-01T08:00:00Z'::timestamptz,
       '2026-09-01T16:00:00Z'::timestamptz,
       'Gatekeeper committed Service Bay 1', 1::smallint, $3::uuid
     ) as result`,
    [SERVICE_CONTROLLER, jobId, SERVICE_TECH],
  );
  assert.equal(scheduled.result.job.status, "Scheduled");
  assert.equal(scheduled.result.assignment.revision, 1);

  const second = await createConvertedService(db, "service-request-2", "ASSET-002");
  await assert.rejects(
    db.query(
      `select public.mdb_schedule_operations_job_v1(
         $1::uuid, $2, 'wc-service-1', 1::smallint,
         '2026-09-01T12:00:00Z'::timestamptz,
         '2026-09-01T18:00:00Z'::timestamptz,
         'Overlapping commitment', 2::smallint, $3::uuid
       )`,
      [SERVICE_CONTROLLER, second.jobId, SERVICE_TECH],
    ),
    /already committed/,
  );

  await db.query(
    "select public.mdb_transition_service_job_v1($1::uuid, $2, 'release', 'Parts and scope ready')",
    [SERVICE_CONTROLLER, jobId],
  );
  await assert.rejects(
    db.query(
      "select public.mdb_transition_service_job_v1($1::uuid, $2, 'start')",
      [OTHER_TECH, jobId],
    ),
    /assigned technician/,
  );
  await db.query(
    "select public.mdb_transition_service_job_v1($1::uuid, $2, 'start')",
    [SERVICE_TECH, jobId],
  );

  const checkpoints = await db.query(
    `select c.checkpoint_key, c.checkpoint_version, d.requires_evidence, d.owner_role
     from public.operations_job_checkpoints c
     join public.operations_checkpoint_definitions d
       on d.checkpoint_key = c.checkpoint_key and d.version = c.checkpoint_version
     where c.job_id = $1 order by c.checkpoint_key`,
    [jobId],
  );
  const technicianCheckpoint = checkpoints.rows.find((checkpoint) => checkpoint.owner_role === "service_technician");
  await assert.rejects(
    db.query(
      `select public.mdb_update_operations_checkpoint_v1(
         $1::uuid, $2, $3, $4, 'Complete', 'Unauthorized evidence', ''
       )`,
      [OTHER_TECH, jobId, technicianCheckpoint.checkpoint_key, technicianCheckpoint.checkpoint_version],
    ),
    /not allowed/,
  );
  for (const checkpoint of checkpoints.rows) {
    await db.query(
      `select public.mdb_update_operations_checkpoint_v1(
         $1::uuid, $2, $3, $4, 'Complete', $5, ''
       )`,
      [
        checkpoint.owner_role === "service_controller" ? SERVICE_CONTROLLER : SERVICE_TECH,
        jobId,
        checkpoint.checkpoint_key,
        checkpoint.checkpoint_version,
        checkpoint.requires_evidence ? "Evidence recorded" : "Completed",
      ],
    );
  }

  await db.query(
    "select public.mdb_transition_service_job_v1($1::uuid, $2, 'complete_work', 'Scope complete')",
    [SERVICE_TECH, jobId],
  );
  await db.query(
    `select public.mdb_record_service_signoff_v1(
       $1::uuid, $2, 'signoff-internal-1', 'Internal',
       'Internal representative', 'Accepted', 'Inspection accepted'
     )`,
    [SERVICE_TECH, workOrderId],
  );
  await db.query(
    `select public.mdb_record_service_signoff_v1(
       $1::uuid, $2, 'signoff-customer-1', 'Customer',
       'Customer representative', 'Accepted', 'Work accepted'
     )`,
    [SERVICE_CONTROLLER, workOrderId],
  );
  await db.query(
    "select public.mdb_transition_service_job_v1($1::uuid, $2, 'complete_signoff')",
    [SERVICE_CONTROLLER, jobId],
  );
  await db.query(
    "select public.mdb_transition_service_job_v1($1::uuid, $2, 'close', 'Financial handoff ready')",
    [SERVICE_CONTROLLER, jobId],
  );

  const closed = await first(
    db,
    `select
       j.status as job_status,
       r.status as request_status,
       (select count(*)::int from public.service_signoffs where service_work_order_id = $1) as signoffs,
       (select count(*)::int from public.operations_job_events where job_id = j.id) as events,
       (select count(*)::int from public.notification_outbox) as notifications
     from public.operations_jobs j
     join public.service_work_orders w on w.operations_job_id = j.id
     join public.service_requests r on r.id = w.service_request_id
     where w.id = $1`,
    [workOrderId],
  );
  assert.equal(closed.job_status, "Closed");
  assert.equal(closed.request_status, "Resolved");
  assert.equal(closed.signoffs, 2);
  assert.ok(closed.events >= 12);
  assert.ok(closed.notifications >= 8);
});

test("existing Build Orders receive a shared Operations Job without losing production semantics", async (t) => {
  const db = await bootstrapDatabase();
  t.after(() => db.close());

  await db.exec(`
    insert into public.operational_users (id, identity_subject, email, display_name, initials)
    values ('${PRODUCTION_CONTROLLER}', 'identity-production-routing', 'routing@example.test', 'Production Controller', 'PC');

    insert into public.operational_user_roles (user_id, role)
    values ('${PRODUCTION_CONTROLLER}', 'production_controller');

    insert into public.items (part_number, description, item_class, uom)
    values ('RIG-BUILD-001', 'Rig build test', 'Assembly', 'EA');

    insert into public.build_orders (
      id, part, description, quantity, work_type, production_serial, rig_model
    ) values (
      'build-rig-1', 'RIG-BUILD-001', 'Controlled rig build', 1,
      'rig_build', 'SERIAL-RIG-001', 'B-Series'
    );
  `);

  const linked = await first(
    db,
    `select
       b.operations_job_id,
       b.work_type,
       b.production_serial,
       j.job_type,
       j.status,
       j.title
     from public.build_orders b
     join public.operations_jobs j on j.id = b.operations_job_id
     where b.id = 'build-rig-1'`,
  );
  assert.equal(linked.operations_job_id, "opj-build-build-rig-1");
  assert.equal(linked.work_type, "rig_build");
  assert.equal(linked.production_serial, "SERIAL-RIG-001");
  assert.equal(linked.job_type, "rig_build");
  assert.equal(linked.status, "Planning");
  assert.equal(linked.title, "Controlled rig build");

  await db.query(
    `select public.mdb_schedule_operations_job_v1(
       $1::uuid, $2, 'machine-shop', 1::smallint,
       '2026-09-08T08:00:00Z'::timestamptz, '2026-09-08T12:00:00Z'::timestamptz,
       'Gatekeeper routed rig-part work to the Machine Shop'
     )`,
    [PRODUCTION_CONTROLLER, linked.operations_job_id],
  );
  const routed = await first(
    db,
    `select j.status, j.work_center_id, c.name as work_center,
            a.revision, a.reason
       from public.operations_jobs j
       join public.work_centers c on c.id = j.work_center_id
       join public.operations_job_assignments a on a.job_id = j.id and a.superseded_at is null
      where j.id = $1`,
    [linked.operations_job_id],
  );
  assert.equal(routed.status, "Scheduled");
  assert.equal(routed.work_center_id, "machine-shop");
  assert.equal(routed.work_center, "Machine Shop");
  assert.equal(routed.revision, 1);
  assert.match(routed.reason, /Gatekeeper routed/);

  await db.query(
    `select public.mdb_schedule_operations_job_v1(
       $1::uuid, $2, 'preassembly-work-bay', 1::smallint,
       '2026-09-08T13:00:00Z'::timestamptz, '2026-09-08T17:00:00Z'::timestamptz,
       'Gatekeeper handed completed machine work to Preassembly'
     )`,
    [PRODUCTION_CONTROLLER, linked.operations_job_id],
  );
  const handedOff = await first(
    db,
    `select j.work_center_id, c.name as work_center, a.revision,
            (select count(*)::int from public.operations_job_assignments
              where job_id = j.id and superseded_at is not null) as prior_routes
       from public.operations_jobs j
       join public.work_centers c on c.id = j.work_center_id
       join public.operations_job_assignments a on a.job_id = j.id and a.superseded_at is null
      where j.id = $1`,
    [linked.operations_job_id],
  );
  assert.equal(handedOff.work_center_id, "preassembly-work-bay");
  assert.equal(handedOff.work_center, "Preassembly Work Bay");
  assert.equal(handedOff.revision, 2);
  assert.equal(handedOff.prior_routes, 1);
});

test("operations and service tables remain server-only with append-only evidence", async (t) => {
  const db = await bootstrapDatabase();
  t.after(() => db.close());

  const protectedTables = [
    "work_centers",
    "operations_jobs",
    "operations_job_assignments",
    "operations_job_events",
    "operations_checkpoint_definitions",
    "operations_job_checkpoints",
    "service_requests",
    "service_request_events",
    "service_work_orders",
    "service_scope_items",
    "service_documents",
    "service_signoffs",
    "workflow_tasks",
    "notification_outbox",
  ];
  const rls = await db.query(
    `select relname, relrowsecurity from pg_class
     where relnamespace = 'public'::regnamespace and relname = any($1::text[])
     order by relname`,
    [protectedTables],
  );
  assert.equal(rls.rows.length, protectedTables.length);
  for (const table of rls.rows) assert.equal(table.relrowsecurity, true, `${table.relname} needs RLS`);

  for (const role of ["public", "anon", "authenticated"]) {
    const privileges = await first(
      db,
      `select
         has_table_privilege($1, 'public.service_requests', 'select,insert,update,delete') as requests,
         has_table_privilege($1, 'public.operations_job_events', 'select,insert,update,delete') as events,
         has_table_privilege($1, 'public.service_signoffs', 'select,insert,update,delete') as signoffs`,
      [role],
    );
    assert.deepEqual(privileges, { requests: false, events: false, signoffs: false });
  }

  const serviceEvidencePrivileges = await first(
    db,
    `select
       has_table_privilege('service_role', 'public.operations_job_events', 'select,insert') as event_write,
       has_table_privilege('service_role', 'public.operations_job_events', 'update,delete') as event_mutate,
       has_table_privilege('service_role', 'public.service_signoffs', 'select,insert') as signoff_write,
       has_table_privilege('service_role', 'public.service_signoffs', 'update,delete') as signoff_mutate`,
  );
  assert.deepEqual(serviceEvidencePrivileges, {
    event_write: true,
    event_mutate: false,
    signoff_write: true,
    signoff_mutate: false,
  });
});
