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
  type ServiceOrderListItem,
  type ServiceOrderUpdateActor,
  type ServiceOrderType,
} from "./apiService";
import { resolveServiceOrderId } from "./assistantPatioTools";

export interface AssistantContext {
  allowedTabs: TabId[];
  serviceOrderActor?: ServiceOrderUpdateActor;
  authorDisplayName: string;
  commentActor: "admin" | "technician";
  currentTechnicianUserId?: string | null;
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
    const orders = await fetchAllNonCancelled();
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
      etapa: stageName(o.status),
      status_id: o.status,
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
        cardName: (payload.card_name && String(payload.card_name).trim()) || "Orçamento (assistente)",
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
