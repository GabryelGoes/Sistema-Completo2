/**
 * Separação canônica Pátio × Laboratório no RDA Intelligence.
 * Não confundir com peças/módulos ABS cadastrados em `workshop_parts` (estoque).
 */

export const RDA_ORDER_TYPE_PATIO = "vehicle" as const;
export const RDA_ORDER_TYPE_LAB = "module" as const;

export type RdaServiceOrderType =
  | typeof RDA_ORDER_TYPE_PATIO
  | typeof RDA_ORDER_TYPE_LAB;

export type RdaWorkshopSector = "patio" | "laboratorio";

export function sectorToOrderType(sector: RdaWorkshopSector): RdaServiceOrderType {
  return sector === "laboratorio" ? RDA_ORDER_TYPE_LAB : RDA_ORDER_TYPE_PATIO;
}

export function orderTypeToSector(orderType: unknown): RdaWorkshopSector {
  return String(orderType || "").toLowerCase() === RDA_ORDER_TYPE_LAB
    ? "laboratorio"
    : "patio";
}

export function parseSectorParam(
  value: unknown
): RdaWorkshopSector | "all" | null {
  if (value == null || value === "") return null;
  const raw = String(value).trim().toLowerCase();
  if (raw === "all" || raw === "oficina" || raw === "ambos") return "all";
  if (
    raw === "patio" ||
    raw === "pátio" ||
    raw === "veiculo" ||
    raw === "veículo" ||
    raw === "vehicle"
  ) {
    return "patio";
  }
  if (
    raw === "laboratorio" ||
    raw === "laboratório" ||
    raw === "lab" ||
    raw === "module" ||
    raw === "modulo" ||
    raw === "módulo"
  ) {
    return "laboratorio";
  }
  return null;
}

/** Rótulo humano do setor para respostas/alertas. */
export function sectorLabel(sector: RdaWorkshopSector): string {
  return sector === "laboratorio" ? "Laboratório" : "Pátio";
}
