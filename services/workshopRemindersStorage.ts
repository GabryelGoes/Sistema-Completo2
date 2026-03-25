/** Mesmas chaves que `PatioView` (localStorage). */
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

function storageKeyForScope(scope: WorkshopReminderScope): string {
  return scope === "laboratorio" ? WORKSHOP_REMINDERS_KEY_LAB : WORKSHOP_REMINDERS_KEY_PATIO;
}

/**
 * Adiciona lembrete na lista do Pátio ou do Laboratório (modal Lembretes).
 * Dispara `workshop-reminders-updated` para a UI sincronizar.
 */
export function appendWorkshopReminder(
  scope: WorkshopReminderScope,
  text: string,
  createdBy: string
): { ok: true; id: string } | { ok: false; error: string } {
  if (typeof window === "undefined" || !window.localStorage) {
    return { ok: false, error: "Armazenamento local indisponível." };
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, error: "Texto do lembrete vazio." };
  }
  const key = storageKeyForScope(scope);
  let list: StoredReminder[] = [];
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const p = JSON.parse(raw) as unknown;
      if (Array.isArray(p)) list = p as StoredReminder[];
    }
  } catch {
    list = [];
  }
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `r-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const item: StoredReminder = {
    id,
    text: trimmed,
    createdAt: new Date().toISOString(),
    done: false,
    createdBy: createdBy.trim() || (scope === "laboratorio" ? "Laboratório" : "Pátio"),
  };
  list.unshift(item);
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    return { ok: false, error: "Não foi possível salvar o lembrete." };
  }
  window.dispatchEvent(
    new CustomEvent("workshop-reminders-updated", { detail: { scope } })
  );
  return { ok: true, id };
}

function parseReminderList(raw: string | null): StoredReminder[] {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return [];
    return p.filter(
      (x): x is StoredReminder =>
        x != null &&
        typeof x === "object" &&
        typeof (x as StoredReminder).id === "string" &&
        typeof (x as StoredReminder).text === "string"
    );
  } catch {
    return [];
  }
}

/** Lê lembretes do Pátio ou Laboratório (mesmo formato do modal). */
export function readWorkshopReminders(scope: WorkshopReminderScope): StoredReminder[] {
  if (typeof window === "undefined" || !window.localStorage) return [];
  const key = storageKeyForScope(scope);
  try {
    return parseReminderList(localStorage.getItem(key));
  } catch {
    return [];
  }
}

/** Remove um lembrete pelo `id` (UUID). Dispara sincronização com o modal. */
export function deleteWorkshopReminder(
  scope: WorkshopReminderScope,
  id: string
): { ok: true } | { ok: false; error: string } {
  if (typeof window === "undefined" || !window.localStorage) {
    return { ok: false, error: "Armazenamento local indisponível." };
  }
  const trimmedId = id.trim();
  if (!trimmedId) {
    return { ok: false, error: "ID do lembrete obrigatório." };
  }
  const key = storageKeyForScope(scope);
  const list = parseReminderList(localStorage.getItem(key));
  const next = list.filter((r) => r.id !== trimmedId);
  if (next.length === list.length) {
    return { ok: false, error: "Lembrete não encontrado." };
  }
  try {
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    return { ok: false, error: "Não foi possível salvar." };
  }
  window.dispatchEvent(
    new CustomEvent("workshop-reminders-updated", { detail: { scope } })
  );
  return { ok: true };
}

/** Atualiza texto e/ou concluído (`done`). */
export function updateWorkshopReminder(
  scope: WorkshopReminderScope,
  id: string,
  updates: { text?: string; done?: boolean }
): { ok: true } | { ok: false; error: string } {
  if (typeof window === "undefined" || !window.localStorage) {
    return { ok: false, error: "Armazenamento local indisponível." };
  }
  const trimmedId = id.trim();
  if (!trimmedId) {
    return { ok: false, error: "ID do lembrete obrigatório." };
  }
  const hasText = typeof updates.text === "string";
  const hasDone = typeof updates.done === "boolean";
  if (!hasText && !hasDone) {
    return { ok: false, error: "Informe text (novo texto) e/ou done (true/false)." };
  }
  const key = storageKeyForScope(scope);
  const list = parseReminderList(localStorage.getItem(key));
  const idx = list.findIndex((r) => r.id === trimmedId);
  if (idx === -1) {
    return { ok: false, error: "Lembrete não encontrado." };
  }
  const item: StoredReminder = { ...list[idx]! };
  if (hasText) {
    const t = updates.text!.trim();
    if (!t) {
      return { ok: false, error: "Texto do lembrete não pode ser vazio." };
    }
    item.text = t;
  }
  if (hasDone) {
    item.done = updates.done!;
  }
  const next = [...list];
  next[idx] = item;
  try {
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    return { ok: false, error: "Não foi possível salvar." };
  }
  window.dispatchEvent(
    new CustomEvent("workshop-reminders-updated", { detail: { scope } })
  );
  return { ok: true };
}
