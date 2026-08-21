import { getUser } from "@netlify/identity";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export class OperationalApiError extends Error {
  status: number;
  detail?: unknown;

  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.name = "OperationalApiError";
    this.status = status;
    this.detail = detail;
  }
}

export function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export function operationalHeaders(prefer?: string) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new OperationalApiError(503, "Operational database is not configured.");
  }
  return {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

export function operationalDatabaseUrl(path: string) {
  if (!SUPABASE_URL) throw new OperationalApiError(503, "Operational database is not configured.");
  return `${SUPABASE_URL}/rest/v1/${path}`;
}

function requireSameOrigin(request: Request) {
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(request.method)) return;
  const origin = request.headers.get("origin");
  const requestOrigin = new URL(request.url).origin;
  if (!origin || origin !== requestOrigin) {
    throw new OperationalApiError(403, "State-changing operational requests must be same-origin.");
  }
}

export async function requireOperationalActor(request: Request) {
  requireSameOrigin(request);
  const identityUser = await getUser();
  if (!identityUser) throw new OperationalApiError(401, "Employee sign-in is required.");

  const subject = encodeURIComponent(identityUser.id);
  const response = await fetch(operationalDatabaseUrl(
    `operational_users?identity_subject=eq.${subject}&is_active=eq.true&select=id,identity_subject,email,display_name,initials,is_active,operational_user_roles(role)&limit=1`
  ), { headers: operationalHeaders() });
  if (!response.ok) {
    throw new OperationalApiError(502, "Operational user lookup failed.", await response.text());
  }
  const [row] = await response.json();
  if (!row) {
    throw new OperationalApiError(403, "This signed-in account has not been provisioned for MDB operations.");
  }

  return {
    id: row.id as string,
    identitySubject: row.identity_subject as string,
    email: row.email as string,
    displayName: row.display_name as string,
    initials: row.initials as string,
    roles: (row.operational_user_roles || []).map((entry: { role: string }) => entry.role),
  };
}

export async function callOperationalRpc(functionName: string, payload: Record<string, unknown>) {
  const response = await fetch(operationalDatabaseUrl(`rpc/${functionName}`), {
    method: "POST",
    headers: operationalHeaders("return=representation"),
    body: JSON.stringify(payload),
  });
  const raw = await response.text();
  let body: unknown = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { detail: raw }; }
  if (!response.ok) {
    const message = typeof body === "object" && body && "message" in body
      ? String((body as { message: unknown }).message)
      : `Operational transaction ${functionName} failed.`;
    throw new OperationalApiError(400, message, body);
  }
  return body;
}

export function operationalErrorResponse(error: unknown) {
  if (error instanceof OperationalApiError) {
    return jsonResponse(error.status, { ok: false, error: error.message, detail: error.detail });
  }
  return jsonResponse(500, { ok: false, error: "Unexpected operational API failure." });
}
