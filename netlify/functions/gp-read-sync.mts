import {
  OperationalApiError,
  callOperationalRpc,
  jsonResponse,
  operationalErrorResponse,
} from "./_operational-auth.mts";
import {
  isAuthorizedGpSyncToken,
  normalizeBatchRequest,
  normalizeFinishRequest,
  normalizeStartRequest,
  requiredText,
} from "./_gp-read-sync-contract.mjs";

declare const Netlify: { env: { get(name: string): string | undefined } };

function runtimeSecret(name: string) {
  try {
    return Netlify.env.get(name) || "";
  } catch {
    return process.env[name] || "";
  }
}

function providedToken(request: Request) {
  const explicit = request.headers.get("x-mdb-gp-sync-token");
  if (explicit) return explicit;
  const authorization = request.headers.get("authorization") || "";
  return authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
}

async function requestBody(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 2_000_000) throw new OperationalApiError(413, "GP sync request exceeds 2 MB.");
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    throw new OperationalApiError(400, "A JSON request body is required.");
  }
  if (JSON.stringify(body).length > 2_000_000) {
    throw new OperationalApiError(413, "GP sync request exceeds 2 MB.");
  }
  return body;
}

export default async (request: Request) => {
  try {
    if (request.method !== "POST") {
      return jsonResponse(405, { ok: false, error: "Method not allowed." });
    }

    const expectedToken = runtimeSecret("GP_SYNC_INGEST_TOKEN");
    if (!expectedToken) throw new OperationalApiError(503, "GP sync ingestion is not configured.");
    if (!isAuthorizedGpSyncToken(providedToken(request), expectedToken)) {
      throw new OperationalApiError(401, "GP sync authentication failed.");
    }

    const body = await requestBody(request);
    let operation: string;
    try {
      operation = requiredText(body.operation, "operation");
    } catch (error) {
      throw new OperationalApiError(400, (error as Error).message);
    }

    let functionName: string;
    let payload: Record<string, unknown>;
    try {
      if (operation === "start") {
        functionName = "mdb_gp_sync_start_v2";
        payload = normalizeStartRequest(body);
      } else if (operation === "batch") {
        functionName = "mdb_gp_sync_ingest_batch_v2";
        payload = normalizeBatchRequest(body);
      } else if (operation === "finish") {
        functionName = "mdb_gp_sync_finish_v2";
        payload = normalizeFinishRequest(body);
      } else {
        throw new Error(`Unsupported operation: ${operation}`);
      }
    } catch (error) {
      throw new OperationalApiError(400, (error as Error).message);
    }

    const result = await callOperationalRpc(functionName, payload);
    return jsonResponse(operation === "start" ? 201 : 200, { ok: true, readOnly: true, result });
  } catch (error) {
    return operationalErrorResponse(error);
  }
};

export const config = { path: "/api/integrations/gp/read-sync" };
