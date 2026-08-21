"use strict";

const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const schemaPath = path.join(root, "supabase", "schema.sql");
const migrationPath = path.join(
  root,
  "supabase",
  "migrations",
  "20260821143000_production_control_foundation.sql",
);

const SALES = "11111111-1111-4111-8111-111111111111";
const CONTROLLER = "22222222-2222-4222-8222-222222222222";
const SHOP = "33333333-3333-4333-8333-333333333333";
const OTHER_SHOP = "44444444-4444-4444-8444-444444444444";

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
  const migration = (await readFile(migrationPath, "utf8")).replace(
    /^create extension if not exists pgcrypto;$/m,
    "-- pgcrypto is preinstalled by Supabase and omitted from the embedded test engine.",
  );
  await db.exec(migration);
  return db;
}

async function createAcceptedBuild(db, {
  requestId,
  lineKey,
  orderLineQuantity,
  requestedQuantity,
}) {
  await db.query(
    `insert into public.order_lines (
       order_id, line_key, item_id, sort_order, part, description, quantity
     ) values (
       'test-order-1', $1, (select id from public.items where part_number = 'TEST-FINISHED-001'),
       0, 'TEST-FINISHED-001', 'Test finished assembly', $2
     )`,
    [lineKey, orderLineQuantity],
  );

  const created = await first(
    db,
    `select public.mdb_create_build_request_v1(
       $1::uuid, 'test-order-1', $2, $3, current_date + 7,
       'Customer needs the assembly', true, $4
     ) as result`,
    [SALES, lineKey, requestedQuantity, requestId],
  );
  assert.equal(created.result.request.status, "Submitted");

  await assert.rejects(
    db.query(
      `select public.mdb_transition_build_request_v1(
         $1::uuid, $2, 'accept', '', current_date + 5, 2::smallint, $3::uuid
       )`,
      [SALES, requestId, SHOP],
    ),
    /Only Production Control can accept/,
  );

  const accepted = await first(
    db,
    `select public.mdb_transition_build_request_v1(
       $1::uuid, $2, 'accept', 'Capacity confirmed', current_date + 5, 2::smallint, $3::uuid
     ) as result`,
    [CONTROLLER, requestId, SHOP],
  );
  assert.ok(accepted.result.buildOrderId);
  return accepted.result.buildOrderId;
}

test("production-control migration and controlled lifecycle execute in PostgreSQL", async (t) => {
  const db = await bootstrapDatabase();
  t.after(() => db.close());

  await db.exec(`
    insert into public.operational_users (id, identity_subject, email, display_name, initials)
    values
      ('${SALES}', 'identity-sales', 'sales@example.test', 'Sales Rep', 'SR'),
      ('${CONTROLLER}', 'identity-controller', 'controller@example.test', 'Production Controller', 'PC'),
      ('${SHOP}', 'identity-shop', 'shop@example.test', 'Assigned Shop', 'AS'),
      ('${OTHER_SHOP}', 'identity-other-shop', 'other-shop@example.test', 'Other Shop', 'OS');

    insert into public.operational_user_roles (user_id, role)
    values
      ('${SALES}', 'sales'),
      ('${CONTROLLER}', 'production_controller'),
      ('${SHOP}', 'shop'),
      ('${OTHER_SHOP}', 'shop');

    insert into public.items (part_number, description, item_class, uom)
    values
      ('TEST-FINISHED-001', 'Test finished assembly', 'Assembly', 'EA'),
      ('TEST-COMP-001', 'Test component', 'Rig Part', 'EA');

    insert into public.orders (id, customer_id, salesperson, status)
    values ('test-order-1', 'test-customer', 'Sales Rep', 'Released');

    insert into public.inventory_stock (part, item_id, on_hand, allocated, bin)
    values (
      'TEST-COMP-001',
      (select id from public.items where part_number = 'TEST-COMP-001'),
      20, 0, 'TEST'
    );
  `);

  const buildId = await createAcceptedBuild(db, {
    requestId: "test-request-1",
    lineKey: "test-line-1",
    orderLineQuantity: 2,
    requestedQuantity: 2,
  });

  const prepared = await first(
    db,
    `select public.mdb_update_build_draft_v1(
       $1::uuid, $2, $3::jsonb, 'Controlled build plan', current_date + 5, 2::smallint, $4::uuid
     ) as result`,
    [
      CONTROLLER,
      buildId,
      JSON.stringify([{
        componentKey: "test-component-1",
        part: "TEST-COMP-001",
        quantityRequired: 4,
      }]),
      SHOP,
    ],
  );
  assert.equal(prepared.result.components.length, 1);

  await assert.rejects(
    db.query(
      "select public.mdb_transition_build_order_v1($1::uuid, $2, 'release')",
      [SALES, buildId],
    ),
    /Only Production Control can release/,
  );

  await db.query(
    "select public.mdb_transition_build_order_v1($1::uuid, $2, 'release')",
    [CONTROLLER, buildId],
  );
  assert.deepEqual(
    await first(
      db,
      `select b.status, c.qty_reserved::text, s.allocated::text
       from public.build_orders b
       join public.build_order_components c on c.build_order_id = b.id
       join public.inventory_stock s on s.part = c.part
       where b.id = $1`,
      [buildId],
    ),
    { status: "Released", qty_reserved: "4", allocated: "4" },
  );

  await assert.rejects(
    db.query(
      `select public.mdb_post_build_progress_v1(
         $1::uuid, $2, 'wrong-shop-batch', $3::jsonb, 1
       )`,
      [OTHER_SHOP, buildId, JSON.stringify([{ componentKey: "test-component-1", quantity: 2 }])],
    ),
    /assigned to another employee/,
  );

  const batchOne = await first(
    db,
    `select public.mdb_post_build_progress_v1(
       $1::uuid, $2, 'test-batch-1', $3::jsonb, 1
     ) as result`,
    [SHOP, buildId, JSON.stringify([{ componentKey: "test-component-1", quantity: 2 }])],
  );
  assert.equal(batchOne.result.finished, false);
  assert.equal(batchOne.result.idempotentReplay, false);

  const afterFirstPost = await first(
    db,
    `select on_hand::text, allocated::text
     from public.inventory_stock where part = 'TEST-COMP-001'`,
  );
  assert.deepEqual(afterFirstPost, { on_hand: "18", allocated: "2" });

  const replay = await first(
    db,
    `select public.mdb_post_build_progress_v1(
       $1::uuid, $2, 'test-batch-1', $3::jsonb, 1
     ) as result`,
    [SHOP, buildId, JSON.stringify([{ componentKey: "test-component-1", quantity: 2 }])],
  );
  assert.equal(replay.result.idempotentReplay, true);
  assert.deepEqual(
    await first(
      db,
      `select on_hand::text, allocated::text
       from public.inventory_stock where part = 'TEST-COMP-001'`,
    ),
    afterFirstPost,
  );

  const batchTwo = await first(
    db,
    `select public.mdb_post_build_progress_v1(
       $1::uuid, $2, 'test-batch-2', $3::jsonb, 1
     ) as result`,
    [SHOP, buildId, JSON.stringify([{ componentKey: "test-component-1", quantity: 2 }])],
  );
  assert.equal(batchTwo.result.finished, true);

  assert.deepEqual(
    await first(
      db,
      `select
         b.status as build_status,
         b.built_qty,
         r.status as request_status,
         component.on_hand::text as component_on_hand,
         component.allocated::text as component_allocated,
         finished.on_hand::text as finished_on_hand,
         (select count(*)::int from public.inventory_posting_batches) as posting_batches,
         (select count(*)::int from public.inventory_ledger_entries) as ledger_entries
       from public.build_orders b
       join public.build_requests r on r.id = b.build_request_id
       join public.inventory_stock component on component.part = 'TEST-COMP-001'
       join public.inventory_stock finished on finished.part = 'TEST-FINISHED-001'
       where b.id = $1`,
      [buildId],
    ),
    {
      build_status: "Finished",
      built_qty: 2,
      request_status: "Fulfilled",
      component_on_hand: "16",
      component_allocated: "0",
      finished_on_hand: "2",
      posting_batches: 2,
      ledger_entries: 4,
    },
  );

  const shortageBuildId = await createAcceptedBuild(db, {
    requestId: "test-request-shortage",
    lineKey: "test-line-shortage",
    orderLineQuantity: 1,
    requestedQuantity: 1,
  });
  await db.query(
    `select public.mdb_update_build_draft_v1(
       $1::uuid, $2, $3::jsonb, '', current_date + 8, 3::smallint, $4::uuid
     )`,
    [
      CONTROLLER,
      shortageBuildId,
      JSON.stringify([{
        componentKey: "test-component-shortage",
        part: "TEST-COMP-001",
        quantityRequired: 999,
      }]),
      SHOP,
    ],
  );
  await assert.rejects(
    db.query(
      "select public.mdb_transition_build_order_v1($1::uuid, $2, 'release')",
      [CONTROLLER, shortageBuildId],
    ),
    /is short by/,
  );
  assert.deepEqual(
    await first(
      db,
      `select b.status, c.qty_reserved::text, s.allocated::text
       from public.build_orders b
       join public.build_order_components c on c.build_order_id = b.id
       join public.inventory_stock s on s.part = c.part
       where b.id = $1`,
      [shortageBuildId],
    ),
    { status: "Open", qty_reserved: "0", allocated: "0" },
  );

  await db.query(
    `select public.mdb_update_build_draft_v1(
       $1::uuid, $2, $3::jsonb, '', current_date + 8, 3::smallint, $4::uuid
     )`,
    [
      CONTROLLER,
      shortageBuildId,
      JSON.stringify([{
        componentKey: "test-component-shortage",
        part: "TEST-COMP-001",
        quantityRequired: 2,
      }]),
      SHOP,
    ],
  );
  await db.query(
    "select public.mdb_transition_build_order_v1($1::uuid, $2, 'release')",
    [CONTROLLER, shortageBuildId],
  );
  await db.query(
    "select public.mdb_transition_build_order_v1($1::uuid, $2, 'reopen', 'Schedule changed')",
    [CONTROLLER, shortageBuildId],
  );
  assert.deepEqual(
    await first(
      db,
      `select b.status, c.qty_reserved::text, s.allocated::text
       from public.build_orders b
       join public.build_order_components c on c.build_order_id = b.id
       join public.inventory_stock s on s.part = c.part
       where b.id = $1`,
      [shortageBuildId],
    ),
    { status: "Open", qty_reserved: "0", allocated: "0" },
  );
  await db.query(
    "select public.mdb_transition_build_order_v1($1::uuid, $2, 'cancel', 'Demand removed')",
    [CONTROLLER, shortageBuildId],
  );
  assert.deepEqual(
    await first(
      db,
      `select b.status as build_status, r.status as request_status
       from public.build_orders b
       join public.build_requests r on r.id = b.build_request_id
       where b.id = $1`,
      [shortageBuildId],
    ),
    { build_status: "Cancelled", request_status: "Cancelled" },
  );
});

test("production-control database permissions are server-only and RLS-backed", async (t) => {
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
    where n.nspname = 'public'
      and p.proname in (
        'mdb_actor_has_role',
        'mdb_create_build_request_v1',
        'mdb_transition_build_request_v1',
        'mdb_transition_build_order_v1',
        'mdb_update_build_draft_v1',
        'mdb_post_build_progress_v1'
      )
    order by p.proname
  `);
  assert.equal(functions.rows.length, 6);
  for (const fn of functions.rows) {
    assert.equal(fn.prosecdef, false, `${fn.proname} must be SECURITY INVOKER`);
    assert.equal(fn.public_execute, false, `${fn.proname} must not be executable by PUBLIC`);
    assert.equal(fn.anon_execute, false, `${fn.proname} must not be executable by anon`);
    assert.equal(fn.authenticated_execute, false, `${fn.proname} must not be executable by authenticated`);
    assert.equal(fn.service_execute, true, `${fn.proname} must be executable by service_role`);
  }

  const protectedTables = [
    "operational_users",
    "operational_user_roles",
    "build_requests",
    "build_request_events",
    "build_orders",
    "build_order_components",
    "build_order_events",
    "inventory_posting_batches",
    "inventory_ledger_entries",
    "integration_outbox",
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
         has_table_privilege($1, 'public.build_requests', 'select,insert,update,delete') as request_access,
         has_table_privilege($1, 'public.inventory_ledger_entries', 'select,insert,update,delete') as ledger_access`,
      [role],
    );
    assert.equal(privilege.request_access, false, `${role} must not access Build Requests directly`);
    assert.equal(privilege.ledger_access, false, `${role} must not access inventory ledger directly`);
  }

  const ledgerServicePrivileges = await first(
    db,
    `select
       has_table_privilege('service_role', 'public.inventory_ledger_entries', 'select') as can_select,
       has_table_privilege('service_role', 'public.inventory_ledger_entries', 'insert') as can_insert,
       has_table_privilege('service_role', 'public.inventory_ledger_entries', 'update') as can_update,
       has_table_privilege('service_role', 'public.inventory_ledger_entries', 'delete') as can_delete`,
  );
  assert.deepEqual(ledgerServicePrivileges, {
    can_select: true,
    can_insert: true,
    can_update: false,
    can_delete: false,
  });
});
