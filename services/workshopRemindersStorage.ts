import {
  createWorkshopReminder as apiCreateWorkshopReminder,
  deleteWorkshopReminderRemote,
  getWorkshopReminders,
  updateWorkshopReminderRemote,
} from "./apiService";

/** Mesmas chaves legadas (migração local → API no Pátio). */
export const WORKSHOP_REMINDERS_KEY_PATIO = "patio-reminders-vehicle";
export const WORKSHOP_REMINDERS_KEY_LAB = "patio-reminders-module";

export type WorkshopReminderScope = "patio" | "laboratorio";

export type StoredReminder = {
  id: string;
  text: string;
  createdAt: string;
  done: boolean;
  createdBy?: string;
};

function scopeToApi(scope: WorkshopReminderScope): "vehicle" | "module" {
  return scope === "laboratorio" ? "module" : "vehicle";
}

function dispatchUpdated(scope: WorkshopReminderScope) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("workshop-reminders-updated", { detail: { scope } }));
}

/**
 * Adiciona lembrete na lista do Pátio ou do Laboratório (API — visível para toda a oficina).
 * Dispara `workshop-reminders-updated` para a UI sincronizar.
 */
export async function appendWorkshopReminder(
  scope: WorkshopReminderScope,
  text: string,
  createdBy: string
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, error: "Texto do lembrete vazio." };
  }
  try {
    const row = await apiCreateWorkshopReminder({
      scope: scopeToApi(scope),
      text: trimmed,
      createdBy: createdBy.trim() || (scope === "laboratorio" ? "Laboratório" : "Pátio"),
    });
    dispatchUpdated(scope);
    return { ok: true, id: row.id };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Não foi possível salvar o lembrete.",
    };
  }
}

/** Lê lembretes do Pátio ou Laboratório (API — compartilhados). */
export async function readWorkshopReminders(scope: WorkshopReminderScope): Promise<StoredReminder[]> {
  try {
    const rows = await getWorkshopReminders(scopeToApi(scope));
    return rows.map((r) => ({
      id: r.id,
      text: r.text,
      createdAt: r.createdAt,
      done: r.done,
      createdBy: r.createdBy,
    }));
  } catch {
    return [];
  }
}

/** Remove um lembrete pelo `id`. Dispara sincronização com o modal. */
export async function deleteWorkshopReminder(
  scope: WorkshopReminderScope,
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmedId = id.trim();
  if (!trimmedId) {
    return { ok: false, error: "ID do lembrete obrigatório." };
  }
  try {
    await deleteWorkshopReminderRemote(trimmedId, scopeToApi(scope));
    dispatchUpdated(scope);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Não foi possível excluir.",
    };
  }
}

/** Atualiza texto e/ou concluído (`done`). */
export async function updateWorkshopReminder(
  scope: WorkshopReminderScope,
  id: string,
  updates: { text?: string; done?: boolean }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmedId = id.trim();
  if (!trimmedId) {
    return { ok: false, error: "ID do lembrete obrigatório." };
  }
  const hasText = typeof updates.text === "string";
  const hasDone = typeof updates.done === "boolean";
  if (!hasText && !hasDone) {
    return { ok: false, error: "Informe text (novo texto) e/ou done (true/false)." };
  }
  if (hasText) {
    const t = updates.text!.trim();
    if (!t) {
      return { ok: false, error: "Texto do lembrete não pode ser vazio." };
    }
  }
  try {
    await updateWorkshopReminderRemote(trimmedId, {
      scope: scopeToApi(scope),
      ...(hasText ? { text: updates.text!.trim() } : {}),
      ...(hasDone ? { done: updates.done! } : {}),
    });
    dispatchUpdated(scope);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Não foi possível salvar.",
    };
  }
}
