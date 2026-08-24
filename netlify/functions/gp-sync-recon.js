"use strict";

// GP read-only sync recon. Returns a discovery checklist plus staged-table
// counts. Fail-closed via _internal-access. No GP write-back.
// Without SUPABASE_URL/SUPABASE_SERVICE_KEY returns configured:false + checklist.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const { internalAccess, jsonResponse } = require("./_internal-access");

const STAGING_TABLES = ["gp_customers_staging","gp_items_staging","gp_inventory_staging","gp_pricing_staging","customer_gp_crosswalk","item_gp_crosswalk"];

const RECON_CHECKLIST = [
  { id: "gp_version", label: "Confirm Dynamics GP version + build" },
  { id: "integration", label: "Identify integration path (eConnect / GP Web Services / OData)" },
  { id: "sql_readonly", label: "Provision read-only SQL access (no write grants)" },
  { id: "field_keys", label: "Capture field keys: customer number, item number, site, price level" },
  { id: "identity", label: "Document auth (Entra/AD) + service account" },
  { id: "network", label: "Network path (VPN/firewall) from Netlify to GP" },
  { id: "dry_run", label: "Dry-run extract: customers -> items -> inventory -> pricing" },
  { id: "crosswalk", label: "Build + verify customer/item crosswalks before write-back" }
];

function headers(){ return { apikey: SUPABASE_SERVICE_KEY, Authorization: "Bearer " + SUPABASE_SERVICE_KEY, Accept: "application/json" }; }

async function count(table){
  const url = SUPABASE_URL + "/rest/v1/" + table + "?select=id&limit=1";
  const res = await fetch(url, { method: "GET", headers: Object.assign({}, headers(), { Prefer: "count=exact" }) });
  const range = res.headers.get("content-range") || "";
  const total = range.indexOf("/") > -1 ? parseInt(range.split("/")[1], 10) : 0;
  return { table: table, count: Number.isFinite(total) ? total : 0 };
}

exports.handler = async (event) => {
  const access = internalAccess(event);
  if (!access.ok) return access.response;
  if (event.httpMethod !== "GET") return jsonResponse(405, { error: "Method not allowed" });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return jsonResponse(200, { configured: false, checklist: RECON_CHECKLIST, staging: [] });
  try {
    const results = [];
    for (const t of STAGING_TABLES) { try { results.push(await count(t)); } catch (e) { results.push({ table: t, count: 0, error: String(e && e.message ? e.message : e) }); } }
    return jsonResponse(200, { configured: true, checklist: RECON_CHECKLIST, staging: results });
  } catch (e) { return jsonResponse(500, { configured: true, error: String(e && e.message ? e.message : e) }); }
};