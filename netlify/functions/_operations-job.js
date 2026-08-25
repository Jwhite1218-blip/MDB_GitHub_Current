"use strict";

const { ROLES, hasAnyRole } = require("./_production-control");

const JOB_TYPES = Object.freeze({
  COMPONENT_BUILD: "component_build",
  RIG_BUILD: "rig_build",
  SERVICE_JOB: "service_job",
});

const OPERATIONS_JOB_STATUSES = Object.freeze({
  PLANNING: "Planning",
  ORDER_SETUP_PENDING: "Order Setup Pending",
  SCHEDULED: "Scheduled",
  RELEASED: "Released",
  IN_PROGRESS: "In Progress",
  WORK_COMPLETE: "Work Complete",
  SIGNOFF_COMPLETE: "Signoff Complete",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
});

const SERVICE_REQUEST_STATUSES = Object.freeze({
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  NEEDS_INFORMATION: "Needs Information",
  RETURNED: "Returned",
  TRIAGED: "Triaged",
  ACCEPTED: "Accepted",
  CONVERTED: "Converted",
  RESOLVED: "Resolved",
  CANCELLED: "Cancelled",
});

const SERVICE_FINANCIAL_CLASSES = Object.freeze({
  UNKNOWN: "Unknown",
  WARRANTY: "Warranty",
  BILLABLE: "Billable",
});

const SERVICE_MODES = Object.freeze({
  UNKNOWN: "Unknown",
  IN_HOUSE: "In House",
  FIELD: "Field",
  OUTSIDE: "Outside",
});

const CHECKPOINT_STATUSES = Object.freeze({
  PENDING: "Pending",
  READY: "Ready",
  BLOCKED: "Blocked",
  COMPLETE: "Complete",
  WAIVED: "Waived",
});

const serviceControllerRoles = Object.freeze([
  ROLES.SERVICE_CONTROLLER,
  ROLES.PRODUCTION_CONTROLLER,
  ROLES.ADMIN,
]);
const serviceRequesterRoles = Object.freeze([
  ROLES.SALES,
  ROLES.SHOP,
  ROLES.SERVICE_TECHNICIAN,
  ...serviceControllerRoles,
]);
const serviceExecutionRoles = Object.freeze([
  ROLES.SERVICE_TECHNICIAN,
  ROLES.SHOP,
  ...serviceControllerRoles,
]);

const serviceRequestTransitions = Object.freeze({
  [SERVICE_REQUEST_STATUSES.DRAFT]: Object.freeze({
    submit: Object.freeze({ to: SERVICE_REQUEST_STATUSES.SUBMITTED, ownerOrRoles: serviceControllerRoles }),
    cancel: Object.freeze({ to: SERVICE_REQUEST_STATUSES.CANCELLED, ownerOrRoles: serviceControllerRoles }),
  }),
  [SERVICE_REQUEST_STATUSES.RETURNED]: Object.freeze({
    submit: Object.freeze({ to: SERVICE_REQUEST_STATUSES.SUBMITTED, ownerOrRoles: serviceControllerRoles }),
    cancel: Object.freeze({ to: SERVICE_REQUEST_STATUSES.CANCELLED, ownerOrRoles: serviceControllerRoles }),
  }),
  [SERVICE_REQUEST_STATUSES.NEEDS_INFORMATION]: Object.freeze({
    submit: Object.freeze({ to: SERVICE_REQUEST_STATUSES.SUBMITTED, ownerOrRoles: serviceControllerRoles }),
    cancel: Object.freeze({ to: SERVICE_REQUEST_STATUSES.CANCELLED, ownerOrRoles: serviceControllerRoles }),
  }),
  [SERVICE_REQUEST_STATUSES.SUBMITTED]: Object.freeze({
    triage: Object.freeze({ to: SERVICE_REQUEST_STATUSES.TRIAGED, roles: serviceControllerRoles }),
    needs_information: Object.freeze({ to: SERVICE_REQUEST_STATUSES.NEEDS_INFORMATION, roles: serviceControllerRoles }),
    return: Object.freeze({ to: SERVICE_REQUEST_STATUSES.RETURNED, roles: serviceControllerRoles }),
    cancel: Object.freeze({ to: SERVICE_REQUEST_STATUSES.CANCELLED, ownerOrRoles: serviceControllerRoles }),
  }),
  [SERVICE_REQUEST_STATUSES.TRIAGED]: Object.freeze({
    accept: Object.freeze({ to: SERVICE_REQUEST_STATUSES.ACCEPTED, roles: serviceControllerRoles }),
    needs_information: Object.freeze({ to: SERVICE_REQUEST_STATUSES.NEEDS_INFORMATION, roles: serviceControllerRoles }),
    return: Object.freeze({ to: SERVICE_REQUEST_STATUSES.RETURNED, roles: serviceControllerRoles }),
    cancel: Object.freeze({ to: SERVICE_REQUEST_STATUSES.CANCELLED, roles: serviceControllerRoles }),
  }),
  [SERVICE_REQUEST_STATUSES.ACCEPTED]: Object.freeze({
    convert: Object.freeze({ to: SERVICE_REQUEST_STATUSES.CONVERTED, roles: serviceControllerRoles }),
    cancel: Object.freeze({ to: SERVICE_REQUEST_STATUSES.CANCELLED, roles: serviceControllerRoles }),
  }),
  [SERVICE_REQUEST_STATUSES.CONVERTED]: Object.freeze({
    resolve: Object.freeze({ to: SERVICE_REQUEST_STATUSES.RESOLVED, systemOnly: true }),
  }),
  [SERVICE_REQUEST_STATUSES.RESOLVED]: Object.freeze({}),
  [SERVICE_REQUEST_STATUSES.CANCELLED]: Object.freeze({}),
});

const operationsJobTransitions = Object.freeze({
  [OPERATIONS_JOB_STATUSES.PLANNING]: Object.freeze({
    mark_order_pending: Object.freeze({ to: OPERATIONS_JOB_STATUSES.ORDER_SETUP_PENDING, roles: serviceControllerRoles }),
    schedule: Object.freeze({ to: OPERATIONS_JOB_STATUSES.SCHEDULED, roles: serviceControllerRoles }),
    cancel: Object.freeze({ to: OPERATIONS_JOB_STATUSES.CANCELLED, roles: serviceControllerRoles }),
  }),
  [OPERATIONS_JOB_STATUSES.ORDER_SETUP_PENDING]: Object.freeze({
    schedule: Object.freeze({ to: OPERATIONS_JOB_STATUSES.SCHEDULED, roles: serviceControllerRoles }),
    cancel: Object.freeze({ to: OPERATIONS_JOB_STATUSES.CANCELLED, roles: serviceControllerRoles }),
  }),
  [OPERATIONS_JOB_STATUSES.SCHEDULED]: Object.freeze({
    reschedule: Object.freeze({ to: OPERATIONS_JOB_STATUSES.SCHEDULED, roles: serviceControllerRoles }),
    release: Object.freeze({ to: OPERATIONS_JOB_STATUSES.RELEASED, roles: serviceControllerRoles }),
    hold: Object.freeze({ to: OPERATIONS_JOB_STATUSES.SCHEDULED, roles: serviceControllerRoles }),
    cancel: Object.freeze({ to: OPERATIONS_JOB_STATUSES.CANCELLED, roles: serviceControllerRoles }),
  }),
  [OPERATIONS_JOB_STATUSES.RELEASED]: Object.freeze({
    start: Object.freeze({ to: OPERATIONS_JOB_STATUSES.IN_PROGRESS, assignedOrRoles: serviceControllerRoles }),
    hold: Object.freeze({ to: OPERATIONS_JOB_STATUSES.RELEASED, roles: serviceControllerRoles }),
    reopen: Object.freeze({ to: OPERATIONS_JOB_STATUSES.PLANNING, roles: serviceControllerRoles }),
    cancel: Object.freeze({ to: OPERATIONS_JOB_STATUSES.CANCELLED, roles: serviceControllerRoles }),
  }),
  [OPERATIONS_JOB_STATUSES.IN_PROGRESS]: Object.freeze({
    block: Object.freeze({ to: OPERATIONS_JOB_STATUSES.IN_PROGRESS, assignedOrRoles: serviceControllerRoles }),
    hold: Object.freeze({ to: OPERATIONS_JOB_STATUSES.IN_PROGRESS, roles: serviceControllerRoles }),
    complete_work: Object.freeze({ to: OPERATIONS_JOB_STATUSES.WORK_COMPLETE, assignedOrRoles: serviceControllerRoles }),
  }),
  [OPERATIONS_JOB_STATUSES.WORK_COMPLETE]: Object.freeze({
    complete_signoff: Object.freeze({ to: OPERATIONS_JOB_STATUSES.SIGNOFF_COMPLETE, roles: serviceControllerRoles }),
    reopen: Object.freeze({ to: OPERATIONS_JOB_STATUSES.IN_PROGRESS, roles: serviceControllerRoles }),
  }),
  [OPERATIONS_JOB_STATUSES.SIGNOFF_COMPLETE]: Object.freeze({
    close: Object.freeze({ to: OPERATIONS_JOB_STATUSES.CLOSED, roles: serviceControllerRoles }),
    reopen: Object.freeze({ to: OPERATIONS_JOB_STATUSES.IN_PROGRESS, roles: serviceControllerRoles }),
  }),
  [OPERATIONS_JOB_STATUSES.CLOSED]: Object.freeze({}),
  [OPERATIONS_JOB_STATUSES.CANCELLED]: Object.freeze({}),
});

function transitionAllowed(rule, { roles, isOwner = false, isAssigned = false, system = false }) {
  if (!rule) return false;
  if (rule.systemOnly) return system;
  if (rule.ownerOrRoles) return isOwner || hasAnyRole(roles, rule.ownerOrRoles);
  if (rule.assignedOrRoles) {
    return (isAssigned && hasAnyRole(roles, serviceExecutionRoles)) || hasAnyRole(roles, rule.assignedOrRoles);
  }
  return hasAnyRole(roles, rule.roles || []);
}

function canCreateServiceRequest(roles) {
  return hasAnyRole(roles, serviceRequesterRoles);
}

function canTransitionServiceRequest({ status, action, roles, isOwner = false, system = false }) {
  const rule = serviceRequestTransitions[status]?.[String(action || "").toLowerCase()];
  return transitionAllowed(rule, { roles, isOwner, system });
}

function serviceRequestTransitionTarget(status, action) {
  return serviceRequestTransitions[status]?.[String(action || "").toLowerCase()]?.to || null;
}

function canPerformOperationsJobAction({ status, action, roles, isAssigned = false }) {
  const rule = operationsJobTransitions[status]?.[String(action || "").toLowerCase()];
  return transitionAllowed(rule, { roles, isAssigned });
}

function operationsJobTransitionTarget(status, action) {
  return operationsJobTransitions[status]?.[String(action || "").toLowerCase()]?.to || null;
}

function deriveRequesterStage(request, job) {
  if (!request) return "Unknown";
  if (request.status === SERVICE_REQUEST_STATUSES.CANCELLED) return "Cancelled";
  if (request.status === SERVICE_REQUEST_STATUSES.RESOLVED) return "Resolved";
  if (request.status === SERVICE_REQUEST_STATUSES.NEEDS_INFORMATION || request.status === SERVICE_REQUEST_STATUSES.RETURNED) {
    return "Needs Information";
  }
  if (request.status === SERVICE_REQUEST_STATUSES.DRAFT) return "Draft";
  if (request.status === SERVICE_REQUEST_STATUSES.SUBMITTED) return "Waiting for Triage";
  if (request.status === SERVICE_REQUEST_STATUSES.TRIAGED || request.status === SERVICE_REQUEST_STATUSES.ACCEPTED) {
    return "Under Review";
  }
  if (!job) return "Order Setup";
  return job.status || "Order Setup";
}

function validScheduleWindow(startAt, endAt) {
  const start = new Date(startAt);
  const end = new Date(endAt);
  return Number.isFinite(start.valueOf()) && Number.isFinite(end.valueOf()) && start < end;
}

module.exports = {
  CHECKPOINT_STATUSES,
  JOB_TYPES,
  OPERATIONS_JOB_STATUSES,
  SERVICE_FINANCIAL_CLASSES,
  SERVICE_MODES,
  SERVICE_REQUEST_STATUSES,
  canCreateServiceRequest,
  canPerformOperationsJobAction,
  canTransitionServiceRequest,
  deriveRequesterStage,
  operationsJobTransitionTarget,
  operationsJobTransitions,
  serviceControllerRoles,
  serviceExecutionRoles,
  serviceRequestTransitionTarget,
  serviceRequestTransitions,
  validScheduleWindow,
};
