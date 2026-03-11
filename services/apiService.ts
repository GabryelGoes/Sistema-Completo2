import { Customer } from "../types";
import type { Appointment } from "../types";
import type { ServiceOrderStatus } from "../constants/serviceOrderStages";

const API_BASE = "/api";

interface ApiCustomer {
  id: string;
  name: string;
  cpf: string | null;
  phone: string;
  email: string | null;
  cep: string | null;
  address: string | null;
  address_number: string | null;
  created_at: string;
}

interface ApiServiceOrder {
  id: string;
  customer_id: string;
  vehicle_model: string;
  plate: string;
  mileage_km: string | null;
  delivery_date: string | null;
  issue_description: string | null;
  ai_analysis: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

/** Tipo da OS: veículo (Pátio) ou módulo (Laboratório). */
export type ServiceOrderType = "vehicle" | "module";

/** OS na listagem (com customer resumido) */
export interface ServiceOrderListItem {
  id: string;
  customer_id: string;
  vehicle_model: string | null;
  module_identification: string | null;
  plate: string | null;
  mileage_km: string | null;
  delivery_date: string | null;
  issue_description: string | null;
  ai_analysis: string | null;
  status: ServiceOrderStatus;
  assigned_technician: string | null;
  garantia_tag?: boolean;
  order_type?: ServiceOrderType;
  created_at: string;
  updated_at: string;
  customers: { id: string; name: string; phone: string | null } | null;
}

/** OS em detalhe (com cliente completo para Recepção) */
export interface ServiceOrderDetail {
  id: string;
  customer_id: string;
  vehicle_model: string;
  module_identification: string | null;
  plate: string;
  mileage_km: string | null;
  delivery_date: string | null;
  issue_description: string | null;
  ai_analysis: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  customers: ApiCustomer | null;
}

/** Linha da tabela workshop_appointments (API) */
interface ApiAppointmentRow {
  id: string;
  workshop_id: string;
  title: string;
  customer_name: string;
  phone: string | null;
  email: string | null;
  vehicle_model: string;
  plate: string;
  notes: string | null;
  scheduled_date: string;
  scheduled_time: string;
  status: string;
  trello_card_id: string | null;
  created_at: string;
  updated_at: string;
}

function mapAppointmentRowToAppointment(row: ApiAppointmentRow): Appointment {
  const date = new Date(row.scheduled_date + "T00:00:00");
  return {
    id: row.id,
    title: row.title,
    customerName: row.customer_name,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    vehicleModel: row.vehicle_model,
    plate: row.plate,
    date,
    time: row.scheduled_time,
    notes: row.notes ?? undefined,
    status: row.status as Appointment["status"],
    trelloCardId: row.trello_card_id ?? undefined,
  };
}

export async function getAppointments(): Promise<Appointment[]> {
  const response = await fetch(`${API_BASE}/appointments`);
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || `Falha ao listar agendamentos (status ${response.status})`);
  }
  const rows: ApiAppointmentRow[] = await response.json();
  return rows.map(mapAppointmentRowToAppointment);
}

export async function createAppointment(appointment: {
  title: string;
  customerName: string;
  phone?: string;
  email?: string;
  vehicleModel: string;
  plate: string;
  notes?: string;
  date: Date;
  time: string;
  status?: Appointment["status"];
  trelloCardId?: string;
}): Promise<Appointment> {
  const dateStr = appointment.date.toISOString().slice(0, 10);
  const response = await fetch(`${API_BASE}/appointments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: appointment.title,
      customerName: appointment.customerName,
      phone: appointment.phone ?? null,
      email: appointment.email ?? null,
      vehicleModel: appointment.vehicleModel,
      plate: appointment.plate,
      notes: appointment.notes ?? null,
      date: dateStr,
      time: appointment.time,
      status: appointment.status ?? "scheduled",
      trelloCardId: appointment.trelloCardId ?? null,
    }),
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || `Falha ao criar agendamento (status ${response.status})`);
  }
  const row: ApiAppointmentRow = await response.json();
  return mapAppointmentRowToAppointment(row);
}

export async function updateAppointment(
  id: string,
  appointment: {
    title?: string;
    customerName?: string;
    phone?: string;
    email?: string;
    vehicleModel?: string;
    plate?: string;
    notes?: string;
    date?: Date;
    time?: string;
    status?: Appointment["status"];
    trelloCardId?: string;
  }
): Promise<Appointment> {
  const body: Record<string, unknown> = {};
  if (appointment.title !== undefined) body.title = appointment.title;
  if (appointment.customerName !== undefined) body.customerName = appointment.customerName;
  if (appointment.phone !== undefined) body.phone = appointment.phone;
  if (appointment.email !== undefined) body.email = appointment.email;
  if (appointment.vehicleModel !== undefined) body.vehicleModel = appointment.vehicleModel;
  if (appointment.plate !== undefined) body.plate = appointment.plate;
  if (appointment.notes !== undefined) body.notes = appointment.notes;
  if (appointment.date !== undefined) body.date = appointment.date.toISOString().slice(0, 10);
  if (appointment.time !== undefined) body.time = appointment.time;
  if (appointment.status !== undefined) body.status = appointment.status;
  if (appointment.trelloCardId !== undefined) body.trelloCardId = appointment.trelloCardId;

  const response = await fetch(`${API_BASE}/appointments/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || `Falha ao atualizar agendamento (status ${response.status})`);
  }
  const row: ApiAppointmentRow = await response.json();
  return mapAppointmentRowToAppointment(row);
}

export async function deleteAppointment(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/appointments/${id}`, { method: "DELETE" });
  if (!response.ok && response.status !== 204) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || `Falha ao excluir agendamento (status ${response.status})`);
  }
}

export async function createCustomer(customer: Customer): Promise<ApiCustomer> {
  const response = await fetch(`${API_BASE}/customers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: customer.name,
      cpf: customer.cpf || null,
      phone: customer.phone,
      email: customer.email || null,
      cep: customer.cep || null,
      address: customer.address || null,
      addressNumber: customer.addressNumber || null,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(
      errorBody.error || `Falha ao criar cliente (status ${response.status})`
    );
  }

  return response.json();
}

export async function updateCustomer(
  id: string,
  data: { name?: string; cpf?: string | null; phone?: string; email?: string | null; cep?: string | null; address?: string | null; addressNumber?: string | null }
): Promise<ApiCustomer> {
  const body: Record<string, unknown> = {};
  if (data.name !== undefined) body.name = data.name;
  if (data.cpf !== undefined) body.cpf = data.cpf;
  if (data.phone !== undefined) body.phone = data.phone;
  if (data.email !== undefined) body.email = data.email;
  if (data.cep !== undefined) body.cep = data.cep;
  if (data.address !== undefined) body.address = data.address;
  if (data.addressNumber !== undefined) body.addressNumber = data.addressNumber;
  const response = await fetch(`${API_BASE}/customers/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao atualizar cliente (${response.status})`);
  }
  return response.json();
}

export async function createServiceOrder(params: {
  customerId: string;
  vehicleModel: string;
  moduleIdentification?: string | null;
  plate?: string | null;
  mileageKm?: string | null;
  issueDescription?: string;
  aiAnalysis?: string;
  orderType?: ServiceOrderType;
}): Promise<ApiServiceOrder> {
  const orderType = params.orderType === "module" ? "module" : "vehicle";
  const body: Record<string, unknown> = {
    customerId: params.customerId,
    vehicleModel: params.vehicleModel ?? (orderType === "module" ? "" : undefined),
    issueDescription: params.issueDescription ?? null,
    aiAnalysis: params.aiAnalysis ?? null,
    orderType,
  };
  if (orderType === "vehicle") {
    body.plate = (params.plate || '').toUpperCase();
    body.mileageKm = params.mileageKm ?? null;
  } else {
    body.plate = null;
    body.mileageKm = null;
    body.moduleIdentification = params.moduleIdentification ?? null;
  }
  const response = await fetch(`${API_BASE}/service-orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(
      errorBody.error ||
        `Falha ao criar ordem de serviço (status ${response.status})`
    );
  }

  return response.json();
}

export async function saveReceptionIntake(
  customer: Customer,
  orderType: ServiceOrderType = "vehicle"
) {
  const createdCustomer = await createCustomer(customer);

  const createdServiceOrder = await createServiceOrder({
    customerId: createdCustomer.id,
    vehicleModel: customer.vehicleModel || '',
    moduleIdentification: orderType === "module" ? (customer.moduleIdentification ?? null) : undefined,
    plate: orderType === "vehicle" ? (customer.plate || '').toUpperCase() : undefined,
    mileageKm: orderType === "vehicle" ? (customer.mileageKm ?? null) : undefined,
    issueDescription: customer.issueDescription,
    aiAnalysis: customer.aiAnalysis,
    orderType,
  });

  return {
    customer: createdCustomer,
    serviceOrder: createdServiceOrder,
  };
}

// ---------- Pátio (listagem e movimentação) ----------

export async function getServiceOrders(
  status?: string,
  orderType?: ServiceOrderType
): Promise<ServiceOrderListItem[]> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (orderType === "vehicle" || orderType === "module") params.set("orderType", orderType);
  const url = `${API_BASE}/service-orders${params.toString() ? `?${params.toString()}` : ""}`;
  const response = await fetch(url);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao listar ordens (${response.status})`);
  }
  return response.json();
}

export async function getServiceOrderById(id: string): Promise<ServiceOrderDetail> {
  const response = await fetch(`${API_BASE}/service-orders/${id}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao carregar OS (${response.status})`);
  }
  return response.json();
}

/** Opções para identificar quem está fazendo a ação (admin vs técnico) — define quem recebe a notificação. */
export interface ServiceOrderUpdateActor {
  actor?: "admin" | "technician";
  actorTechnicianSlug?: string;
  actorTechnicianName?: string;
}

function mergeActorIntoBody<T extends Record<string, unknown>>(body: T, options?: ServiceOrderUpdateActor): T {
  if (!options?.actor) return body;
  return { ...body, actor: options.actor, actorTechnicianSlug: options.actorTechnicianSlug, actorTechnicianName: options.actorTechnicianName };
}

export async function updateServiceOrderStatus(
  id: string,
  status: ServiceOrderStatus,
  options?: ServiceOrderUpdateActor
): Promise<ApiServiceOrder> {
  const body = mergeActorIntoBody({ status }, options);
  const response = await fetch(`${API_BASE}/service-orders/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao atualizar status (${response.status})`);
  }
  return response.json();
}

export async function updateServiceOrderDescription(
  id: string,
  issueDescription: string,
  options?: ServiceOrderUpdateActor
): Promise<ApiServiceOrder> {
  const body = mergeActorIntoBody({ issueDescription }, options);
  const response = await fetch(`${API_BASE}/service-orders/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao atualizar descrição (${response.status})`);
  }
  return response.json();
}

/** Atualiza o técnico responsável da OS (gabryel, jhow, fabio). */
export async function updateServiceOrderTechnician(
  id: string,
  assignedTechnician: string | null,
  options?: ServiceOrderUpdateActor
): Promise<ApiServiceOrder> {
  const body = mergeActorIntoBody({ assignedTechnician: assignedTechnician ?? null }, options);
  const response = await fetch(`${API_BASE}/service-orders/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao atribuir técnico (${response.status})`);
  }
  return response.json();
}

/** Remove a etiqueta de garantia da OS (persiste em qualquer etapa até remover pelo modal). */
export async function updateServiceOrderGarantiaTag(
  id: string,
  garantiaTag: boolean,
  options?: ServiceOrderUpdateActor
): Promise<ApiServiceOrder> {
  const body = mergeActorIntoBody({ garantiaTag }, options);
  const response = await fetch(`${API_BASE}/service-orders/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao atualizar etiqueta garantia (${response.status})`);
  }
  return response.json();
}

/** Atualiza a quilometragem do veículo da OS. */
export async function updateServiceOrderMileage(
  id: string,
  mileageKm: string | null,
  options?: ServiceOrderUpdateActor
): Promise<ApiServiceOrder> {
  const body = mergeActorIntoBody({ mileageKm: mileageKm == null || mileageKm.trim() === '' ? null : mileageKm.trim() }, options);
  const response = await fetch(`${API_BASE}/service-orders/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao atualizar quilometragem (${response.status})`);
  }
  return response.json();
}

/** Atualiza a data de entrega prevista do veículo (YYYY-MM-DD ou null). */
export async function updateServiceOrderDeliveryDate(
  id: string,
  deliveryDate: string | null,
  options?: ServiceOrderUpdateActor
): Promise<ApiServiceOrder> {
  const body = mergeActorIntoBody({ deliveryDate: deliveryDate == null || deliveryDate.trim() === '' ? null : deliveryDate.trim() }, options);
  const response = await fetch(`${API_BASE}/service-orders/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao atualizar data de entrega (${response.status})`);
  }
  return response.json();
}

/** Atualiza modelo do veículo, identificação do módulo e/ou placa da OS. */
export async function updateServiceOrderVehicle(
  id: string,
  data: { vehicleModel?: string; moduleIdentification?: string | null; plate?: string },
  options?: ServiceOrderUpdateActor
): Promise<ApiServiceOrder> {
  const body: Record<string, unknown> = {};
  if (data.vehicleModel !== undefined) body.vehicleModel = data.vehicleModel.trim();
  if (data.moduleIdentification !== undefined) body.moduleIdentification = data.moduleIdentification === null || data.moduleIdentification === "" ? null : String(data.moduleIdentification).trim();
  if (data.plate !== undefined) body.plate = data.plate.trim().toUpperCase();
  const merged = mergeActorIntoBody(body, options);
  const response = await fetch(`${API_BASE}/service-orders/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(merged),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao atualizar veículo/placa (${response.status})`);
  }
  return response.json();
}

export interface ServiceOrderPhoto {
  url: string;
  name: string;
  path: string;
}

export async function getServiceOrderPhotos(id: string): Promise<ServiceOrderPhoto[]> {
  const response = await fetch(`${API_BASE}/service-orders/${id}/photos`);
  if (!response.ok) return [];
  return response.json();
}

export async function uploadServiceOrderPhoto(
  id: string,
  file: Blob,
  fileName: string
): Promise<ServiceOrderPhoto> {
  const formData = new FormData();
  formData.append("file", file, fileName);
  const response = await fetch(`${API_BASE}/service-orders/${id}/photos`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao enviar foto (${response.status})`);
  }
  return response.json();
}

export async function renameServiceOrderPhoto(
  serviceOrderId: string,
  path: string,
  newName: string
): Promise<ServiceOrderPhoto> {
  const response = await fetch(
    `${API_BASE}/service-orders/${serviceOrderId}/photos/rename`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, newName: newName.trim() }),
    }
  );
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao renomear anexo (${response.status})`);
  }
  return response.json();
}

// ---------- Comentários do modal do veículo ----------

export interface ServiceOrderComment {
  id: string;
  author_display_name: string;
  text: string;
  created_at: string;
  author_photo_url?: string | null;
}

export async function getServiceOrderComments(serviceOrderId: string): Promise<ServiceOrderComment[]> {
  const response = await fetch(`${API_BASE}/service-orders/${serviceOrderId}/comments`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao carregar comentários (${response.status})`);
  }
  return response.json();
}

export async function addServiceOrderComment(
  serviceOrderId: string,
  text: string,
  authorDisplayName: string
): Promise<ServiceOrderComment> {
  const response = await fetch(`${API_BASE}/service-orders/${serviceOrderId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: text.trim(), authorDisplayName: authorDisplayName.trim() }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao enviar comentário (${response.status})`);
  }
  return response.json();
}

export async function deleteServiceOrderComment(
  serviceOrderId: string,
  commentId: string
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/service-orders/${serviceOrderId}/comments/${encodeURIComponent(commentId)}`,
    { method: "DELETE" }
  );
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao excluir comentário (${response.status})`);
  }
}

export async function updateServiceOrderComment(
  serviceOrderId: string,
  commentId: string,
  text: string
): Promise<ServiceOrderComment> {
  const response = await fetch(
    `${API_BASE}/service-orders/${serviceOrderId}/comments/${encodeURIComponent(commentId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.trim() }),
    }
  );
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao atualizar comentário (${response.status})`);
  }
  return response.json();
}

// ---------- Central de notificações ----------

export type NotificationType =
  | "comment"
  | "stage_change"
  | "budget_created"
  | "budget_edited"
  | "vehicle_finalized"
  | "vehicle_scheduled"
  | "vehicle_registered"
  | "complaint_edited"
  | "delivery_date_changed";

export interface NotificationPayload {
  service_order_id?: string;
  comment_id?: string;
  author_display_name?: string;
  author_photo_url?: string | null;
  text?: string;
  vehicle_plate?: string | null;
  vehicle_model?: string | null;
  customer_name?: string | null;
  status?: string;
  new_status?: string;
  delivery_date?: string | null;
  technician_slug?: string;
  technician_name?: string;
  [key: string]: unknown;
}

export interface Notification {
  id: string;
  type: NotificationType;
  payload: NotificationPayload;
  read_at: string | null;
  created_at: string;
}

export async function getNotifications(params?: {
  limit?: number;
  since?: string;
  for?: "admin" | "technician";
  technicianSlug?: string;
}): Promise<Notification[]> {
  const sp = new URLSearchParams();
  if (params?.limit) sp.set("limit", String(params.limit));
  if (params?.since) sp.set("since", params.since ?? "");
  if (params?.for === "technician" && params?.technicianSlug) {
    sp.set("for", "technician");
    sp.set("slug", params.technicianSlug);
  }
  const q = sp.toString();
  const response = await fetch(`${API_BASE}/notifications${q ? `?${q}` : ""}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Falha ao carregar notificações.");
  }
  return response.json();
}

export async function getUnreadNotificationsCount(params?: {
  for?: "admin" | "technician";
  technicianSlug?: string;
}): Promise<number> {
  const sp = new URLSearchParams();
  if (params?.for === "technician" && params?.technicianSlug) {
    sp.set("for", "technician");
    sp.set("slug", params.technicianSlug);
  }
  const q = sp.toString();
  const response = await fetch(`${API_BASE}/notifications/unread-count${q ? `?${q}` : ""}`);
  if (!response.ok) return 0;
  const data = await response.json();
  return typeof data.count === "number" ? data.count : 0;
}

export async function markNotificationRead(
  id: string,
  params?: { for?: "admin" | "technician"; technicianSlug?: string }
): Promise<void> {
  const sp = new URLSearchParams();
  if (params?.for === "technician" && params?.technicianSlug) {
    sp.set("for", "technician");
    sp.set("slug", params.technicianSlug);
  }
  const q = sp.toString();
  const response = await fetch(`${API_BASE}/notifications/${id}/read${q ? `?${q}` : ""}`, { method: "PATCH" });
  if (!response.ok && response.status !== 204) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Falha ao marcar como lida.");
  }
}

export async function markAllNotificationsRead(params?: {
  for?: "admin" | "technician";
  technicianSlug?: string;
}): Promise<void> {
  const body =
    params?.for === "technician" && params?.technicianSlug
      ? { for: "technician" as const, slug: params.technicianSlug }
      : undefined;
  const response = await fetch(`${API_BASE}/notifications/read-all`, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok && response.status !== 204) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Falha ao marcar todas como lidas.");
  }
}

export async function clearNotifications(params?: {
  for?: "admin" | "technician";
  technicianSlug?: string;
}): Promise<void> {
  const sp = new URLSearchParams();
  if (params?.for === "technician" && params?.technicianSlug) {
    sp.set("for", "technician");
    sp.set("slug", params.technicianSlug);
  }
  const q = sp.toString();
  const response = await fetch(`${API_BASE}/notifications${q ? `?${q}` : ""}`, { method: "DELETE" });
  if (!response.ok && response.status !== 204) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Falha ao limpar notificações.");
  }
}

export async function createNotification(
  type: NotificationType,
  payload: NotificationPayload,
  options?: { targetType?: "admin" | "technician"; targetSlug?: string }
): Promise<Notification> {
  const body: { type: NotificationType; payload: NotificationPayload; targetType?: string; targetSlug?: string | null } = {
    type,
    payload,
  };
  if (options?.targetType === "technician" && options?.targetSlug) {
    body.targetType = "technician";
    body.targetSlug = options.targetSlug;
  }
  const response = await fetch(`${API_BASE}/notifications`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Falha ao criar notificação.");
  }
  return response.json();
}

// ---------- Orçamentos ----------

/** Orçamento no formato da API (snake_case) */
interface ApiBudget {
  id: string;
  service_order_id: string;
  card_name: string | null;
  diagnosis: string;
  services: { description: string }[];
  parts: { description: string; quantity: string }[];
  observations: string;
  created_at: string;
}

/** Orçamento no formato do frontend (SavedBudget) */
export interface SavedBudgetFromApi {
  id: string;
  createdAt: string;
  serviceOrderId: string;
  cardName: string;
  diagnosis: string;
  services: { description: string }[];
  parts: { description: string; quantity: string }[];
  observations: string;
}

function mapApiBudgetToSaved(b: ApiBudget): SavedBudgetFromApi {
  return {
    id: b.id,
    createdAt: b.created_at,
    serviceOrderId: b.service_order_id,
    cardName: b.card_name ?? "",
    diagnosis: b.diagnosis ?? "",
    services: b.services ?? [],
    parts: b.parts ?? [],
    observations: b.observations ?? "",
  };
}

export async function getServiceOrderBudgets(
  serviceOrderId: string
): Promise<SavedBudgetFromApi[]> {
  const response = await fetch(`${API_BASE}/service-orders/${serviceOrderId}/budgets`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao listar orçamentos (${response.status})`);
  }
  const data: ApiBudget[] = await response.json();
  return (data ?? []).map(mapApiBudgetToSaved);
}

export async function createServiceOrderBudget(
  serviceOrderId: string,
  payload: {
    cardName: string;
    diagnosis: string;
    services: { description: string }[];
    parts: { description: string; quantity: string }[];
    observations: string;
  },
  options?: ServiceOrderUpdateActor
): Promise<SavedBudgetFromApi> {
  const body = mergeActorIntoBody({
    cardName: payload.cardName,
    diagnosis: payload.diagnosis,
    services: payload.services,
    parts: payload.parts,
    observations: payload.observations,
  }, options);
  const response = await fetch(`${API_BASE}/service-orders/${serviceOrderId}/budgets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao criar orçamento (${response.status})`);
  }
  const data: ApiBudget = await response.json();
  return mapApiBudgetToSaved(data);
}

export async function updateServiceOrderBudget(
  serviceOrderId: string,
  budgetId: string,
  payload: {
    cardName: string;
    diagnosis: string;
    services: { description: string }[];
    parts: { description: string; quantity: string }[];
    observations: string;
  },
  options?: ServiceOrderUpdateActor
): Promise<SavedBudgetFromApi> {
  const body = mergeActorIntoBody({
    cardName: payload.cardName,
    diagnosis: payload.diagnosis,
    services: payload.services,
    parts: payload.parts,
    observations: payload.observations,
  }, options);
  const response = await fetch(
    `${API_BASE}/service-orders/${serviceOrderId}/budgets/${budgetId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao atualizar orçamento (${response.status})`);
  }
  const data: ApiBudget = await response.json();
  return mapApiBudgetToSaved(data);
}

export async function deleteServiceOrderBudget(
  serviceOrderId: string,
  budgetId: string
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/service-orders/${serviceOrderId}/budgets/${budgetId}`,
    { method: "DELETE" }
  );
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao excluir orçamento (${response.status})`);
  }
}

// ---------- Serviços da oficina (para orçamentos) ----------

export interface WorkshopService {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export async function getWorkshopServices(): Promise<WorkshopService[]> {
  const response = await fetch(`${API_BASE}/workshop-services`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao listar serviços (${response.status})`);
  }
  return response.json();
}

export async function createWorkshopService(name: string): Promise<WorkshopService> {
  const response = await fetch(`${API_BASE}/workshop-services`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name.trim() }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao criar serviço (${response.status})`);
  }
  return response.json();
}

export async function updateWorkshopService(id: string, name: string): Promise<WorkshopService> {
  const response = await fetch(`${API_BASE}/workshop-services/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name.trim() }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao atualizar serviço (${response.status})`);
  }
  return response.json();
}

export async function deleteWorkshopService(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/workshop-services/${id}`, { method: "DELETE" });
  if (!response.ok && response.status !== 204) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao excluir serviço (${response.status})`);
  }
}

// ---------- Técnicos da oficina (atribuição nos cards) ----------

export interface WorkshopTechnician {
  id: string;
  slug: string;
  name: string;
  color_style: string | null;
  sort_order: number;
  photo_url: string | null;
  created_at: string;
}

export async function getWorkshopTechnicians(): Promise<WorkshopTechnician[]> {
  const response = await fetch(`${API_BASE}/workshop-technicians`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao listar técnicos (${response.status})`);
  }
  return response.json();
}

export async function createWorkshopTechnician(
  slug: string,
  name: string,
  colorStyle?: string | null
): Promise<WorkshopTechnician> {
  const response = await fetch(`${API_BASE}/workshop-technicians`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      slug: slug.trim().toLowerCase().replace(/\s+/g, "_"),
      name: name.trim(),
      color_style: colorStyle?.trim() || null,
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao criar técnico (${response.status})`);
  }
  return response.json();
}

export async function updateWorkshopTechnician(
  id: string,
  updates: { slug?: string; name?: string; color_style?: string | null }
): Promise<WorkshopTechnician> {
  const body: Record<string, string | null> = {};
  if (updates.slug !== undefined) body.slug = updates.slug.trim().toLowerCase().replace(/\s+/g, "_");
  if (updates.name !== undefined) body.name = updates.name.trim();
  if (updates.color_style !== undefined) body.color_style = updates.color_style?.trim() || null;
  const response = await fetch(`${API_BASE}/workshop-technicians/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao atualizar técnico (${response.status})`);
  }
  return response.json();
}

/** Envia a foto do técnico (arquivo ou captura da câmera). */
export async function uploadWorkshopTechnicianPhoto(
  technicianId: string,
  file: Blob,
  fileName?: string
): Promise<WorkshopTechnician> {
  const formData = new FormData();
  formData.append("file", file, fileName ?? "photo.jpg");
  const response = await fetch(`${API_BASE}/workshop-technicians/${technicianId}/photo`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao enviar foto (${response.status})`);
  }
  return response.json();
}

export async function deleteWorkshopTechnician(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/workshop-technicians/${id}`, { method: "DELETE" });
  if (!response.ok && response.status !== 204) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao excluir técnico (${response.status})`);
  }
}

/** Envia a foto do perfil do administrador. */
export async function uploadWorkshopAdminPhoto(file: Blob, fileName?: string): Promise<{ adminPhotoUrl: string }> {
  const formData = new FormData();
  formData.append("file", file, fileName ?? "photo.jpg");
  const response = await fetch(`${API_BASE}/workshop-admin/photo`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao enviar foto do admin (${response.status})`);
  }
  return response.json();
}

// ---------- Autenticação ----------

/** Permissões de um usuário do sistema (não-admin). */
export interface SystemUserPermissions {
  access_home?: boolean;
  access_reception?: boolean;
  access_agenda?: boolean;
  access_patio?: boolean;
  access_laboratorio?: boolean;
  access_settings?: boolean;
  access_change_passwords?: boolean;
  access_technicians?: boolean;
  patio_delete_cards?: boolean;
  patio_assign_technician?: boolean;
  patio_edit_ficha?: boolean;
  patio_edit_queixa?: boolean;
  patio_edit_delivery_date?: boolean;
  patio_edit_mileage?: boolean;
  patio_edit_budgets?: boolean;
  patio_add_comments?: boolean;
  patio_archive_card?: boolean;
}

export type AuthRole = "admin" | "user";

export interface AuthSession {
  role: AuthRole;
  userId?: string;
  username?: string;
  displayName?: string;
  photoUrl?: string | null;
  profileToken?: string;
  isTechnician?: boolean;
  accentColor?: string | null;
  permissions?: SystemUserPermissions;
}

export async function login(username: string, password: string): Promise<AuthSession> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: username.trim(), password }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Usuário ou senha incorretos.");
  }
  const data = await response.json();
  if (data.role === "admin") return { role: "admin" };
  return {
    role: "user",
    userId: data.userId,
    username: data.username,
    displayName: data.displayName || data.username,
    photoUrl: data.photoUrl ?? null,
    profileToken: data.profileToken ?? undefined,
    isTechnician: data.isTechnician ?? false,
    accentColor: data.accentColor ?? null,
    permissions: data.permissions || {},
  };
}

export interface SystemUser {
  id: string;
  username: string;
  display_name: string | null;
  permissions: SystemUserPermissions;
  is_technician?: boolean;
  job_title?: string | null;
  created_at: string;
  updated_at: string;
}

/** Usuário do sistema marcado como técnico (para atribuição nos cards). */
export interface SystemUserTechnician {
  id: string;
  username: string;
  display_name: string | null;
  job_title: string | null;
  accent_color?: string | null;
  photo_url?: string | null;
}

export async function getSystemUsers(adminPassword: string): Promise<SystemUser[]> {
  const url = `${API_BASE}/system-users?adminPassword=${encodeURIComponent(adminPassword)}`;
  const response = await fetch(url);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Falha ao listar usuários.");
  }
  return response.json();
}

export async function getSystemUserTechnicians(): Promise<SystemUserTechnician[]> {
  const response = await fetch(`${API_BASE}/system-users/technicians`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Falha ao listar técnicos.");
  }
  return response.json();
}

export async function createSystemUser(
  adminPassword: string,
  data: {
    username: string;
    password: string;
    displayName?: string;
    permissions: SystemUserPermissions;
    isTechnician?: boolean;
    jobTitle?: string | null;
  }
): Promise<SystemUser> {
  const response = await fetch(`${API_BASE}/system-users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      adminPassword,
      username: data.username.trim(),
      password: data.password,
      displayName: data.displayName?.trim() || null,
      permissions: data.permissions,
      isTechnician: data.isTechnician ?? false,
      jobTitle: data.jobTitle?.trim() || null,
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Falha ao criar usuário.");
  }
  return response.json();
}

export async function updateSystemUser(
  id: string,
  adminPassword: string,
  data: {
    password?: string;
    displayName?: string;
    permissions: SystemUserPermissions;
    isTechnician?: boolean;
    jobTitle?: string | null;
  }
): Promise<SystemUser> {
  const response = await fetch(`${API_BASE}/system-users/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      adminPassword,
      password: data.password,
      displayName: data.displayName?.trim() ?? null,
      permissions: data.permissions,
      isTechnician: data.isTechnician,
      jobTitle: data.jobTitle?.trim() || null,
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Falha ao atualizar usuário.");
  }
  return response.json();
}

export async function deleteSystemUser(id: string, adminPassword: string): Promise<void> {
  const url = `${API_BASE}/system-users/${id}?adminPassword=${encodeURIComponent(adminPassword)}`;
  const response = await fetch(url, { method: "DELETE" });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Falha ao excluir usuário.");
  }
}

// ---------- Meu perfil (usuário do sistema, não-admin) ----------

export interface MyProfile {
  username: string;
  displayName: string;
  photoUrl: string | null;
  accentColor?: string | null;
}

export async function getMyProfile(username: string, password: string): Promise<MyProfile> {
  const url = `${API_BASE}/auth/my-profile?username=${encodeURIComponent(username.trim())}&password=${encodeURIComponent(password)}`;
  const response = await fetch(url);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Usuário ou senha incorretos.");
  }
  const data = await response.json();
  return {
    username: data.username,
    displayName: data.displayName ?? data.username,
    photoUrl: data.photoUrl ?? null,
    accentColor: data.accentColor ?? null,
  };
}

export async function updateMyProfile(
  username: string,
  password: string,
  data: { displayName?: string; accentColor?: string | null },
  options?: { profileToken?: string }
): Promise<MyProfile> {
  const body: Record<string, unknown> = {
    username: username.trim(),
    displayName: data.displayName?.trim(),
    accentColor: data.accentColor !== undefined ? (data.accentColor?.trim() || null) : undefined,
  };
  if (options?.profileToken) body.profileToken = options.profileToken;
  else body.password = password;
  const response = await fetch(`${API_BASE}/auth/my-profile`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Falha ao atualizar perfil.");
  }
  const res = await response.json();
  return {
    username: res.username,
    displayName: res.displayName ?? res.username,
    photoUrl: res.photoUrl ?? null,
    accentColor: res.accentColor ?? null,
  };
}

export async function changeMyPassword(
  username: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const response = await fetch(`${API_BASE}/auth/change-my-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: username.trim(),
      currentPassword,
      newPassword,
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Falha ao alterar senha.");
  }
}

export async function uploadMyProfilePhoto(
  username: string,
  file: Blob,
  fileName?: string,
  auth?: { password?: string; profileToken?: string }
): Promise<{ photoUrl: string }> {
  const form = new FormData();
  form.append("file", file, fileName || "photo.jpg");
  form.append("username", username.trim());
  if (auth?.profileToken) form.append("profileToken", auth.profileToken);
  else if (auth?.password) form.append("password", auth.password);
  const response = await fetch(`${API_BASE}/auth/my-profile/photo`, {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Falha ao enviar foto.");
  }
  const data = await response.json();
  return { photoUrl: data.photoUrl };
}

// ---------- Configurações da oficina (acesso pátio) ----------

export interface WorkshopSettings {
  patioLoginEnabled: boolean;
  patioPin: string;
  technicianAccessReception: boolean;
  technicianAccessAgenda: boolean;
  technicianAccessPatio: boolean;
  adminDisplayName?: string;
  adminPhotoUrl?: string | null;
  vehicleDeletePassword?: string;
}

export async function getWorkshopSettings(): Promise<WorkshopSettings> {
  const response = await fetch(`${API_BASE}/workshop-settings`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Falha ao carregar configurações.");
  }
  return response.json();
}

export async function updateWorkshopSettings(
  updates: Partial<WorkshopSettings> & { adminPassword?: string; adminDisplayName?: string; adminPhotoUrl?: string | null; vehicleDeletePassword?: string }
): Promise<WorkshopSettings> {
  const response = await fetch(`${API_BASE}/workshop-settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Falha ao salvar configurações.");
  }
  return response.json();
}

/** Exclui o veículo do sistema (marca OS como CANCELLED). Exige a senha configurada em Alterar senhas. */
export async function deleteServiceOrderWithPassword(serviceOrderId: string, password: string): Promise<void> {
  const response = await fetch(`${API_BASE}/service-orders/${serviceOrderId}/delete-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: String(password).trim() }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Falha ao excluir veículo.");
  }
}

