/**
 * SEC-03.32 — campos do PUT /api/service-orders/:id.
 *
 * A mesma rota muda etapa, ficha, queixa, quilometragem, entrega, técnico e arquivo.
 * Cada campo usa a chave que a tela já exige. Campo fora da operação não é gravado.
 * Gerência e full_access seguem podendo gravar o conjunto inteiro.
 */

import { CANCELLED_STATUS } from "../constants/serviceOrderStages.js";

export const SERVICE_ORDER_PUT_FIELDS = [
  "status",
  "issueDescription",
  "aiAnalysis",
  "assignedTechnician",
  "garantiaTag",
  "mileageKm",
  "deliveryDate",
  "vehicleObservations",
  "vehicleModel",
  "moduleIdentification",
  "plate",
  "orderType",
  "vehicleCategory",
  "referenceLinks",
  "labServiceLinks",
  "vehicleColor",
  "vehicleYear",
  "vehicleEngineInfo",
  "vehicleChassis",
  "vehicleBrand",
  "moduleKind",
  "moduleVehicleKind",
  "moduleProductOther",
  "diagnosticAuthorizationSignaturePath",
] as const;

const ACTOR_FIELDS = new Set([
  "actor",
  "actorTechnicianSlug",
  "actorTechnicianName",
  "actorDisplayName",
]);

const FICHA_FIELDS = new Set([
  "vehicleObservations",
  "vehicleModel",
  "moduleIdentification",
  "plate",
  "orderType",
  "vehicleCategory",
  "referenceLinks",
  "vehicleColor",
  "vehicleYear",
  "vehicleEngineInfo",
  "vehicleChassis",
  "vehicleBrand",
  "moduleKind",
  "moduleVehicleKind",
  "moduleProductOther",
]);

export type ServiceOrderPutDecision =
  | { ok: true; fields: string[] }
  | { ok: false; fields: string[] };

function granted(permissions: Record<string, unknown>, key: string): boolean {
  return permissions[key] === true;
}

function canMoveStage(permissions: Record<string, unknown>): boolean {
  return (
    granted(permissions, "access_patio") ||
    granted(permissions, "access_laboratorio") ||
    granted(permissions, "access_reception")
  );
}

function canApproveBudget(permissions: Record<string, unknown>): boolean {
  return (
    granted(permissions, "patio_approve_budget_items") ||
    granted(permissions, "patio_edit_budgets")
  );
}

function fieldAllowed(
  field: string,
  value: unknown,
  permissions: Record<string, unknown>,
  previousStatus: string | null | undefined
): boolean {
  if (field === "status") {
    const next = typeof value === "string" ? value : "";
    const reopening = previousStatus === CANCELLED_STATUS && next !== CANCELLED_STATUS;
    if (next === CANCELLED_STATUS || reopening) {
      return granted(permissions, "patio_archive_card") || (reopening && granted(permissions, "access_reception"));
    }
    if (next === "ORCAMENTO_APROVADO") return canMoveStage(permissions) || canApproveBudget(permissions);
    return canMoveStage(permissions);
  }
  if (field === "garantiaTag" || field === "diagnosticAuthorizationSignaturePath") return canMoveStage(permissions);
  if (field === "labServiceLinks") {
    return granted(permissions, "access_patio") || granted(permissions, "access_laboratorio");
  }
  if (field === "issueDescription" || field === "aiAnalysis") return granted(permissions, "patio_edit_queixa");
  if (field === "mileageKm") return granted(permissions, "patio_edit_mileage");
  if (field === "deliveryDate") return granted(permissions, "patio_edit_delivery_date");
  if (field === "assignedTechnician") return granted(permissions, "patio_assign_technician");
  if (FICHA_FIELDS.has(field)) return granted(permissions, "patio_edit_ficha");
  return false;
}

export function assessServiceOrderPut(input: {
  body: unknown;
  role: "admin" | "user";
  fullAccess: boolean;
  permissions: Record<string, unknown>;
  previousStatus?: string | null;
}): ServiceOrderPutDecision {
  const body = input.body && typeof input.body === "object" && !Array.isArray(input.body)
    ? (input.body as Record<string, unknown>)
    : {};
  const known = new Set<string>(SERVICE_ORDER_PUT_FIELDS);
  const fields = Object.keys(body).filter((key) => known.has(key) && body[key] !== undefined);
  if (input.role === "admin" || input.fullAccess) return { ok: true, fields };
  const denied = fields.filter(
    (field) => !fieldAllowed(field, body[field], input.permissions, input.previousStatus)
  );
  if (denied.length > 0) return { ok: false, fields: denied };
  return { ok: true, fields };
}
