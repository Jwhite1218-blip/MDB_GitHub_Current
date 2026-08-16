// Upserts one quote (and replaces its lines) in Supabase. Requires
// SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables. Without them,
// returns { configured: false, saved: false } and the frontend falls back to
// localStorage -- nothing breaks while this is being set up.
//
// Lines are replaced wholesale (delete then reinsert) rather than diffed --
// quotes have a handful of lines, so this is simple and safe rather than
// tracking per-line inserts/updates/deletes.

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
    Prefer: "resolution=merge-duplicates,return=minimal",
  };

  const quoteRow = {
    id: quote.id,
    number: quote.number,
    customer_id: quote.customerId || "",
    customer_po: quote.customerPo || "",
    salesperson: quote.salesperson || "",
    workflow: quote.workflow || "General",
    terms: quote.terms || "Net 30",
    ship_via: quote.shipVia || "Best way",
    notes: quote.notes || "",
    freight: Number(quote.freight) || 0,
    tax_rate: Number(quote.taxRate) || 0,
    status: quote.status || "Open",
    originator_initials: quote.originatorInitials || "",
    originator_name: quote.originatorName || "",
    last_modified_by_initials: quote.lastModifiedByInitials || "",
    last_modified_by_name: quote.lastModifiedByName || "",
    created_at: quote.createdAt || new Date().toISOString(),
    last_modified_at: quote.lastModifiedAt || new Date().toISOString(),
  };

  try {
    const upsertResponse = await fetch(`${SUPABASE_URL}/rest/v1/quotes?on_conflict=id`, {
      method: "POST",
      headers,
      body: JSON.stringify(quoteRow),
    });
    if (!upsertResponse.ok) {
      const detail = await upsertResponse.text();
      return { statusCode: 502, body: JSON.stringify({ saved: false, error: detail }) };
    }

    await fetch(`${SUPABASE_URL}/rest/v1/quote_lines?quote_id=eq.${encodeURIComponent(quote.id)}`, {
      method: "DELETE",
      headers,
    });

    const lines = Array.isArray(quote.lines) ? quote.lines : [];
    if (lines.length) {
      const lineRows = lines.map((line, index) => ({
        quote_id: quote.id,
        sort_order: index,
        part: line.part || "",
        description: line.description || "",
        quantity: Math.min(5000, Math.max(1, Math.round(Number(line.quantity)) || 1)),
        unit_price: Number(line.unitPrice) || 0,
        discount: Number(line.discount) || 0,
        taxable: Boolean(line.taxable),
        source: line.source || "MDB demo",
      }));
      const linesResponse = await fetch(`${SUPABASE_URL}/rest/v1/quote_lines`, {
        method: "POST",
        headers,
        body: JSON.stringify(lineRows),
      });
      if (!linesResponse.ok) {
        const detail = await linesResponse.text();
        return { statusCode: 502, body: JSON.stringify({ saved: false, error: detail }) };
      }
    }

    return { statusCode: 200, body: JSON.stringify({ saved: true }) };
  } catch (error) {
    return { statusCode: 502, body: JSON.stringify({ saved: false, error: String(error) }) };
  }
};
