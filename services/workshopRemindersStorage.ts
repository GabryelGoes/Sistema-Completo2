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
