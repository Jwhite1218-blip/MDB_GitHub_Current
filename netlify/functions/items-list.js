"use strict";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const { internalAccess, jsonResponse } = require("./_internal-access");

const PAGE_SIZE = 1000;

function headers(extra = {}) {
  return {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    ...extra,
  };
}

function mapItem(row) {
  return {
    id: row.id,
    partNumber: row.part_number,
    description: row.description,
    itemClass: row.item_class,
    category: row.category,
    family: row.family,
    subfamily: row.subfamily,
    uom: row.uom,
    status: row.status,
    revision: row.revision,
    drawingNumber: row.drawing_number,
    preferredVendor: row.preferred_vendor,
    standardCost: Number(row.standard_cost),
    listPrice: Number(row.list_price),
    weightLbs: Number(row.weight_lbs),
    sourceAuthority: row.source_authority,
    sourceSystem: row.source_system,
    sourceUpdatedAt: row.source_updated_at,
    attributes: row.attributes || {},
    updatedAt: row.updated_at,
  };
}

exports.handler = async (event) => {
  const access = internalAccess(event);
  if (!access.ok) return access.response;
  if (event.httpMethod !== "GET") return jsonResponse(405, { error: "Method not allowed" });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return jsonResponse(200, { configured: false, items: [] });
  }

  try {
    const rows = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const to = from + PAGE_SIZE - 1;
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/items?select=*&order=part_number.asc`,
        { headers: headers({ Range: `${from}-${to}`, "Range-Unit": "items" }) },
      );
      if (!response.ok) {
        return jsonResponse(502, { configured: true, error: await response.text() });
      }
      const page = await response.json();
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
    }
    return jsonResponse(200, { configured: true, items: rows.map(mapItem) });
  } catch (error) {
    return jsonResponse(502, { configured: true, error: String(error) });
  }
};
