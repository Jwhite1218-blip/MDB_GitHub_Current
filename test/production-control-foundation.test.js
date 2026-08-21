"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const migration = fs.readFileSync(
  path.join(root, "supabase", "migrations", "20260821143000_production_control_foundation.sql"),
  "utf8"
);
const operationalApi = fs.readFileSync(
  path.join(root, "netlify", "functions", "production-control.mts"),
  "utf8"
);
const operationalAuth = fs.readFileSync(
  path.join(root, "netlify", "functions", "_operational-auth.mts"),
  "utf8"
);

test("production-control migration is explicitly transactional", () => {
  assert.match(migration, /^begin;/m);
  assert.match(migration, /^commit;/m);
});

test("sales demand and build components receive stable line identities", () => {
  assert.match(migration, /order_lines[\s\S]*line_key text/);
  assert.match(migration, /build_order_components[\s\S]*component_key text/);
  assert.match(migration, /build_requests_source_line_fk/);
});

test("all state-changing production RPCs recheck server-managed roles", () => {
  for (const functionName of [
    "mdb_create_build_request_v1",
    "mdb_transition_build_request_v1",
    "mdb_transition_build_order_v1",
    "mdb_update_build_draft_v1",
    "mdb_post_build_progress_v1",
  ]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${functionName}`));
  }
  assert.match(migration, /mdb_actor_has_role/);
  assert.doesNotMatch(migration, /security definer/i);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /alter default privileges[\s\S]*revoke execute on functions from public/i);
  assert.doesNotMatch(migration, /grant execute[\s\S]{0,180}to authenticated/);
});

test("inventory posting is idempotent and creates consumption and output entries", () => {
  assert.match(migration, /inventory_posting_batches/);
  assert.match(migration, /idempotentReplay/);
  assert.match(migration, /'Build Consumption'/);
  assert.match(migration, /'Build Output'/);
  assert.match(migration, /for update/);
});

test("operational API uses Netlify Identity and never trusts browser role metadata", () => {
  assert.match(operationalAuth, /from "@netlify\/identity"/);
  assert.match(operationalAuth, /operational_user_roles\(role\)/);
  assert.doesNotMatch(operationalAuth, /userMetadata|appMetadata|user\.roles/);
  assert.match(operationalApi, /mdb_post_build_progress_v1/);
});
