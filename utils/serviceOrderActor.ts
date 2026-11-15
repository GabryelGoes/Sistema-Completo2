/**
 * SEC-03.32.1 — autoria do PUT /api/service-orders/:id.
 *
 * Quem executou a alteração sai da sessão. O body não escolhe Gerência,
 * não troca o nome e não escolhe o destinatário do aviso.
 * Só a sessão de Gerência avisa os técnicos. Os demais funcionários avisam a Gerência.
 */

export type ServiceOrderActorArea =
  | "management"
  | "full_access"
  | "patio"
  | "laboratory"
  | "reception"
  | "employee";

export type ServiceOrderNotificationActor =
  | {
      ok: true;
      audience: "technicians" | "management";
      role: "admin" | "user";
      userId: string | null;
      displayName: string;
      area: ServiceOrderActorArea;
    }
  | { ok: false; reason: "unresolved" };

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function areaOf(input: {
  fullAccess: boolean;
  isTechnician: boolean;
  permissions: Record<string, unknown>;
}): Exclude<ServiceOrderActorArea, "management"> {
  if (input.fullAccess) return "full_access";
  if (input.isTechnician && input.permissions.access_laboratorio === true && input.permissions.access_patio !== true) {
    return "laboratory";
  }
  if (input.isTechnician && input.permissions.access_patio === true) return "patio";
  if (input.permissions.access_reception === true) return "reception";
  return "employee";
}

export function resolveServiceOrderNotificationActor(input: {
  role: "admin" | "user";
  userId?: string | null;
  displayName?: string | null;
  username?: string | null;
  fullAccess?: boolean;
  isTechnician?: boolean;
  permissions?: Record<string, unknown> | null;
  adminDisplayName?: string | null;
}): ServiceOrderNotificationActor {
  if (input.role === "admin") {
    return {
      ok: true,
      audience: "technicians",
      role: "admin",
      userId: null,
      displayName: text(input.adminDisplayName) || "Gerência",
      area: "management",
    };
  }
  const userId = text(input.userId);
  const displayName = text(input.displayName) || text(input.username);
  if (!userId || !displayName) return { ok: false, reason: "unresolved" };
  const permissions = input.permissions || {};
  return {
    ok: true,
    audience: "management",
    role: "user",
    userId,
    displayName,
    area: areaOf({
      fullAccess: input.fullAccess === true || permissions.full_access === true,
      isTechnician: input.isTechnician === true,
      permissions,
    }),
  };
}
