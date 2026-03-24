import type { TabId } from "../components/TabBar";
import {
  getServiceOrders,
  getServiceOrderById,
  updateServiceOrderStatus,
  type ServiceOrderUpdateActor,
  type ServiceOrderType,
} from "./apiService";
import {
  ALL_STATUSES,
  type ServiceOrderStatus,
} from "../constants/serviceOrderStages";

export function isValidServiceOrderStatus(s: string): s is ServiceOrderStatus {
  return (ALL_STATUSES as readonly string[]).includes(s);
}

function normalizePlate(p: string): string {
  return String(p || "")
    .replace(/\s/g, "")
    .toUpperCase();
}

/** Resolve UUID da OS a partir de id, número ou placa (reutilizado por outras ferramentas do assistente). */
export async function resolveServiceOrderId(opts: {
  service_order_id?: string;
  os_number?: number;
  plate?: string | null;
}): Promise<string | null> {
  const uuid = typeof opts.service_order_id === "string" ? opts.service_order_id.trim() : "";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)) {
    return uuid;
  }
  if (typeof opts.os_number === "number" && Number.isFinite(opts.os_number)) {
    for (const ot of ["vehicle", "module"] as const) {
      const orders = await getServiceOrders(undefined, ot);
      const hit = orders.find((o) => o.os_number === opts.os_number);
      if (hit) return hit.id;
    }
    return null;
  }
  const pl = opts.plate != null && String(opts.plate).trim() !== "" ? normalizePlate(String(opts.plate)) : "";
  if (pl) {
    const orders = await getServiceOrders(undefined, "vehicle");
    const hit = orders.find((o) => normalizePlate(o.plate || "") === pl);
    return hit?.id ?? null;
  }
  return null;
}

export async function listVehiclesInStageJson(
  status: string,
  orderType: ServiceOrderType
): Promise<string> {
  if (!isValidServiceOrderStatus(status)) {
    return JSON.stringify({ ok: false, error: "Status inválido. Use o ID da etapa (ex.: EM_SERVICO)." });
  }
  try {
    const orders = await getServiceOrders(status, orderType);
    const veiculos = orders.map((o) => ({
      id: o.id,
      os_number: o.os_number ?? null,
      plate: o.plate,
      module_identification: o.module_identification,
      vehicle_model: o.vehicle_model,
      cliente: o.customer_name ?? o.customers?.name ?? null,
      status: o.status,
    }));
    return JSON.stringify({
      ok: true,
      etapa: status,
      tipo: orderType,
      total: veiculos.length,
      ordens: veiculos,
    });
  } catch (e) {
    return JSON.stringify({
      ok: false,
      error: e instanceof Error ? e.message : "Falha ao listar ordens.",
    });
  }
}

export async function updateServiceOrderStageJson(
  newStatus: ServiceOrderStatus,
  opts: {
    service_order_id?: string;
    os_number?: number;
    plate?: string | null;
  },
  allowedTabs: TabId[],
  actor?: ServiceOrderUpdateActor
): Promise<string> {
  if (!isValidServiceOrderStatus(newStatus)) {
    return JSON.stringify({ ok: false, error: "Status de destino inválido." });
  }
  try {
    const id = await resolveServiceOrderId(opts);
    if (!id) {
      return JSON.stringify({
        ok: false,
        error:
          "Ordem não encontrada. Informe service_order_id (UUID), ou os_number, ou plate (veículo).",
      });
    }
    const detail = await getServiceOrderById(id);
    const ot: ServiceOrderType = detail.order_type === "module" ? "module" : "vehicle";
    if (ot === "vehicle" && !allowedTabs.includes("patio")) {
      return JSON.stringify({
        ok: false,
        error: "Sem acesso ao Pátio para alterar esta OS.",
      });
    }
    if (ot === "module" && !allowedTabs.includes("laboratorio")) {
      return JSON.stringify({
        ok: false,
        error: "Sem acesso ao Laboratório para alterar esta OS.",
      });
    }
    await updateServiceOrderStatus(id, newStatus, actor);
    return JSON.stringify({
      ok: true,
      service_order_id: id,
      novo_status: newStatus,
      tipo: ot,
    });
  } catch (e) {
    return JSON.stringify({
      ok: false,
      error: e instanceof Error ? e.message : "Falha ao atualizar etapa.",
    });
  }
}
