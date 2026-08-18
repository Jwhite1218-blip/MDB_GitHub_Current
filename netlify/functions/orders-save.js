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
    status: order.status || "Open",
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

    await fetch(`${SUPABASE_URL}/rest/v1/order_lines?order_id=eq.${encodeURIComponent(order.id)}`, {
      method: "DELETE",
      headers: { ...headers, Prefer: "return=minimal" },
    });

    const lines = Array.isArray(order.lines) ? order.lines : [];
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
        shipped_qty: Math.max(0, Math.round(Number(line.shippedQty)) || 0),
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

    return {
      statusCode: 200,
      body: JSON.stringify({ saved: true, orderNumber: savedRow?.order_number ?? null, masterNo: savedRow?.master_no ?? null }),
    };
  } catch (error) {
    return { statusCode: 502, body: JSON.stringify({ saved: false, error: String(error) }) };
  }
};
