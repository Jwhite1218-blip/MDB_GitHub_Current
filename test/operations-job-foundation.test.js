"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const migration = fs.readFileSync(
  path.join(root, "supabase", "migrations", "20260825090000_operations_job_service_foundation.sql"),
  "utf8"
);
const operationsApi = fs.readFileSync(
  path.join(root, "netlify", "functions", "operations-jobs.mts"),
  "utf8"
);
const shopCentersMigration = fs.readFileSync(
  path.join(root, "supabase", "migrations", "20260825103000_operations_shop_work_centers.sql"),
  "utf8"
);
const serviceEstimateMigration = fs.readFileSync(
  path.join(root, "supabase", "migrations", "20260825143000_service_estimate_matrix.sql"),
  "utf8"
);

test("operations and service migration is explicitly transactional", () => {
  assert.match(migration, /^begin;/m);
  assert.match(migration, /^commit;/m);
});

test("machine shop and preassembly are controlled Operations Job destinations", () => {
  assert.match(shopCentersMigration, /^begin;/m);
  assert.match(shopCentersMigration, /^commit;/m);
  assert.match(shopCentersMigration, /'machine-shop', 'MACHINE', 'Machine Shop', 'shop_cell'/);
  assert.match(shopCentersMigration, /'preassembly-work-bay', 'PREASM', 'Preassembly Work Bay', 'build_bay'/);
  assert.match(shopCentersMigration, /capacity, is_active/);
  assert.match(shopCentersMigration, /v_existing_committed_due_at/);
  assert.match(shopCentersMigration, /coalesce\(v_existing_committed_due_at, coalesce\(new\.committed_due_date/);
});

test("requests, shared execution jobs, and specialized work documents stay separate", () => {
  assert.match(migration, /create table if not exists public\.service_requests/);
  assert.match(migration, /create table if not exists public\.operations_jobs/);
  assert.match(migration, /create table if not exists public\.service_work_orders/);
  assert.match(migration, /service_request_id text not null unique references public\.service_requests/);
  assert.match(migration, /operations_job_id text not null unique references public\.operations_jobs/);
  assert.match(migration, /alter table public\.build_orders[\s\S]*operations_job_id text/);
});

test("qualified service estimates separate pricing judgment from gatekeeper and execution", () => {
  assert.match(serviceEstimateMigration, /^begin;/m);
  assert.match(serviceEstimateMigration, /^commit;/m);
  assert.match(serviceEstimateMigration, /'service_estimator'/);
  assert.match(serviceEstimateMigration, /create table if not exists public\.service_estimates/);
  assert.match(serviceEstimateMigration, /create table if not exists public\.service_estimate_lines/);
  assert.match(serviceEstimateMigration, /create table if not exists public\.service_pricing_rules/);
  assert.match(serviceEstimateMigration, /create table if not exists public\.service_actual_cost_entries/);
  assert.match(serviceEstimateMigration, /mdb_save_service_estimate_v1/);
  assert.match(serviceEstimateMigration, /mdb_transition_service_estimate_v1/);
  assert.match(serviceEstimateMigration, /mdb_record_service_actual_cost_v1/);
  assert.match(serviceEstimateMigration, /Only a qualified Service Estimator/);
  assert.match(serviceEstimateMigration, /Only a Service Gatekeeper can approve an estimate/);
  assert.doesNotMatch(serviceEstimateMigration, /grant\s+delete\s+on\s+public\.(service_estimate_events|service_actual_cost_entries)/i);
});

test("the shared job spine controls capacity, checkpoints, and append-only evidence", () => {
  assert.match(migration, /mdb_enforce_work_center_capacity_v1/);
  assert.match(migration, /tstzrange/);
  assert.match(migration, /operations_job_assignments_active_job_uidx/);
  assert.match(migration, /operations_checkpoint_definitions/);
  assert.match(migration, /requires_evidence/);
  assert.match(migration, /service_scope_items[\s\S]*scope_version/);
  assert.match(migration, /service_signoffs[\s\S]*scope_version/);
  assert.doesNotMatch(migration, /grant\s+delete\s+on\s+public\.(operations_job_events|service_request_events|service_signoffs)/i);
});

test("operations tables are server-only and state changes go through role-checked RPCs", () => {
  for (const functionName of [
    "mdb_create_service_request_v1",
    "mdb_transition_service_request_v1",
    "mdb_schedule_operations_job_v1",
    "mdb_replace_service_scope_v1",
    "mdb_update_operations_checkpoint_v1",
    "mdb_record_service_signoff_v1",
    "mdb_transition_service_job_v1",
  ]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${functionName}`));
    assert.match(operationsApi, new RegExp(functionName));
  }
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.operations_jobs from anon, authenticated, public/);
  assert.doesNotMatch(migration, /security definer/i);
  assert.match(migration, /security invoker/i);
  assert.doesNotMatch(migration, /grant execute[\s\S]{0,180}to authenticated/);
});

test("operations API uses employee identity and returns only actor-visible records", () => {
  assert.match(operationsApi, /requireOperationalActor\(request\)/);
  assert.match(operationsApi, /requester_user_id === actor\.id/);
  assert.match(operationsApi, /assignee_user_id === actor\.id/);
  assert.match(operationsApi, /SERVICE_CONTROLLER_ROLES/);
  assert.match(operationsApi, /config = \{ path: "\/api\/operations\/jobs" \}/);
});
