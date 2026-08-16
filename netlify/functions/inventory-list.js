// Fetches every part that has a real recorded stock override in Supabase.
// Parts with no row here aren't missing data -- they just use the existing
// deterministic demo seed (same fake on-hand/allocated/bin/price for
// everyone, computed from a hash of the part number). Only edited parts ever
// need to be shared, so this table stays small regardless of catalog size.
//
// Requires SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables.
// Without them, returns { configured: false } and the frontend falls back to
// the local seed/localStorage behavior -- nothing breaks while this is being
// set up.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 200, body: JSON.stringify({ configured: false, stock: {} }) };
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/inventory_stock?select=*`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    });
    if (!response.ok) {
      const detail = await response.text();
      return { statusCode: 502, body: JSON.stringify({ configured: true, error: detail }) };
    }
    const rows = await response.json();
    const stock = {};
    for (const row of rows) {
      stock[row.part] = {
        onHand: Number(row.on_hand),
        allocated: Number(row.allocated),
        bin: row.bin,
        unitPrice: Number(row.unit_price),
        lastModifiedByName: row.last_modified_by_name,
        lastModifiedAt: row.last_modified_at,
      };
    }
    return { statusCode: 200, body: JSON.stringify({ configured: true, stock }) };
  } catch (error) {
    return { statusCode: 502, body: JSON.stringify({ configured: true, error: String(error) }) };
  }
};
