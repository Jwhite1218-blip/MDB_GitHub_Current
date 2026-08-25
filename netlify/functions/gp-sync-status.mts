import {
  OperationalApiError,
  jsonResponse,
  operationalDatabaseUrl,
  operationalErrorResponse,
  operationalHeaders,
  requireOperationalActor,
} from "./_operational-auth.mts";

async function readOperationalRows(path: string, label: string) {
  const response = await fetch(operationalDatabaseUrl(path), { headers: operationalHeaders() });
  if (!response.ok) throw new OperationalApiError(502, `${label} could not be loaded.`, await response.text());
  return response.json();
}

export default async (request: Request) => {
  try {
    if (request.method !== "GET") return jsonResponse(405, { ok: false, error: "Method not allowed." });
    const actor = await requireOperationalActor(request);
    if (!actor.roles.some((role) => ["admin", "production_controller", "inventory_controller"].includes(role))) {
      throw new OperationalApiError(403, "GP synchronization status is limited to operational controllers.");
    }

    const [runs, runEntities, cursors, issues] = await Promise.all([
      readOperationalRows(
        "gp_sync_runs?select=id,run_key,company_id,connector,mode,contract_version,mapping_version,status,requested_entities,source_watermark,records_seen,records_inserted,records_updated,records_unchanged,error_summary,started_at,finished_at&order=started_at.desc&limit=20",
        "GP sync run history",
      ),
      readOperationalRows(
        "gp_sync_run_entities?select=sync_run_id,entity_type,sync_mode,status,starting_watermark,ending_watermark,expected_record_count,records_seen,records_inserted,records_updated,records_unchanged,batches_seen,last_batch_sequence,started_at,finished_at&order=started_at.desc,entity_type&limit=140",
        "GP sync entity history",
      ),
      readOperationalRows(
        "gp_sync_cursors?select=company_id,entity_type,source_watermark,last_successful_run_id,last_successful_at&order=company_id,entity_type",
        "GP sync cursors",
      ),
      readOperationalRows(
        "gp_reconciliation_issues?select=id,issue_code,severity,status,summary,detected_at,source_record:gp_source_records(company_id,entity_type,external_id,match_status)&status=eq.Open&order=detected_at.desc&limit=50",
        "GP reconciliation issues",
      ),
    ]);

    return jsonResponse(200, {
      ok: true,
      readOnly: true,
      actor: { displayName: actor.displayName, roles: actor.roles },
      runs,
      runEntities,
      cursors,
      issues,
    });
  } catch (error) {
    return operationalErrorResponse(error);
  }
};

export const config = { path: "/api/integrations/gp/status" };
