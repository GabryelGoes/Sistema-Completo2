/**
 * SEC-03.31 — destinatário da caixa de avisos.
 *
 * A sessão decide o alcance. `for` e `slug` do cliente não trocam o funcionário.
 * Gerência lê a caixa administrativa e, se pedir, a oficina inteira ou uma pessoa.
 * full_access faz o mesmo, exceto quando pede a caixa de técnico: aí fica a própria,
 * porque o sino envia esse par e não pode apontar para outro usuário.
 * Os demais funcionários autenticados leem e alteram só a própria caixa.
 */

export type NotificationScope =
  | { kind: "admin" }
  | { kind: "workshop" }
  | { kind: "person"; userId: string };

export function requestedNotificationAudience(raw: unknown): "admin" | "technician" | "all" {
  return raw === "all" || raw === "technician" || raw === "admin" ? raw : "admin";
}

export function notificationScope(input: {
  role: "admin" | "user";
  userId?: string;
  fullAccess: boolean;
  requestedFor?: unknown;
  requestedSlug?: unknown;
}): NotificationScope | null {
  const requested = requestedNotificationAudience(input.requestedFor);
  const slug = typeof input.requestedSlug === "string" ? input.requestedSlug.trim() : "";

  if (input.role === "admin") {
    if (requested === "all") return { kind: "workshop" };
    if (requested === "technician" && slug) return { kind: "person", userId: slug };
    return { kind: "admin" };
  }

  const self = typeof input.userId === "string" ? input.userId.trim() : "";
  if (!self) return null;
  if (input.fullAccess && requested === "all") return { kind: "workshop" };
  if (input.fullAccess && requested === "admin") return { kind: "admin" };
  return { kind: "person", userId: self };
}
