import { Customer, type LabServiceLink, type VehicleReferenceLink } from "../types";
import type { Appointment } from "../types";
import type { ServiceOrderStatus } from "../constants/serviceOrderStages";
import type { ExternalRepair } from "../constants/labBench";
import { API_BASE } from "./apiConfig";
import { compressImageForUpload } from "../utils/imageUpload";
import type { BudgetPartFields } from "../utils/budgetPartStock";
import { normalizeTvChimeConfig, type TvChimeScheduleConfig } from "@/utils/tvChimeSchedule";

export type { TvChimeAlert, TvChimeKind, TvChimeSoundPreset } from "@/utils/tvChimeSchedule";

export interface ApiCustomer {
  id: string;
  name: string;
  cpf: string | null;
  phone: string;
  email: string | null;
  cep: string | null;
  address: string | null;
  city: string | null;
  address_number: string | null;
  created_at: string;
}

/** Lista todos os clientes da oficina (para buscas / assistente). */
export async function getCustomers(): Promise<ApiCustomer[]> {
  const response = await fetch(`${API_BASE}/customers`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao listar clientes (${response.status})`);
  }
  return response.json();
}

interface ApiServiceOrder {
  id: string;
  os_number?: number | null;
  customer_id: string;
  vehicle_model: string;
  vehicle_brand?: string | null;
  plate: string;
  mileage_km: string | null;
  delivery_date: string | null;
  issue_description: string | null;
  ai_analysis: string | null;
  status: string;
  vehicle_category?: string | null;
  vehicle_color?: string | null;
  vehicle_year?: string | null;
  vehicle_engine_info?: string | null;
  bench_slot?: number | null;
  bench_slot_at?: string | null;
  bench_queued_at?: string | null;
  external_repair?: ExternalRepair | null;
  diagnostic_authorization_signed_at?: string | null;
  diagnostic_authorization_signature_path?: string | null;
  created_at: string;
  updated_at: string;
}

/** Tipo da OS: veículo (Pátio) ou módulo (Laboratório). */
export type ServiceOrderType = "vehicle" | "module";

/** OS na listagem (com customer resumido) */
export interface ServiceOrderListItem {
  id: string;
  os_number?: number | null;
  customer_id: string;
  vehicle_model: string | null;
  module_identification: string | null;
  module_kind?: string | null;
  module_vehicle_kind?: string | null;
  module_product_other?: string | null;
  plate: string | null;
  mileage_km: string | null;
  delivery_date: string | null;
  issue_description: string | null;
  ai_analysis: string | null;
  status: ServiceOrderStatus;
  assigned_technician: string | null;
  /** Preenchido pelo backend na listagem. */
  assigned_technician_name?: string | null;
  garantia_tag?: boolean;
  order_type?: ServiceOrderType;
  /** Recepção — veículo: Compacto, Médio/SUV, Pick-Up, Premium */
  vehicle_category?: string | null;
  vehicle_brand?: string | null;
  vehicle_color?: string | null;
  vehicle_year?: string | null;
  vehicle_engine_info?: string | null;
  /** Links anexados ao modal (JSON no banco). */
  reference_links?: VehicleReferenceLink[] | null;
  /** Vínculos de serviços do pátio enviados ao laboratório. */
  lab_service_links?: LabServiceLink[] | null;
  /** Bancada do laboratório: compartimento físico (1..24) ou null (fora da bancada). */
  bench_slot?: number | null;
  bench_slot_at?: string | null;
  bench_queued_at?: string | null;
  /** Dados do conserto em terceiros. */
  external_repair?: ExternalRepair | null;
  diagnostic_authorization_signed_at?: string | null;
  diagnostic_authorization_signature_path?: string | null;
  created_at: string;
  updated_at: string;
  customers: { id: string; name: string; phone: string | null } | null;
  /** Nome do cliente (preenchido pelo backend para garantir exibição no Pátio/Laboratório) */
  customer_name?: string | null;
}

/** OS em detalhe (com cliente completo para Recepção) */
export interface ServiceOrderDetail {
  id: string;
  /** Incluído na resposta GET; usado para Realtime no browser (filtro lembretes). */
  workshop_id?: string;
  os_number?: number | null;
  customer_id: string;
  vehicle_model: string;
  module_identification: string | null;
  module_kind?: string | null;
  module_vehicle_kind?: string | null;
  module_product_other?: string | null;
  plate: string;
  mileage_km: string | null;
  delivery_date: string | null;
  issue_description: string | null;
  ai_analysis: string | null;
  status: string;
  order_type?: ServiceOrderType;
  vehicle_category?: string | null;
  vehicle_brand?: string | null;
  vehicle_color?: string | null;
  vehicle_year?: string | null;
  vehicle_engine_info?: string | null;
  reference_links?: VehicleReferenceLink[] | null;
  /** Vínculos de serviços do pátio enviados ao laboratório. */
  lab_service_links?: LabServiceLink[] | null;
  /** Bancada do laboratório: compartimento físico (1..24) ou null (fora da bancada). */
  bench_slot?: number | null;
  bench_slot_at?: string | null;
  bench_queued_at?: string | null;
  /** Dados do conserto em terceiros. */
  external_repair?: ExternalRepair | null;
  diagnostic_authorization_signed_at?: string | null;
  diagnostic_authorization_signature_path?: string | null;
  created_at: string;
  updated_at: string;
  customers: ApiCustomer | null;
}

/** Resposta de POST /api/consulta-placa (PlacaFipe via servidor). */
export interface PlacaFipeLookupResult {
  plate: string;
  vehicleBrand: string | null;
  vehicleModel: string | null;
  vehicleColor: string | null;
  vehicleYear: string | null;
  vehicleEngineInfo: string | null;
  /** Sugestão para o campo cidade (município — UF) */
  citySuggestion: string | null;
}

export async function consultPlacaFipe(placa: string): Promise<PlacaFipeLookupResult> {
  const response = await fetch(`${API_BASE}/consulta-placa`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ placa }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof body.error === "string" && body.error.trim()
        ? body.error
        : `Falha na consulta da placa (${response.status})`
    );
  }
  return body as PlacaFipeLookupResult;
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

// ---------- Boletim de Erros ----------

export type ErrorBulletinStatus = "draft" | "published" | "archived";

export type ErrorBulletinReferenceLink = {
  title?: string;
  url: string;
};

export type ErrorBulletinAttachment = {
  id: string;
  bulletinId: string;
  kind: "photo" | "document" | "link";
  name: string;
  url: string;
  storagePath?: string | null;
  mimeType?: string | null;
  fileSizeBytes?: number | null;
  sortOrder: number;
  createdAt: string;
};

export type ErrorBulletin = {
  id: string;
  workshopId: string;
  title: string;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleYear: string;
  plate: string;
  engineInfo: string;
  dtcCodes: string;
  symptoms: string;
  possibleCauses: string;
  probableCauses: string;
  solution: string;
  notes: string;
  status: ErrorBulletinStatus;
  tags: string[];
  referenceLinks: ErrorBulletinReferenceLink[];
  serviceOrderId: string | null;
  createdByUserId: string | null;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
};

export type ErrorBulletinDetail = ErrorBulletin & {
  attachments: ErrorBulletinAttachment[];
};

export async function getErrorBulletins(params?: {
  status?: string;
  q?: string;
}): Promise<ErrorBulletin[]> {
  const search = new URLSearchParams();
  if (params?.status) search.set("status", params.status);
  if (params?.q) search.set("q", params.q);
  const qs = search.toString();
  const response = await fetch(`${API_BASE}/error-bulletins${qs ? `?${qs}` : ""}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao listar boletins (${response.status})`);
  }
  return response.json();
}

export async function getErrorBulletinById(id: string): Promise<ErrorBulletinDetail> {
  const response = await fetch(`${API_BASE}/error-bulletins/${id}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao carregar boletim (${response.status})`);
  }
  return response.json();
}

export async function createErrorBulletin(payload: {
  title?: string;
  vehicleBrand?: string;
  vehicleModel?: string;
  vehicleYear?: string;
  plate?: string;
  engineInfo?: string;
  dtcCodes?: string;
  symptoms?: string;
  possibleCauses?: string;
  probableCauses?: string;
  solution?: string;
  notes?: string;
  status?: ErrorBulletinStatus;
  tags?: string[];
  referenceLinks?: ErrorBulletinReferenceLink[];
  serviceOrderId?: string | null;
  createdByUserId?: string | null;
  createdByName?: string;
}): Promise<ErrorBulletin> {
  const response = await fetch(`${API_BASE}/error-bulletins`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao criar boletim (${response.status})`);
  }
  return response.json();
}

export async function updateErrorBulletin(
  id: string,
  payload: Partial<{
    title: string;
    vehicleBrand: string;
    vehicleModel: string;
    vehicleYear: string;
    plate: string;
    engineInfo: string;
    dtcCodes: string;
    symptoms: string;
    possibleCauses: string;
    probableCauses: string;
    solution: string;
    notes: string;
    status: ErrorBulletinStatus;
    tags: string[];
    referenceLinks: ErrorBulletinReferenceLink[];
    serviceOrderId: string | null;
  }>
): Promise<ErrorBulletin> {
  const response = await fetch(`${API_BASE}/error-bulletins/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao atualizar boletim (${response.status})`);
  }
  return response.json();
}

export async function deleteErrorBulletin(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/error-bulletins/${id}`, { method: "DELETE" });
  if (!response.ok && response.status !== 204) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao excluir boletim (${response.status})`);
  }
}

export async function uploadErrorBulletinAttachment(
  bulletinId: string,
  file: File
): Promise<ErrorBulletinAttachment> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`${API_BASE}/error-bulletins/${bulletinId}/attachments`, {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao enviar anexo (${response.status})`);
  }
  return response.json();
}

export async function addErrorBulletinLink(
  bulletinId: string,
  payload: { name?: string; url: string }
): Promise<ErrorBulletinAttachment> {
  const response = await fetch(`${API_BASE}/error-bulletins/${bulletinId}/links`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao adicionar link (${response.status})`);
  }
  return response.json();
}

export async function deleteErrorBulletinAttachment(
  bulletinId: string,
  attachmentId: string
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/error-bulletins/${bulletinId}/attachments/${attachmentId}`,
    { method: "DELETE" }
  );
  if (!response.ok && response.status !== 204) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao remover anexo (${response.status})`);
  }
}

// ---------- Radar de Qualidade (ocorrências por mecânico) ----------

export type QualityIncidentCategory =
  | "montagem"
  | "diagnostico"
  | "retrabalho"
  | "prazo"
  | "comunicacao"
  | "seguranca"
  | "peca_material"
  | "cliente"
  | "outro";

export type QualityIncidentSeverity = "baixa" | "media" | "alta" | "critica";

export type QualityIncidentStatus =
  | "aberta"
  | "em_analise"
  | "plano_acao"
  | "resolvida"
  | "arquivada";

export type QualityIncidentAttachment = {
  id: string;
  incidentId: string;
  kind: "photo" | "document" | "link";
  name: string;
  url: string;
  storagePath?: string | null;
  mimeType?: string | null;
  fileSizeBytes?: number | null;
  sortOrder: number;
  createdAt: string;
};

export type QualityIncident = {
  id: string;
  workshopId: string;
  technicianId: string | null;
  technicianName: string;
  title: string;
  category: QualityIncidentCategory;
  severity: QualityIncidentSeverity;
  status: QualityIncidentStatus;
  occurredAt: string;
  description: string;
  impact: string;
  rootCause: string;
  correctiveAction: string;
  preventiveAction: string;
  lessonLearned: string;
  plate: string;
  vehicleSummary: string;
  serviceOrderId: string | null;
  serviceOrderLabel: string;
  registeredByUserId: string | null;
  registeredByName: string;
  resolvedAt: string | null;
  resolvedByName: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type QualityIncidentDetail = QualityIncident & {
  attachments: QualityIncidentAttachment[];
};

export async function getQualityIncidents(params?: {
  status?: string;
  technicianId?: string;
  /** Usuário do sistema (is_technician) — filtra por technician_name na ocorrência. */
  technicianSystemUserId?: string;
  category?: string;
  severity?: string;
  from?: string;
  to?: string;
  q?: string;
}): Promise<QualityIncident[]> {
  const search = new URLSearchParams();
  if (params?.status) search.set("status", params.status);
  if (params?.technicianId) search.set("technicianId", params.technicianId);
  if (params?.technicianSystemUserId) search.set("technicianSystemUserId", params.technicianSystemUserId);
  if (params?.category) search.set("category", params.category);
  if (params?.severity) search.set("severity", params.severity);
  if (params?.from) search.set("from", params.from);
  if (params?.to) search.set("to", params.to);
  if (params?.q) search.set("q", params.q);
  const qs = search.toString();
  const response = await fetch(`${API_BASE}/quality-incidents${qs ? `?${qs}` : ""}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao listar ocorrências (${response.status})`);
  }
  return response.json();
}

export async function getQualityIncidentById(id: string): Promise<QualityIncidentDetail> {
  const response = await fetch(`${API_BASE}/quality-incidents/${id}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao carregar ocorrência (${response.status})`);
  }
  return response.json();
}

export async function createQualityIncident(payload: {
  technicianId?: string | null;
  technicianName?: string;
  title?: string;
  category?: QualityIncidentCategory;
  severity?: QualityIncidentSeverity;
  status?: QualityIncidentStatus;
  occurredAt?: string;
  description?: string;
  impact?: string;
  rootCause?: string;
  correctiveAction?: string;
  preventiveAction?: string;
  lessonLearned?: string;
  plate?: string;
  vehicleSummary?: string;
  serviceOrderId?: string | null;
  serviceOrderLabel?: string;
  registeredByUserId?: string | null;
  registeredByName?: string;
  resolvedAt?: string | null;
  resolvedByName?: string;
  tags?: string[];
}): Promise<QualityIncident> {
  const response = await fetch(`${API_BASE}/quality-incidents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao registrar ocorrência (${response.status})`);
  }
  return response.json();
}

export async function updateQualityIncident(
  id: string,
  payload: Partial<{
    technicianId: string | null;
    technicianName: string;
    title: string;
    category: QualityIncidentCategory;
    severity: QualityIncidentSeverity;
    status: QualityIncidentStatus;
    occurredAt: string;
    description: string;
    impact: string;
    rootCause: string;
    correctiveAction: string;
    preventiveAction: string;
    lessonLearned: string;
    plate: string;
    vehicleSummary: string;
    serviceOrderId: string | null;
    serviceOrderLabel: string;
    resolvedAt: string | null;
    resolvedByName: string;
    tags: string[];
  }>
): Promise<QualityIncident> {
  const response = await fetch(`${API_BASE}/quality-incidents/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao atualizar ocorrência (${response.status})`);
  }
  return response.json();
}

export async function deleteQualityIncident(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/quality-incidents/${id}`, { method: "DELETE" });
  if (!response.ok && response.status !== 204) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao excluir ocorrência (${response.status})`);
  }
}

export async function uploadQualityIncidentAttachment(
  incidentId: string,
  file: File
): Promise<QualityIncidentAttachment> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`${API_BASE}/quality-incidents/${incidentId}/attachments`, {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao enviar anexo (${response.status})`);
  }
  return response.json();
}

export async function addQualityIncidentLink(
  incidentId: string,
  payload: { name?: string; url: string }
): Promise<QualityIncidentAttachment> {
  const response = await fetch(`${API_BASE}/quality-incidents/${incidentId}/links`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao adicionar link (${response.status})`);
  }
  return response.json();
}

export async function deleteQualityIncidentAttachment(
  incidentId: string,
  attachmentId: string
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/quality-incidents/${incidentId}/attachments/${attachmentId}`,
    { method: "DELETE" }
  );
  if (!response.ok && response.status !== 204) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao remover anexo (${response.status})`);
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
      city: customer.city || null,
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
  data: { name?: string; cpf?: string | null; phone?: string; email?: string | null; cep?: string | null; address?: string | null; city?: string | null; addressNumber?: string | null }
): Promise<ApiCustomer> {
  const body: Record<string, unknown> = {};
  if (data.name !== undefined) body.name = data.name;
  if (data.cpf !== undefined) body.cpf = data.cpf;
  if (data.phone !== undefined) body.phone = data.phone;
  if (data.email !== undefined) body.email = data.email;
  if (data.cep !== undefined) body.cep = data.cep;
  if (data.address !== undefined) body.address = data.address;
  if (data.city !== undefined) body.city = data.city;
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
  moduleKind?: string | null;
  moduleVehicleKind?: string | null;
  moduleProductOther?: string | null;
  plate?: string | null;
  mileageKm?: string | null;
  issueDescription?: string;
  aiAnalysis?: string;
  orderType?: ServiceOrderType;
  /** Laboratório: etapa inicial no quadro (padrão: aguardando avaliação). */
  status?: ServiceOrderStatus;
  /** Só veículo: categoria escolhida na recepção */
  vehicleCategory?: string | null;
  vehicleBrand?: string | null;
  vehicleColor?: string | null;
  vehicleYear?: string | null;
  vehicleEngineInfo?: string | null;
}): Promise<ApiServiceOrder> {
  const orderType = params.orderType === "module" ? "module" : "vehicle";
  const body: Record<string, unknown> = {
    customerId: params.customerId,
    vehicleModel: params.vehicleModel ?? (orderType === "module" ? "" : undefined),
    issueDescription: params.issueDescription ?? null,
    aiAnalysis: params.aiAnalysis ?? null,
    orderType,
  };
  if (orderType === "vehicle" && params.vehicleCategory !== undefined) {
    body.vehicleCategory = params.vehicleCategory?.trim() || null;
  }
  if (orderType === "vehicle") {
    body.plate = (params.plate || '').toUpperCase();
    body.mileageKm = params.mileageKm ?? null;
    if (params.vehicleBrand !== undefined) body.vehicleBrand = params.vehicleBrand?.trim() || null;
    if (params.vehicleColor !== undefined) body.vehicleColor = params.vehicleColor?.trim() || null;
    if (params.vehicleYear !== undefined) body.vehicleYear = params.vehicleYear?.trim() || null;
    if (params.vehicleEngineInfo !== undefined)
      body.vehicleEngineInfo = params.vehicleEngineInfo?.trim() || null;
  } else {
    body.plate = null;
    body.mileageKm = null;
    body.moduleIdentification = params.moduleIdentification ?? null;
    if (params.moduleKind) body.moduleKind = params.moduleKind;
    if (params.moduleVehicleKind) body.moduleVehicleKind = params.moduleVehicleKind;
    if (params.moduleProductOther) body.moduleProductOther = params.moduleProductOther;
    if (params.status) body.status = params.status;
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
  orderType: ServiceOrderType = "vehicle",
  vehicleCategory?: string | null,
  moduleInitialStatus?: ServiceOrderStatus
) {
  const createdCustomer = await createCustomer(customer);

  const createdServiceOrder = await createServiceOrder({
    customerId: createdCustomer.id,
    vehicleModel: customer.vehicleModel || '',
    moduleIdentification: orderType === "module" ? (customer.moduleIdentification ?? null) : undefined,
    moduleKind: orderType === "module" ? customer.moduleKind ?? null : undefined,
    moduleVehicleKind: orderType === "module" ? customer.moduleVehicleKind ?? null : undefined,
    moduleProductOther:
      orderType === "module" && customer.moduleKind === "outro"
        ? customer.moduleProductOther?.trim() || null
        : undefined,
    plate: orderType === "vehicle" ? (customer.plate || '').toUpperCase() : undefined,
    mileageKm: orderType === "vehicle" ? (customer.mileageKm ?? null) : undefined,
    issueDescription: customer.issueDescription,
    aiAnalysis: customer.aiAnalysis,
    orderType,
    vehicleCategory: orderType === "vehicle" ? vehicleCategory ?? null : null,
    vehicleBrand: orderType === "vehicle" ? customer.vehicleBrand?.trim() || null : undefined,
    vehicleColor: orderType === "vehicle" ? customer.vehicleColor?.trim() || null : undefined,
    vehicleYear: orderType === "vehicle" ? customer.vehicleYear?.trim() || null : undefined,
    vehicleEngineInfo:
      orderType === "vehicle" ? customer.vehicleEngineInfo?.trim() || null : undefined,
    status: orderType === "module" ? moduleInitialStatus : undefined,
  });

  return {
    customer: createdCustomer,
    serviceOrder: createdServiceOrder,
  };
}

/** Nova OS para um cliente que já existe (ex.: segundo carro ou outro módulo). Não cria registro em `customers`. */
export async function saveReceptionIntakeForExistingCustomer(
  customerId: string,
  customer: Customer,
  orderType: ServiceOrderType = "vehicle",
  vehicleCategory?: string | null,
  moduleInitialStatus?: ServiceOrderStatus
) {
  const createdServiceOrder = await createServiceOrder({
    customerId,
    vehicleModel: customer.vehicleModel || "",
    moduleIdentification: orderType === "module" ? (customer.moduleIdentification ?? null) : undefined,
    moduleKind: orderType === "module" ? customer.moduleKind ?? null : undefined,
    moduleVehicleKind: orderType === "module" ? customer.moduleVehicleKind ?? null : undefined,
    moduleProductOther:
      orderType === "module" && customer.moduleKind === "outro"
        ? customer.moduleProductOther?.trim() || null
        : undefined,
    plate: orderType === "vehicle" ? (customer.plate || "").toUpperCase() : undefined,
    mileageKm: orderType === "vehicle" ? (customer.mileageKm ?? null) : undefined,
    issueDescription: customer.issueDescription,
    aiAnalysis: customer.aiAnalysis,
    orderType,
    vehicleCategory: orderType === "vehicle" ? vehicleCategory ?? null : null,
    vehicleBrand: orderType === "vehicle" ? customer.vehicleBrand?.trim() || null : undefined,
    vehicleColor: orderType === "vehicle" ? customer.vehicleColor?.trim() || null : undefined,
    vehicleYear: orderType === "vehicle" ? customer.vehicleYear?.trim() || null : undefined,
    vehicleEngineInfo: orderType === "vehicle" ? customer.vehicleEngineInfo?.trim() || null : undefined,
    status: orderType === "module" ? moduleInitialStatus : undefined,
  });
  const all = await getCustomers();
  const row = all.find((c) => c.id === customerId);
  if (!row) {
    throw new Error("Cliente não encontrado após criar a OS. Atualize a página e confira o cadastro.");
  }
  return { customer: row, serviceOrder: createdServiceOrder };
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

// ---------- Checklists do Pátio (templates criados pelo admin) ----------

export interface ChecklistTemplateItem {
  id: string;
  text: string;
  sort_order: number;
}

export interface ChecklistTemplate {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
  items: ChecklistTemplateItem[];
}

export async function getChecklistTemplates(): Promise<ChecklistTemplate[]> {
  const response = await fetch(`${API_BASE}/workshop/checklist-templates`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao listar checklists (${response.status})`);
  }
  return response.json();
}

export async function createChecklistTemplate(name: string, items: string[]): Promise<ChecklistTemplate> {
  const response = await fetch(`${API_BASE}/workshop/checklist-templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name.trim(), items }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao criar checklist (${response.status})`);
  }
  return response.json();
}

export async function updateChecklistTemplate(
  id: string,
  name: string,
  items: string[]
): Promise<ChecklistTemplate> {
  const response = await fetch(`${API_BASE}/workshop/checklist-templates/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name.trim(), items }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao atualizar checklist (${response.status})`);
  }
  return response.json();
}

export async function deleteChecklistTemplate(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/workshop/checklist-templates/${id}`, { method: "DELETE" });
  if (!response.ok && response.status !== 204) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao excluir checklist (${response.status})`);
  }
}

/** Estado dos itens por OS: template_item_id -> 'complete' | 'incomplete' */
export async function getServiceOrderChecklistState(
  serviceOrderId: string
): Promise<Record<string, "complete" | "incomplete">> {
  const response = await fetch(`${API_BASE}/service-orders/${serviceOrderId}/checklist-state`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao carregar estado do checklist (${response.status})`);
  }
  return response.json();
}

export async function updateServiceOrderChecklistItem(
  serviceOrderId: string,
  templateItemId: string,
  state: "complete" | "incomplete"
): Promise<void> {
  const response = await fetch(`${API_BASE}/service-orders/${serviceOrderId}/checklist-state`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ templateItemId, state }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao atualizar item (${response.status})`);
  }
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

/** Define (1..24) ou limpa (null) o compartimento da bancada do laboratório. */
export async function updateServiceOrderBenchSlot(
  id: string,
  slot: number | null
): Promise<ApiServiceOrder> {
  const response = await fetch(`${API_BASE}/service-orders/${id}/bench-slot`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slot }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao atualizar compartimento (${response.status})`);
  }
  return response.json();
}

/** Grava (ou limpa, passando null) os dados do conserto externo de uma OS de módulo. */
export async function updateServiceOrderExternalRepair(
  id: string,
  data: ExternalRepair | null
): Promise<ApiServiceOrder> {
  const body = data === null ? { externalRepair: null } : { ...data };
  const response = await fetch(`${API_BASE}/service-orders/${id}/external-repair`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao salvar conserto externo (${response.status})`);
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
  data: {
    vehicleModel?: string;
    moduleIdentification?: string | null;
    plate?: string;
    vehicleBrand?: string | null;
    vehicleColor?: string | null;
    vehicleYear?: string | null;
    vehicleEngineInfo?: string | null;
    moduleKind?: string | null;
    moduleVehicleKind?: string | null;
    moduleProductOther?: string | null;
  },
  options?: ServiceOrderUpdateActor
): Promise<ApiServiceOrder> {
  const body: Record<string, unknown> = {};
  if (data.vehicleModel !== undefined) body.vehicleModel = data.vehicleModel.trim();
  if (data.moduleIdentification !== undefined) body.moduleIdentification = data.moduleIdentification === null || data.moduleIdentification === "" ? null : String(data.moduleIdentification).trim();
  if (data.plate !== undefined) body.plate = data.plate.trim().toUpperCase();
  if (data.vehicleBrand !== undefined) {
    body.vehicleBrand =
      data.vehicleBrand == null || String(data.vehicleBrand).trim() === ""
        ? null
        : String(data.vehicleBrand).trim();
  }
  if (data.vehicleColor !== undefined) {
    body.vehicleColor =
      data.vehicleColor == null || String(data.vehicleColor).trim() === ""
        ? null
        : String(data.vehicleColor).trim();
  }
  if (data.vehicleYear !== undefined) {
    body.vehicleYear =
      data.vehicleYear == null || String(data.vehicleYear).trim() === ""
        ? null
        : String(data.vehicleYear).trim();
  }
  if (data.vehicleEngineInfo !== undefined) {
    body.vehicleEngineInfo =
      data.vehicleEngineInfo == null || String(data.vehicleEngineInfo).trim() === ""
        ? null
        : String(data.vehicleEngineInfo).trim();
  }
  if (data.moduleKind !== undefined) {
    body.moduleKind =
      data.moduleKind == null || String(data.moduleKind).trim() === ""
        ? null
        : String(data.moduleKind).trim();
  }
  if (data.moduleVehicleKind !== undefined) {
    body.moduleVehicleKind =
      data.moduleVehicleKind == null || String(data.moduleVehicleKind).trim() === ""
        ? null
        : String(data.moduleVehicleKind).trim();
  }
  if (data.moduleProductOther !== undefined) {
    body.moduleProductOther =
      data.moduleProductOther == null || String(data.moduleProductOther).trim() === ""
        ? null
        : String(data.moduleProductOther).trim();
  }
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

/** Altera o tipo do cadastro: veículo (Pátio) ↔ módulo (Laboratório). */
export async function updateServiceOrderType(
  id: string,
  orderType: ServiceOrderType,
  options?: ServiceOrderUpdateActor
): Promise<ApiServiceOrder> {
  const body = mergeActorIntoBody({ orderType }, options);
  const response = await fetch(`${API_BASE}/service-orders/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao alterar tipo (${response.status})`);
  }
  return response.json();
}

/** Atualiza a categoria do veículo (Compacto, Médio/SUV, Pick-Up, Premium). Só modo veículo. */
/** Grava caminho da imagem da assinatura (Storage) e data/hora no servidor. */
export async function updateServiceOrderDiagnosticAuthorization(
  id: string,
  data: { signaturePath: string | null },
  options?: ServiceOrderUpdateActor
): Promise<ApiServiceOrder> {
  const body = mergeActorIntoBody(
    { diagnosticAuthorizationSignaturePath: data.signaturePath },
    options
  );
  const response = await fetch(`${API_BASE}/service-orders/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao registrar autorização de diagnóstico (${response.status})`);
  }
  return response.json();
}

export async function updateServiceOrderVehicleCategory(
  id: string,
  vehicleCategory: string | null,
  options?: ServiceOrderUpdateActor
): Promise<ApiServiceOrder> {
  const body = mergeActorIntoBody(
    {
      vehicleCategory:
        vehicleCategory == null || String(vehicleCategory).trim() === ""
          ? null
          : String(vehicleCategory).trim(),
    },
    options
  );
  const response = await fetch(`${API_BASE}/service-orders/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao atualizar categoria (${response.status})`);
  }
  return response.json();
}

/** Atualiza os links de referência exibidos no modal da OS (substitui a lista inteira). */
export async function updateServiceOrderReferenceLinks(
  id: string,
  links: VehicleReferenceLink[],
  options?: ServiceOrderUpdateActor
): Promise<ApiServiceOrder> {
  const body = mergeActorIntoBody({ referenceLinks: links }, options);
  const response = await fetch(`${API_BASE}/service-orders/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao salvar links (${response.status})`);
  }
  return response.json();
}

/** Atualiza os vínculos de serviços enviados ao laboratório (substitui a lista inteira). */
export async function updateServiceOrderLabServiceLinks(
  id: string,
  links: LabServiceLink[],
  options?: ServiceOrderUpdateActor
): Promise<ApiServiceOrder> {
  const body = mergeActorIntoBody({ labServiceLinks: links }, options);
  const response = await fetch(`${API_BASE}/service-orders/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao salvar serviços do laboratório (${response.status})`);
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
  const rows = (await response.json()) as ServiceOrderPhoto[];
  if (!Array.isArray(rows)) return [];
  return rows.filter(
    (p) => p && typeof p.name === "string" && !/AUTORIZACAO_DIAGNOSTICO/i.test(p.name)
  );
}

/** Limite seguro do corpo no Vercel (serverless ~4,5 MB); evita "Failed to fetch" por corte abrupto. */
const UPLOAD_MAX_BYTES = 3.5 * 1024 * 1024;

export async function uploadServiceOrderPhoto(
  id: string,
  file: Blob,
  fileName: string
): Promise<ServiceOrderPhoto> {
  const toSend = await compressImageForUpload(file, 3 * 1024 * 1024);
  if (toSend.size > UPLOAD_MAX_BYTES) {
    throw new Error(
      `Arquivo muito grande (${Math.max(1, Math.round(toSend.size / 1024 / 1024))} MB). Limite para envio é ~3,5 MB. Tente outra imagem ou reduza a resolução.`
    );
  }
  const name = toSend === file ? fileName : (fileName.replace(/\.\w+$/i, ".jpg") || "photo.jpg");
  const formData = new FormData();
  formData.append("file", toSend, name);
  const path = `/service-orders/${id}/photos`;
  const url =
    API_BASE.startsWith("/") && typeof window !== "undefined"
      ? new URL(`${API_BASE.replace(/\/$/, "")}${path}`, window.location.origin).href
      : `${API_BASE.replace(/\/$/, "")}${path}`;
  let response: Response;
  const sameOrigin =
    typeof window !== "undefined" && url.startsWith(`${window.location.origin}/`);
  try {
    response = await fetch(url, {
      method: "POST",
      body: formData,
      cache: "no-store",
      ...(sameOrigin ? ({ mode: "same-origin" } as const) : {}),
    });
  } catch (e) {
    const isNetwork =
      e instanceof TypeError && (String(e.message).includes("fetch") || String(e.message).includes("NetworkError"));
    if (isNetwork) {
      const hasViteBase =
        typeof import.meta.env.VITE_API_BASE === "string" && import.meta.env.VITE_API_BASE.trim() !== "";
      const healthHint =
        typeof window !== "undefined"
          ? ` Abra no navegador: ${window.location.origin}/api/health — se não carregar JSON, a API não está acessível neste endereço.`
          : "";
      throw new Error(
        hasViteBase
          ? `Não foi possível enviar o arquivo (rede ou bloqueio entre domínios). Confira CORS_ALLOWED_ORIGINS na Vercel e se a página HTTPS não chama API em HTTP.${healthHint}`
          : `Não foi possível enviar o arquivo. Verifique Wi‑Fi, VPN e firewall.${healthHint} Se você instalou o app como PWA, abra também pelo Chrome e atualize (Ctrl+F5). Em deploy com domínio próprio, pode ser necessário definir VITE_API_BASE=https://seu-dominio.com/api no build do front.`
      );
    }
    throw e;
  }
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

export async function deleteServiceOrderPhoto(serviceOrderId: string, path: string): Promise<void> {
  const response = await fetch(`${API_BASE}/service-orders/${serviceOrderId}/photos`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao excluir anexo (${response.status})`);
  }
}

/** Substitui o arquivo no Storage (mesmo path) após rotação no cliente. */
export async function rotateServiceOrderPhoto(
  serviceOrderId: string,
  path: string,
  file: Blob,
  fileName: string
): Promise<ServiceOrderPhoto> {
  const toSend = await compressImageForUpload(file, 3 * 1024 * 1024);
  const name = toSend === file ? fileName : (fileName.replace(/\.\w+$/i, ".jpg") || "photo.jpg");
  const formData = new FormData();
  formData.append("file", toSend, name);
  formData.append("path", path);
  const response = await fetch(`${API_BASE}/service-orders/${serviceOrderId}/photos/rotate`, {
    method: "PATCH",
    body: formData,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao girar foto (${response.status})`);
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
  updated_at?: string | null;
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
  authorDisplayName: string,
  actor?: "admin" | "technician"
): Promise<ServiceOrderComment> {
  const body: { text: string; authorDisplayName: string; actor?: "admin" | "technician" } = {
    text: text.trim(),
    authorDisplayName: authorDisplayName.trim(),
  };
  if (actor) body.actor = actor;
  const response = await fetch(`${API_BASE}/service-orders/${serviceOrderId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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
  /** Presente quando a API retorna lista completa (`for=all`): admin | technician */
  target_type?: string | null;
  target_slug?: string | null;
}

export async function getNotifications(params?: {
  limit?: number;
  since?: string;
  /** admin = só central; technician = um técnico; all = toda a oficina (assistente) */
  for?: "admin" | "technician" | "all";
  technicianSlug?: string;
}): Promise<Notification[]> {
  const sp = new URLSearchParams();
  if (params?.limit) sp.set("limit", String(params.limit));
  if (params?.since) sp.set("since", params.since ?? "");
  if (params?.for === "all") {
    sp.set("for", "all");
  } else if (params?.for === "technician" && params?.technicianSlug) {
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
  for?: "admin" | "technician" | "all";
  technicianSlug?: string;
}): Promise<number> {
  const sp = new URLSearchParams();
  if (params?.for === "all") {
    sp.set("for", "all");
  } else if (params?.for === "technician" && params?.technicianSlug) {
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
  params?: { for?: "admin" | "technician" | "all"; technicianSlug?: string }
): Promise<void> {
  const sp = new URLSearchParams();
  if (params?.for === "all") {
    sp.set("for", "all");
  } else if (params?.for === "technician" && params?.technicianSlug) {
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
  for?: "admin" | "technician" | "all";
  technicianSlug?: string;
}): Promise<void> {
  const body =
    params?.for === "all"
      ? { for: "all" as const }
      : params?.for === "technician" && params?.technicianSlug
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
  for?: "admin" | "technician" | "all";
  technicianSlug?: string;
}): Promise<void> {
  const sp = new URLSearchParams();
  if (params?.for === "all") {
    sp.set("for", "all");
  } else if (params?.for === "technician" && params?.technicianSlug) {
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

/** Lembretes do Pátio (vehicle) / Laboratório (module) — compartilhados na oficina. */
export type WorkshopReminderScopeApi = "vehicle" | "module";

export interface WorkshopReminder {
  id: string;
  text: string;
  done: boolean;
  createdAt: string;
  createdBy: string;
}

export async function getWorkshopReminders(scope: WorkshopReminderScopeApi): Promise<WorkshopReminder[]> {
  const response = await fetch(`${API_BASE}/workshop-reminders?scope=${encodeURIComponent(scope)}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Falha ao carregar lembretes.");
  }
  return response.json();
}

export async function createWorkshopReminder(params: {
  scope: WorkshopReminderScopeApi;
  text: string;
  createdBy: string;
}): Promise<WorkshopReminder> {
  const response = await fetch(`${API_BASE}/workshop-reminders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scope: params.scope,
      text: params.text.trim(),
      createdBy: params.createdBy.trim(),
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Falha ao criar lembrete.");
  }
  return response.json();
}

export async function updateWorkshopReminderRemote(
  id: string,
  params: {
    scope: WorkshopReminderScopeApi;
    text?: string;
    done?: boolean;
  }
): Promise<void> {
  const response = await fetch(`${API_BASE}/workshop-reminders/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scope: params.scope,
      ...(typeof params.text === "string" ? { text: params.text } : {}),
      ...(typeof params.done === "boolean" ? { done: params.done } : {}),
    }),
  });
  if (!response.ok && response.status !== 204) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Falha ao atualizar lembrete.");
  }
}

export async function deleteWorkshopReminderRemote(id: string, scope: WorkshopReminderScopeApi): Promise<void> {
  const response = await fetch(
    `${API_BASE}/workshop-reminders/${encodeURIComponent(id)}?scope=${encodeURIComponent(scope)}`,
    { method: "DELETE" }
  );
  if (!response.ok && response.status !== 204) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Falha ao excluir lembrete.");
  }
}

// ---------- Orçamentos ----------

/** Orçamento no formato da API (snake_case). approved = decisão do admin por item. */
interface ApiBudget {
  id: string;
  service_order_id: string;
  card_name: string | null;
  diagnosis: string;
  services: { description: string; approved?: boolean; labor_hours?: number | null }[];
  parts: BudgetPartFields[];
  observations: string;
  created_at: string;
  updated_at?: string | null;
}

/** Orçamento no formato do frontend (SavedBudget). approved = aprovado (true) ou reprovado (false) pelo admin. */
export interface SavedBudgetFromApi {
  id: string;
  createdAt: string;
  /** Última edição (igual a createdAt até a primeira alteração). */
  updatedAt: string;
  serviceOrderId: string;
  cardName: string;
  diagnosis: string;
  services: { description: string; approved?: boolean; labor_hours?: number | null }[];
  parts: BudgetPartFields[];
  observations: string;
}

/** Timestamp (ms) da última atividade: criação ou última edição. */
export function budgetLastActivityMs(b: { createdAt: string; updatedAt?: string | null }): number {
  const c = new Date(b.createdAt).getTime();
  const raw = b.updatedAt != null && String(b.updatedAt).trim() !== "" ? String(b.updatedAt) : "";
  const u = raw ? new Date(raw).getTime() : NaN;
  if (!Number.isFinite(c)) return 0;
  if (!Number.isFinite(u)) return c;
  return Math.max(c, u);
}

/** Número do orçamento na OS por ordem de criação (1 = mais antigo). */
export function budgetChronologicalNumber(all: { id: string; createdAt: string }[], budgetId: string): number {
  const sorted = [...all].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const i = sorted.findIndex((x) => x.id === budgetId);
  return i >= 0 ? i + 1 : 1;
}

function mapApiBudgetToSaved(b: ApiBudget): SavedBudgetFromApi {
  const createdAt = b.created_at;
  const updatedRaw = b.updated_at != null && String(b.updated_at).trim() !== "" ? String(b.updated_at) : "";
  const updatedAt = updatedRaw || createdAt;
  return {
    id: b.id,
    createdAt,
    updatedAt,
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

/** Item do hub “Orçamentos” (Pátio + Laboratório, OS não arquivadas). */
export interface PatioVehicleBudgetAggregateItem {
  budgetId: string;
  serviceOrderId: string;
  createdAt: string;
  updatedAt: string;
  contentSignature: string;
  cardName: string | null;
  diagnosisPreview: string;
  servicesCount: number;
  partsCount: number;
  plate: string | null;
  vehicleModel: string | null;
  vehicleBrand: string | null;
  osNumber: number | null;
  orderStatus: string;
  /** `vehicle` = Pátio · `module` = Laboratório */
  orderType: 'vehicle' | 'module';
  moduleIdentification: string | null;
  customerName: string | null;
  hasApprovedItems: boolean;
  hasExplicitApprovalDecisions: boolean;
  approvedItemsCount: number;
  rejectedItemsCount: number;
  pendingItemsCount: number;
}

export async function getPatioVehicleBudgetsAggregate(): Promise<PatioVehicleBudgetAggregateItem[]> {
  const response = await fetch(`${API_BASE}/patio-vehicle-budgets-aggregate`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao carregar orçamentos (${response.status})`);
  }
  const data = (await response.json()) as { items?: PatioVehicleBudgetAggregateItem[] };
  return Array.isArray(data.items) ? data.items : [];
}

export async function createServiceOrderBudget(
  serviceOrderId: string,
  payload: {
    cardName: string;
    diagnosis: string;
    services: { description: string; labor_hours?: number | null }[];
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
    services: { description: string; approved?: boolean; labor_hours?: number | null }[];
    parts: { description: string; quantity: string; approved?: boolean }[];
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
  category: string | null;
  labor_hours: number | null;
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

export async function createWorkshopService(input: {
  name: string;
  category?: string | null;
  labor_hours?: number | null;
}): Promise<WorkshopService> {
  const response = await fetch(`${API_BASE}/workshop-services`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.name.trim(),
      category: input.category?.trim() || null,
      labor_hours: input.labor_hours ?? null,
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao criar serviço (${response.status})`);
  }
  return response.json();
}

export async function updateWorkshopService(
  id: string,
  input: { name: string; category?: string | null; labor_hours?: number | null }
): Promise<WorkshopService> {
  const response = await fetch(`${API_BASE}/workshop-services/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.name.trim(),
      category: input.category?.trim() || null,
      labor_hours: input.labor_hours ?? null,
    }),
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

// ---------- Estoque de peças (para orçamentos) ----------

export type WorkshopPartFiscalExtra = {
  cest?: string;
  cfop?: string;
  icms_cst?: string;
  ipi_cst?: string;
  pis_cst?: string;
  cofins_cst?: string;
  tax_notes?: string;
};

export type WorkshopPartPurchaseStatus = 'pending' | 'ordered' | 'received' | 'cancelled';

export interface WorkshopPartPurchase {
  id: string;
  part_id: string;
  supplier_name: string | null;
  quantity: number;
  unit_cost: number;
  expected_date: string | null;
  notes: string | null;
  status: WorkshopPartPurchaseStatus;
  created_at: string;
}

export interface WorkshopPartPhoto {
  id: string;
  part_id: string;
  photo_url: string;
  sort_order: number;
}

export const WORKSHOP_PART_PHOTOS_MAX = 3;

export interface WorkshopPart {
  id: string;
  name: string;
  brand?: string | null;
  unit_price: number;
  stock_qty: number;
  photo_url?: string | null;
  photos?: WorkshopPartPhoto[];
  sort_order: number;
  created_at: string;
  original_code?: string | null;
  numeric_code?: string | null;
  location?: string | null;
  application_similar?: string | null;
  notes?: string | null;
  ncm_code?: string | null;
  unit_of_measure?: string;
  min_stock_qty?: number;
  max_stock_qty?: number | null;
  fiscal_origin?: string;
  premium_amount?: number;
  commission_pct?: number;
  default_profit_pct?: number;
  km_limit?: number | null;
  validity_months?: number | null;
  unit_cost?: number;
  fiscal_extra?: WorkshopPartFiscalExtra;
  primary_category_id?: string | null;
  /** IDs das categorias do estoque vinculadas a este produto. */
  category_ids?: string[];
  purchases?: WorkshopPartPurchase[];
}

export type WorkshopPartWriteInput = {
  name: string;
  brand?: string | null;
  unit_price?: number;
  stock_qty?: number;
  original_code?: string | null;
  numeric_code?: string | null;
  location?: string | null;
  application_similar?: string | null;
  notes?: string | null;
  ncm_code?: string | null;
  unit_of_measure?: string;
  min_stock_qty?: number;
  max_stock_qty?: number | null;
  fiscal_origin?: string;
  premium_amount?: number;
  commission_pct?: number;
  default_profit_pct?: number;
  km_limit?: number | null;
  validity_months?: number | null;
  unit_cost?: number;
  fiscal_extra?: WorkshopPartFiscalExtra;
  primary_category_id?: string | null;
  photo_url?: string | null;
};

export interface WorkshopPartCategory {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export type { WorkshopPartsAnalyticsResponse } from '../utils/workshopPartsAnalytics';

export async function getWorkshopPartsAnalytics(
  preset: '7d' | '30d' | '90d' | 'month' | 'year' = '30d'
): Promise<import('../utils/workshopPartsAnalytics').WorkshopPartsAnalyticsResponse> {
  const response = await fetch(`${API_BASE}/workshop-parts/analytics?preset=${encodeURIComponent(preset)}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao carregar gráficos do estoque (${response.status})`);
  }
  return response.json();
}

export async function getWorkshopParts(): Promise<WorkshopPart[]> {
  const response = await fetch(`${API_BASE}/workshop-parts`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao listar peças (${response.status})`);
  }
  const list = (await response.json()) as Record<string, unknown>[];
  return list.map((p) => normalizeWorkshopPartRow(p));
}

function normalizeWorkshopPartRow(row: Record<string, unknown>): WorkshopPart {
  const fiscal = row.fiscal_extra;
  return {
    ...(row as WorkshopPart),
    unit_price: Number(row.unit_price ?? 0),
    stock_qty: Number(row.stock_qty ?? 0),
    min_stock_qty: Number(row.min_stock_qty ?? 0),
    max_stock_qty: row.max_stock_qty != null ? Number(row.max_stock_qty) : null,
    premium_amount: Number(row.premium_amount ?? 0),
    commission_pct: Number(row.commission_pct ?? 0),
    default_profit_pct: Number(row.default_profit_pct ?? 0),
    unit_cost: Number(row.unit_cost ?? 0),
    km_limit: row.km_limit != null ? Number(row.km_limit) : null,
    validity_months: row.validity_months != null ? Number(row.validity_months) : null,
    fiscal_extra:
      fiscal && typeof fiscal === 'object' && !Array.isArray(fiscal)
        ? (fiscal as WorkshopPartFiscalExtra)
        : {},
    category_ids: Array.isArray(row.category_ids) ? (row.category_ids as string[]) : [],
    photos: Array.isArray(row.photos) ? (row.photos as WorkshopPartPhoto[]) : undefined,
    purchases: Array.isArray(row.purchases) ? (row.purchases as WorkshopPartPurchase[]) : undefined,
  };
}

export async function getWorkshopPartPhotos(partId: string): Promise<WorkshopPartPhoto[]> {
  const response = await fetch(`${API_BASE}/workshop-parts/${partId}/photos`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao listar fotos (${response.status})`);
  }
  return response.json();
}

export async function deleteWorkshopPartPhoto(partId: string, photoId: string): Promise<WorkshopPart> {
  const response = await fetch(`${API_BASE}/workshop-parts/${partId}/photos/${photoId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao excluir foto (${response.status})`);
  }
  const row = await response.json();
  return normalizeWorkshopPartRow(row as Record<string, unknown>);
}

export async function createWorkshopPart(input: WorkshopPartWriteInput): Promise<WorkshopPart> {
  const response = await fetch(`${API_BASE}/workshop-parts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao criar peça (${response.status})`);
  }
  const row = await response.json();
  return normalizeWorkshopPartRow(row as Record<string, unknown>);
}

export async function updateWorkshopPart(
  id: string,
  input: Partial<WorkshopPartWriteInput>
): Promise<WorkshopPart> {
  const response = await fetch(`${API_BASE}/workshop-parts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao atualizar peça (${response.status})`);
  }
  const row = await response.json();
  return normalizeWorkshopPartRow(row as Record<string, unknown>);
}

export async function getWorkshopPartPurchases(partId: string): Promise<WorkshopPartPurchase[]> {
  const response = await fetch(`${API_BASE}/workshop-parts/${partId}/purchases`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao listar compras (${response.status})`);
  }
  return response.json();
}

/** Contexto da OS do laboratório vinculada ao produto (para ficha impressa). */
export type WorkshopPartLabContext = {
  service_order_id?: string;
  os_number?: number | null;
  issue_description?: string | null;
  customer_name?: string | null;
  vehicle_model?: string | null;
  vehicle_brand?: string | null;
  module_identification?: string | null;
  module_kind?: string | null;
  module_vehicle_kind?: string | null;
  module_product_other?: string | null;
  plate?: string | null;
  mileage_km?: string | null;
  vehicle_year?: string | null;
  vehicle_engine_info?: string | null;
  status?: string | null;
};

export async function getWorkshopPartLabContext(
  partId: string
): Promise<{ context: WorkshopPartLabContext | null }> {
  const response = await fetch(`${API_BASE}/workshop-parts/${partId}/lab-context`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao buscar OS do laboratório (${response.status})`);
  }
  return response.json();
}

export async function createWorkshopPartPurchase(
  partId: string,
  input: {
    supplier_name?: string | null;
    quantity?: number;
    unit_cost?: number;
    expected_date?: string | null;
    notes?: string | null;
    status?: WorkshopPartPurchaseStatus;
  }
): Promise<WorkshopPartPurchase> {
  const response = await fetch(`${API_BASE}/workshop-parts/${partId}/purchases`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao adicionar compra (${response.status})`);
  }
  return response.json();
}

export async function updateWorkshopPartPurchase(
  partId: string,
  purchaseId: string,
  input: {
    supplier_name?: string | null;
    quantity?: number;
    unit_cost?: number;
    expected_date?: string | null;
    notes?: string | null;
    status?: WorkshopPartPurchaseStatus;
  }
): Promise<WorkshopPartPurchase> {
  const response = await fetch(`${API_BASE}/workshop-parts/${partId}/purchases/${purchaseId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao atualizar compra (${response.status})`);
  }
  return response.json();
}

export async function deleteWorkshopPartPurchase(partId: string, purchaseId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/workshop-parts/${partId}/purchases/${purchaseId}`, {
    method: "DELETE",
  });
  if (!response.ok && response.status !== 204) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao excluir compra (${response.status})`);
  }
}

export async function deleteWorkshopPart(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/workshop-parts/${id}`, { method: "DELETE" });
  if (!response.ok && response.status !== 204) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao excluir peça (${response.status})`);
  }
}

/** Adiciona ou substitui foto. A primeira (sort_order 0) vira capa (`photo_url`). */
export async function uploadWorkshopPartPhoto(
  partId: string,
  file: Blob,
  fileName?: string,
  options?: { replacePhotoId?: string }
): Promise<WorkshopPart> {
  const formData = new FormData();
  formData.append("file", file, fileName ?? "part.jpg");
  if (options?.replacePhotoId) {
    formData.append("replace_photo_id", options.replacePhotoId);
  }
  const replaceQs = options?.replacePhotoId
    ? `?replace_photo_id=${encodeURIComponent(options.replacePhotoId)}`
    : "";
  const response = await fetch(`${API_BASE}/workshop-parts/${partId}/photo${replaceQs}`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao enviar foto da peça (${response.status})`);
  }
  const row = await response.json();
  return normalizeWorkshopPartRow(row as Record<string, unknown>);
}

export async function getWorkshopPartCategories(): Promise<WorkshopPartCategory[]> {
  const response = await fetch(`${API_BASE}/workshop-part-categories`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao listar categorias (${response.status})`);
  }
  return response.json();
}

export async function createWorkshopPartCategory(input: {
  name: string;
  sort_order?: number;
}): Promise<WorkshopPartCategory> {
  const response = await fetch(`${API_BASE}/workshop-part-categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.name.trim(),
      sort_order: input.sort_order ?? 0,
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao criar categoria (${response.status})`);
  }
  return response.json();
}

export async function updateWorkshopPartCategory(
  id: string,
  input: { name?: string; sort_order?: number }
): Promise<WorkshopPartCategory> {
  const body: Record<string, unknown> = {};
  if (input.name !== undefined) body.name = input.name.trim();
  if (input.sort_order !== undefined) body.sort_order = input.sort_order;
  const response = await fetch(`${API_BASE}/workshop-part-categories/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao atualizar categoria (${response.status})`);
  }
  return response.json();
}

export async function deleteWorkshopPartCategory(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/workshop-part-categories/${id}`, { method: "DELETE" });
  if (!response.ok && response.status !== 204) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao excluir categoria (${response.status})`);
  }
}

export async function setWorkshopPartCategories(
  partId: string,
  categoryIds: string[]
): Promise<WorkshopPart> {
  const response = await fetch(`${API_BASE}/workshop-parts/${partId}/categories`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ categoryIds }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao salvar categorias do produto (${response.status})`);
  }
  const row = await response.json();
  return normalizeWorkshopPartRow(row as Record<string, unknown>);
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
  /** Acesso completo igual ao administrador (todas as telas, Administração e ações no Pátio). */
  full_access?: boolean;
  access_home?: boolean;
  access_reception?: boolean;
  access_agenda?: boolean;
  access_patio?: boolean;
  access_laboratorio?: boolean;
  /** Hub de orçamentos (aba). Se omitido, segue o mesmo que `access_patio` (compatibilidade). */
  access_orcamentos?: boolean;
  /** Tile e modal TV do Pátio; link externo do painel no hub de configurações. */
  access_tv_patio?: boolean;
  /** Tile «Central do atendimento» (acompanhamento de OS). */
  access_centro_atendimento?: boolean;
  /** Tile «Estoque de peças» e catálogo de peças. */
  access_estoque_pecas?: boolean;
  /** Centro de relatórios (módulo na página inicial). */
  access_relatorios?: boolean;
  /** Boletim de Erros — base de conhecimento DTC/sintomas/soluções. */
  access_boletim_erros?: boolean;
  /** Radar de Qualidade — ocorrências e relatório por mecânico. */
  access_radar_qualidade?: boolean;
  /** Modal «Serviços da oficina» (hub Configurações). */
  access_servicos_oficina?: boolean;
  /** Modal «Checklists do Pátio». */
  access_checklists_patio?: boolean;
  /** Modal «Notificações do sistema». */
  access_notificacoes_sistema?: boolean;
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
  /** Aprovar/reprovar itens (serviços e peças) no orçamento. Se omitido, vale o mesmo que patio_edit_budgets (compatibilidade). */
  patio_approve_budget_items?: boolean;
  patio_add_comments?: boolean;
  patio_archive_card?: boolean;
}

/** Se o usuário pode aprovar/reprovar itens do orçamento no Pátio/Laboratório (respeita legado quando a chave não existe no JSON). */
export function effectivePatioApproveBudgetItems(perms: SystemUserPermissions | undefined): boolean {
  if (!perms) return true;
  if (perms.full_access) return true;
  if (perms.patio_approve_budget_items === true) return true;
  if (perms.patio_approve_budget_items === false) return false;
  return !!perms.patio_edit_budgets;
}

/** Aba «Orçamentos»: se a chave não existir no JSON, mantém o comportamento antigo (ligado ao Pátio). */
export function effectiveAccessOrcamentos(perms: SystemUserPermissions | undefined): boolean {
  if (!perms) return false;
  if (perms.full_access) return true;
  if (perms.access_orcamentos === true) return true;
  if (perms.access_orcamentos === false) return false;
  return !!perms.access_patio;
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

/** Todos os usuários do sistema (nome para selects — ex.: Radar de Qualidade). */
export interface SystemUserDirectoryEntry {
  id: string;
  username: string;
  display_name: string | null;
  job_title: string | null;
}

export async function getSystemUsersDirectory(): Promise<SystemUserDirectoryEntry[]> {
  const response = await fetch(`${API_BASE}/system-users/directory`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Falha ao listar usuários do sistema.");
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

/** Aparência global (JSON no banco); formato em `utils/appAppearance`. */
export type WorkshopAppAppearance = Record<string, unknown>;

export interface WorkshopSettings {
  patioLoginEnabled: boolean;
  patioPin: string;
  technicianAccessReception: boolean;
  technicianAccessAgenda: boolean;
  technicianAccessPatio: boolean;
  adminDisplayName?: string;
  adminPhotoUrl?: string | null;
  vehicleDeletePassword?: string;
  /** Configuração visual da oficina (cor de destaque, wallpapers); null se nunca salvo. */
  appAppearance?: WorkshopAppAppearance | null;
  /** Tipos de produto do laboratório configuráveis (id + rótulo). */
  labProductKinds?: { id: string; label: string }[];
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
  updates: Partial<WorkshopSettings> & {
    adminPassword?: string;
    adminDisplayName?: string;
    adminPhotoUrl?: string | null;
    vehicleDeletePassword?: string;
    appAppearance?: WorkshopAppAppearance | null;
    labProductKinds?: { id: string; label: string }[];
  }
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

export interface WorkshopUserOption {
  id: string;
  username: string;
  displayName: string;
}

export interface SystemNotificationsSubscriberRow {
  systemUserId: string;
  notificationTypes: string[];
  displayName: string;
}

export interface SystemNotificationsConfig {
  adminNotificationTypes: string[];
  subscribers: SystemNotificationsSubscriberRow[];
  availableUsers: WorkshopUserOption[];
}

export async function getSystemNotificationsConfig(): Promise<SystemNotificationsConfig> {
  const response = await fetch(`${API_BASE}/workshop/system-notifications`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Falha ao carregar notificações do sistema.");
  }
  return response.json();
}

export async function saveSystemNotificationsConfig(body: {
  adminPassword: string;
  adminNotificationTypes: string[];
  subscribers: { systemUserId: string; notificationTypes: string[] }[];
}): Promise<void> {
  const response = await fetch(`${API_BASE}/workshop/system-notifications`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Falha ao salvar notificações do sistema.");
  }
}

/**
 * Arquiva a OS (status CANCELLED).
 * Aceita a senha do administrador ou a senha configurada em Alterar senhas (excluir veículos).
 */
export async function deleteServiceOrderWithPassword(serviceOrderId: string, password: string): Promise<void> {
  const response = await fetch(`${API_BASE}/service-orders/${serviceOrderId}/delete-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: String(password).trim() }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Falha ao excluir ordem de serviço.");
  }
}

/** Atalho: excluir OS com senha do administrador (mesmo endpoint que deleteServiceOrderWithPassword). */
export async function deleteServiceOrderWithAdminPassword(
  serviceOrderId: string,
  adminPassword: string
): Promise<void> {
  return deleteServiceOrderWithPassword(serviceOrderId, adminPassword);
}

/** --- TV do pátio (playlist) --- */
export type TvSlideType = "notice" | "image" | "video" | "goal" | "alert";

/** Encaixe da imagem/vídeo na área da TV (object-fit). */
export type TvMediaObjectFit = "cover" | "contain" | "fill";

export function normalizeTvMediaObjectFit(v: unknown): TvMediaObjectFit {
  const s = String(v ?? "").toLowerCase();
  if (s === "contain" || s === "fill" || s === "cover") return s;
  return "cover";
}

export interface TvSlide {
  id: string;
  slideType: TvSlideType;
  title: string;
  body: string;
  mediaUrl: string | null;
  durationSeconds: number;
  sortOrder: number;
  isActive?: boolean;
  goalCurrent: number | null;
  goalTarget: number | null;
  goalLabel: string | null;
  /** Bip ao exibir este slide na TV. */
  playSound?: boolean;
  /** Só para tipo goal: true = R$, false = %. */
  goalShowValues?: boolean;
  /** Fixa este slide na TV imediatamente até desligar (só um por oficina). */
  pinImmediate?: boolean;
  /** Para imagem/vídeo: preencher toda a área (sem bordas). */
  mediaFullscreen?: boolean;
  /** Para imagem/vídeo: como encaixar na área (cover / contain / fill). */
  mediaObjectFit?: TvMediaObjectFit;
}

export interface TvWeeklyGoal {
  label: string;
  currentAmount: number;
  targetAmount: number;
  /** Se false, a barra de meta não aparece na TV (páginas de veículos). Default true. */
  showWeeklyBar?: boolean;
}

/** Painel TV: pátio (veículos) ou laboratório (módulos). */
export type TvScope = "patio" | "laboratorio";

function tvScopeQuery(scope: TvScope): string {
  return `scope=${encodeURIComponent(scope)}`;
}

export async function getTvManage(scope: TvScope = "patio"): Promise<{
  slides: TvSlide[];
  weeklyGoal: TvWeeklyGoal | null;
  chimeSchedule: TvChimeScheduleConfig;
}> {
  const response = await fetch(`${API_BASE}/tv/manage?${tvScopeQuery(scope)}`, { cache: 'no-store' });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Falha ao carregar dados da TV.");
  }
  const d = (await response.json()) as {
    slides: TvSlide[];
    weeklyGoal: TvWeeklyGoal | null;
    chimeSchedule?: unknown;
  };
  return {
    slides: d.slides ?? [],
    weeklyGoal: d.weeklyGoal ?? null,
    chimeSchedule: normalizeTvChimeConfig(d.chimeSchedule ?? null),
  };
}

export async function putTvWeeklyGoal(
  data: {
    label: string;
    currentAmount: number;
    targetAmount: number;
    showWeeklyBar?: boolean;
  },
  scope: TvScope = "patio"
): Promise<void> {
  const response = await fetch(`${API_BASE}/tv/weekly-goal`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      label: data.label,
      currentAmount: data.currentAmount,
      targetAmount: data.targetAmount,
      showWeeklyBar: data.showWeeklyBar !== false,
      tvScope: scope,
    }),
  });
  const err = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((err as { error?: string }).error || "Falha ao salvar meta.");
  }
}

/** Playlist pública da TV (slides + meta semanal sem senha). Inclui `chimeSchedule` para o painel reproduzir avisos por horário. */
export async function getTvPlaylist(scope: TvScope = "patio"): Promise<{
  slides: unknown[];
  weeklyGoal: TvWeeklyGoal | null;
  chimeSchedule: TvChimeScheduleConfig;
}> {
  const response = await fetch(`${API_BASE}/tv/playlist?${tvScopeQuery(scope)}`);
  const d = (await response.json().catch(() => ({}))) as {
    slides?: unknown[];
    weeklyGoal?: TvWeeklyGoal | null;
    chimeSchedule?: unknown;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(d.error || "Falha ao carregar playlist da TV.");
  }
  return {
    slides: d.slides ?? [],
    weeklyGoal: d.weeklyGoal ?? null,
    chimeSchedule: normalizeTvChimeConfig(d.chimeSchedule ?? null),
  };
}

export async function putTvChimeSchedule(
  config: TvChimeScheduleConfig,
  scope: TvScope = "patio"
): Promise<TvChimeScheduleConfig> {
  const response = await fetch(`${API_BASE}/tv/chime-schedule`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config, tvScope: scope }),
  });
  const err = (await response.json().catch(() => ({}))) as {
    chimeSchedule?: unknown;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(err.error || "Falha ao salvar horários da TV.");
  }
  if (err.chimeSchedule !== undefined && err.chimeSchedule !== null) {
    return normalizeTvChimeConfig(err.chimeSchedule);
  }
  return normalizeTvChimeConfig(config);
}

export async function deleteTvWeeklyGoal(scope: TvScope = "patio"): Promise<void> {
  const response = await fetch(`${API_BASE}/tv/weekly-goal?${tvScopeQuery(scope)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tvScope: scope }),
  });
  const err = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((err as { error?: string }).error || "Falha ao remover meta.");
  }
}

export async function createTvSlide(
  slide: Omit<TvSlide, "id"> & { isActive?: boolean },
  scope: TvScope = "patio"
): Promise<string> {
  const response = await fetch(`${API_BASE}/tv/slides`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slide, tvScope: scope }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || "Falha ao criar slide.");
  }
  return (data as { id?: string }).id ?? "";
}

export async function updateTvSlide(id: string, slide: Partial<Omit<TvSlide, "id">>): Promise<void> {
  const response = await fetch(`${API_BASE}/tv/slides/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slide }),
  });
  const err = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((err as { error?: string }).error || "Falha ao atualizar slide.");
  }
}

export async function deleteTvSlide(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/tv/slides/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Falha ao excluir slide.");
  }
}

/** Upload de imagem ou vídeo para o Storage da TV (retorna URL pública). */
export async function uploadTvPatioMedia(file: File): Promise<{ url: string }> {
  const fd = new FormData();
  fd.append("file", file);
  const response = await fetch(`${API_BASE}/tv/media/upload`, {
    method: "POST",
    body: fd,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || "Falha no upload do arquivo.");
  }
  return data as { url: string };
}

/** Marcador em foto de entrada (% da largura/altura da imagem). */
export type VehicleAccompanimentMarker = { id: string; xPct: number; yPct: number; note: string };

/** Foto de entrada com caminho no Storage da OS. */
export type VehicleAccompanimentPhoto = {
  id: string;
  path: string;
  markers: VehicleAccompanimentMarker[];
  /** Serviço vinculado à foto (antes/depois). */
  service_id?: string;
  service_name?: string;
  phase?: "before" | "after";
};

export type WorkshopVehicleAccompanimentRow = {
  id: string;
  workshop_id: string;
  service_order_id: string;
  share_token: string;
  intake_observations: string | null;
  intake_photos: VehicleAccompanimentPhoto[];
  client_rating_attendance: number | null;
  client_rating_service: number | null;
  client_rating_recommend: number | null;
  client_rating_comment: string | null;
  client_rating_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function getVehicleAccompanimentByOrder(
  serviceOrderId: string
): Promise<WorkshopVehicleAccompanimentRow | null> {
  const response = await fetch(`${API_BASE}/vehicle-accompaniment/by-order/${encodeURIComponent(serviceOrderId)}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || "Falha ao carregar central do atendimento.");
  }
  return data as WorkshopVehicleAccompanimentRow | null;
}

export async function bootstrapVehicleAccompaniment(serviceOrderId: string): Promise<WorkshopVehicleAccompanimentRow> {
  const response = await fetch(`${API_BASE}/vehicle-accompaniment/bootstrap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ serviceOrderId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || "Falha ao criar central.");
  }
  return data as WorkshopVehicleAccompanimentRow;
}

export async function putVehicleAccompaniment(
  serviceOrderId: string,
  payload: {
    intake_observations: string;
    intake_photos: VehicleAccompanimentPhoto[];
    budget_public_settings?: Record<string, { visible: boolean; allow_client_approval: boolean }>;
  }
): Promise<WorkshopVehicleAccompanimentRow> {
  const response = await fetch(`${API_BASE}/vehicle-accompaniment/by-order/${encodeURIComponent(serviceOrderId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || "Falha ao guardar.");
  }
  return data as WorkshopVehicleAccompanimentRow;
}

export type PublicVehicleAccompanimentPayload = {
  workshopName: string | null;
  serviceOrder: {
    os_number?: number | null;
    plate: string | null;
    vehicle_brand?: string | null;
    vehicle_model?: string | null;
    vehicle_color?: string | null;
    vehicle_year?: string | null;
    mileage_km?: string | null;
    status: string;
    progressLabel: string;
    finalized: boolean;
    issue_description?: string | null;
    customer: { name?: string; phone?: string | null; email?: string | null } | null;
  };
  intake_observations: string;
  intake_photos: { id?: string; path?: string; url: string; markers: VehicleAccompanimentMarker[] }[];
  budgets: {
    id: string;
    diagnosis?: string | null;
    services: unknown;
    parts: unknown;
    observations?: string | null;
    created_at?: string;
    updated_at?: string;
  }[];
  ratings: {
    attendance: number | null;
    service: number | null;
    recommend: number | null;
    comment: string | null;
    submittedAt: string | null;
  };
};

export async function getPublicVehicleAccompaniment(token: string): Promise<PublicVehicleAccompanimentPayload> {
  const response = await fetch(`${API_BASE}/public/vehicle-accompaniment/${encodeURIComponent(token)}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || "Não foi possível carregar a página.");
  }
  return data as PublicVehicleAccompanimentPayload;
}

export async function submitPublicVehicleAccompanimentRatings(
  token: string,
  payload: {
    client_rating_attendance: number;
    client_rating_service: number;
    client_rating_recommend: number;
    client_rating_comment?: string;
  }
): Promise<void> {
  const response = await fetch(`${API_BASE}/public/vehicle-accompaniment/${encodeURIComponent(token)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || "Não foi possível enviar a avaliação.");
  }
}

