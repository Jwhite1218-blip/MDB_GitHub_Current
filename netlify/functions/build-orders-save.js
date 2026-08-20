// Upserts one build order (and replaces its components) in Supabase.
// Requires SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables.
// Without them, returns { configured: false, saved: false } and the frontend
// falls back to localStorage -- nothing breaks while this is being set up.
//
// build_number is only ever sent by the client once already known -- on
// first creation it's omitted so Postgres applies its own sequence-based
// default, and the resulting value is returned so the frontend can remember
// it for every future edit of that same build order.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const { internalAccess } = require("./_internal-access");

function badRequest(message) {
  return { statusCode: 400, body: JSON.stringify({ saved: false, error: message }) };
}

exports.handler = async (event) => {
  const access = internalAccess(event);
  if (!access.ok) return access.response;
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 200, body: JSON.stringify({ configured: false, saved: false }) };
  }

  let build;
  try {
    build = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }
  if (!build.id) {
    return { statusCode: 400, body: "Missing id" };
  }
  const allowedStatuses = new Set(["Open", "Released", "Finished"]);
  if (!allowedStatuses.has(build.status || "Open")) return badRequest("Invalid build status");
  const quantity = Math.round(Number(build.quantity));
  const builtQty = Math.round(Number(build.builtQty) || 0);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 5000) return badRequest("Invalid build quantity");
  if (!Number.isFinite(builtQty) || builtQty < 0 || builtQty > quantity) return badRequest("Invalid built quantity");

  const components = Array.isArray(build.components) ? build.components : [];
  for (const [index, line] of components.entries()) {
    const qtyRequired = Number(line.qtyRequired);
    const qtyConsumed = Number(line.qtyConsumed) || 0;
    if (!Number.isFinite(qtyRequired) || qtyRequired < 0) return badRequest(`Component ${index + 1} has an invalid required quantity`);
    if (!Number.isFinite(qtyConsumed) || qtyConsumed < 0 || qtyConsumed > qtyRequired) return badRequest(`Component ${index + 1} has an impossible consumption state`);
  }

  const allowedEventTypes = new Set(["Created", "Released", "Consumed", "Finished", "Reopened", "Edited"]);
  const events = Array.isArray(build.events) ? build.events.filter((entry) => entry?.key && entry?.summary) : [];
  if (events.some((entry) => !allowedEventTypes.has(entry.type || "Edited"))) return badRequest("Invalid build event type");

  const headers = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json",
  };

  const buildRow = {
    id: build.id,
    item_id: Number.isInteger(Number(build.itemId)) && Number(build.itemId) > 0 ? Number(build.itemId) : null,
    part: build.part || "",
    description: build.description || "",
    uom: build.uom || "EA",
    quantity,
    built_qty: builtQty,
    due_date: build.dueDate || null,
    location_code: build.locationCode || "MAIN",
    status: build.status || "Open",
    notes: build.notes || "",
    released_at: build.releasedAt || null,
    released_by_initials: build.releasedByInitials || "",
    released_by_name: build.releasedByName || "",
    finished_at: build.finishedAt || null,
    originator_initials: build.originatorInitials || "",
    originator_name: build.originatorName || "",
    last_modified_by_initials: build.lastModifiedByInitials || "",
    last_modified_by_name: build.lastModifiedByName || "",
    created_at: build.createdAt || new Date().toISOString(),
    last_modified_at: build.lastModifiedAt || new Date().toISOString(),
  };
  if (build.buildNumber) buildRow.build_number = build.buildNumber;

  try {
    const upsertResponse = await fetch(`${SUPABASE_URL}/rest/v1/build_orders?on_conflict=id`, {
      method: "POST",
      headers: { ...headers, Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(buildRow),
    });
    if (!upsertResponse.ok) {
      const detail = await upsertResponse.text();
      return { statusCode: 502, body: JSON.stringify({ saved: false, error: detail }) };
    }
    const [savedRow] = await upsertResponse.json();

    const deleteComponentsResponse = await fetch(`${SUPABASE_URL}/rest/v1/build_order_components?build_order_id=eq.${encodeURIComponent(build.id)}`, {
      method: "DELETE",
      headers: { ...headers, Prefer: "return=minimal" },
    });
    if (!deleteComponentsResponse.ok) {
      const detail = await deleteComponentsResponse.text();
      return { statusCode: 502, body: JSON.stringify({ saved: false, error: detail }) };
    }

    if (components.length) {
      const componentRows = components.map((line, index) => ({
        build_order_id: build.id,
        item_id: Number.isInteger(Number(line.itemId)) && Number(line.itemId) > 0 ? Number(line.itemId) : null,
        sort_order: index,
        part: line.part || "",
        description: line.description || "",
        uom: line.uom || "EA",
        qty_required: Number(line.qtyRequired) || 0,
        qty_consumed: Number(line.qtyConsumed) || 0,
      }));
      const componentsResponse = await fetch(`${SUPABASE_URL}/rest/v1/build_order_components`, {
        method: "POST",
        headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify(componentRows),
      });
      if (!componentsResponse.ok) {
        const detail = await componentsResponse.text();
        return { statusCode: 502, body: JSON.stringify({ saved: false, error: detail }) };
      }
    }

    if (events.length) {
      const eventRows = events.map((entry) => ({
        event_key: String(entry.key),
        build_order_id: build.id,
        event_type: entry.type || "Edited",
        summary: String(entry.summary),
        detail: entry.detail || "",
        actor_initials: entry.actorInitials || "",
        actor_name: entry.actorName || "",
        created_at: entry.createdAt || new Date().toISOString(),
      }));
      const eventsResponse = await fetch(`${SUPABASE_URL}/rest/v1/build_order_events?on_conflict=event_key`, {
        method: "POST",
        headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(eventRows),
      });
      if (!eventsResponse.ok) {
        const detail = await eventsResponse.text();
        return { statusCode: 502, body: JSON.stringify({ saved: false, error: detail }) };
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ saved: true, buildNumber: savedRow?.build_number ?? null }),
    };
  } catch (error) {
    return { statusCode: 502, body: JSON.stringify({ saved: false, error: String(error) }) };
  }
};
