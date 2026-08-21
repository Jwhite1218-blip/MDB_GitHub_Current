"use strict";

const ROLES = Object.freeze({
  SALES: "sales",
  PRODUCTION_CONTROLLER: "production_controller",
  SHOP: "shop",
  INVENTORY_CONTROLLER: "inventory_controller",
  ADMIN: "admin",
});

const REQUEST_STATUSES = Object.freeze({
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  RETURNED: "Returned",
  ACCEPTED: "Accepted",
  FULFILLED: "Fulfilled",
  CANCELLED: "Cancelled",
});

const BUILD_STATUSES = Object.freeze({
  OPEN: "Open",
  RELEASED: "Released",
  FINISHED: "Finished",
  CANCELLED: "Cancelled",
});

const EXCEPTION_CODES = Object.freeze({
  NEEDS_INFORMATION: "needs_information",
  BLOCKED: "blocked",
  ON_HOLD: "on_hold",
  CUSTOMER_CHANGE: "customer_change",
  AT_RISK: "at_risk",
});

const controllerRoles = Object.freeze([ROLES.PRODUCTION_CONTROLLER, ROLES.ADMIN]);
const progressRoles = Object.freeze([
  ROLES.SHOP,
  ROLES.PRODUCTION_CONTROLLER,
  ROLES.INVENTORY_CONTROLLER,
  ROLES.ADMIN,
]);

const requestTransitions = Object.freeze({
  [REQUEST_STATUSES.DRAFT]: Object.freeze({
    submit: Object.freeze({ to: REQUEST_STATUSES.SUBMITTED, ownerOrRoles: controllerRoles }),
    cancel: Object.freeze({ to: REQUEST_STATUSES.CANCELLED, ownerOrRoles: controllerRoles }),
  }),
  [REQUEST_STATUSES.RETURNED]: Object.freeze({
    submit: Object.freeze({ to: REQUEST_STATUSES.SUBMITTED, ownerOrRoles: controllerRoles }),
    cancel: Object.freeze({ to: REQUEST_STATUSES.CANCELLED, ownerOrRoles: controllerRoles }),
  }),
  [REQUEST_STATUSES.SUBMITTED]: Object.freeze({
    accept: Object.freeze({ to: REQUEST_STATUSES.ACCEPTED, roles: controllerRoles }),
    return: Object.freeze({ to: REQUEST_STATUSES.RETURNED, roles: controllerRoles }),
    cancel: Object.freeze({ to: REQUEST_STATUSES.CANCELLED, ownerOrRoles: controllerRoles }),
  }),
  [REQUEST_STATUSES.ACCEPTED]: Object.freeze({
    request_change: Object.freeze({ to: REQUEST_STATUSES.ACCEPTED, ownerOrRoles: controllerRoles }),
    fulfill: Object.freeze({ to: REQUEST_STATUSES.FULFILLED, systemOnly: true }),
    cancel: Object.freeze({ to: REQUEST_STATUSES.CANCELLED, roles: controllerRoles }),
  }),
  [REQUEST_STATUSES.FULFILLED]: Object.freeze({}),
  [REQUEST_STATUSES.CANCELLED]: Object.freeze({}),
});

const buildActionRoles = Object.freeze({
  assign: controllerRoles,
  reschedule: controllerRoles,
  release: controllerRoles,
  reopen: controllerRoles,
  hold: controllerRoles,
  clear_exception: controllerRoles,
  cancel: controllerRoles,
  start: progressRoles,
  block: progressRoles,
  post_progress: progressRoles,
});

function normalizeRoles(roles) {
  return new Set(Array.isArray(roles) ? roles.filter((role) => Object.values(ROLES).includes(role)) : []);
}

function hasAnyRole(roles, allowedRoles) {
  const actual = normalizeRoles(roles);
  return allowedRoles.some((role) => actual.has(role));
}

function canTransitionRequest({ status, action, roles, isOriginator = false, system = false }) {
  const rule = requestTransitions[status]?.[String(action || "").toLowerCase()];
  if (!rule) return false;
  if (rule.systemOnly) return system;
  if (rule.ownerOrRoles) return isOriginator || hasAnyRole(roles, rule.ownerOrRoles);
  return hasAnyRole(roles, rule.roles || []);
}

function requestTransitionTarget(status, action) {
  return requestTransitions[status]?.[String(action || "").toLowerCase()]?.to || null;
}

function canPerformBuildAction({ action, roles, isAssignedShopUser = false }) {
  const normalizedAction = String(action || "").toLowerCase();
  const allowed = buildActionRoles[normalizedAction];
  if (!allowed || !hasAnyRole(roles, allowed)) return false;
  if (normalizedAction === "start" || normalizedAction === "post_progress" || normalizedAction === "block") {
    if (hasAnyRole(roles, controllerRoles) || hasAnyRole(roles, [ROLES.INVENTORY_CONTROLLER])) return true;
    return isAssignedShopUser;
  }
  return true;
}

function deriveBuildStage(build) {
  if (!build) return "Unknown";
  if (build.status === BUILD_STATUSES.CANCELLED) return "Cancelled";
  if (build.status === BUILD_STATUSES.FINISHED) return "Completed";
  if (build.status === BUILD_STATUSES.RELEASED) {
    if (Number(build.builtQty) > 0 || build.actualStartedAt) return "In Progress";
    return "Released";
  }
  return build.buildRequestId ? "Scheduled" : "Draft";
}

module.exports = {
  BUILD_STATUSES,
  EXCEPTION_CODES,
  REQUEST_STATUSES,
  ROLES,
  buildActionRoles,
  canPerformBuildAction,
  canTransitionRequest,
  deriveBuildStage,
  hasAnyRole,
  requestTransitionTarget,
  requestTransitions,
};
