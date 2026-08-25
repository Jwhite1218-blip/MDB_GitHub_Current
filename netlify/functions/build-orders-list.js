// Fetches every build order (with components and activity events) from
// Supabase for the Build Orders workspace's team-wide list. Requires
// SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables. Without them,
// returns { configured: false } and the frontend falls back to localStorage
// -- nothing breaks while this is being set up.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const { internalAccess } = require("./_internal-access");

function toCamelBuild(row) {
  return {
    id: row.id,
    buildNumber: row.build_number,
    itemId: row.item_id,
    part: row.part,
    description: row.description,
    uom: row.uom,
    quantity: row.quantity,
    builtQty: row.built_qty,
    dueDate: row.due_date,
    locationCode: row.location_code || "MAIN",
    status: row.status,
    notes: row.notes,
    releasedAt: row.released_at,
    releasedByInitials: row.released_by_initials,
    releasedByName: row.released_by_name,
    finishedAt: row.finished_at,
    originatorInitials: row.originator_initials,
    originatorName: row.originator_name,
    lastModifiedByInitials: row.last_modified_by_initials,
    lastModifiedByName: row.last_modified_by_name,
    buildRequestId: row.build_request_id,
    operationsJobId: row.operations_job_id,
    workType: row.work_type || "component_build",
    controllerUserId: row.controller_user_id,
    shopAssigneeUserId: row.shop_assignee_user_id,
    priority: row.priority,
    requestedDueDate: row.requested_due_date,
    committedDueDate: row.committed_due_date,
    actualStartedAt: row.actual_started_at,
    postedAt: row.posted_at,
    exceptionCode: row.exception_code,
    exceptionDetail: row.exception_detail,
    revision: row.revision,
    createdAt: row.created_at,
    lastModifiedAt: row.last_modified_at,
    components: (row.build_order_components || [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((line) => ({
        componentKey: line.component_key,
        itemId: line.item_id,
        part: line.part,
        description: line.description,
        uom: line.uom,
        qtyRequired: Number(line.qty_required),
        qtyReserved: Number(line.qty_reserved || 0),
        qtyConsumed: Number(line.qty_consumed),
      })),
    events: (row.build_order_events || [])
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map((entry) => ({
        key: entry.event_key,
        type: entry.event_type,
        summary: entry.summary,
        detail: entry.detail,
        actorInitials: entry.actor_initials,
        actorName: entry.actor_name,
        createdAt: entry.created_at,
      })),
  };
}

exports.handler = async (event) => {
  const access = internalAccess(event);
  if (!access.ok) return access.response;
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 200, body: JSON.stringify({ configured: false, builds: [] }) };
  }

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/build_orders?select=*,build_order_components(*),build_order_events(*)&order=created_at.desc`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    if (!response.ok) {
      const detail = await response.text();
      return { statusCode: 502, body: JSON.stringify({ configured: true, error: detail }) };
    }
    const rows = await response.json();
    return { statusCode: 200, body: JSON.stringify({ configured: true, builds: rows.map(toCamelBuild) }) };
  } catch (error) {
    return { statusCode: 502, body: JSON.stringify({ configured: true, error: String(error) }) };
  }
};
