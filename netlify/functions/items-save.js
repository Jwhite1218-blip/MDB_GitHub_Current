"use strict";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const { internalAccess, jsonResponse } = require("./_internal-access");

const ITEM_CLASSES = new Set(["Tooling", "Rig Part", "Tooling + Rig Part", "Service", "Assembly", "Other"]);
const ITEM_STATUSES = new Set(["Active", "Inactive", "Blocked", "Review"]);

function cleanText(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function nonnegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function safeAttributes(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
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
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method not allowed" });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return jsonResponse(200, { configured: false, saved: false });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { error: "Invalid JSON" });
  }

  const partNumber = cleanText(payload.partNumber).toUpperCase();
  if (!partNumber || partNumber.length > 80 || !/^[A-Z0-9][A-Z0-9 ._\/-]*$/.test(partNumber)) {
    return jsonResponse(400, { error: "A valid part number is required" });
  }

  const itemClass = ITEM_CLASSES.has(payload.itemClass) ? payload.itemClass : "Other";
  const status = ITEM_STATUSES.has(payload.status) ? payload.status : "Active";
  const row = {
    part_number: partNumber,
    description: cleanText(payload.description),
    item_class: itemClass,
    category: cleanText(payload.category),
    family: cleanText(payload.family),
    subfamily: cleanText(payload.subfamily),
    uom: cleanText(payload.uom, "EA") || "EA",
    status,
    revision: cleanText(payload.revision),
    drawing_number: cleanText(payload.drawingNumber),
    preferred_vendor: cleanText(payload.preferredVendor),
    standard_cost: nonnegativeNumber(payload.standardCost),
    list_price: nonnegativeNumber(payload.listPrice),
    weight_lbs: nonnegativeNumber(payload.weightLbs),
    source_authority: cleanText(payload.sourceAuthority),
    source_system: cleanText(payload.sourceSystem, "MDB") || "MDB",
    source_updated_at: payload.sourceUpdatedAt || null,
    attributes: safeAttributes(payload.attributes),
    updated_at: new Date().toISOString(),
  };

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/items?on_conflict=part_number`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(row),
    });
    if (!response.ok) {
      return jsonResponse(502, { configured: true, saved: false, error: await response.text() });
    }
    const [saved] = await response.json();
    return jsonResponse(200, { configured: true, saved: true, item: mapItem(saved) });
  } catch (error) {
    return jsonResponse(502, { configured: true, saved: false, error: String(error) });
  }
};
