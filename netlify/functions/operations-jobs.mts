import {
  OperationalApiError,
  callOperationalRpc,
  jsonResponse,
  operationalDatabaseUrl,
  operationalErrorResponse,
  operationalHeaders,
  requireOperationalActor,
} from "./_operational-auth.mts";

type OperationalActor = Awaited<ReturnType<typeof requireOperationalActor>>;
type Row = Record<string, unknown>;

const SERVICE_CONTROLLER_ROLES = ["service_controller", "production_controller", "admin"];
const SERVICE_ESTIMATOR_ROLES = ["service_estimator", "admin"];
const OPERATIONS_CONTROLLER_ROLES = [
  "service_controller", "production_controller", "inventory_controller", "admin",
];

function requiredText(value: unknown, label: string, maxLength = 4000) {
  const text = String(value || "").trim();
  if (!text) throw new OperationalApiError(400, `${label} is required.`);
  if (text.length > maxLength) throw new OperationalApiError(400, `${label} is too long.`);
  return text;
}

function optionalText(value: unknown, maxLength = 4000) {
  const text = String(value || "").trim();
  if (text.length > maxLength) throw new OperationalApiError(400, "A text value is too long.");
  return text || null;
}

function optionalNumber(value: unknown, label: string, minimum = 0) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum) {
    throw new OperationalApiError(400, `${label} must be a number of at least ${minimum}.`);
  }
  return number;
}

function optionalInteger(value: unknown, label: string, minimum: number, maximum: number) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new OperationalApiError(400, `${label} must be an integer from ${minimum} through ${maximum}.`);
  }
  return number;
}

function requiredTimestamp(value: unknown, label: string) {
  const text = requiredText(value, label, 80);
  const timestamp = new Date(text);
  if (Number.isNaN(timestamp.valueOf())) {
    throw new OperationalApiError(400, `${label} must be a valid date and time.`);
  }
  return timestamp.toISOString();
}

function allowedValue(value: unknown, label: string, allowed: string[], fallback?: string) {
  const candidate = String(value || fallback || "").trim();
  if (!allowed.includes(candidate)) {
    throw new OperationalApiError(400, `${label} must be one of: ${allowed.join(", ")}.`);
  }
  return candidate;
}

async function readRows(path: string, label: string): Promise<Row[]> {
  const response = await fetch(operationalDatabaseUrl(path), { headers: operationalHeaders() });
  if (!response.ok) {
    throw new OperationalApiError(502, `${label} could not be loaded.`, await response.text());
  }
  return response.json();
}

function hasAnyRole(actor: OperationalActor, roles: string[]) {
  return actor.roles.some((role) => roles.includes(role));
}

async function listOperations(actor: OperationalActor) {
  const [serviceRequests, requestEvents, serviceWorkOrders, jobs, assignments,
    jobEvents, checkpoints, checkpointDefinitions, tasks, signoffs, scopeItems, workCenters, buildOrders, operationalUsers,
    serviceEstimates, serviceEstimateLines, serviceEstimateEvents, servicePricingRules, serviceActualCosts] = await Promise.all([
    readRows("service_requests?select=*&order=created_at.desc&limit=500", "Service Request queue"),
    readRows("service_request_events?select=*&order=created_at.desc&limit=2000", "Service Request history"),
    readRows("service_work_orders?select=*&order=created_at.desc&limit=500", "Service Work Orders"),
    readRows("operations_jobs?select=*&order=priority,committed_due_at.nullslast,created_at&limit=1000", "Operations Jobs"),
    readRows("operations_job_assignments?select=*&order=created_at.desc&limit=2000", "Operations schedules"),
    readRows("operations_job_events?select=*&order=created_at.desc&limit=4000", "Operations history"),
    readRows("operations_job_checkpoints?select=*&order=job_id,checkpoint_key&limit=4000", "Operations checkpoints"),
    readRows("operations_checkpoint_definitions?select=*&is_active=eq.true&order=applies_to_job_type,sequence", "Checkpoint definitions"),
    readRows("workflow_tasks?select=*&order=created_at.desc&limit=2000", "Workflow tasks"),
    readRows("service_signoffs?select=*&order=signed_at.desc&limit=1000", "Service signoffs"),
    readRows("service_scope_items?select=*&order=service_work_order_id,scope_version,sequence&limit=5000", "Service scope"),
    readRows("work_centers?select=*&is_active=eq.true&order=center_type,code", "Work centers"),
    readRows("build_orders?select=*&operations_job_id=not.is.null&order=created_at.desc&limit=1000", "Build Orders"),
    readRows("operational_users?select=id,display_name,initials,operational_user_roles(role)&is_active=eq.true&order=display_name", "Operational employees"),
    readRows("service_estimates?select=*&order=updated_at.desc&limit=1000", "Service Estimates"),
    readRows("service_estimate_lines?select=*&order=service_estimate_id,sequence&limit=10000", "Service Estimate lines"),
    readRows("service_estimate_events?select=*&order=created_at.desc&limit=4000", "Service Estimate history"),
    readRows("service_pricing_rules?select=*&is_active=eq.true&order=profile_version.desc,service_family,line_type,rule_code&limit=2000", "Service pricing rules"),
    readRows("service_actual_cost_entries?select=*&order=occurred_on.desc,id.desc&limit=10000", "Service actual costs"),
  ]);

  const seesPricing = hasAnyRole(actor, [...SERVICE_CONTROLLER_ROLES, ...SERVICE_ESTIMATOR_ROLES]);
  const seesAllRequests = seesPricing;
  const seesAllJobs = hasAnyRole(actor, OPERATIONS_CONTROLLER_ROLES);
  const assignedJobIds = new Set(jobs
    .filter((job) => job.assignee_user_id === actor.id || job.created_by_user_id === actor.id)
    .map((job) => String(job.id)));
  const ownedRequestIds = new Set(serviceRequests
    .filter((request) => request.requester_user_id === actor.id)
    .map((request) => String(request.id)));
  const linkedWorkOrders = serviceWorkOrders.filter((workOrder) =>
    ownedRequestIds.has(String(workOrder.service_request_id))
    || assignedJobIds.has(String(workOrder.operations_job_id)));
  linkedWorkOrders.forEach((workOrder) => {
    assignedJobIds.add(String(workOrder.operations_job_id));
    ownedRequestIds.add(String(workOrder.service_request_id));
  });

  const visibleJobs = seesAllJobs ? jobs : jobs.filter((job) => assignedJobIds.has(String(job.id)));
  const visibleJobIds = new Set(visibleJobs.map((job) => String(job.id)));
  const visibleRequests = seesAllRequests
    ? serviceRequests
    : serviceRequests.filter((request) => ownedRequestIds.has(String(request.id)));
  const visibleRequestIds = new Set(visibleRequests.map((request) => String(request.id)));
  const visibleWorkOrders = serviceWorkOrders.filter((workOrder) =>
    visibleRequestIds.has(String(workOrder.service_request_id))
    && visibleJobIds.has(String(workOrder.operations_job_id)));
  const visibleWorkOrderIds = new Set(visibleWorkOrders.map((workOrder) => String(workOrder.id)));
  const visibleEstimates = serviceEstimates.filter((estimate) =>
    visibleRequestIds.has(String(estimate.service_request_id)));
  const visibleEstimateIds = new Set(visibleEstimates.map((estimate) => String(estimate.id)));

  return jsonResponse(200, {
    ok: true,
    actor,
    serviceRequests: visibleRequests,
    serviceRequestEvents: requestEvents.filter((event) => visibleRequestIds.has(String(event.service_request_id))),
    serviceWorkOrders: visibleWorkOrders,
    operationsJobs: visibleJobs,
    operationsJobAssignments: assignments.filter((assignment) => visibleJobIds.has(String(assignment.job_id))),
    operationsJobEvents: jobEvents.filter((event) => visibleJobIds.has(String(event.job_id))),
    operationsJobCheckpoints: checkpoints.filter((checkpoint) => visibleJobIds.has(String(checkpoint.job_id))),
    operationsCheckpointDefinitions: checkpointDefinitions,
    workflowTasks: tasks.filter((task) =>
      visibleJobIds.has(String(task.job_id))
      || visibleRequestIds.has(String(task.service_request_id))
      || visibleWorkOrderIds.has(String(task.service_work_order_id))),
    serviceSignoffs: signoffs.filter((signoff) => visibleWorkOrderIds.has(String(signoff.service_work_order_id))),
    serviceScopeItems: scopeItems.filter((item) => visibleWorkOrderIds.has(String(item.service_work_order_id))),
    serviceEstimates: visibleEstimates,
    serviceEstimateLines: serviceEstimateLines.filter((line) => visibleEstimateIds.has(String(line.service_estimate_id))),
    serviceEstimateEvents: serviceEstimateEvents.filter((event) => visibleEstimateIds.has(String(event.service_estimate_id))),
    servicePricingRules: seesPricing ? servicePricingRules : [],
    serviceActualCosts: serviceActualCosts.filter((entry) => visibleWorkOrderIds.has(String(entry.service_work_order_id))),
    workCenters,
    buildOrders: buildOrders.filter((build) => visibleJobIds.has(String(build.operations_job_id))),
    operationalUsers: (seesAllRequests || seesAllJobs || seesPricing)
      ? operationalUsers
      : operationalUsers.filter((user) => user.id === actor.id),
  });
}

async function handleOperation(request: Request, actor: OperationalActor) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    throw new OperationalApiError(400, "A JSON request body is required.");
  }
  const operation = requiredText(body.operation, "operation", 80);

  if (operation === "create_service_request") {
    const result = await callOperationalRpc("mdb_create_service_request_v1", {
      p_actor_user_id: actor.id,
      p_source_channel: allowedValue(body.sourceChannel, "sourceChannel", ["Desktop", "Mobile", "NFC", "Email", "Import"], "Desktop"),
      p_urgency: allowedValue(body.urgency, "urgency", ["Routine", "Priority", "Urgent", "Machine Down", "Safety"], "Routine"),
      p_customer_name: optionalText(body.customerName, 300) || "",
      p_service_location: optionalText(body.serviceLocation, 500) || "",
      p_customer_contact: optionalText(body.customerContact, 500) || "",
      p_asset_id: optionalText(body.assetId, 160),
      p_production_serial: optionalText(body.productionSerial, 160),
      p_rig_model: optionalText(body.rigModel, 300) || "",
      p_drill_hours: optionalNumber(body.drillHours, "drillHours"),
      p_complaint: optionalText(body.complaint, 8000) || "",
      p_requested_work: optionalText(body.requestedWork, 8000) || "",
      p_financial_class: allowedValue(body.financialClass, "financialClass", ["Unknown", "Warranty", "Billable"], "Unknown"),
      p_service_mode: allowedValue(body.serviceMode, "serviceMode", ["Unknown", "In House", "Field", "Outside"], "Unknown"),
      p_submit: Boolean(body.submit),
      p_request_id: optionalText(body.requestId, 200),
    });
    return jsonResponse(201, { ok: true, result });
  }

  if (operation === "transition_service_request") {
    const result = await callOperationalRpc("mdb_transition_service_request_v1", {
      p_actor_user_id: actor.id,
      p_service_request_id: requiredText(body.serviceRequestId, "serviceRequestId", 200),
      p_action: requiredText(body.action, "action", 80),
      p_note: optionalText(body.note, 8000) || "",
      p_financial_class: body.financialClass == null ? null : allowedValue(body.financialClass, "financialClass", ["Unknown", "Warranty", "Billable"]),
      p_service_mode: body.serviceMode == null ? null : allowedValue(body.serviceMode, "serviceMode", ["Unknown", "In House", "Field", "Outside"]),
      p_priority: optionalInteger(body.priority, "priority", 1, 5),
      p_controller_user_id: optionalText(body.controllerUserId, 80),
      p_assignee_user_id: optionalText(body.assigneeUserId, 80),
    });
    return jsonResponse(200, { ok: true, result });
  }

  if (operation === "save_service_estimate") {
    const lines = body.lines;
    if (!Array.isArray(lines) || lines.length < 1 || lines.length > 100) {
      throw new OperationalApiError(400, "lines must contain between 1 and 100 estimate lines.");
    }
    const result = await callOperationalRpc("mdb_save_service_estimate_v1", {
      p_actor_user_id: actor.id,
      p_service_request_id: requiredText(body.serviceRequestId, "serviceRequestId", 200),
      p_estimate_id: optionalText(body.estimateId, 200),
      p_diagnostic_family: requiredText(body.diagnosticFamily, "diagnosticFamily", 300),
      p_customer_scope: requiredText(body.customerScope, "customerScope", 8000),
      p_assumptions: optionalText(body.assumptions, 8000) || "",
      p_exclusions: optionalText(body.exclusions, 8000) || "",
      p_internal_note: optionalText(body.internalNote, 8000) || "",
      p_pricing_profile_version: optionalInteger(body.pricingProfileVersion, "pricingProfileVersion", 1, 100000),
      p_recommendation_basis: optionalText(body.recommendationBasis, 8000) || "",
      p_recommendation_confidence: allowedValue(body.recommendationConfidence, "recommendationConfidence", ["Low", "Medium", "High"], "Low"),
      p_lines: lines,
    });
    return jsonResponse(200, { ok: true, result });
  }

  if (operation === "transition_service_estimate") {
    const result = await callOperationalRpc("mdb_transition_service_estimate_v1", {
      p_actor_user_id: actor.id,
      p_service_estimate_id: requiredText(body.serviceEstimateId, "serviceEstimateId", 200),
      p_action: allowedValue(body.action, "action", ["submit", "return", "approve"]),
      p_note: optionalText(body.note, 8000) || "",
    });
    return jsonResponse(200, { ok: true, result });
  }

  if (operation === "record_service_actual_cost") {
    const result = await callOperationalRpc("mdb_record_service_actual_cost_v1", {
      p_actor_user_id: actor.id,
      p_service_work_order_id: requiredText(body.serviceWorkOrderId, "serviceWorkOrderId", 200),
      p_line_type: allowedValue(body.lineType, "lineType", ["Labor", "Part", "Travel", "Outside", "Shop Supply", "Contingency"]),
      p_description: requiredText(body.description, "description", 2000),
      p_quantity: optionalNumber(body.quantity, "quantity", 0.0001) || 1,
      p_uom: optionalText(body.uom, 40) || "EA",
      p_unit_cost: optionalNumber(body.unitCost, "unitCost", 0) || 0,
      p_source_type: allowedValue(body.sourceType, "sourceType", ["GP", "Time Entry", "Inventory", "Outside Invoice", "Manual"], "Manual"),
      p_source_reference: optionalText(body.sourceReference, 1000) || "",
      p_occurred_on: optionalText(body.occurredOn, 20),
      p_service_estimate_line_id: optionalText(body.serviceEstimateLineId, 200),
    });
    return jsonResponse(201, { ok: true, result });
  }

  if (operation === "schedule_job") {
    const startsAt = requiredTimestamp(body.startsAt, "startsAt");
    const endsAt = requiredTimestamp(body.endsAt, "endsAt");
    if (startsAt >= endsAt) throw new OperationalApiError(400, "endsAt must be after startsAt.");
    const result = await callOperationalRpc("mdb_schedule_operations_job_v1", {
      p_actor_user_id: actor.id,
      p_operations_job_id: requiredText(body.operationsJobId, "operationsJobId", 200),
      p_work_center_id: requiredText(body.workCenterId, "workCenterId", 200),
      p_slot_number: optionalInteger(body.slotNumber, "slotNumber", 1, 50) || 1,
      p_starts_at: startsAt,
      p_ends_at: endsAt,
      p_reason: requiredText(body.reason, "reason", 2000),
      p_priority: optionalInteger(body.priority, "priority", 1, 5),
      p_assignee_user_id: optionalText(body.assigneeUserId, 80),
    });
    return jsonResponse(200, { ok: true, result });
  }

  if (operation === "replace_service_scope") {
    const scopeItems = body.scopeItems;
    if (!Array.isArray(scopeItems) || scopeItems.length < 1 || scopeItems.length > 250) {
      throw new OperationalApiError(400, "scopeItems must contain between 1 and 250 items.");
    }
    const result = await callOperationalRpc("mdb_replace_service_scope_v1", {
      p_actor_user_id: actor.id,
      p_service_work_order_id: requiredText(body.serviceWorkOrderId, "serviceWorkOrderId", 200),
      p_scope_items: scopeItems,
      p_scope_summary: optionalText(body.scopeSummary, 8000) || "",
    });
    return jsonResponse(200, { ok: true, result });
  }

  if (operation === "update_checkpoint") {
    const result = await callOperationalRpc("mdb_update_operations_checkpoint_v1", {
      p_actor_user_id: actor.id,
      p_operations_job_id: requiredText(body.operationsJobId, "operationsJobId", 200),
      p_checkpoint_key: requiredText(body.checkpointKey, "checkpointKey", 200),
      p_checkpoint_version: optionalInteger(body.checkpointVersion, "checkpointVersion", 1, 1000) || 1,
      p_status: allowedValue(body.status, "status", ["Pending", "Ready", "Blocked", "Complete", "Waived"]),
      p_evidence_note: optionalText(body.evidenceNote, 8000) || "",
      p_blocker_detail: optionalText(body.blockerDetail, 8000) || "",
    });
    return jsonResponse(200, { ok: true, result });
  }

  if (operation === "record_signoff") {
    const result = await callOperationalRpc("mdb_record_service_signoff_v1", {
      p_actor_user_id: actor.id,
      p_service_work_order_id: requiredText(body.serviceWorkOrderId, "serviceWorkOrderId", 200),
      p_signoff_key: requiredText(body.signoffKey, "signoffKey", 200),
      p_party_type: allowedValue(body.partyType, "partyType", ["Internal", "Customer"]),
      p_representative_name: requiredText(body.representativeName, "representativeName", 500),
      p_decision: allowedValue(body.decision, "decision", ["Accepted", "Accepted With Exceptions", "Declined"]),
      p_notes: optionalText(body.notes, 8000) || "",
    });
    return jsonResponse(200, { ok: true, result });
  }

  if (operation === "transition_service_job") {
    const result = await callOperationalRpc("mdb_transition_service_job_v1", {
      p_actor_user_id: actor.id,
      p_operations_job_id: requiredText(body.operationsJobId, "operationsJobId", 200),
      p_action: requiredText(body.action, "action", 80),
      p_note: optionalText(body.note, 8000) || "",
    });
    return jsonResponse(200, { ok: true, result });
  }

  throw new OperationalApiError(400, `Unsupported operation: ${operation}`);
}

export default async (request: Request) => {
  try {
    const actor = await requireOperationalActor(request);
    if (request.method === "GET") return await listOperations(actor);
    if (request.method === "POST") return await handleOperation(request, actor);
    return jsonResponse(405, { ok: false, error: "Method not allowed." });
  } catch (error) {
    return operationalErrorResponse(error);
  }
};

export const config = { path: "/api/operations/jobs" };
