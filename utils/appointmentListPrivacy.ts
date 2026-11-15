/**
 * SEC-03.26 — a lista GET /api/appointments continua aberta a qualquer sessão
 * desta oficina, porque a Home e os lembretes leem essa rota.
 * CPF, telefone, e-mail, observação e o id legado do Trello só saem para quem
 * administra o agendamento: Gerência, acesso total, Agenda ou Recepção.
 * Falha ao ler a permissão devolve a lista reduzida. Nunca a lista completa.
 */

export const APPOINTMENT_LIST_PUBLIC_FIELDS = [
  "id",
  "title",
  "customer_name",
  "vehicle_brand",
  "vehicle_model",
  "plate",
  "scheduled_date",
  "scheduled_time",
  "status",
] as const;

export const APPOINTMENT_LIST_PRIVATE_FIELDS = [
  "phone",
  "email",
  "customer_cpf",
  "notes",
  "trello_card_id",
] as const;

const PUBLIC_FIELD_SET = new Set<string>(APPOINTMENT_LIST_PUBLIC_FIELDS);

export function permissionFlags(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value === true) out[key] = true;
  }
  return out;
}

/** Gerência, acesso total, Agenda ou Recepção veem a ficha completa. */
export function appointmentListSeesPrivateFields(
  role: "admin" | "user" | undefined,
  permissions: Record<string, boolean> | null | undefined
): boolean {
  if (role === "admin") return true;
  if (!permissions) return false;
  return Boolean(
    permissions.full_access || permissions.access_agenda || permissions.access_reception
  );
}

export function projectAppointmentListRow(
  row: Record<string, unknown>,
  seesPrivate: boolean
): Record<string, unknown> {
  if (seesPrivate) return row;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (PUBLIC_FIELD_SET.has(key)) out[key] = value;
  }
  return out;
}
