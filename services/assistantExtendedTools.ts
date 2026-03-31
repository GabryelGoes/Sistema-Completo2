import type { TabId } from "../components/TabBar";
import { Customer } from "../types";
import { CANCELLED_STATUS, SERVICE_ORDER_STAGES } from "../constants/serviceOrderStages";
import {
  addServiceOrderComment,
  createAppointment,
  createServiceOrderBudget,
  getAppointments,
  getCustomers,
  getServiceOrderById,
  getServiceOrderBudgets,
  getServiceOrderComments,
  getServiceOrders,
  getSystemUserTechnicians,
  saveReceptionIntake,
  updateServiceOrderBudget,
  updateServiceOrderDescription,
  updateServiceOrderStatus,
  updateServiceOrderTechnician,
  type ServiceOrderListItem,
  type ServiceOrderUpdateActor,
  type ServiceOrderType,
} from "./apiService";
import { listVehiclesInStageJson, resolveServiceOrderId } from "./assistantPatioTools";
import { ASSISTANT_NAME } from "../constants/assistant";
import type { RelaySessionRole } from "../assistantOpenAiTools";

export type { RelaySessionRole };

export interface AssistantContext {
  allowedTabs: TabId[];
  serviceOrderActor?: ServiceOrderUpdateActor;
  authorDisplayName: string;
  commentActor: "admin" | "technician";
  currentTechnicianUserId?: string | null;
  /** Recados gerência ↔ técnicos (Zaya); `none` desativa as ferramentas de recado. */
  relaySessionRole?: RelaySessionRole;
  /** Sessão login admin (Gerência): ferramentas sensíveis da TV / meta semanal. */
  isAdminSession?: boolean;
}

function norm(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function stageName(status: string): string {
  return SERVICE_ORDER_STAGES.find((x) => x.id === status)?.name ?? status;
}

function canAccessOsTools(allowedTabs: TabId[]): boolean {
  return allowedTabs.includes("patio") || allowedTabs.includes("laboratorio");
}

async function fetchAllNonCancelled(): Promise<ServiceOrderListItem[]> {
  const v = await getServiceOrders(undefined, "vehicle");
  const m = await getServiceOrders(undefined, "module");
  return [...v, ...m].filter((o) => o.status !== CANCELLED_STATUS);
}

/** Veículo + módulo, inclusive arquivados (CANCELLED), para busca textual da assistente. */
async function fetchAllOrdersForAssistantSearch(): Promise<ServiceOrderListItem[]> {
  const v = await getServiceOrders(undefined, "vehicle");
  const m = await getServiceOrders(undefined, "module");
  const byId = new Map<string, ServiceOrderListItem>();
  for (const o of [...v, ...m]) byId.set(o.id, o);
  return Array.from(byId.values());
}

export async function addServiceOrderCommentJson(
  payload: {
    text: string;
    service_order_id?: string;
    os_number?: number;
    plate?: string | null;
  },
  ctx: AssistantContext
): Promise<string> {
  if (!canAccessOsTools(ctx.allowedTabs)) {
    return JSON.stringify({ ok: false, error: "Sem acesso ao Pátio/Laboratório." });
  }
  const text = String(payload.text ?? "").trim();
  if (!text) {
    return JSON.stringify({ ok: false, error: "Texto do comentário vazio." });
  }
  try {
    const id = await resolveServiceOrderId({
      service_order_id: payload.service_order_id,
      os_number: payload.os_number,
      plate: payload.plate,
    });
    if (!id) {
      return JSON.stringify({ ok: false, error: "OS não encontrada (id, número ou placa)." });
    }
    const detail = await getServiceOrderById(id);
    const ot: ServiceOrderType = detail.order_type === "module" ? "module" : "vehicle";
    if (ot === "vehicle" && !ctx.allowedTabs.includes("patio")) {
      return JSON.stringify({ ok: false, error: "Sem acesso ao Pátio para esta OS." });
    }
    if (ot === "module" && !ctx.allowedTabs.includes("laboratorio")) {
      return JSON.stringify({ ok: false, error: "Sem acesso ao Laboratório para esta OS." });
    }
    const c = await addServiceOrderComment(
      id,
      text,
      ctx.authorDisplayName || "Usuário",
      ctx.commentActor
    );
    return JSON.stringify({
      ok: true,
      comment_id: c.id,
      service_order_id: id,
    });
  } catch (e) {
    return JSON.stringify({
      ok: false,
      error: e instanceof Error ? e.message : "Falha ao comentar.",
    });
  }
}

export async function getServiceOrderCommentsJson(
  payload: { service_order_id?: string; os_number?: number; plate?: string | null },
  ctx: AssistantContext
): Promise<string> {
  if (!canAccessOsTools(ctx.allowedTabs)) {
    return JSON.stringify({ ok: false, error: "Sem acesso ao Pátio/Laboratório." });
  }
  try {
    const id = await resolveServiceOrderId({
      service_order_id: payload.service_order_id,
      os_number: payload.os_number,
      plate: payload.plate,
    });
    if (!id) {
      return JSON.stringify({ ok: false, error: "OS não encontrada." });
    }
    const list = await getServiceOrderComments(id);
    return JSON.stringify({
      ok: true,
      service_order_id: id,
      total: list.length,
      comentarios: list.map((x) => ({
        autor: x.author_display_name,
        texto: x.text,
        criado_em: x.created_at,
      })),
    });
  } catch (e) {
    return JSON.stringify({
      ok: false,
      error: e instanceof Error ? e.message : "Falha ao ler comentários.",
    });
  }
}

export async function listOrdersByTechnicianJson(
  payload: {
    only_mine?: boolean;
    technician_user_id?: string;
    technician_name_search?: string;
  },
  ctx: AssistantContext
): Promise<string> {
  if (!canAccessOsTools(ctx.allowedTabs)) {
    return JSON.stringify({ ok: false, error: "Sem acesso ao Pátio/Laboratório." });
  }
  const mine = payload.only_mine === true;
  const tid = typeof payload.technician_user_id === "string" ? payload.technician_user_id.trim() : "";
  const nameHint =
    typeof payload.technician_name_search === "string" ? payload.technician_name_search.trim() : "";

  if (!mine && !tid && !nameHint) {
    return JSON.stringify({
      ok: false,
      error:
        "Informe only_mine=true, ou technician_user_id (UUID), ou technician_name_search (parte do nome).",
    });
  }

  let filterId: string | null = null;
  if (mine) {
    if (!ctx.currentTechnicianUserId) {
      return JSON.stringify({
        ok: false,
        error: "Não foi possível identificar o técnico logado para 'minhas OS'.",
      });
    }
    filterId = ctx.currentTechnicianUserId;
  } else if (tid) {
    filterId = tid;
  } else if (nameHint) {
    try {
      const techs = await getSystemUserTechnicians();
      const h = norm(nameHint);
      const match = techs.find(
        (t) =>
          norm(t.display_name || "").includes(h) ||
          norm(t.username || "").includes(h) ||
          t.id.toLowerCase() === nameHint.toLowerCase()
      );
      if (!match) {
        return JSON.stringify({
          ok: false,
          error: `Nenhum técnico encontrado para "${nameHint}".`,
        });
      }
      filterId = match.id;
    } catch (e) {
      return JSON.stringify({
        ok: false,
        error: e instanceof Error ? e.message : "Falha ao listar técnicos.",
      });
    }
  }

  try {
    const orders = await fetchAllNonCancelled();
    const hit = orders.filter((o) => o.assigned_technician === filterId);
    const rows = hit.slice(0, 80).map((o) => ({
      os_number: o.os_number ?? null,
      id: o.id,
      placa: o.plate,
      modulo: o.module_identification,
      modelo: o.vehicle_model,
      cliente: o.customer_name ?? o.customers?.name ?? null,
      etapa: stageName(o.status),
      status_id: o.status,
      tipo: o.order_type === "module" ? "module" : "vehicle",
    }));
    return JSON.stringify({
      ok: true,
      tecnico_id: filterId,
      total: hit.length,
      amostra: rows,
    });
  } catch (e) {
    return JSON.stringify({
      ok: false,
      error: e instanceof Error ? e.message : "Falha ao listar OS.",
    });
  }
}

export async function listUpcomingDeliveriesJson(
  payload: { days_ahead?: number },
  ctx: AssistantContext
): Promise<string> {
  if (!canAccessOsTools(ctx.allowedTabs)) {
    return JSON.stringify({ ok: false, error: "Sem acesso ao Pátio/Laboratório." });
  }
  const days = typeof payload.days_ahead === "number" && payload.days_ahead > 0 ? Math.min(payload.days_ahead, 90) : 14;
  try {
    const orders = await fetchAllNonCancelled();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const limit = new Date(today);
    limit.setDate(limit.getDate() + days);

    type Row = {
      os_number: number | null;
      id: string;
      placa: string | null;
      modelo: string | null;
      cliente: string | null;
      entrega: string | null;
      etapa: string;
      atrasado: boolean;
    };

    const upcoming: Row[] = [];
    const overdue: Row[] = [];

    for (const o of orders) {
      if (!o.delivery_date || String(o.delivery_date).trim() === "") continue;
      const d = new Date(o.delivery_date);
      if (Number.isNaN(d.getTime())) continue;
      d.setHours(0, 0, 0, 0);
      const row: Row = {
        os_number: o.os_number ?? null,
        id: o.id,
        placa: o.plate,
        modelo: o.vehicle_model,
        cliente: o.customer_name ?? o.customers?.name ?? null,
        entrega: String(o.delivery_date).slice(0, 10),
        etapa: stageName(o.status),
        atrasado: d < today,
      };
      if (d < today) overdue.push(row);
      else if (d >= today && d <= limit) upcoming.push(row);
    }

    upcoming.sort((a, b) => String(a.entrega).localeCompare(String(b.entrega)));
    overdue.sort((a, b) => String(a.entrega).localeCompare(String(b.entrega)));

    return JSON.stringify({
      ok: true,
      janela_dias: days,
      proximas_entregas: upcoming.slice(0, 60),
      atrasadas: overdue.slice(0, 40),
    });
  } catch (e) {
    return JSON.stringify({
      ok: false,
      error: e instanceof Error ? e.message : "Falha ao listar entregas.",
    });
  }
}

export async function searchServiceOrdersJson(
  payload: { query: string },
  ctx: AssistantContext
): Promise<string> {
  if (!canAccessOsTools(ctx.allowedTabs)) {
    return JSON.stringify({ ok: false, error: "Sem acesso ao Pátio/Laboratório." });
  }
  const q = norm(payload.query ?? "");
  if (q.length < 2) {
    return JSON.stringify({ ok: false, error: "Use ao menos 2 caracteres na busca." });
  }
  try {
    const orders = await fetchAllOrdersForAssistantSearch();
    const hit = orders.filter((o) => {
      const parts = [
        o.plate,
        o.vehicle_model,
        o.module_identification,
        o.customer_name,
        o.customers?.name,
        o.os_number != null ? String(o.os_number) : "",
        o.issue_description,
      ]
        .filter(Boolean)
        .map((x) => norm(String(x)));
      return parts.some((p) => p.includes(q));
    });
    const rows = hit.slice(0, 40).map((o) => ({
      os_number: o.os_number ?? null,
      id: o.id,
      placa: o.plate,
      modelo: o.vehicle_model,
      cliente: o.customer_name ?? o.customers?.name ?? null,
      etapa:
        o.status === CANCELLED_STATUS ? "Entregue/arquivado" : stageName(o.status),
      status_id: o.status,
      arquivada: o.status === CANCELLED_STATUS,
    }));
    return JSON.stringify({ ok: true, total_encontrado: hit.length, ordens: rows });
  } catch (e) {
    return JSON.stringify({
      ok: false,
      error: e instanceof Error ? e.message : "Falha na busca.",
    });
  }
}

export async function getServiceOrderBudgetsJson(
  payload: { service_order_id?: string; os_number?: number; plate?: string | null },
  ctx: AssistantContext
): Promise<string> {
  if (!canAccessOsTools(ctx.allowedTabs)) {
    return JSON.stringify({ ok: false, error: "Sem acesso ao Pátio/Laboratório." });
  }
  try {
    const id = await resolveServiceOrderId(payload);
    if (!id) {
      return JSON.stringify({ ok: false, error: "OS não encontrada." });
    }
    const budgets = await getServiceOrderBudgets(id);
    return JSON.stringify({
      ok: true,
      service_order_id: id,
      total: budgets.length,
      orcamentos: budgets.map((b) => ({
        id: b.id,
        nome: b.cardName,
        diagnostico: b.diagnosis,
        servicos: b.services,
        pecas: b.parts,
        observacoes: b.observations,
        criado_em: b.createdAt,
      })),
    });
  } catch (e) {
    return JSON.stringify({
      ok: false,
      error: e instanceof Error ? e.message : "Falha ao listar orçamentos.",
    });
  }
}

export async function createServiceOrderBudgetSimpleJson(
  payload: {
    service_order_id?: string;
    os_number?: number;
    plate?: string | null;
    card_name?: string;
    diagnosis: string;
    service_description: string;
    parts?: { description: string; quantity: string }[];
    observations?: string;
  },
  ctx: AssistantContext
): Promise<string> {
  if (!canAccessOsTools(ctx.allowedTabs)) {
    return JSON.stringify({ ok: false, error: "Sem acesso ao Pátio/Laboratório." });
  }
  try {
    const id = await resolveServiceOrderId(payload);
    if (!id) {
      return JSON.stringify({ ok: false, error: "OS não encontrada." });
    }
    const diagnosis = String(payload.diagnosis ?? "").trim();
    const svc = String(payload.service_description ?? "").trim();
    if (!diagnosis || !svc) {
      return JSON.stringify({ ok: false, error: "diagnosis e service_description são obrigatórios." });
    }
    const parts = Array.isArray(payload.parts) ? payload.parts : [];
    const b = await createServiceOrderBudget(
      id,
      {
        cardName: (payload.card_name && String(payload.card_name).trim()) || `Orçamento (${ASSISTANT_NAME})`,
        diagnosis,
        services: [{ description: svc }],
        parts: parts.map((p) => ({
          description: String(p.description ?? "").trim() || "Peça",
          quantity: String(p.quantity ?? "1").trim() || "1",
        })),
        observations: String(payload.observations ?? "").trim(),
      },
      ctx.serviceOrderActor
    );
    return JSON.stringify({
      ok: true,
      orcamento_id: b.id,
      service_order_id: id,
    });
  } catch (e) {
    return JSON.stringify({
      ok: false,
      error: e instanceof Error ? e.message : "Falha ao criar orçamento.",
    });
  }
}

export async function updateServiceOrderBudgetJson(
  payload: {
    budget_id: string;
    service_order_id?: string;
    os_number?: number;
    plate?: string | null;
    card_name?: string;
    diagnosis?: string;
    services?: { description: string; approved?: boolean }[];
    parts?: { description: string; quantity: string; approved?: boolean }[];
    observations?: string;
  },
  ctx: AssistantContext
): Promise<string> {
  if (!canAccessOsTools(ctx.allowedTabs)) {
    return JSON.stringify({ ok: false, error: "Sem acesso ao Pátio/Laboratório." });
  }

  const budgetId = String(payload.budget_id ?? "").trim();
  if (!budgetId) {
    return JSON.stringify({ ok: false, error: "budget_id é obrigatório." });
  }

  try {
    const id = await resolveServiceOrderId({
      service_order_id: payload.service_order_id,
      os_number: payload.os_number,
      plate: payload.plate,
    });
    if (!id) {
      return JSON.stringify({
        ok: false,
        error: "OS não encontrada. Informe service_order_id (UUID), os_number ou plate.",
      });
    }

    const detail = await getServiceOrderById(id);
    const ot: ServiceOrderType = detail.order_type === "module" ? "module" : "vehicle";
    if (ot === "vehicle" && !ctx.allowedTabs.includes("patio")) {
      return JSON.stringify({ ok: false, error: "Sem acesso ao Pátio para esta OS." });
    }
    if (ot === "module" && !ctx.allowedTabs.includes("laboratorio")) {
      return JSON.stringify({ ok: false, error: "Sem acesso ao Laboratório para esta OS." });
    }

    const budgets = await getServiceOrderBudgets(id);
    const existing = budgets.find((b) => b.id === budgetId);
    if (!existing) {
      return JSON.stringify({ ok: false, error: "Orçamento não encontrado nesta OS." });
    }

    const nextCardName = typeof payload.card_name === "string" ? payload.card_name : existing.cardName;
    const nextDiagnosis = typeof payload.diagnosis === "string" ? payload.diagnosis : existing.diagnosis;
    const nextObservations =
      typeof payload.observations === "string" ? payload.observations : existing.observations;

    const services =
      Array.isArray(payload.services)
        ? payload.services
            .map((s, i) => {
              const description = String(s?.description ?? "").trim();
              if (!description) return null;
              const approved =
                typeof s?.approved === "boolean" ? s.approved : existing.services[i]?.approved;
              return { description, approved };
            })
            .filter(Boolean)
        : existing.services.map((s) => ({ description: s.description, approved: s.approved }));

    const parts =
      Array.isArray(payload.parts)
        ? payload.parts
            .map((p, i) => {
              const description = String(p?.description ?? "").trim();
              if (!description) return null;
              const quantity = String(p?.quantity ?? existing.parts[i]?.quantity ?? "1").trim() || "1";
              const approved =
                typeof p?.approved === "boolean" ? p.approved : existing.parts[i]?.approved;
              return { description, quantity, approved };
            })
            .filter(Boolean)
        : existing.parts.map((p) => ({ description: p.description, quantity: p.quantity, approved: p.approved }));

    const updated = await updateServiceOrderBudget(
      id,
      budgetId,
      {
        cardName: nextCardName ?? "",
        diagnosis: nextDiagnosis ?? "",
        services,
        parts,
        observations: nextObservations ?? "",
      },
      ctx.serviceOrderActor
    );

    return JSON.stringify({
      ok: true,
      orcamento_id: updated.id,
      service_order_id: id,
    });
  } catch (e) {
    return JSON.stringify({
      ok: false,
      error: e instanceof Error ? e.message : "Falha ao atualizar orçamento.",
    });
  }
}

export async function addServiceOrderBudgetItemsJson(
  payload: {
    budget_id: string;
    service_order_id?: string;
    os_number?: number;
    plate?: string | null;
    services_to_add?: { description: string }[];
    parts_to_add?: { description: string; quantity?: string }[];
    card_name?: string;
    diagnosis?: string;
    observations?: string;
  },
  ctx: AssistantContext
): Promise<string> {
  if (!canAccessOsTools(ctx.allowedTabs)) {
    return JSON.stringify({ ok: false, error: "Sem acesso ao Pátio/Laboratório." });
  }

  const budgetId = String(payload.budget_id ?? "").trim();
  if (!budgetId) {
    return JSON.stringify({ ok: false, error: "budget_id é obrigatório." });
  }

  try {
    const id = await resolveServiceOrderId({
      service_order_id: payload.service_order_id,
      os_number: payload.os_number,
      plate: payload.plate,
    });
    if (!id) {
      return JSON.stringify({
        ok: false,
        error: "OS não encontrada. Informe service_order_id (UUID), os_number ou plate.",
      });
    }

    const detail = await getServiceOrderById(id);
    const ot: ServiceOrderType = detail.order_type === "module" ? "module" : "vehicle";
    if (ot === "vehicle" && !ctx.allowedTabs.includes("patio")) {
      return JSON.stringify({ ok: false, error: "Sem acesso ao Pátio para esta OS." });
    }
    if (ot === "module" && !ctx.allowedTabs.includes("laboratorio")) {
      return JSON.stringify({ ok: false, error: "Sem acesso ao Laboratório para esta OS." });
    }

    const budgets = await getServiceOrderBudgets(id);
    const existing = budgets.find((b) => b.id === budgetId);
    if (!existing) {
      return JSON.stringify({ ok: false, error: "Orçamento não encontrado nesta OS." });
    }

    const servicesToAdd = Array.isArray(payload.services_to_add) ? payload.services_to_add : [];
    const partsToAdd = Array.isArray(payload.parts_to_add) ? payload.parts_to_add : [];

    if (servicesToAdd.length === 0 && partsToAdd.length === 0) {
      return JSON.stringify({
        ok: false,
        error: "Nada para adicionar: informe services_to_add e/ou parts_to_add.",
      });
    }

    const nextCardName = typeof payload.card_name === "string" ? payload.card_name : existing.cardName;
    const nextDiagnosis = typeof payload.diagnosis === "string" ? payload.diagnosis : existing.diagnosis;
    const nextObservations =
      typeof payload.observations === "string" ? payload.observations : existing.observations;

    const baseServices = existing.services.map((s) => ({ description: s.description, approved: s.approved }));
    const addedServices = servicesToAdd
      .map((s) => {
        const description = String(s?.description ?? "").trim();
        return description ? { description, approved: undefined as boolean | undefined } : null;
      })
      .filter(Boolean) as { description: string; approved?: boolean }[];

    const baseParts = existing.parts.map((p) => ({
      description: p.description,
      quantity: p.quantity,
      approved: p.approved,
    }));
    const addedParts = partsToAdd
      .map((p) => {
        const description = String(p?.description ?? "").trim();
        if (!description) return null;
        const quantity = String(p?.quantity ?? "1").trim() || "1";
        return { description, quantity, approved: undefined as boolean | undefined };
      })
      .filter(Boolean) as { description: string; quantity: string; approved?: boolean }[];

    const updated = await updateServiceOrderBudget(
      id,
      budgetId,
      {
        cardName: nextCardName ?? "",
        diagnosis: nextDiagnosis ?? "",
        services: [...baseServices, ...addedServices],
        parts: [...baseParts, ...addedParts],
        observations: nextObservations ?? "",
      },
      ctx.serviceOrderActor
    );

    return JSON.stringify({
      ok: true,
      orcamento_id: updated.id,
      service_order_id: id,
    });
  } catch (e) {
    return JSON.stringify({
      ok: false,
      error: e instanceof Error ? e.message : "Falha ao adicionar itens ao orçamento.",
    });
  }
}

export async function listAppointmentsJson(ctx: AssistantContext): Promise<string> {
  if (!ctx.allowedTabs.includes("agenda")) {
    return JSON.stringify({ ok: false, error: "Sem acesso à Agenda." });
  }
  try {
    const list = await getAppointments();
    return JSON.stringify({
      ok: true,
      total: list.length,
      agendamentos: list.slice(0, 80).map((a) => ({
        id: a.id,
        titulo: a.title,
        cliente: a.customerName,
        telefone: a.phone,
        veiculo: a.vehicleModel,
        placa: a.plate,
        data: a.date,
        horario: a.time,
        status: a.status,
        observacoes: a.notes,
      })),
    });
  } catch (e) {
    return JSON.stringify({
      ok: false,
      error: e instanceof Error ? e.message : "Falha ao listar agenda.",
    });
  }
}

export async function createAppointmentJson(
  payload: {
    title: string;
    customer_name: string;
    phone?: string;
    vehicle_model: string;
    plate: string;
    date: string;
    time: string;
    notes?: string;
  },
  ctx: AssistantContext
): Promise<string> {
  if (!ctx.allowedTabs.includes("agenda")) {
    return JSON.stringify({ ok: false, error: "Sem acesso à Agenda." });
  }
  try {
    const dateStr = String(payload.date ?? "").trim();
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) {
      return JSON.stringify({
        ok: false,
        error: "Data inválida. Use formato ISO (AAAA-MM-DD).",
      });
    }
    const a = await createAppointment({
      title: String(payload.title ?? "").trim() || "Agendamento",
      customerName: String(payload.customer_name ?? "").trim(),
      phone: payload.phone,
      vehicleModel: String(payload.vehicle_model ?? "").trim(),
      plate: String(payload.plate ?? "").trim(),
      notes: payload.notes,
      date: d,
      time: String(payload.time ?? "").trim() || "08:00",
      status: "scheduled",
    });
    return JSON.stringify({ ok: true, id: a.id, titulo: a.title });
  } catch (e) {
    return JSON.stringify({
      ok: false,
      error: e instanceof Error ? e.message : "Falha ao criar agendamento.",
    });
  }
}

export async function countOrdersByStageJson(ctx: AssistantContext): Promise<string> {
  if (!canAccessOsTools(ctx.allowedTabs)) {
    return JSON.stringify({ ok: false, error: "Sem acesso ao Pátio/Laboratório." });
  }
  try {
    const orders = await fetchAllNonCancelled();
    const counts: Record<string, number> = {};
    for (const s of orders) {
      counts[s.status] = (counts[s.status] ?? 0) + 1;
    }
    const resumo = Object.entries(counts).map(([status_id, total]) => ({
      status_id,
      nome: stageName(status_id),
      total,
    }));
    return JSON.stringify({ ok: true, os_abertas_total: orders.length, por_etapa: resumo });
  } catch (e) {
    return JSON.stringify({
      ok: false,
      error: e instanceof Error ? e.message : "Falha ao contar.",
    });
  }
}

export async function countCustomerOpenOrdersJson(
  payload: { customer_name_fragment: string },
  ctx: AssistantContext
): Promise<string> {
  if (!canAccessOsTools(ctx.allowedTabs)) {
    return JSON.stringify({ ok: false, error: "Sem acesso ao Pátio/Laboratório." });
  }
  const frag = norm(payload.customer_name_fragment ?? "");
  if (frag.length < 2) {
    return JSON.stringify({ ok: false, error: "Informe ao menos 2 letras do nome do cliente." });
  }
  try {
    const orders = await fetchAllNonCancelled();
    const hit = orders.filter((o) => {
      const name = norm(o.customer_name ?? o.customers?.name ?? "");
      return name.includes(frag);
    });
    return JSON.stringify({
      ok: true,
      fragmento: payload.customer_name_fragment,
      total_ordens_abertas: hit.length,
      ordens: hit.slice(0, 30).map((o) => ({
        os_number: o.os_number ?? null,
        id: o.id,
        cliente: o.customer_name ?? o.customers?.name,
        placa: o.plate,
        etapa: stageName(o.status),
      })),
    });
  } catch (e) {
    return JSON.stringify({
      ok: false,
      error: e instanceof Error ? e.message : "Falha.",
    });
  }
}

export async function registerCustomerVehicleIntakeJson(
  payload: {
    name: string;
    phone: string;
    vehicle_model: string;
    plate: string;
    issue_description: string;
  },
  ctx: AssistantContext
): Promise<string> {
  if (!ctx.allowedTabs.includes("reception")) {
    return JSON.stringify({ ok: false, error: "Sem acesso à Recepção." });
  }
  const name = String(payload.name ?? "").trim();
  const phone = String(payload.phone ?? "").trim();
  if (!name || !phone) {
    return JSON.stringify({ ok: false, error: "Nome e telefone são obrigatórios." });
  }
  try {
    const customer: Customer = {
      name,
      phone,
      cpf: "",
      cep: "",
      address: "",
      addressNumber: "",
      city: "",
      vehicleModel: String(payload.vehicle_model ?? "").trim(),
      plate: String(payload.plate ?? "")
        .replace(/\s/g, "")
        .toUpperCase(),
      issueDescription: String(payload.issue_description ?? "").trim() || "—",
      email: "",
    };
    if (!customer.plate || customer.plate.length < 5) {
      return JSON.stringify({ ok: false, error: "Placa do veículo inválida." });
    }
    const { customer: c, serviceOrder } = await saveReceptionIntake(customer, "vehicle");
    const so = serviceOrder as { id: string; os_number?: number | null };
    return JSON.stringify({
      ok: true,
      cliente_id: c.id,
      service_order_id: so.id,
      os_number: so.os_number ?? null,
    });
  } catch (e) {
    return JSON.stringify({
      ok: false,
      error: e instanceof Error ? e.message : "Falha ao cadastrar.",
    });
  }
}

/** Lista clientes (nome) para o modelo cruzar com pedidos do usuário. */
export async function searchCustomersJson(
  payload: { query: string },
  ctx: AssistantContext
): Promise<string> {
  if (!ctx.allowedTabs.includes("reception") && !canAccessOsTools(ctx.allowedTabs)) {
    return JSON.stringify({ ok: false, error: "Sem permissão para listar clientes." });
  }
  const q = norm(payload.query ?? "");
  if (q.length < 2) {
    return JSON.stringify({ ok: false, error: "Use ao menos 2 caracteres." });
  }
  try {
    const rows = await getCustomers();
    const hit = rows.filter((r) => norm(r.name).includes(q) || norm(r.phone).includes(q));
    return JSON.stringify({
      ok: true,
      total: hit.length,
      clientes: hit.slice(0, 40).map((c) => ({
        id: c.id,
        nome: c.name,
        telefone: c.phone,
      })),
    });
  } catch (e) {
    return JSON.stringify({
      ok: false,
      error: e instanceof Error ? e.message : "Falha ao buscar clientes.",
    });
  }
}

export type PatioVehicleMatchResult =
  | { kind: "error"; message: string }
  | {
      kind: "ambiguous";
      opcoes: Array<{
        service_order_id: string;
        os_number: number | null;
        placa: string | null;
        veiculo: string | null;
        cliente: string;
      }>;
    }
  | { kind: "single"; order: ServiceOrderListItem };

/** Resolve veículo por nome/modelo. Por padrão só OS em aberto no Pátio; use includeArchived para OS arquivadas (CANCELLED). */
export async function matchPatioVehicleByModel(
  vehicle_model_query: string,
  customer_name_query: string | undefined,
  allowedTabs: TabId[],
  options?: { includeArchived?: boolean }
): Promise<PatioVehicleMatchResult> {
  if (!allowedTabs.includes("patio")) {
    return { kind: "error", message: "Sem acesso ao Pátio." };
  }
  const raw = String(vehicle_model_query ?? "").trim();
  const q = norm(raw);
  if (q.length < 2) {
    return {
      kind: "error",
      message: "Informe o nome ou modelo do veículo (ao menos 2 caracteres).",
    };
  }
  try {
    const orders = await getServiceOrders(undefined, "vehicle");
    const active = orders.filter((o) => o.status !== CANCELLED_STATUS);
    const archived = orders.filter((o) => o.status === CANCELLED_STATUS);
    const includeArchived = options?.includeArchived === true;
    const pool = includeArchived ? archived : active;

    const custRaw = typeof customer_name_query === "string" ? customer_name_query.trim() : "";
    const cq = custRaw ? norm(custRaw) : "";
    if (custRaw && cq.length < 2) {
      return {
        kind: "error",
        message: "Nome do cliente deve ter ao menos 2 letras para filtrar.",
      };
    }

    const matchByVehicle = (pool: ServiceOrderListItem[]) =>
      pool.filter((o) => {
        const vm = norm(o.vehicle_model || "");
        if (!vm) return false;
        return vm.includes(q) || q.includes(vm);
      });

    const applyCustomer = (pool: ServiceOrderListItem[]) => {
      if (cq.length < 2) return pool;
      return pool.filter((o) => {
        const cn = norm(o.customer_name ?? o.customers?.name ?? "");
        return (
          cn.includes(cq) ||
          cq
            .split(/\s+/)
            .filter((w) => w.length >= 2)
            .some((w) => cn.includes(w))
        );
      });
    };

    let matches = applyCustomer(matchByVehicle(pool));
    if (matches.length === 0) {
      if (includeArchived) {
        return {
          kind: "error",
          message: `Nenhum veículo arquivado combina com "${raw}".`,
        };
      }
      return {
        kind: "error",
        message: `Não encontrei nenhum veículo em aberto no Pátio com esse nome. Se o carro estiver arquivado/entregue, diga explicitamente e chame de novo com include_archived: true.`,
      };
    }

    // Em vez de pedir placa ou nome do cliente quando o usuário só falar o nome/modelo,
    // escolhemos automaticamente o registro mais provável.
    const scoreOrder = (o: ServiceOrderListItem) => {
      const vm = norm(o.vehicle_model || "");
      if (!vm) return 0;

      let score = 0;
      if (vm === q) score += 100;
      else if (vm.includes(q) || q.includes(vm)) score += 70;

      const qTokens = q.split(/\s+/).filter((w) => w.length >= 2);
      for (const t of qTokens) {
        if (vm.includes(t)) score += 6;
      }

      return score;
    };

    const best = [...matches].sort((a, b) => {
      const sa = scoreOrder(a);
      const sb = scoreOrder(b);
      if (sb !== sa) return sb - sa;
      const ua = new Date(a.updated_at || a.created_at).getTime();
      const ub = new Date(b.updated_at || b.created_at).getTime();
      return (ub || 0) - (ua || 0);
    })[0]!;

    return { kind: "single", order: best };
  } catch (e) {
    return {
      kind: "error",
      message: e instanceof Error ? e.message : "Falha ao buscar veículo.",
    };
  }
}

/**
 * Resolve OS de veículo no Pátio por nome/modelo; se vários, pede cliente.
 * Retorno com action "open" faz o app abrir o modal (via callback no cliente).
 */
export async function openPatioVehicleModalJson(
  payload: { vehicle_model_query: string; customer_name_query?: string; include_archived?: boolean },
  allowedTabs: TabId[]
): Promise<string> {
  const r = await matchPatioVehicleByModel(
    payload.vehicle_model_query,
    typeof payload.customer_name_query === "string" ? payload.customer_name_query : undefined,
    allowedTabs,
    { includeArchived: payload.include_archived === true }
  );
  if (r.kind === "error") {
    return JSON.stringify({ ok: false, error: r.message });
  }
  if (r.kind === "ambiguous") {
    return JSON.stringify({
      ok: true,
      ambiguous: true,
      pedir_cliente: true,
      mensagem:
        "Há mais de um veículo com esse nome. Pergunte o nome do cliente e use a ferramenta de novo com customer_name_query.",
      opcoes: r.opcoes,
    });
  }
  const o = r.order;
  return JSON.stringify({
    ok: true,
    action: "open",
    service_order_id: o.id,
    os_number: o.os_number ?? null,
    plate: o.plate,
    vehicle_model: o.vehicle_model,
    cliente: o.customer_name ?? o.customers?.name ?? null,
    os_arquivada: o.status === CANCELLED_STATUS,
  });
}

/**
 * Abre o Pátio no modal do veículo e exibe o modal de leitura do orçamento.
 * Vários orçamentos na mesma OS: retorna ambiguous com lista (índice 1 = mais recente) ou use budget_id / budget_index.
 */
export async function openPatioVehicleBudgetViewJson(
  payload: {
    vehicle_model_query: string;
    customer_name_query?: string;
    include_archived?: boolean;
    budget_id?: string;
    budget_index?: number | string;
  },
  allowedTabs: TabId[]
): Promise<string> {
  const r = await matchPatioVehicleByModel(
    payload.vehicle_model_query,
    typeof payload.customer_name_query === "string" ? payload.customer_name_query : undefined,
    allowedTabs,
    { includeArchived: payload.include_archived === true }
  );
  if (r.kind === "error") {
    return JSON.stringify({ ok: false, error: r.message });
  }
  if (r.kind === "ambiguous") {
    return JSON.stringify({
      ok: true,
      ambiguous: true,
      pedir_cliente: true,
      mensagem:
        "Há mais de um veículo com esse nome. Pergunte o nome do cliente e use a ferramenta de novo com customer_name_query.",
      opcoes: r.opcoes,
    });
  }
  try {
    const osArquivada = r.order.status === CANCELLED_STATUS;
    const budgets = await getServiceOrderBudgets(r.order.id);
    if (budgets.length === 0) {
      return JSON.stringify({ ok: false, error: "Esta OS não tem orçamentos salvos." });
    }
    const sorted = [...budgets].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const bidRaw = typeof payload.budget_id === "string" ? payload.budget_id.trim() : "";
    const idxRaw = payload.budget_index;
    const idx =
      typeof idxRaw === "number" && Number.isFinite(idxRaw)
        ? idxRaw
        : typeof idxRaw === "string" && String(idxRaw).trim() !== ""
          ? parseInt(String(idxRaw).trim(), 10)
          : NaN;

    if (sorted.length === 1) {
      const b = sorted[0]!;
      return JSON.stringify({
        ok: true,
        action: "open_budget",
        service_order_id: r.order.id,
        budget_id: b.id,
        resumo: b.cardName,
        os_arquivada: osArquivada,
      });
    }

    if (bidRaw) {
      const b = sorted.find((x) => x.id === bidRaw);
      if (!b) {
        return JSON.stringify({ ok: false, error: "Orçamento não encontrado nesta OS." });
      }
      return JSON.stringify({
        ok: true,
        action: "open_budget",
        service_order_id: r.order.id,
        budget_id: b.id,
        resumo: b.cardName,
        os_arquivada: osArquivada,
      });
    }

    if (Number.isFinite(idx) && idx >= 1 && idx <= sorted.length) {
      const b = sorted[idx - 1]!;
      return JSON.stringify({
        ok: true,
        action: "open_budget",
        service_order_id: r.order.id,
        budget_id: b.id,
        resumo: b.cardName,
        os_arquivada: osArquivada,
      });
    }

    return JSON.stringify({
      ok: true,
      ambiguous: true,
      pedir_orcamento: true,
      mensagem:
        "Há mais de um orçamento nesta OS. Pergunte qual o usuário deseja ver ou use budget_index (1 = mais recente) ou budget_id.",
      orcamentos: sorted.map((b, i) => ({
        indice: i + 1,
        budget_id: b.id,
        nome: b.cardName,
        criado_em: b.createdAt,
      })),
    });
  } catch (e) {
    return JSON.stringify({
      ok: false,
      error: e instanceof Error ? e.message : "Falha ao listar orçamentos.",
    });
  }
}

/** Lê o campo queixa do cliente (issue_description) da OS localizada pelo modelo do veículo. Somente leitura. */
export async function getCustomerComplaintForVehicleJson(
  payload: {
    vehicle_model_query: string;
    customer_name_query?: string;
    include_archived?: boolean;
  },
  ctx: AssistantContext
): Promise<string> {
  const r = await matchPatioVehicleByModel(
    payload.vehicle_model_query,
    typeof payload.customer_name_query === "string" ? payload.customer_name_query : undefined,
    ctx.allowedTabs,
    { includeArchived: payload.include_archived === true }
  );
  if (r.kind === "error") {
    return JSON.stringify({ ok: false, error: r.message });
  }
  if (r.kind === "ambiguous") {
    return JSON.stringify({
      ok: true,
      ambiguous: true,
      pedir_cliente: true,
      mensagem:
        "Há mais de um veículo com esse nome. Pergunte o nome do cliente e chame a ferramenta de novo com customer_name_query.",
      opcoes: r.opcoes,
    });
  }
  try {
    const detail = await getServiceOrderById(r.order.id);
    const queixa = (detail.issue_description ?? "").trim();
    const cliente =
      detail.customers?.name ?? r.order.customer_name ?? r.order.customers?.name ?? null;
    return JSON.stringify({
      ok: true,
      service_order_id: r.order.id,
      os_number: r.order.os_number ?? null,
      placa: r.order.plate,
      veiculo_modelo: r.order.vehicle_model,
      cliente,
      queixa_do_cliente: queixa || null,
      os_arquivada: r.order.status === CANCELLED_STATUS,
      leitura_apenas: r.order.status === CANCELLED_STATUS,
    });
  } catch (e) {
    return JSON.stringify({
      ok: false,
      error: e instanceof Error ? e.message : "Falha ao carregar a queixa.",
    });
  }
}

/** Acrescenta texto ao campo queixa do cliente (issue_description) da OS encontrada pelo modelo do carro. Nunca substitui o que já existia — só concatena ao final. */
export async function appendComplaintToVehicleJson(
  payload: {
    complaint_text: string;
    vehicle_model_query: string;
    customer_name_query?: string;
    include_archived?: boolean;
  },
  ctx: AssistantContext
): Promise<string> {
  const text = String(payload.complaint_text ?? "").trim();
  if (!text) {
    return JSON.stringify({ ok: false, error: "Texto da queixa vazio." });
  }
  const r = await matchPatioVehicleByModel(
    payload.vehicle_model_query,
    typeof payload.customer_name_query === "string" ? payload.customer_name_query : undefined,
    ctx.allowedTabs,
    { includeArchived: payload.include_archived === true }
  );
  if (r.kind === "error") {
    return JSON.stringify({ ok: false, error: r.message });
  }
  if (r.kind === "ambiguous") {
    return JSON.stringify({
      ok: true,
      ambiguous: true,
      pedir_cliente: true,
      mensagem:
        "Há mais de um veículo com esse nome. Pergunte o nome do cliente e chame a ferramenta de novo com customer_name_query.",
      opcoes: r.opcoes,
    });
  }
  if (r.order.status === CANCELLED_STATUS) {
    return JSON.stringify({
      ok: false,
      error: "Esta OS está arquivada (entregue); não é possível alterar a queixa por aqui.",
    });
  }
  try {
    const detail = await getServiceOrderById(r.order.id);
    const prev = (detail.issue_description ?? "").trim();
    const merged = prev ? `${prev}\n\n${text}` : text;
    if (prev && !merged.startsWith(prev)) {
      return JSON.stringify({
        ok: false,
        error: "Não foi possível preservar o texto existente da queixa; operação cancelada.",
      });
    }
    await updateServiceOrderDescription(r.order.id, merged, ctx.serviceOrderActor);
    return JSON.stringify({
      ok: true,
      service_order_id: r.order.id,
      os_number: r.order.os_number ?? null,
      texto_adicionado: text,
      queixa_completa: merged,
    });
  } catch (e) {
    return JSON.stringify({
      ok: false,
      error: e instanceof Error ? e.message : "Falha ao salvar a queixa.",
    });
  }
}

type ResolveTechnicianResult =
  | { kind: "clear" }
  | { kind: "id"; id: string; label: string }
  | {
      kind: "ambiguous_tech";
      technicians: Array<{ id: string; username: string; nome: string }>;
    }
  | { kind: "error"; message: string };

async function resolveTechnicianForAssignment(payload: {
  clear_technician?: boolean;
  technician_user_id?: string;
  technician_username?: string;
}): Promise<ResolveTechnicianResult> {
  if (payload.clear_technician === true) {
    return { kind: "clear" };
  }
  const rawId = typeof payload.technician_user_id === "string" ? payload.technician_user_id.trim() : "";
  if (rawId) {
    const techs = await getSystemUserTechnicians();
    const t = techs.find((x) => x.id === rawId);
    if (!t) {
      return {
        kind: "error",
        message: "UUID de técnico inválido ou usuário não é técnico da oficina.",
      };
    }
    return { kind: "id", id: t.id, label: t.display_name ?? t.username };
  }
  const rawUser = typeof payload.technician_username === "string" ? payload.technician_username.trim() : "";
  if (rawUser) {
    const techs = await getSystemUserTechnicians();
    const q = norm(rawUser);
    const matches = techs.filter((t) => {
      const u = norm(t.username);
      const d = norm(t.display_name ?? "");
      return (
        u === q ||
        d === q ||
        (u.length >= 2 && (u.includes(q) || q.includes(u))) ||
        (d.length >= 2 && (d.includes(q) || q.includes(d)))
      );
    });
    if (matches.length === 0) {
      return {
        kind: "error",
        message: `Nenhum técnico encontrado para "${rawUser}". Informe o login (username) ou o UUID (technician_user_id).`,
      };
    }
    if (matches.length > 1) {
      return {
        kind: "ambiguous_tech",
        technicians: matches.slice(0, 20).map((t) => ({
          id: t.id,
          username: t.username,
          nome: t.display_name ?? t.username,
        })),
      };
    }
    const t = matches[0]!;
    return { kind: "id", id: t.id, label: t.display_name ?? t.username };
  }
  return {
    kind: "error",
    message:
      "Para atribuir ou trocar técnico, informe technician_user_id (UUID) ou technician_username (login ou nome exibido). Para retirar o técnico do card, use clear_technician: true.",
  };
}

/** Atribui, retira ou troca o técnico responsável na OS localizada pelo modelo do veículo. */
export async function setVehicleTechnicianJson(
  payload: {
    vehicle_model_query: string;
    customer_name_query?: string;
    include_archived?: boolean;
    clear_technician?: boolean;
    technician_user_id?: string;
    technician_username?: string;
  },
  ctx: AssistantContext
): Promise<string> {
  if (!canAccessOsTools(ctx.allowedTabs)) {
    return JSON.stringify({ ok: false, error: "Sem acesso ao Pátio/Laboratório." });
  }
  const r = await matchPatioVehicleByModel(
    payload.vehicle_model_query,
    typeof payload.customer_name_query === "string" ? payload.customer_name_query : undefined,
    ctx.allowedTabs,
    { includeArchived: payload.include_archived === true }
  );
  if (r.kind === "error") {
    return JSON.stringify({ ok: false, error: r.message });
  }
  if (r.kind === "ambiguous") {
    return JSON.stringify({
      ok: true,
      ambiguous: true,
      pedir_cliente: true,
      mensagem:
        "Há mais de um veículo com esse nome. Pergunte o nome do cliente e chame a ferramenta de novo com customer_name_query.",
      opcoes: r.opcoes,
    });
  }
  if (r.order.status === CANCELLED_STATUS) {
    return JSON.stringify({
      ok: false,
      error: "Esta OS está arquivada (entregue); não é possível alterar o técnico por aqui.",
    });
  }

  const resolved = await resolveTechnicianForAssignment({
    clear_technician: payload.clear_technician,
    technician_user_id: payload.technician_user_id,
    technician_username: payload.technician_username,
  });
  if (resolved.kind === "error") {
    return JSON.stringify({ ok: false, error: resolved.message });
  }
  if (resolved.kind === "ambiguous_tech") {
    return JSON.stringify({
      ok: true,
      ambiguous_tecnico: true,
      mensagem:
        "Há mais de um técnico que combina com o nome. Pergunte qual é ou chame de novo com technician_user_id (UUID exato).",
      tecnicos: resolved.technicians,
    });
  }

  try {
    const before = await getServiceOrderById(r.order.id);
    const prevId = before.assigned_technician ?? null;
    let prevLabel: string | null = null;
    if (prevId) {
      const techs = await getSystemUserTechnicians();
      const pt = techs.find((x) => x.id === prevId);
      prevLabel = pt ? pt.display_name ?? pt.username : prevId;
    }

    if (resolved.kind === "clear") {
      await updateServiceOrderTechnician(r.order.id, null, ctx.serviceOrderActor);
      return JSON.stringify({
        ok: true,
        service_order_id: r.order.id,
        os_number: r.order.os_number ?? null,
        acao: "tecnico_retirado",
        tecnico_anterior_id: prevId,
        tecnico_anterior_nome: prevLabel,
      });
    }

    await updateServiceOrderTechnician(r.order.id, resolved.id, ctx.serviceOrderActor);
    return JSON.stringify({
      ok: true,
      service_order_id: r.order.id,
      os_number: r.order.os_number ?? null,
      acao: prevId ? "tecnico_trocado" : "tecnico_atribuido",
      tecnico_anterior_id: prevId,
      tecnico_anterior_nome: prevLabel,
      tecnico_novo_id: resolved.id,
      tecnico_novo_nome: resolved.label,
    });
  } catch (e) {
    return JSON.stringify({
      ok: false,
      error: e instanceof Error ? e.message : "Falha ao atualizar o técnico.",
    });
  }
}

/** Abre o modal de histórico de veículos/módulos arquivados no Pátio ou Laboratório (callback no cliente). */
export async function openPatioVehicleHistoryJson(
  payload: { target?: "patio" | "laboratorio" },
  allowedTabs: TabId[]
): Promise<string> {
  const target = payload.target === "laboratorio" ? "laboratorio" : "patio";
  if (target === "patio" && !allowedTabs.includes("patio")) {
    return JSON.stringify({ ok: false, error: "Sem acesso ao Pátio." });
  }
  if (target === "laboratorio" && !allowedTabs.includes("laboratorio")) {
    return JSON.stringify({ ok: false, error: "Sem acesso ao Laboratório." });
  }
  return JSON.stringify({
    ok: true,
    action: "open_history",
    target,
    mensagem:
      target === "laboratorio"
        ? "Abrindo o histórico de módulos arquivados no Laboratório."
        : "Abrindo o histórico de veículos arquivados no Pátio.",
  });
}

/** Lista OS arquivadas (entregues) — status CANCELLED. */
export async function listArchivedVehicleOrdersJson(
  orderType: ServiceOrderType,
  allowedTabs: TabId[]
): Promise<string> {
  if (orderType === "vehicle" && !allowedTabs.includes("patio")) {
    return JSON.stringify({ ok: false, error: "Sem acesso ao Pátio." });
  }
  if (orderType === "module" && !allowedTabs.includes("laboratorio")) {
    return JSON.stringify({ ok: false, error: "Sem acesso ao Laboratório." });
  }
  return listVehiclesInStageJson(CANCELLED_STATUS, orderType);
}

/** Remove o arquivamento: OS em CANCELLED volta para FINALIZADO (mesmo fluxo do botão Desarquivar no Pátio). */
export async function unarchiveVehicleServiceOrderJson(
  payload: {
    service_order_id?: string;
    os_number?: number;
    plate?: string | null;
  },
  ctx: AssistantContext
): Promise<string> {
  if (!canAccessOsTools(ctx.allowedTabs)) {
    return JSON.stringify({ ok: false, error: "Sem acesso ao Pátio/Laboratório." });
  }
  try {
    const id = await resolveServiceOrderId({
      service_order_id: payload.service_order_id,
      os_number: payload.os_number,
      plate: payload.plate,
    });
    if (!id) {
      return JSON.stringify({
        ok: false,
        error: "OS não encontrada. Informe service_order_id, os_number ou plate.",
      });
    }
    const detail = await getServiceOrderById(id);
    if (detail.status !== CANCELLED_STATUS) {
      return JSON.stringify({
        ok: false,
        error: `Esta OS não está arquivada (status atual: ${detail.status}). Só é possível desarquivar ordens entregues/arquivadas (CANCELLED).`,
      });
    }
    await updateServiceOrderStatus(id, "FINALIZADO", ctx.serviceOrderActor);
    return JSON.stringify({
      ok: true,
      service_order_id: id,
      os_number: detail.os_number ?? null,
      placa: detail.plate ?? null,
      veiculo_modelo: detail.vehicle_model ?? null,
      novo_status: "FINALIZADO",
      mensagem:
        "OS desarquivada: voltou para a etapa Finalizado no fluxo do Pátio/Laboratório (como o botão Desarquivar no histórico).",
    });
  } catch (e) {
    return JSON.stringify({
      ok: false,
      error: e instanceof Error ? e.message : "Falha ao desarquivar.",
    });
  }
}
