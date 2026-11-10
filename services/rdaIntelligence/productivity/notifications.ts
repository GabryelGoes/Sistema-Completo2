import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductivityTaskView } from "./types.js";

export type ProductivityNotifyKind =
  | "assigned"
  | "due_soon"
  | "overdue"
  | "completed"
  | "reassigned";

export function severityForProductivityNotify(
  kind: ProductivityNotifyKind
): "info" | "warning" | "critical" {
  if (kind === "overdue") return "critical";
  if (kind === "due_soon" || kind === "reassigned") return "warning";
  return "info";
}

function severityFor(kind: ProductivityNotifyKind): "info" | "warning" | "critical" {
  return severityForProductivityNotify(kind);
}

export function titleForProductivityNotify(
  kind: ProductivityNotifyKind,
  task: ProductivityTaskView
): string {
  return titleFor(kind, task);
}

function titleFor(kind: ProductivityNotifyKind, task: ProductivityTaskView): string {
  switch (kind) {
    case "assigned":
      return `Nova tarefa: ${task.title}`;
    case "due_soon":
      return `Prazo próximo: ${task.title}`;
    case "overdue":
      return `Tarefa vencida: ${task.title}`;
    case "completed":
      return `Tarefa concluída: ${task.title}`;
    case "reassigned":
      return `Tarefa reatribuída: ${task.title}`;
  }
}

function bodyFor(kind: ProductivityNotifyKind, task: ProductivityTaskView): string {
  const due = task.dueAt
    ? new Date(task.dueAt).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  const parts = [
    task.assigneeName ? `Responsável: ${task.assigneeName}` : null,
    due ? `Prazo: ${due}` : null,
    task.refLabel ? `Ref.: ${task.refLabel}` : null,
  ].filter(Boolean);
  if (kind === "completed") parts.unshift("Marcada como concluída.");
  if (kind === "reassigned") parts.unshift("Responsável alterado.");
  return parts.join(" · ") || task.description || task.title;
}

/** Chave estável para dedupe diário (prazos) ou por evento (assigned/completed/reassigned). */
export function buildProductivityDedupeKey(
  kind: ProductivityNotifyKind,
  taskId: string,
  extra = "",
  dayIso = new Date().toISOString().slice(0, 10)
): string {
  if (kind === "due_soon" || kind === "overdue") {
    return `${kind}:${taskId}:${dayIso}${extra ? `:${extra}` : ""}`;
  }
  return `${kind}:${taskId}${extra ? `:${extra}` : ""}`;
}

function dedupeKey(kind: ProductivityNotifyKind, taskId: string, extra = ""): string {
  return buildProductivityDedupeKey(kind, taskId, extra);
}

/**
 * Insere notificação com dedupe por (workshop, dedupe_key).
 * target_type admin para gestão; também notifica assignee via target_slug quando houver user id.
 */
export async function notifyProductivityEvent(input: {
  supabase: SupabaseClient;
  workshopId: string;
  task: ProductivityTaskView;
  kind: ProductivityNotifyKind;
  /** Força chave estável (ex.: assigned:taskId). */
  stableKey?: string;
}): Promise<{ sent: boolean; notificationId: string | null }> {
  const { supabase, workshopId, task, kind } = input;
  const key = input.stableKey || dedupeKey(kind, task.id);

  const { data: existing } = await supabase
    .from("rda_productivity_notification_dedupe")
    .select("id, notification_id")
    .eq("workshop_id", workshopId)
    .eq("dedupe_key", key)
    .maybeSingle();
  if (existing) {
    return {
      sent: false,
      notificationId: (existing as { notification_id?: string | null }).notification_id || null,
    };
  }

  const severity = severityFor(kind);
  const payload = {
    title: titleFor(kind, task),
    body: bodyFor(kind, task),
    severity,
    category: "produtividade",
    taskId: task.id,
    productivityKind: kind,
    assigneeUserId: task.assigneeUserId,
    assigneeName: task.assigneeName,
    dueAt: task.dueAt,
    refType: task.refType,
    refId: task.refId,
    refLabel: task.refLabel,
  };

  const { data: notif, error: nErr } = await supabase
    .from("notifications")
    .insert({
      workshop_id: workshopId,
      type: "rda_productivity_task",
      payload,
      target_type: "admin",
      target_slug: null,
    })
    .select("id")
    .maybeSingle();

  if (nErr) {
    console.warn("[productivity] notification:", nErr.message);
    return { sent: false, notificationId: null };
  }

  const notificationId = (notif as { id?: string } | null)?.id || null;

  // Notificação dirigida ao responsável (quando houver user id).
  if (task.assigneeUserId) {
    await supabase.from("notifications").insert({
      workshop_id: workshopId,
      type: "rda_productivity_task",
      payload,
      target_type: "user",
      target_slug: task.assigneeUserId,
    });
  }

  const { error: dErr } = await supabase.from("rda_productivity_notification_dedupe").insert({
    workshop_id: workshopId,
    dedupe_key: key,
    task_id: task.id,
    notification_id: notificationId,
  });
  if (dErr && !/duplicate|unique/i.test(dErr.message)) {
    console.warn("[productivity] dedupe:", dErr.message);
  }

  return { sent: true, notificationId };
}
