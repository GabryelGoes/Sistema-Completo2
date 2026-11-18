/**
 * SEC-03.27.1 — o agregado da Home continua para qualquer sessão da oficina.
 * Diagnóstico, nome do cliente e o nome de quem verificou ficam com quem já
 * lê orçamentos. Banners usam veículo, placa, horário e a assinatura.
 */

export const BUDGET_AGGREGATE_SHARED_KEYS = [
  "budgetId",
  "serviceOrderId",
  "createdAt",
  "updatedAt",
  "contentSignature",
  "approvalFingerprint",
  "cardName",
  "servicesCount",
  "partsCount",
  "plate",
  "vehicleModel",
  "vehicleBrand",
  "osNumber",
  "orderStatus",
  "orderType",
  "moduleIdentification",
  "hasApprovedItems",
  "hasExplicitApprovalDecisions",
  "approvedItemsCount",
  "rejectedItemsCount",
  "pendingItemsCount",
  "isVerified",
  "verifiedAt",
  "lastActorName",
  "lastActorPhotoUrl",
  "lastActorUserId",
  "verifiedByPhotoUrl",
] as const;

const SHARED = new Set<string>(BUDGET_AGGREGATE_SHARED_KEYS);

export function projectBudgetAggregateItem(
  item: Record<string, unknown>,
  detailed: boolean
): Record<string, unknown> {
  if (detailed) return item;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item)) {
    if (SHARED.has(key)) out[key] = value;
  }
  return out;
}
