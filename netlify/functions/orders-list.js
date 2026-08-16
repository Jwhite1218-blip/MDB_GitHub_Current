// Fetches every Open order (with its lines) from Supabase for the Orders
// workspace's team-wide list. Requires SUPABASE_URL and SUPABASE_SERVICE_KEY
// environment variables. Without them, returns { configured: false } and the
// frontend falls back to localStorage -- nothing breaks while this is being
// set up.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function toCamelOrder(row) {
  return {
    id: row.id,
    orderNumber: row.order_number,
    masterNo: row.master_no,
    convertedFromQuoteId: row.converted_from_quote_id,
    customerId: row.customer_id,
    customerPo: row.customer_po,
    salesperson: row.salesperson,
    terms: row.terms,
    shipVia: row.ship_via,
    shipToContact: row.ship_to_contact,
    shipToAddress: row.ship_to_address,
    reqShipDate: row.req_ship_date,
    notes: row.notes,
    misc: Number(row.misc),
    freight: Number(row.freight),
    tradeDiscount: Number(row.trade_discount),
    status: row.status,
    originatorInitials: row.originator_initials,
    originatorName: row.originator_name,
    lastModifiedByInitials: row.last_modified_by_initials,
    lastModifiedByName: row.last_modified_by_name,
    createdAt: row.created_at,
    lastModifiedAt: row.last_modified_at,
    lines: (row.order_lines || [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((line) => ({
        part: line.part,
        description: line.description,
        uom: line.uom,
        quantity: line.quantity,
        shippedQty: line.shipped_qty,
        backorderQty: line.backorder_qty,
        unitPrice: Number(line.unit_price),
        discount: Number(line.discount),
        taxable: line.taxable,
        source: line.source,
      })),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 200, body: JSON.stringify({ configured: false, orders: [] }) };
  }

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?select=*,order_lines(*)&order=created_at.desc`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    if (!response.ok) {
      const detail = await response.text();
      return { statusCode: 502, body: JSON.stringify({ configured: true, error: detail }) };
    }
    const rows = await response.json();
    return { statusCode: 200, body: JSON.stringify({ configured: true, orders: rows.map(toCamelOrder) }) };
  } catch (error) {
    return { statusCode: 502, body: JSON.stringify({ configured: true, error: String(error) }) };
  }
};
