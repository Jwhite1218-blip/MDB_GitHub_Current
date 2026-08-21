import {
  OperationalApiError,
  callOperationalRpc,
  jsonResponse,
  operationalDatabaseUrl,
  operationalErrorResponse,
  operationalHeaders,
  requireOperationalActor,
} from "./_operational-auth.mts";

function requiredText(value: unknown, label: string) {
  const text = String(value || "").trim();
  if (!text) throw new OperationalApiError(400, `${label} is required.`);
  return text;
}

function optionalDate(value: unknown) {
  const date = String(value || "").trim();
  if (!date) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new OperationalApiError(400, "Dates must use YYYY-MM-DD.");
  return date;
}

async function listRequests(actor: Awaited<ReturnType<typeof requireOperationalActor>>) {
  const response = await fetch(operationalDatabaseUrl(
    "build_requests?select=*,build_request_events(*),build_orders(*)&order=created_at.desc"
  ), { headers: operationalHeaders() });
  if (!response.ok) {
    throw new OperationalApiError(502, "Build Request queue could not be loaded.", await response.text());
  }
  const rows = await response.json();
  const seesAll = actor.roles.some((role) => ["production_controller", "inventory_controller", "admin"].includes(role));
  const visible = seesAll ? rows : rows.filter((row: {
    originator_user_id: string;
    build_orders?: Array<{ shop_assignee_user_id?: string }>;
  }) => row.originator_user_id === actor.id
    || (actor.roles.includes("shop") && row.build_orders?.some((build) => build.shop_assignee_user_id === actor.id)));
  return jsonResponse(200, { ok: true, actor, requests: visible });
}

async function handleOperation(request: Request, actor: Awaited<ReturnType<typeof requireOperationalActor>>) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { throw new OperationalApiError(400, "A JSON request body is required."); }
  const operation = requiredText(body.operation, "operation");

  if (operation === "create_request") {
    const quantity = Math.round(Number(body.requestedQuantity));
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 5000) {
      throw new OperationalApiError(400, "requestedQuantity must be an integer between 1 and 5000.");
    }
    const result = await callOperationalRpc("mdb_create_build_request_v1", {
      p_actor_user_id: actor.id,
      p_source_order_id: requiredText(body.sourceOrderId, "sourceOrderId"),
      p_source_order_line_key: requiredText(body.sourceOrderLineKey, "sourceOrderLineKey"),
      p_requested_quantity: quantity,
      p_requested_ship_date: optionalDate(body.requestedShipDate),
      p_customer_requirements: String(body.customerRequirements || ""),
      p_submit: Boolean(body.submit),
      p_request_id: body.requestId ? String(body.requestId) : null,
    });
    return jsonResponse(201, { ok: true, result });
  }

  if (operation === "transition_request") {
    const priority = body.priority == null ? null : Math.round(Number(body.priority));
    const result = await callOperationalRpc("mdb_transition_build_request_v1", {
      p_actor_user_id: actor.id,
      p_build_request_id: requiredText(body.buildRequestId, "buildRequestId"),
      p_action: requiredText(body.action, "action"),
      p_note: String(body.note || ""),
      p_committed_due_date: optionalDate(body.committedDueDate),
      p_priority: priority,
      p_shop_assignee_user_id: body.shopAssigneeUserId ? String(body.shopAssigneeUserId) : null,
    });
    return jsonResponse(200, { ok: true, result });
  }

  if (operation === "transition_build") {
    const priority = body.priority == null ? null : Math.round(Number(body.priority));
    const result = await callOperationalRpc("mdb_transition_build_order_v1", {
      p_actor_user_id: actor.id,
      p_build_order_id: requiredText(body.buildOrderId, "buildOrderId"),
      p_action: requiredText(body.action, "action"),
      p_note: String(body.note || ""),
      p_committed_due_date: optionalDate(body.committedDueDate),
      p_priority: priority,
      p_shop_assignee_user_id: body.shopAssigneeUserId ? String(body.shopAssigneeUserId) : null,
    });
    return jsonResponse(200, { ok: true, result });
  }

  if (operation === "update_build_draft") {
    const priority = body.priority == null ? null : Math.round(Number(body.priority));
    const components = Array.isArray(body.components) ? body.components : [];
    const result = await callOperationalRpc("mdb_update_build_draft_v1", {
      p_actor_user_id: actor.id,
      p_build_order_id: requiredText(body.buildOrderId, "buildOrderId"),
      p_components: components,
      p_notes: String(body.notes || ""),
      p_committed_due_date: optionalDate(body.committedDueDate),
      p_priority: priority,
      p_shop_assignee_user_id: body.shopAssigneeUserId ? String(body.shopAssigneeUserId) : null,
    });
    return jsonResponse(200, { ok: true, result });
  }

  if (operation === "post_build_progress") {
    const outputQuantity = Number(body.outputQuantity || 0);
    if (!Number.isFinite(outputQuantity) || outputQuantity < 0) {
      throw new OperationalApiError(400, "outputQuantity must be a non-negative number.");
    }
    const consumptions = Array.isArray(body.consumptions) ? body.consumptions : [];
    const result = await callOperationalRpc("mdb_post_build_progress_v1", {
      p_actor_user_id: actor.id,
      p_build_order_id: requiredText(body.buildOrderId, "buildOrderId"),
      p_batch_key: requiredText(body.idempotencyKey, "idempotencyKey"),
      p_consumptions: consumptions,
      p_output_quantity: outputQuantity,
    });
    return jsonResponse(200, { ok: true, result });
  }

  throw new OperationalApiError(400, `Unsupported operation: ${operation}`);
}

export default async (request: Request) => {
  try {
    const actor = await requireOperationalActor(request);
    if (request.method === "GET") return await listRequests(actor);
    if (request.method === "POST") return await handleOperation(request, actor);
    return jsonResponse(405, { ok: false, error: "Method not allowed." });
  } catch (error) {
    return operationalErrorResponse(error);
  }
};
