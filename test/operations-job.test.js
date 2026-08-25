"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { ROLES } = require("../netlify/functions/_production-control");
const {
  OPERATIONS_JOB_STATUSES,
  SERVICE_REQUEST_STATUSES,
  canCreateServiceRequest,
  canPerformOperationsJobAction,
  canTransitionServiceRequest,
  deriveRequesterStage,
  operationsJobTransitionTarget,
  serviceRequestTransitionTarget,
  validScheduleWindow,
} = require("../netlify/functions/_operations-job");

test("authorized employees can submit service demand without accepting their own request", () => {
  assert.equal(canCreateServiceRequest([ROLES.SALES]), true);
  assert.equal(canCreateServiceRequest([ROLES.SERVICE_TECHNICIAN]), true);
  assert.equal(canTransitionServiceRequest({
    status: SERVICE_REQUEST_STATUSES.DRAFT,
    action: "submit",
    roles: [ROLES.SALES],
    isOwner: true,
  }), true);
  assert.equal(canTransitionServiceRequest({
    status: SERVICE_REQUEST_STATUSES.TRIAGED,
    action: "accept",
    roles: [ROLES.SALES],
    isOwner: true,
  }), false);
});

test("service and production controllers own triage, acceptance, and conversion", () => {
  for (const role of [ROLES.SERVICE_CONTROLLER, ROLES.PRODUCTION_CONTROLLER, ROLES.ADMIN]) {
    assert.equal(canTransitionServiceRequest({
      status: SERVICE_REQUEST_STATUSES.SUBMITTED,
      action: "triage",
      roles: [role],
    }), true);
    assert.equal(canTransitionServiceRequest({
      status: SERVICE_REQUEST_STATUSES.TRIAGED,
      action: "accept",
      roles: [role],
    }), true);
    assert.equal(canTransitionServiceRequest({
      status: SERVICE_REQUEST_STATUSES.ACCEPTED,
      action: "convert",
      roles: [role],
    }), true);
  }
  assert.equal(
    serviceRequestTransitionTarget(SERVICE_REQUEST_STATUSES.ACCEPTED, "convert"),
    SERVICE_REQUEST_STATUSES.CONVERTED,
  );
});

test("request resolution remains a system consequence of job closeout", () => {
  assert.equal(canTransitionServiceRequest({
    status: SERVICE_REQUEST_STATUSES.CONVERTED,
    action: "resolve",
    roles: [ROLES.ADMIN],
  }), false);
  assert.equal(canTransitionServiceRequest({
    status: SERVICE_REQUEST_STATUSES.CONVERTED,
    action: "resolve",
    roles: [],
    system: true,
  }), true);
});

test("assigned service technicians execute work but cannot schedule or close it", () => {
  assert.equal(canPerformOperationsJobAction({
    status: OPERATIONS_JOB_STATUSES.RELEASED,
    action: "start",
    roles: [ROLES.SERVICE_TECHNICIAN],
    isAssigned: true,
  }), true);
  assert.equal(canPerformOperationsJobAction({
    status: OPERATIONS_JOB_STATUSES.PLANNING,
    action: "schedule",
    roles: [ROLES.SERVICE_TECHNICIAN],
    isAssigned: true,
  }), false);
  assert.equal(canPerformOperationsJobAction({
    status: OPERATIONS_JOB_STATUSES.SIGNOFF_COMPLETE,
    action: "close",
    roles: [ROLES.SERVICE_TECHNICIAN],
    isAssigned: true,
  }), false);
});

test("operations lifecycle keeps work completion, signoff, and close separate", () => {
  assert.equal(
    operationsJobTransitionTarget(OPERATIONS_JOB_STATUSES.IN_PROGRESS, "complete_work"),
    OPERATIONS_JOB_STATUSES.WORK_COMPLETE,
  );
  assert.equal(
    operationsJobTransitionTarget(OPERATIONS_JOB_STATUSES.WORK_COMPLETE, "complete_signoff"),
    OPERATIONS_JOB_STATUSES.SIGNOFF_COMPLETE,
  );
  assert.equal(
    operationsJobTransitionTarget(OPERATIONS_JOB_STATUSES.SIGNOFF_COMPLETE, "close"),
    OPERATIONS_JOB_STATUSES.CLOSED,
  );
});

test("requester stage is derived from controlled request and job facts", () => {
  assert.equal(deriveRequesterStage({ status: SERVICE_REQUEST_STATUSES.SUBMITTED }), "Waiting for Triage");
  assert.equal(deriveRequesterStage({ status: SERVICE_REQUEST_STATUSES.CONVERTED }, {
    status: OPERATIONS_JOB_STATUSES.SCHEDULED,
  }), "Scheduled");
  assert.equal(deriveRequesterStage({ status: SERVICE_REQUEST_STATUSES.RETURNED }), "Needs Information");
});

test("schedule windows must be finite and end after they start", () => {
  assert.equal(validScheduleWindow("2026-09-01T08:00:00Z", "2026-09-01T16:00:00Z"), true);
  assert.equal(validScheduleWindow("2026-09-01T16:00:00Z", "2026-09-01T08:00:00Z"), false);
  assert.equal(validScheduleWindow("not-a-date", "2026-09-01T08:00:00Z"), false);
});
