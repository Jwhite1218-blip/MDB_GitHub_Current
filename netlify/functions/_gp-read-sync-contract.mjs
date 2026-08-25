import { createHash, timingSafeEqual } from "node:crypto";

export const GP_ENTITY_TYPES = Object.freeze([
  "Customer",
  "Item",
  "Inventory",
  "SalesOrder",
  "SalesOrderLine",
  "Invoice",
  "InvoiceLine",
]);

export const GP_SYNC_CONTRACT_VERSION = 2;

const NORMALIZED_IDENTITIES = Object.freeze({
  Customer: ["customerNumber"],
  Item: ["partNumber"],
  Inventory: ["partNumber", "locationCode"],
  SalesOrder: ["orderNumber"],
  SalesOrderLine: ["orderNumber", "lineNumber"],
  Invoice: ["invoiceNumber"],
  InvoiceLine: ["invoiceNumber", "lineNumber"],
});

export function requiredText(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

function plainObject(value, label) {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`${label} must be a JSON object.`);
  }
  return value;
}

function requireContractVersion(body) {
  const version = body.contractVersion == null ? GP_SYNC_CONTRACT_VERSION : Number(body.contractVersion);
  if (version !== GP_SYNC_CONTRACT_VERSION) {
    throw new Error(`contractVersion must be ${GP_SYNC_CONTRACT_VERSION}.`);
  }
}

function normalizeEntityPlans(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > GP_ENTITY_TYPES.length) {
    throw new Error(`entityPlans must contain between 1 and ${GP_ENTITY_TYPES.length} entities.`);
  }
  const seen = new Set();
  return value.map((rawPlan, index) => {
    const plan = plainObject(rawPlan, `entityPlans[${index}]`);
    const entityType = requiredText(plan.entityType, `entityPlans[${index}].entityType`);
    const syncMode = requiredText(plan.syncMode, `entityPlans[${index}].syncMode`);
    if (!GP_ENTITY_TYPES.includes(entityType)) throw new Error(`Unsupported GP entity type: ${entityType}`);
    if (!["Delta", "Snapshot"].includes(syncMode)) {
      throw new Error(`entityPlans[${index}].syncMode must be Delta or Snapshot.`);
    }
    if (seen.has(entityType)) throw new Error("entityPlans cannot contain duplicate entityType values.");
    seen.add(entityType);
    return { entityType, syncMode };
  });
}

function validateRecord(record, entityType, index) {
  plainObject(record, `records[${index}]`);
  const externalId = requiredText(record.externalId, `records[${index}].externalId`);
  if (externalId.length > 256) throw new Error(`records[${index}].externalId exceeds 256 characters.`);
  const payload = record.payload == null ? {} : plainObject(record.payload, `records[${index}].payload`);
  const normalized = record.normalized == null
    ? {}
    : plainObject(record.normalized, `records[${index}].normalized`);
  if (record.deleted != null && typeof record.deleted !== "boolean") {
    throw new Error(`records[${index}].deleted must be a boolean.`);
  }
  if (record.sourceModifiedAt != null && record.sourceModifiedAt !== "") {
    const timestamp = String(record.sourceModifiedAt);
    if (!Number.isFinite(Date.parse(timestamp))) {
      throw new Error(`records[${index}].sourceModifiedAt must be an ISO timestamp.`);
    }
  }
  if (!record.deleted) {
    for (const field of NORMALIZED_IDENTITIES[entityType]) {
      requiredText(normalized[field], `records[${index}].normalized.${field}`);
    }
  }
  return {
    externalId,
    sourceModifiedAt: record.sourceModifiedAt == null || record.sourceModifiedAt === ""
      ? null
      : String(record.sourceModifiedAt),
    deleted: Boolean(record.deleted),
    payload,
    normalized,
  };
}

export function isAuthorizedGpSyncToken(providedToken, expectedToken) {
  const provided = String(providedToken || "");
  const expected = String(expectedToken || "");
  if (!provided || !expected) return false;
  const providedDigest = createHash("sha256").update(provided, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

export function normalizeStartRequest(body) {
  requireContractVersion(body);
  const entityPlans = normalizeEntityPlans(body.entityPlans);
  const metadata = body.metadata == null ? {} : plainObject(body.metadata, "metadata");
  return {
    p_run_key: requiredText(body.runKey, "runKey"),
    p_company_id: requiredText(body.companyId, "companyId"),
    p_connector: String(body.connector || "normalized_export").trim() || "normalized_export",
    p_mapping_version: requiredText(body.mappingVersion, "mappingVersion"),
    p_entity_plans: entityPlans,
    p_metadata: metadata,
  };
}

export function normalizeBatchRequest(body) {
  requireContractVersion(body);
  const entityType = requiredText(body.entityType, "entityType");
  if (!GP_ENTITY_TYPES.includes(entityType)) throw new Error(`Unsupported GP entity type: ${entityType}`);
  if (!Array.isArray(body.records)) throw new Error("records must be a JSON array.");
  if (body.records.length < 1 || body.records.length > 500) {
    throw new Error("A GP sync batch must contain between 1 and 500 records.");
  }
  const batchSequence = Number(body.batchSequence);
  if (!Number.isSafeInteger(batchSequence) || batchSequence < 1) {
    throw new Error("batchSequence must be a positive integer.");
  }
  const records = body.records.map((record, index) => validateRecord(record, entityType, index));
  if (new Set(records.map((record) => record.externalId)).size !== records.length) {
    throw new Error("A GP batch cannot contain duplicate externalId values.");
  }
  return {
    p_run_id: requiredText(body.runId, "runId"),
    p_batch_key: requiredText(body.batchKey, "batchKey"),
    p_batch_sequence: batchSequence,
    p_entity_type: entityType,
    p_records: records,
  };
}

export function normalizeFinishRequest(body) {
  requireContractVersion(body);
  const status = requiredText(body.status, "status");
  if (!["Succeeded", "Failed"].includes(status)) {
    throw new Error("status must be Succeeded or Failed.");
  }
  const rawResults = body.entityResults == null ? [] : body.entityResults;
  if (!Array.isArray(rawResults)) throw new Error("entityResults must be a JSON array.");
  const seen = new Set();
  const entityResults = rawResults.map((rawResult, index) => {
    const result = plainObject(rawResult, `entityResults[${index}]`);
    const entityType = requiredText(result.entityType, `entityResults[${index}].entityType`);
    if (!GP_ENTITY_TYPES.includes(entityType)) throw new Error(`Unsupported GP entity type: ${entityType}`);
    if (seen.has(entityType)) throw new Error("entityResults cannot contain duplicate entityType values.");
    seen.add(entityType);
    const expectedRecordCount = Number(result.expectedRecordCount);
    if (!Number.isSafeInteger(expectedRecordCount) || expectedRecordCount < 0) {
      throw new Error(`entityResults[${index}].expectedRecordCount must be a non-negative integer.`);
    }
    return {
      entityType,
      endingWatermark: requiredText(result.endingWatermark, `entityResults[${index}].endingWatermark`),
      expectedRecordCount,
    };
  });
  if (status === "Succeeded" && entityResults.length < 1) {
    throw new Error("A successful GP sync requires entityResults.");
  }
  if (status === "Failed" && entityResults.length > 0) {
    throw new Error("A failed GP sync must not advance entity results.");
  }
  return {
    p_run_id: requiredText(body.runId, "runId"),
    p_status: status,
    p_entity_results: entityResults,
    p_error_summary: String(body.errorSummary || "").trim(),
  };
}
