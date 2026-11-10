import type { SupabaseClient } from "@supabase/supabase-js";
import type { RdaAuthContext } from "../types.js";
import {
  actorDisplayName,
  canManageProductivity,
  canUpdateTaskAsAssignee,
  canViewProductivity,
} from "./access.js";
import { notifyProductivityEvent } from "./notifications.js";
import type {
  CreateProductivityTaskInput,
  ProductivityAssignablePerson,
  ProductivityPendingSummary,
  ProductivityTaskFilters,
  ProductivityTaskPriority,
  ProductivityTaskRow,
  ProductivityTaskStatus,
  ProductivityTaskView,
  UpdateProductivityTaskInput,
} from "./types.js";

const OPEN_STATUSES: ProductivityTaskStatus[] = ["pending", "in_progress"];

function mapRow(row: ProductivityTaskRow): ProductivityTaskView {
  const overdue =
    OPEN_STATUSES.includes(row.status) &&
    !!row.due_at &&
    new Date(row.due_at).getTime() < Date.now();
  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    priority: row.priority,
    status: row.status,
    requesterUserId: row.requester_user_id,
    requesterName: row.requester_name,
    assigneeUserId: row.assignee_user_id,
    assigneeName: row.assignee_name,
    dueAt: row.due_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    refType: row.ref_type,
    refId: row.ref_id,
    refLabel: row.ref_label,
    notes: row.notes || "",
    createdByUserId: row.created_by_user_id,
    createdByName: row.created_by_name,
    updatedByUserId: row.updated_by_user_id,
    updatedByName: row.updated_by_name,
    clientRequestId: row.client_request_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    overdue,
  };
}

function clampLimit(n: unknown, fallback = 40): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(1, Math.min(100, Math.floor(v)));
}

export function normalizePriority(raw: unknown): ProductivityTaskPriority {
  const p = String(raw || "normal").trim().toLowerCase();
  if (p === "low" || p === "baixa") return "low";
  if (p === "high" || p === "alta") return "high";
  if (p === "urgent" || p === "urgente") return "urgent";
  return "normal";
}

export function normalizeStatus(raw: unknown): ProductivityTaskStatus | null {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "pending" || s === "pendente") return "pending";
  if (s === "in_progress" || s === "em_andamento" || s === "andamento") return "in_progress";
  if (s === "done" || s === "concluida" || s === "concluída" || s === "completed") return "done";
  if (s === "cancelled" || s === "cancelada") return "cancelled";
  return null;
}

async function appendEvent(
  supabase: SupabaseClient,
  workshopId: string,
  taskId: string,
  eventType: string,
  auth: RdaAuthContext,
  opts?: { fromStatus?: string | null; toStatus?: string | null; note?: string; meta?: Record<string, unknown> }
): Promise<void> {
  const { error } = await supabase.from("rda_productivity_task_events").insert({
    workshop_id: workshopId,
    task_id: taskId,
    event_type: eventType,
    from_status: opts?.fromStatus ?? null,
    to_status: opts?.toStatus ?? null,
    actor_user_id: auth.userId || null,
    actor_name: actorDisplayName(auth),
    note: opts?.note || null,
    meta: opts?.meta || {},
  });
  if (error && !/does not exist|schema cache/i.test(error.message)) {
    console.warn("[productivity] event:", error.message);
  }
}

async function resolveAssignee(
  supabase: SupabaseClient,
  workshopId: string,
  assigneeUserId?: string | null,
  assigneeName?: string | null
): Promise<{ id: string | null; name: string | null; error?: string }> {
  const id = String(assigneeUserId || "").trim() || null;
  const nameHint = String(assigneeName || "").trim() || null;
  if (id) {
    const { data } = await supabase
      .from("workshop_system_users")
      .select("id, display_name, username")
      .eq("workshop_id", workshopId)
      .eq("id", id)
      .maybeSingle();
    if (!data) return { id: null, name: null, error: "Responsável não encontrado nesta oficina." };
    const dn =
      String((data as { display_name?: string }).display_name || "").trim() ||
      String((data as { username?: string }).username || "").trim() ||
      id;
    return { id, name: dn };
  }
  if (!nameHint) return { id: null, name: null };
  const q = nameHint.toLowerCase();
  const { data: users } = await supabase
    .from("workshop_system_users")
    .select("id, display_name, username")
    .eq("workshop_id", workshopId)
    .limit(80);
  const matches = (users || []).filter((u) => {
    const dn = String((u as { display_name?: string }).display_name || "").toLowerCase();
    const un = String((u as { username?: string }).username || "").toLowerCase();
    return dn === q || un === q || dn.includes(q) || un.includes(q);
  });
  if (matches.length === 0) {
    return { id: null, name: null, error: `Nenhum funcionário encontrado para “${nameHint}”.` };
  }
  if (matches.length > 1) {
    return {
      id: null,
      name: null,
      error: `Ambíguo: ${matches.length} pessoas batem com “${nameHint}”. Informe o id ou o nome completo.`,
    };
  }
  const m = matches[0] as { id: string; display_name?: string; username?: string };
  return {
    id: m.id,
    name: String(m.display_name || m.username || m.id).trim(),
  };
}

export async function listAssignablePeople(input: {
  supabase: SupabaseClient;
  workshopId: string;
  auth: RdaAuthContext;
  q?: string | null;
}): Promise<ProductivityAssignablePerson[]> {
  if (!canViewProductivity(input.auth)) return [];
  let query = input.supabase
    .from("workshop_system_users")
    .select("id, display_name, username, job_title, is_technician")
    .eq("workshop_id", input.workshopId)
    .order("display_name", { ascending: true })
    .limit(80);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const needle = String(input.q || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  return (data || [])
    .map((u) => ({
      id: String((u as { id: string }).id),
      displayName:
        String((u as { display_name?: string }).display_name || "").trim() ||
        String((u as { username?: string }).username || "").trim() ||
        String((u as { id: string }).id),
      username: (u as { username?: string | null }).username || null,
      jobTitle: (u as { job_title?: string | null }).job_title || null,
      isTechnician: (u as { is_technician?: boolean }).is_technician === true,
    }))
    .filter((p) => {
      if (!needle) return true;
      const hay = `${p.displayName} ${p.username || ""} ${p.jobTitle || ""}`
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      return hay.includes(needle);
    });
}

export async function listProductivityTasks(input: {
  supabase: SupabaseClient;
  workshopId: string;
  auth: RdaAuthContext;
  filters?: ProductivityTaskFilters;
}): Promise<ProductivityTaskView[]> {
  if (!canViewProductivity(input.auth)) {
    throw new Error("Sem permissão para ver tarefas.");
  }
  const limit = clampLimit(input.filters?.limit, 40);
  let q = input.supabase
    .from("rda_productivity_tasks")
    .select("*")
    .eq("workshop_id", input.workshopId)
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  const status = input.filters?.status;
  if (status === "open" || status == null) {
    q = q.in("status", OPEN_STATUSES);
  } else if (status !== "all") {
    if (Array.isArray(status)) q = q.in("status", status);
    else q = q.eq("status", status);
  }

  if (input.filters?.assigneeUserId) {
    q = q.eq("assignee_user_id", input.filters.assigneeUserId);
  } else if (!canManageProductivity(input.auth) && input.auth.userId) {
    // Não-gestão: só próprias (como responsável ou solicitante).
    q = q.or(
      `assignee_user_id.eq.${input.auth.userId},requester_user_id.eq.${input.auth.userId},created_by_user_id.eq.${input.auth.userId}`
    );
  }

  if (input.filters?.priority) {
    q = q.eq("priority", input.filters.priority);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  let rows = (data || []).map((r) => mapRow(r as ProductivityTaskRow));
  if (input.filters?.overdueOnly) rows = rows.filter((t) => t.overdue);
  const text = String(input.filters?.q || "").trim().toLowerCase();
  if (text) {
    rows = rows.filter(
      (t) =>
        t.title.toLowerCase().includes(text) ||
        t.description.toLowerCase().includes(text) ||
        (t.assigneeName || "").toLowerCase().includes(text) ||
        (t.refLabel || "").toLowerCase().includes(text)
    );
  }
  return rows;
}

export async function getProductivityTask(input: {
  supabase: SupabaseClient;
  workshopId: string;
  auth: RdaAuthContext;
  taskId: string;
}): Promise<{ task: ProductivityTaskView; events: unknown[] }> {
  const tasks = await listProductivityTasks({
    supabase: input.supabase,
    workshopId: input.workshopId,
    auth: input.auth,
    filters: { status: "all", limit: 100 },
  });
  const task = tasks.find((t) => t.id === input.taskId);
  if (!task) throw new Error("Tarefa não encontrada.");
  const { data: events } = await input.supabase
    .from("rda_productivity_task_events")
    .select("*")
    .eq("workshop_id", input.workshopId)
    .eq("task_id", input.taskId)
    .order("created_at", { ascending: false })
    .limit(50);
  return { task, events: events || [] };
}

export async function createProductivityTask(input: {
  supabase: SupabaseClient;
  workshopId: string;
  auth: RdaAuthContext;
  payload: CreateProductivityTaskInput;
}): Promise<ProductivityTaskView> {
  if (!canViewProductivity(input.auth)) throw new Error("Sem permissão.");
  const title = String(input.payload.title || "").trim();
  if (title.length < 2) throw new Error("Informe um título válido.");

  const wantsOther =
    Boolean(input.payload.assigneeUserId) || Boolean(input.payload.assigneeName);
  if (wantsOther && !canManageProductivity(input.auth)) {
    // Funcionário só pode criar para si.
    const selfId = input.auth.userId;
    if (input.payload.assigneeUserId && input.payload.assigneeUserId !== selfId) {
      throw new Error("Sem permissão para delegar a outro funcionário.");
    }
  }

  const assignee = await resolveAssignee(
    input.supabase,
    input.workshopId,
    input.payload.assigneeUserId,
    input.payload.assigneeName
  );
  if (assignee.error) throw new Error(assignee.error);

  const clientRequestId = String(input.payload.clientRequestId || "").trim() || null;
  if (clientRequestId) {
    const { data: existing } = await input.supabase
      .from("rda_productivity_tasks")
      .select("*")
      .eq("workshop_id", input.workshopId)
      .eq("client_request_id", clientRequestId)
      .maybeSingle();
    if (existing) return mapRow(existing as ProductivityTaskRow);
  }

  const actor = actorDisplayName(input.auth);
  const row = {
    workshop_id: input.workshopId,
    title,
    description: String(input.payload.description || "").trim(),
    priority: normalizePriority(input.payload.priority),
    status: "pending" as const,
    requester_user_id: input.auth.userId || null,
    requester_name: actor,
    assignee_user_id: assignee.id,
    assignee_name: assignee.name || (assignee.id ? null : actor),
    due_at: input.payload.dueAt || null,
    ref_type: input.payload.refType || null,
    ref_id: input.payload.refId || null,
    ref_label: input.payload.refLabel || null,
    notes: String(input.payload.notes || "").trim(),
    created_by_user_id: input.auth.userId || null,
    created_by_name: actor,
    updated_by_user_id: input.auth.userId || null,
    updated_by_name: actor,
    client_request_id: clientRequestId,
  };

  // Se não há assignee, autoatribui ao solicitante.
  if (!row.assignee_user_id && input.auth.userId) {
    row.assignee_user_id = input.auth.userId;
    row.assignee_name = actor;
  }

  const { data, error } = await input.supabase
    .from("rda_productivity_tasks")
    .insert(row)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const task = mapRow(data as ProductivityTaskRow);
  await appendEvent(input.supabase, input.workshopId, task.id, "created", input.auth, {
    toStatus: "pending",
    meta: { assigneeUserId: task.assigneeUserId },
  });
  await notifyProductivityEvent({
    supabase: input.supabase,
    workshopId: input.workshopId,
    task,
    kind: "assigned",
    stableKey: `assigned:${task.id}`,
  });
  return task;
}

export async function updateProductivityTask(input: {
  supabase: SupabaseClient;
  workshopId: string;
  auth: RdaAuthContext;
  taskId: string;
  patch: UpdateProductivityTaskInput;
}): Promise<ProductivityTaskView> {
  if (!canViewProductivity(input.auth)) throw new Error("Sem permissão.");
  const { data: current, error: cErr } = await input.supabase
    .from("rda_productivity_tasks")
    .select("*")
    .eq("workshop_id", input.workshopId)
    .eq("id", input.taskId)
    .maybeSingle();
  if (cErr) throw new Error(cErr.message);
  if (!current) throw new Error("Tarefa não encontrada.");
  const prev = mapRow(current as ProductivityTaskRow);

  const isManager = canManageProductivity(input.auth);
  const isAssignee = canUpdateTaskAsAssignee(input.auth, prev.assigneeUserId);
  if (!isManager && !isAssignee) {
    throw new Error("Sem permissão para alterar esta tarefa.");
  }

  const next: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by_user_id: input.auth.userId || null,
    updated_by_name: actorDisplayName(input.auth),
  };

  if (input.patch.title != null) {
    if (!isManager) throw new Error("Somente gestão pode alterar o título.");
    const t = String(input.patch.title).trim();
    if (t.length < 2) throw new Error("Título inválido.");
    next.title = t;
  }
  if (input.patch.description != null) {
    if (!isManager && !isAssignee) throw new Error("Sem permissão.");
    next.description = String(input.patch.description).trim();
  }
  if (input.patch.notes != null) next.notes = String(input.patch.notes).trim();
  if (input.patch.priority != null) {
    if (!isManager) throw new Error("Somente gestão pode alterar prioridade.");
    next.priority = normalizePriority(input.patch.priority);
  }
  if (input.patch.dueAt !== undefined) {
    if (!isManager) throw new Error("Somente gestão pode alterar prazo.");
    next.due_at = input.patch.dueAt;
  }

  let reassigned = false;
  if (input.patch.assigneeUserId !== undefined || input.patch.assigneeName !== undefined) {
    if (!isManager) throw new Error("Somente gestão pode reatribuir.");
    const assignee = await resolveAssignee(
      input.supabase,
      input.workshopId,
      input.patch.assigneeUserId,
      input.patch.assigneeName
    );
    if (assignee.error) throw new Error(assignee.error);
    if (assignee.id !== prev.assigneeUserId) reassigned = true;
    next.assignee_user_id = assignee.id;
    next.assignee_name = assignee.name;
  }

  let statusChanged: ProductivityTaskStatus | null = null;
  if (input.patch.status != null) {
    const st =
      typeof input.patch.status === "string"
        ? normalizeStatus(input.patch.status)
        : input.patch.status;
    if (!st) throw new Error("Status inválido.");
    if (st === "cancelled" && !isManager) {
      throw new Error("Somente gestão pode cancelar.");
    }
    if (st !== prev.status) {
      statusChanged = st;
      next.status = st;
      if (st === "done") next.completed_at = new Date().toISOString();
      if (st === "cancelled") next.cancelled_at = new Date().toISOString();
      if (st === "pending" || st === "in_progress") {
        next.completed_at = null;
        next.cancelled_at = null;
      }
    }
  }

  const { data, error } = await input.supabase
    .from("rda_productivity_tasks")
    .update(next)
    .eq("workshop_id", input.workshopId)
    .eq("id", input.taskId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const task = mapRow(data as ProductivityTaskRow);

  if (statusChanged) {
    await appendEvent(input.supabase, input.workshopId, task.id, "status_changed", input.auth, {
      fromStatus: prev.status,
      toStatus: statusChanged,
    });
    if (statusChanged === "done") {
      await notifyProductivityEvent({
        supabase: input.supabase,
        workshopId: input.workshopId,
        task,
        kind: "completed",
        stableKey: `completed:${task.id}`,
      });
    }
  }
  if (reassigned) {
    await appendEvent(input.supabase, input.workshopId, task.id, "reassigned", input.auth, {
      meta: { from: prev.assigneeUserId, to: task.assigneeUserId },
    });
    await notifyProductivityEvent({
      supabase: input.supabase,
      workshopId: input.workshopId,
      task,
      kind: "reassigned",
      stableKey: `reassigned:${task.id}:${task.assigneeUserId || "none"}`,
    });
  }
  if (!statusChanged && !reassigned) {
    await appendEvent(input.supabase, input.workshopId, task.id, "updated", input.auth);
  }
  return task;
}

export async function summarizePendingTasks(input: {
  supabase: SupabaseClient;
  workshopId: string;
  auth: RdaAuthContext;
}): Promise<ProductivityPendingSummary> {
  const open = await listProductivityTasks({
    ...input,
    filters: { status: "open", limit: 100 },
  });
  const overdue = open.filter((t) => t.overdue);
  const soonMs = 48 * 3600 * 1000;
  const dueSoon = open.filter((t) => {
    if (!t.dueAt || t.overdue) return false;
    const d = new Date(t.dueAt).getTime() - Date.now();
    return d >= 0 && d <= soonMs;
  });

  const byMap = new Map<
    string,
    { assigneeUserId: string | null; assigneeName: string | null; openCount: number; overdueCount: number }
  >();
  for (const t of open) {
    const key = t.assigneeUserId || t.assigneeName || "—";
    const cur = byMap.get(key) || {
      assigneeUserId: t.assigneeUserId,
      assigneeName: t.assigneeName,
      openCount: 0,
      overdueCount: 0,
    };
    cur.openCount += 1;
    if (t.overdue) cur.overdueCount += 1;
    byMap.set(key, cur);
  }

  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const { count } = await input.supabase
    .from("rda_productivity_tasks")
    .select("id", { count: "exact", head: true })
    .eq("workshop_id", input.workshopId)
    .eq("status", "done")
    .gte("completed_at", since);

  return {
    openCount: open.length,
    overdueCount: overdue.length,
    dueSoonCount: dueSoon.length,
    doneLast7d: count ?? 0,
    byAssignee: Array.from(byMap.values()).sort((a, b) => b.openCount - a.openCount),
    topOverdue: overdue.slice(0, 8),
  };
}

/** Tick de prazos: notifica due_soon / overdue com dedupe diário. Fail-soft. */
export async function runProductivityDeadlineTick(input: {
  supabase: SupabaseClient;
  workshopId: string;
}): Promise<{ dueSoonNotified: number; overdueNotified: number }> {
  const { data, error } = await input.supabase
    .from("rda_productivity_tasks")
    .select("*")
    .eq("workshop_id", input.workshopId)
    .in("status", OPEN_STATUSES)
    .not("due_at", "is", null)
    .limit(200);
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) {
      return { dueSoonNotified: 0, overdueNotified: 0 };
    }
    throw new Error(error.message);
  }
  let dueSoonNotified = 0;
  let overdueNotified = 0;
  const soonMs = 48 * 3600 * 1000;
  for (const row of data || []) {
    const task = mapRow(row as ProductivityTaskRow);
    if (!task.dueAt) continue;
    const due = new Date(task.dueAt).getTime();
    const delta = due - Date.now();
    if (delta < 0) {
      const r = await notifyProductivityEvent({
        supabase: input.supabase,
        workshopId: input.workshopId,
        task,
        kind: "overdue",
      });
      if (r.sent) overdueNotified += 1;
    } else if (delta <= soonMs) {
      const r = await notifyProductivityEvent({
        supabase: input.supabase,
        workshopId: input.workshopId,
        task,
        kind: "due_soon",
      });
      if (r.sent) dueSoonNotified += 1;
    }
  }
  return { dueSoonNotified, overdueNotified };
}
