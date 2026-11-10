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

export type ReserveDedupeResult =
  | { reserved: true; reservationId: string }
  | { reserved: false; notificationId: string | null; reason: "already_exists" | "error" };

/**
 * Reserva atômica da chave de dedupe (INSERT único).
 * Em corrida, só um caller ganha; o outro recebe reserved:false.
 */
export async function reserveProductivityDedupeKey(input: {
  supabase: SupabaseClient;
  workshopId: string;
  dedupeKey: string;
  taskId: string;
}): Promise<ReserveDedupeResult> {
  const { supabase, workshopId, dedupeKey: key, taskId } = input;
  const { data, error } = await supabase
    .from("rda_productivity_notification_dedupe")
    .insert({
      workshop_id: workshopId,
      dedupe_key: key,
      task_id: taskId,
      notification_id: null,
    })
    .select("id")
    .maybeSingle();

  if (!error && data && (data as { id?: string }).id) {
    return { reserved: true, reservationId: String((data as { id: string }).id) };
  }

  if (error && /duplicate|unique/i.test(error.message)) {
    const { data: existing } = await supabase
      .from("rda_productivity_notification_dedupe")
      .select("notification_id")
      .eq("workshop_id", workshopId)
      .eq("dedupe_key", key)
      .maybeSingle();
    return {
      reserved: false,
      notificationId:
        (existing as { notification_id?: string | null } | null)?.notification_id || null,
      reason: "already_exists",
    };
  }

  if (error) {
    console.warn("[productivity] dedupe reserve:", error.message);
    return { reserved: false, notificationId: null, reason: "error" };
  }

  // Insert sem id retornado — trata como falha segura.
  return { reserved: false, notificationId: null, reason: "error" };
}

async function releaseProductivityDedupeReservation(
  supabase: SupabaseClient,
  reservationId: string
): Promise<void> {
  const { error } = await supabase
    .from("rda_productivity_notification_dedupe")
    .delete()
    .eq("id", reservationId);
  if (error) {
    console.warn("[productivity] dedupe release:", error.message);
  }
}

/**
 * Insere notificação com reserva atômica por (workshop, dedupe_key).
 * Corridas concorrentes: só uma emite; a outra retorna sent:false.
 * Falha parcial (notificação não criada): libera a reserva para retry.
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

  const reservation = await reserveProductivityDedupeKey({
    supabase,
    workshopId,
    dedupeKey: key,
    taskId: task.id,
  });
  if (reservation.reserved === false) {
    return { sent: false, notificationId: reservation.notificationId };
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

  try {
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
      await releaseProductivityDedupeReservation(supabase, reservation.reservationId);
      return { sent: false, notificationId: null };
    }

    const notificationId = (notif as { id?: string } | null)?.id || null;
    if (!notificationId) {
      await releaseProductivityDedupeReservation(supabase, reservation.reservationId);
      return { sent: false, notificationId: null };
    }

    // Notificação dirigida ao responsável (quando houver user id). Fail-soft.
    if (task.assigneeUserId) {
      const { error: aErr } = await supabase.from("notifications").insert({
        workshop_id: workshopId,
        type: "rda_productivity_task",
        payload,
        target_type: "user",
        target_slug: task.assigneeUserId,
      });
      if (aErr) {
        console.warn("[productivity] assignee notification:", aErr.message);
      }
    }

    const { error: uErr } = await supabase
      .from("rda_productivity_notification_dedupe")
      .update({ notification_id: notificationId })
      .eq("id", reservation.reservationId);
    if (uErr) {
      console.warn("[productivity] dedupe update:", uErr.message);
    }

    return { sent: true, notificationId };
  } catch (err) {
    console.warn(
      "[productivity] notify failed:",
      err instanceof Error ? err.message : err
    );
    await releaseProductivityDedupeReservation(supabase, reservation.reservationId);
    return { sent: false, notificationId: null };
  }
}
