// Upserts one part's stock override in Supabase. Requires SUPABASE_URL and
// SUPABASE_SERVICE_KEY environment variables. Without them, returns
// { configured: false, saved: false } and the frontend falls back to
// localStorage -- nothing breaks while this is being set up.

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

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }
  if (!payload.part) {
    return { statusCode: 400, body: "Missing part" };
  }

  const row = {
    part: payload.part,
    item_id: Number.isInteger(Number(payload.itemId)) && Number(payload.itemId) > 0 ? Number(payload.itemId) : null,
    on_hand: Number(payload.onHand) || 0,
    allocated: Number(payload.allocated) || 0,
    bin: payload.bin || "",
    unit_price: Number(payload.unitPrice) || 0,
    last_modified_by_initials: payload.lastModifiedByInitials || "",
    last_modified_by_name: payload.lastModifiedByName || "",
    last_modified_at: new Date().toISOString(),
  };

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/inventory_stock?on_conflict=part`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(row),
    });
    if (!response.ok) {
      const detail = await response.text();
      return { statusCode: 502, body: JSON.stringify({ saved: false, error: detail }) };
    }
    return { statusCode: 200, body: JSON.stringify({ saved: true }) };
  } catch (error) {
    return { statusCode: 502, body: JSON.stringify({ saved: false, error: String(error) }) };
  }
};
