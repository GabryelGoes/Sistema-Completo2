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

export type NormalizePermissionsMode = "replace" | "merge";

/**
 * Persistência admin.
 * - `replace` (formulário completo): boolean explícito em todas as chaves de navegação
 *   (`access_orcamentos: false` quando desmarcado, mesmo com Pátio).
 * - `merge` (patch / atalho): não inventa `false` para chaves ausentes.
 * `patio_approve_budget_items` ausente **não** vira `false` (legado = herda patio_edit_budgets).
 * `false` explícito do admin é preservado.
 */
export function normalizePermissionsForAdminSave(
  perms: EmployeePermissions | undefined,
  options?: { mode?: NormalizePermissionsMode }
): EmployeePermissions {
  const src = perms || {};
  const mode = options?.mode ?? "replace";
  const out: EmployeePermissions = { ...src };

  if (mode === "replace") {
    for (const key of EMPLOYEE_NAV_PERMISSION_KEYS) {
      (out as Record<string, boolean>)[key] = src[key] === true;
    }
  } else {
    for (const key of EMPLOYEE_NAV_PERMISSION_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(src, key)) continue;
      (out as Record<string, boolean>)[key] = src[key] === true;
    }
  }

  if (src.full_access === true) out.full_access = true;
  else if (src.full_access === false) out.full_access = false;
  else delete out.full_access;

  if (src.patio_approve_budget_items === true) out.patio_approve_budget_items = true;
  else if (src.patio_approve_budget_items === false) out.patio_approve_budget_items = false;
  else delete out.patio_approve_budget_items;

  return out;
}

/**
 * Patch mínimo (ex.: toggle rápido de aprovação): só altera a chave pedida.
 * Não zera navegação nem materializa heranças.
 */
export function patchEmployeePermission(
  existing: EmployeePermissions | undefined,
  patch: Partial<EmployeePermissions>
): EmployeePermissions {
  return normalizePermissionsForAdminSave(
    { ...(existing || {}), ...patch },
    { mode: "merge" }
  );
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
    central_seguranca: isWorkshopAdmin || (isSystemUser && !!p.full_access),
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
    // Interruptor mestre: só quem pode gravar a flag (gerência / full_access).
    rda_ligado: isWorkshopAdmin || (isSystemUser && !!p.full_access),
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

/**
 * Após sync válido, falha temporária de rede ainda usa o snapshot por este prazo.
 * Depois restringe módulos sensíveis até nova validação.
 */
export const EMPLOYEE_ACCESS_GRACE_MS = 10 * 60 * 1000;

/**
 * Chaves sensíveis / administrativas: sem sync válido (ou após expirar a graça)
 * o snapshot do localStorage não as libera.
 * Operacional (home/recepção/agenda/pátio/lab/orçamentos) pode seguir o snapshot
 * durante a graça — a API ainda está em shadow/off (ver limitações abaixo).
 */
export const SENSITIVE_PERMISSION_KEYS = [
  "full_access",
  "access_settings",
  "access_change_passwords",
  "access_technicians",
  "access_estoque_pecas",
  "access_tv_patio",
  "access_relatorios",
  "access_boletim_erros",
  "access_radar_qualidade",
  "access_servicos_oficina",
  "access_checklists_patio",
  "access_notificacoes_sistema",
] as const satisfies readonly (keyof EmployeePermissions)[];

export type AccessTrustStatus = "unverified" | "verified" | "grace" | "expired" | "denied";

export type AccessTrustState = {
  status: AccessTrustStatus;
  /** Epoch ms da última sync bem-sucedida (se houver). */
  verifiedAt: number | null;
  /** Motivo quando status === denied. */
  deniedReason?: "unauthorized" | "forbidden" | "not_found";
};

export function initialAccessTrustState(): AccessTrustState {
  return { status: "unverified", verifiedAt: null };
}

/** Remove grants sensíveis do snapshot para UI. */
export function stripSensitivePermissions(perms: EmployeePermissions | undefined): EmployeePermissions {
  const out: EmployeePermissions = { ...(perms || {}) };
  for (const key of SENSITIVE_PERMISSION_KEYS) {
    if (out[key] === true) (out as Record<string, boolean>)[key] = false;
  }
  return out;
}

/**
 * Permissões efetivas na UI conforme confiança do sync.
 * - unverified / expired / denied → sem módulos sensíveis
 * - verified / grace → snapshot completo (dentro da validade)
 */
export function resolveUiPermissions(
  stored: EmployeePermissions | undefined,
  trust: AccessTrustState,
  nowMs = Date.now()
): EmployeePermissions {
  const base = stored || {};
  if (trust.status === "denied" || trust.status === "unverified" || trust.status === "expired") {
    return stripSensitivePermissions(base);
  }
  if (trust.status === "grace") {
    const verifiedAt = trust.verifiedAt ?? 0;
    if (nowMs - verifiedAt > EMPLOYEE_ACCESS_GRACE_MS) {
      return stripSensitivePermissions(base);
    }
    return base;
  }
  // verified
  return base;
}

/** Atualiza trust após o tempo passar (grace → expired). */
export function refreshAccessTrust(trust: AccessTrustState, nowMs = Date.now()): AccessTrustState {
  if (trust.status === "grace" || trust.status === "verified") {
    const verifiedAt = trust.verifiedAt ?? 0;
    if (trust.status === "grace" && nowMs - verifiedAt > EMPLOYEE_ACCESS_GRACE_MS) {
      return { status: "expired", verifiedAt: trust.verifiedAt };
    }
  }
  return trust;
}

/*
 * LIMITAÇÕES (SEC-03.3 / famílias shadow|off):
 * A UI restringe módulos sensíveis sem sync válido, mas a maioria das rotas API
 * ainda não está em `enforce`. Um cliente com token válido pode chamar endpoints
 * de estoque/OS/etc. até as famílias entrarem em enforce. Este PR não ativa enforce.
 */
