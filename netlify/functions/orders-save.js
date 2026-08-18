// Upserts one order (and replaces its lines) in Supabase. Requires
// SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables. Without them,
// returns { configured: false, saved: false } and the frontend falls back to
// localStorage -- nothing breaks while this is being set up.
//
// order_number and master_no are only ever sent by the client once already
// known -- on first creation both are omitted so Postgres applies its own
// sequence-based defaults, and the resulting values are returned so the
// frontend can remember them for every future edit of that same order.

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

  let order;
  try {
    order = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }
  if (!order.id) {
    return { statusCode: 400, body: "Missing id" };
  }
  const allowedStatuses = new Set(["Open", "Released", "Closed"]);
  if (!allowedStatuses.has(order.status || "Open")) return badRequest("Invalid order status");
  for (const field of ["misc", "freight", "tradeDiscount", "weightLbs", "lengthIn", "widthIn", "heightIn"]) {
    const value = Number(order[field] || 0);
    if (!Number.isFinite(value) || value < 0) return badRequest(`${field} must be a non-negative number`);
  }

  const lines = Array.isArray(order.lines) ? order.lines : [];
  for (const [index, line] of lines.entries()) {
    const quantity = Math.round(Number(line.quantity));
    const reserved = Math.round(Number(line.reservedQty) || 0);
    const toShip = Math.round(Number(line.qtyToShip) || 0);
    const shipped = Math.round(Number(line.shippedQty) || 0);
    const toInvoice = Math.round(Number(line.qtyToInvoice) || 0);
    const invoiced = Math.round(Number(line.invoicedQty) || 0);
    const backorder = Math.round(Number(line.backorderQty) || 0);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 5000) return badRequest(`Line ${index + 1} has an invalid ordered quantity`);
    if ([reserved, toShip, shipped, toInvoice, invoiced, backorder].some((value) => !Number.isFinite(value) || value < 0)) return badRequest(`Line ${index + 1} has an invalid execution quantity`);
    if (shipped > quantity || reserved + shipped > quantity || toShip > reserved || invoiced > shipped || toInvoice + invoiced > shipped || backorder > quantity - shipped) return badRequest(`Line ${index + 1} has an impossible fulfillment state`);
  }

  const allowedEventTypes = new Set(["Created", "Released", "Reopened", "Reserved", "Shipment", "Invoice", "Closed", "Edited"]);
  const events = Array.isArray(order.events) ? order.events.filter((entry) => entry?.key && entry?.summary) : [];
  if (events.some((entry) => !allowedEventTypes.has(entry.type || "Edited"))) return badRequest("Invalid order event type");

  const headers = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json",
  };

  const orderRow = {
    id: order.id,
    converted_from_quote_id: order.convertedFromQuoteId || null,
    customer_id: order.customerId || "",
    customer_po: order.customerPo || "",
    salesperson: order.salesperson || "",
    terms: order.terms || "Net 30",
    ship_via: order.shipVia || "Best Way",
    ship_to_contact: order.shipToContact || "",
    ship_to_address: order.shipToAddress || "",
    req_ship_date: order.reqShipDate || null,
    notes: order.notes || "",
    misc: Number(order.misc) || 0,
    freight: Number(order.freight) || 0,
    trade_discount: Number(order.tradeDiscount) || 0,
    weight_lbs: Number(order.weightLbs) || 0,
    length_in: Number(order.lengthIn) || 0,
    width_in: Number(order.widthIn) || 0,
    height_in: Number(order.heightIn) || 0,
    location_code: order.locationCode || "MAIN",
    status: order.status || "Open",
    released_at: order.releasedAt || null,
    released_by_initials: order.releasedByInitials || "",
    released_by_name: order.releasedByName || "",
    closed_at: order.closedAt || null,
    originator_initials: order.originatorInitials || "",
    originator_name: order.originatorName || "",
    last_modified_by_initials: order.lastModifiedByInitials || "",
    last_modified_by_name: order.lastModifiedByName || "",
    created_at: order.createdAt || new Date().toISOString(),
    last_modified_at: order.lastModifiedAt || new Date().toISOString(),
  };
  if (order.orderNumber) orderRow.order_number = order.orderNumber;
  if (order.masterNo != null) orderRow.master_no = order.masterNo;

  try {
    const upsertResponse = await fetch(`${SUPABASE_URL}/rest/v1/orders?on_conflict=id`, {
      method: "POST",
      headers: { ...headers, Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(orderRow),
    });
    if (!upsertResponse.ok) {
      const detail = await upsertResponse.text();
      return { statusCode: 502, body: JSON.stringify({ saved: false, error: detail }) };
    }
    const [savedRow] = await upsertResponse.json();

    const deleteLinesResponse = await fetch(`${SUPABASE_URL}/rest/v1/order_lines?order_id=eq.${encodeURIComponent(order.id)}`, {
      method: "DELETE",
      headers: { ...headers, Prefer: "return=minimal" },
    });
    if (!deleteLinesResponse.ok) {
      const detail = await deleteLinesResponse.text();
      return { statusCode: 502, body: JSON.stringify({ saved: false, error: detail }) };
    }

    if (lines.length) {
      const lineRows = lines.map((line, index) => ({
        order_id: order.id,
        item_id: Number.isInteger(Number(line.itemId)) && Number(line.itemId) > 0 ? Number(line.itemId) : null,
        sort_order: index,
        part: line.part || "",
        description: line.description || "",
        category: line.category || "",
        uom: line.uom || "EA",
        quantity: Math.min(5000, Math.max(1, Math.round(Number(line.quantity)) || 1)),
        reserved_qty: Math.max(0, Math.round(Number(line.reservedQty)) || 0),
        qty_to_ship: Math.max(0, Math.round(Number(line.qtyToShip)) || 0),
        shipped_qty: Math.max(0, Math.round(Number(line.shippedQty)) || 0),
        qty_to_invoice: Math.max(0, Math.round(Number(line.qtyToInvoice)) || 0),
        invoiced_qty: Math.max(0, Math.round(Number(line.invoicedQty)) || 0),
        backorder_qty: Math.max(0, Math.round(Number(line.backorderQty)) || 0),
        unit_price: Number(line.unitPrice) || 0,
        discount: Number(line.discount) || 0,
        taxable: Boolean(line.taxable),
        source: line.source || "MDB demo",
      }));
      const linesResponse = await fetch(`${SUPABASE_URL}/rest/v1/order_lines`, {
        method: "POST",
        headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify(lineRows),
      });
      if (!linesResponse.ok) {
        const detail = await linesResponse.text();
        return { statusCode: 502, body: JSON.stringify({ saved: false, error: detail }) };
      }
    }

    if (events.length) {
      const eventRows = events.map((entry) => ({
        event_key: String(entry.key),
        order_id: order.id,
        event_type: entry.type || "Edited",
        summary: String(entry.summary),
        detail: entry.detail || "",
        actor_initials: entry.actorInitials || "",
        actor_name: entry.actorName || "",
        created_at: entry.createdAt || new Date().toISOString(),
      }));
      const eventsResponse = await fetch(`${SUPABASE_URL}/rest/v1/order_events?on_conflict=event_key`, {
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
      body: JSON.stringify({ saved: true, orderNumber: savedRow?.order_number ?? null, masterNo: savedRow?.master_no ?? null }),
    };
  } catch (error) {
    return { statusCode: 502, body: JSON.stringify({ saved: false, error: String(error) }) };
  }
};
