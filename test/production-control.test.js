"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  BUILD_STATUSES,
  REQUEST_STATUSES,
  ROLES,
  canPerformBuildAction,
  canTransitionRequest,
  deriveBuildStage,
  requestTransitionTarget,
} = require("../netlify/functions/_production-control");

test("an originating sales rep can submit a draft but cannot accept it", () => {
  assert.equal(canTransitionRequest({
    status: REQUEST_STATUSES.DRAFT,
    action: "submit",
    roles: [ROLES.SALES],
    isOriginator: true,
  }), true);
  assert.equal(canTransitionRequest({
    status: REQUEST_STATUSES.SUBMITTED,
    action: "accept",
    roles: [ROLES.SALES],
    isOriginator: true,
  }), false);
});

test("production control can return or accept submitted demand", () => {
  for (const action of ["return", "accept"]) {
    assert.equal(canTransitionRequest({
      status: REQUEST_STATUSES.SUBMITTED,
      action,
      roles: [ROLES.PRODUCTION_CONTROLLER],
    }), true);
  }
  assert.equal(requestTransitionTarget(REQUEST_STATUSES.SUBMITTED, "accept"), REQUEST_STATUSES.ACCEPTED);
});

test("fulfilled requests are created only by the posting workflow", () => {
  assert.equal(canTransitionRequest({
    status: REQUEST_STATUSES.ACCEPTED,
    action: "fulfill",
    roles: [ROLES.ADMIN],
  }), false);
  assert.equal(canTransitionRequest({
    status: REQUEST_STATUSES.ACCEPTED,
    action: "fulfill",
    roles: [],
    system: true,
  }), true);
});

test("the originating rep can request a change without rewriting production", () => {
  assert.equal(canTransitionRequest({
    status: REQUEST_STATUSES.ACCEPTED,
    action: "request_change",
    roles: [ROLES.SALES],
    isOriginator: true,
  }), true);
  assert.equal(requestTransitionTarget(REQUEST_STATUSES.ACCEPTED, "request_change"), REQUEST_STATUSES.ACCEPTED);
});

test("only production control or admin can release and reprioritize builds", () => {
  for (const action of ["release", "assign", "reschedule", "hold", "reopen"]) {
    assert.equal(canPerformBuildAction({ action, roles: [ROLES.SALES] }), false);
    assert.equal(canPerformBuildAction({ action, roles: [ROLES.PRODUCTION_CONTROLLER] }), true);
  }
});

test("shop progress is restricted to the assigned worker", () => {
  assert.equal(canPerformBuildAction({
    action: "post_progress",
    roles: [ROLES.SHOP],
    isAssignedShopUser: false,
  }), false);
  assert.equal(canPerformBuildAction({
    action: "post_progress",
    roles: [ROLES.SHOP],
    isAssignedShopUser: true,
  }), true);
  assert.equal(canPerformBuildAction({
    action: "post_progress",
    roles: [ROLES.INVENTORY_CONTROLLER],
  }), true);
});

test("rep-facing stage is derived from controlled facts", () => {
  assert.equal(deriveBuildStage({ status: BUILD_STATUSES.OPEN, buildRequestId: "brq-1" }), "Scheduled");
  assert.equal(deriveBuildStage({ status: BUILD_STATUSES.RELEASED, builtQty: 0 }), "Released");
  assert.equal(deriveBuildStage({ status: BUILD_STATUSES.RELEASED, builtQty: 2 }), "In Progress");
  assert.equal(deriveBuildStage({ status: BUILD_STATUSES.FINISHED }), "Completed");
});
