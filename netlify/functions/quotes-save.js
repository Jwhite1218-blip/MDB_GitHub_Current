// Upserts one quote (and replaces its lines) in Supabase. Requires
// SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables. Without them,
// returns { configured: false, saved: false } and the frontend falls back to
// localStorage -- nothing breaks while this is being set up.
//
// Lines are replaced wholesale (delete then reinsert) rather than diffed --
// quotes have a handful of lines, so this is simple and safe rather than
// tracking per-line inserts/updates/deletes.
//
// master_no is only ever set by the client once it's already known (i.e. a
// quote the server has already assigned a number to). On first creation the
// field is omitted so Postgres applies its own nextval() default, and the
// resulting value is returned to the caller so the frontend can remember it
// for every future edit of that same quote.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 200, body: JSON.stringify({ configured: false, saved: false }) };
  }

  let quote;
  try {
    quote = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }
  if (!quote.id || !quote.number) {
    return { statusCode: 400, body: "Missing id or number" };
  }

  const headers = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json",
  };

  const quoteRow = {
    id: quote.id,
    number: quote.number,
    customer_id: quote.customerId || "",
    customer_po: quote.customerPo || "",
    salesperson: quote.salesperson || "",
    workflow: quote.workflow || "General",
    terms: quote.terms || "Net 30",
    ship_via: quote.shipVia || "Best Way",
    ship_to_contact: quote.shipToContact || "",
    ship_to_address: quote.shipToAddress || "",
    req_ship_date: quote.reqShipDate || null,
    notes: quote.notes || "",
    misc: Number(quote.misc) || 0,
    freight: Number(quote.freight) || 0,
    trade_discount: Number(quote.tradeDiscount) || 0,
    status: quote.status || "Open",
    originator_initials: quote.originatorInitials || "",
    originator_name: quote.originatorName || "",
    last_modified_by_initials: quote.lastModifiedByInitials || "",
    last_modified_by_name: quote.lastModifiedByName || "",
    created_at: quote.createdAt || new Date().toISOString(),
    last_modified_at: quote.lastModifiedAt || new Date().toISOString(),
  };
  if (quote.masterNo != null) quoteRow.master_no = quote.masterNo;

  try {
    const upsertResponse = await fetch(`${SUPABASE_URL}/rest/v1/quotes?on_conflict=id`, {
      method: "POST",
      headers: { ...headers, Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(quoteRow),
    });
    if (!upsertResponse.ok) {
      const detail = await upsertResponse.text();
      return { statusCode: 502, body: JSON.stringify({ saved: false, error: detail }) };
    }
    const [savedRow] = await upsertResponse.json();

    await fetch(`${SUPABASE_URL}/rest/v1/quote_lines?quote_id=eq.${encodeURIComponent(quote.id)}`, {
      method: "DELETE",
      headers: { ...headers, Prefer: "return=minimal" },
    });

    const lines = Array.isArray(quote.lines) ? quote.lines : [];
    if (lines.length) {
      const lineRows = lines.map((line, index) => ({
        quote_id: quote.id,
        sort_order: index,
        part: line.part || "",
        description: line.description || "",
        uom: line.uom || "EA",
        quantity: Math.min(5000, Math.max(1, Math.round(Number(line.quantity)) || 1)),
        unit_price: Number(line.unitPrice) || 0,
        discount: Number(line.discount) || 0,
        taxable: Boolean(line.taxable),
        source: line.source || "MDB demo",
      }));
      const linesResponse = await fetch(`${SUPABASE_URL}/rest/v1/quote_lines`, {
        method: "POST",
        headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify(lineRows),
      });
      if (!linesResponse.ok) {
        const detail = await linesResponse.text();
        return { statusCode: 502, body: JSON.stringify({ saved: false, error: detail }) };
      }
    }

    return { statusCode: 200, body: JSON.stringify({ saved: true, masterNo: savedRow?.master_no ?? null }) };
  } catch (error) {
    return { statusCode: 502, body: JSON.stringify({ saved: false, error: String(error) }) };
  }
};
