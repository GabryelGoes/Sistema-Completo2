/**
 * SEC-03.3 — regras centralizadas de acesso do funcionário (UI).
 * Fonte da verdade das chaves: workshop_system_users.permissions (servidor).
 * O navegador nunca concede privilégios; só aplica o snapshot devolvido pela API.
 */

import type { AjustesVisibility } from "../components/ajustes/AjustesHubPanel";
import type { NavigationTabId } from "./appAppearance";

/** Espelha `SystemUserPermissions` sem importar apiService (evita ciclo). */
export type EmployeePermissions = {
  full_access?: boolean;
  access_home?: boolean;
  access_reception?: boolean;
  access_agenda?: boolean;
  access_patio?: boolean;
  access_laboratorio?: boolean;
  access_orcamentos?: boolean;
  access_tv_patio?: boolean;
  access_estoque_pecas?: boolean;
  access_relatorios?: boolean;
  access_boletim_erros?: boolean;
  access_radar_qualidade?: boolean;
  access_servicos_oficina?: boolean;
  access_checklists_patio?: boolean;
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
  patio_approve_budget_items?: boolean;
  patio_add_comments?: boolean;
  patio_archive_card?: boolean;
};

export type SystemUserPermissions = EmployeePermissions;

/** Se o usuário pode aprovar/reprovar itens do orçamento (legado: segue patio_edit_budgets). */
export function effectivePatioApproveBudgetItems(perms: EmployeePermissions | undefined): boolean {
  if (!perms) return true;
  if (perms.full_access) return true;
  if (perms.patio_approve_budget_items === true) return true;
  if (perms.patio_approve_budget_items === false) return false;
  return !!perms.patio_edit_budgets;
}

/** Aba Orçamentos: chave omitida herda Pátio (legado); `false` explícito bloqueia. */
export function effectiveAccessOrcamentos(perms: EmployeePermissions | undefined): boolean {
  if (!perms) return false;
  if (perms.full_access) return true;
  if (perms.access_orcamentos === true) return true;
  if (perms.access_orcamentos === false) return false;
  return !!perms.access_patio;
}

export type EmployeeRole = "admin" | "user";

/** Chaves de navegação / módulos que o admin grava explicitamente como boolean. */
export const EMPLOYEE_NAV_PERMISSION_KEYS = [
  "access_home",
  "access_reception",
  "access_agenda",
  "access_patio",
  "access_orcamentos",
  "access_laboratorio",
  "access_tv_patio",
  "access_estoque_pecas",
  "access_relatorios",
  "access_boletim_erros",
  "access_radar_qualidade",
  "access_servicos_oficina",
  "access_checklists_patio",
  "access_notificacoes_sistema",
  "access_settings",
  "access_change_passwords",
  "access_technicians",
] as const satisfies readonly (keyof EmployeePermissions)[];

export type EmployeeNavPermissionKey = (typeof EMPLOYEE_NAV_PERMISSION_KEYS)[number];

export type HomeModuleId =
  | "agenda"
  | "patio"
  | "orcamentos"
  | "laboratorio"
  | "tv_patio"
  | "parts_stock"
  | "relatorios"
  | "boletim_erros"
  | "radar_qualidade";

export type ServerAccessSnapshot = {
  permissions: EmployeePermissions;
  isTechnician: boolean;
  /** ISO do updated_at no banco (opcional; para telemetria/debug). */
  updatedAt?: string | null;
};

export function asPermissionRecord(value: unknown): EmployeePermissions {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const src = value as Record<string, unknown>;
  const out: EmployeePermissions = {};
  for (const [key, raw] of Object.entries(src)) {
    if (raw === true) (out as Record<string, boolean>)[key] = true;
    else if (raw === false) (out as Record<string, boolean>)[key] = false;
  }
  return out;
}

/** Materializa heranças legadas na UI de edição (Orçamentos / aprovar itens). */
export function materializePermissionsForEdit(perms: EmployeePermissions | undefined): EmployeePermissions {
  const base = { ...(perms || {}) };
  return {
    ...base,
    access_orcamentos: effectiveAccessOrcamentos(base),
    patio_approve_budget_items: effectivePatioApproveBudgetItems(base),
  };
}

/**
 * Persistência admin: boolean explícito nas chaves de navegação.
 * Desmarcar Orçamentos grava `access_orcamentos: false` mesmo com Pátio ligado.
 * Registros antigos sem a chave continuam lidos via `effectiveAccessOrcamentos` até um save.
 */
export function normalizePermissionsForAdminSave(perms: EmployeePermissions | undefined): EmployeePermissions {
  const src = perms || {};
  const out: EmployeePermissions = { ...src };
  for (const key of EMPLOYEE_NAV_PERMISSION_KEYS) {
    (out as Record<string, boolean>)[key] = src[key] === true;
  }
  if (src.full_access === true) out.full_access = true;
  else if (src.full_access === false) out.full_access = false;
  else delete out.full_access;

  out.patio_approve_budget_items = src.patio_approve_budget_items === true;
  return out;
}

export function permissionsToTabs(perms: EmployeePermissions | undefined): NavigationTabId[] {
  if (!perms) return ["home"];
  if (perms.full_access) {
    return [
      "home",
      "reception",
      "agenda",
      "patio",
      "orcamentos",
      "relatorios",
      "laboratorio",
      "boletim_erros",
      "radar_qualidade",
    ];
  }
  const t: NavigationTabId[] = [];
  if (perms.access_home) t.push("home");
  if (perms.access_reception) t.push("reception");
  if (perms.access_agenda) t.push("agenda");
  if (perms.access_patio) t.push("patio");
  if (effectiveAccessOrcamentos(perms)) t.push("orcamentos");
  if (perms.access_relatorios) t.push("relatorios");
  if (perms.access_boletim_erros) t.push("boletim_erros");
  if (perms.access_radar_qualidade) t.push("radar_qualidade");
  if (perms.access_laboratorio) t.push("laboratorio");
  return t.length ? t : ["home"];
}

export function isFullAccessEmployee(perms: EmployeePermissions | undefined): boolean {
  return !!perms?.full_access;
}

/**
 * Hub de Ajustes (engrenagem / sidebar): sempre para staff autenticado.
 * Itens administrativos dentro do hub usam `resolveAjustesVisibility` / chaves access_*.
 * Perfil, dispositivo e sair permanecem disponíveis a todos os funcionários.
 */
export function canOpenSettingsHub(
  role: EmployeeRole | undefined,
  _perms?: EmployeePermissions | undefined
): boolean {
  return role === "admin" || role === "user";
}

/** Itens administrativos do hub (além de perfil / dispositivo / sair). */
export function hasAdministrativeSettingsItems(perms: EmployeePermissions | undefined): boolean {
  if (!perms) return false;
  if (perms.full_access) return true;
  return !!(
    perms.access_settings ||
    perms.access_change_passwords ||
    perms.access_technicians ||
    perms.access_servicos_oficina ||
    perms.access_checklists_patio ||
    perms.access_tv_patio ||
    perms.access_notificacoes_sistema ||
    perms.access_laboratorio
  );
}

export function homeModuleAllowed(
  moduleId: HomeModuleId,
  role: EmployeeRole | undefined,
  perms: EmployeePermissions | undefined
): boolean {
  if (role === "admin") return true;
  if (role !== "user") return false;
  if (!perms) return false;
  if (perms.full_access) return true;
  switch (moduleId) {
    case "agenda":
      return !!perms.access_agenda;
    case "patio":
      return !!perms.access_patio;
    case "orcamentos":
      return effectiveAccessOrcamentos(perms);
    case "laboratorio":
      return !!perms.access_laboratorio;
    case "tv_patio":
      return !!perms.access_tv_patio;
    case "parts_stock":
      return !!perms.access_estoque_pecas;
    case "relatorios":
      return !!perms.access_relatorios;
    case "boletim_erros":
      return !!perms.access_boletim_erros;
    case "radar_qualidade":
      return !!perms.access_radar_qualidade;
    default:
      return false;
  }
}

export type ResolveAjustesVisibilityInput = {
  role: EmployeeRole | undefined;
  permissions: EmployeePermissions | undefined;
  isSystemUser: boolean;
  isTechnician: boolean;
  hasTechnicianProfile: boolean;
  hasLogout: boolean;
};
/**
 * Visibilidade do hub de Ajustes — só chaves de permissão / papel.
 * Não usa existência de callbacks.
 */
export function resolveAjustesVisibility(input: ResolveAjustesVisibilityInput): AjustesVisibility {
  const { role, permissions: perms, isSystemUser, isTechnician, hasTechnicianProfile, hasLogout } = input;
  const isWorkshopAdmin = role === "admin" || (!isSystemUser && !isTechnician);
  const full = isWorkshopAdmin || (isSystemUser && !!perms?.full_access);
  const p = perms || {};

  const canTheme = full || (!!p.access_settings && isSystemUser);
  const canPasswords =
    full || (!!p.access_change_passwords && isSystemUser);
  const canLabTypes = full || !!p.access_servicos_oficina || !!p.access_laboratorio;

  return {
    perfil: isSystemUser || ((!isTechnician || hasTechnicianProfile) && !isSystemUser) || isWorkshopAdmin,
    usuarios: isWorkshopAdmin || (isSystemUser && !!p.full_access),
    sair: hasLogout,
    senhas: canPasswords,
    servicos_oficina: full || !!p.access_servicos_oficina,
    checklists_patio: full || !!p.access_checklists_patio,
    painel_tv: full || !!p.access_tv_patio,
    lab_tipos: canLabTypes,
    lab_rapidos: canLabTypes,
    orcamentos_prefs: full || !!p.access_settings,
    notificacoes_sistema: full || !!p.access_notificacoes_sistema,
    tema: canTheme,
    dispositivos_conectados: isWorkshopAdmin || (isSystemUser && !!p.full_access),
    // Layout deste aparelho: disponível a todo funcionário logado (não é admin de oficina).
    dispositivo: true,
    etiquetas: full || !!p.access_settings,
    memoria_rda: isWorkshopAdmin || (isSystemUser && !!p.full_access),
    inteligencia_operacional:
      isWorkshopAdmin || (isSystemUser && (!!p.full_access || !!p.access_radar_qualidade)),
    gestao_patio_rda:
      isWorkshopAdmin ||
      (isSystemUser && (!!p.full_access || !!p.access_radar_qualidade || !!p.access_patio)),
    lab_estoque_rda:
      isWorkshopAdmin ||
      (isSystemUser &&
        (!!p.full_access ||
          !!p.access_radar_qualidade ||
          !!p.access_laboratorio ||
          !!p.access_estoque_pecas)),
    monitoramento_proativo_rda:
      isWorkshopAdmin ||
      (isSystemUser &&
        (!!p.full_access ||
          !!p.access_radar_qualidade ||
          !!p.access_patio ||
          !!p.access_laboratorio ||
          !!p.access_estoque_pecas)),
    produtividade_rda:
      isWorkshopAdmin ||
      (isSystemUser &&
        (!!p.full_access ||
          !!p.access_radar_qualidade ||
          !!p.access_home ||
          !!p.access_patio ||
          !!p.access_laboratorio ||
          !!p.access_estoque_pecas)),
  };
}

export function permissionsSnapshotsEqual(
  a: EmployeePermissions | undefined,
  b: EmployeePermissions | undefined
): boolean {
  const left = a || {};
  const right = b || {};
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    const lv = (left as Record<string, unknown>)[key] === true;
    const rv = (right as Record<string, unknown>)[key] === true;
    if (lv !== rv) return false;
  }
  return true;
}

/**
 * Aplica snapshot do servidor na sessão.
 * Substitui permissões (não faz merge que preserve grants antigos removidos no banco).
 * Em falha de rede o chamador não deve chamar isto.
 */
export function applyServerAccessSnapshot(
  session: {
    role: EmployeeRole;
    permissions?: EmployeePermissions;
    isTechnician?: boolean;
  },
  server: ServerAccessSnapshot
): { next: { permissions: EmployeePermissions; isTechnician: boolean }; changed: boolean } {
  const permissions = asPermissionRecord(server.permissions);
  const isTechnician = server.isTechnician === true;
  const changed =
    session.role === "user" &&
    (!permissionsSnapshotsEqual(session.permissions, permissions) ||
      !!session.isTechnician !== isTechnician);
  return { next: { permissions, isTechnician }, changed };
}

/** Intervalo sugerido de poll leve (ms). */
export const EMPLOYEE_ACCESS_POLL_MS = 90_000;
