// Fetches the real (if partial) known-customer roster for the Prospects
// duplicate-check. Requires SUPABASE_URL and SUPABASE_SERVICE_KEY --
// without them returns { configured: false } and Prospects should say it
// can't check for duplicates rather than pretending it did.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 200, body: JSON.stringify({ configured: false, customers: [] }) };
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/known_customers?select=customer_number,customer_name,source`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    });
    if (!response.ok) {
      const detail = await response.text();
      return { statusCode: 502, body: JSON.stringify({ configured: true, error: detail }) };
    }
    const rows = await response.json();
    return {
      statusCode: 200,
      body: JSON.stringify({
        configured: true,
        customers: rows.map((row) => ({ number: row.customer_number, name: row.customer_name, source: row.source })),
      }),
    };
  } catch (error) {
    return { statusCode: 502, body: JSON.stringify({ configured: true, error: String(error) }) };
  }
};
