/**
 * SEC-03.3 — merge seguro de permissions no PUT de system-users.
 * Pure: testável com falha simulada do Supabase, sem tocar no banco real.
 */

import {
  normalizePermissionsForAdminSave,
  type EmployeePermissions,
  type NormalizePermissionsMode,
} from "./employeeAccess";

export type PermissionsRow = {
  permissions: unknown;
  updated_at: string | null;
};

export type LoadPermissionsResult =
  | { ok: true; row: PermissionsRow }
  | { ok: false; reason: "read_error"; message: string }
  | { ok: false; reason: "not_found" };

export type MergePermissionsPlan =
  | {
      ok: true;
      nextPermissions: EmployeePermissions;
      /** updated_at lido antes do write — usar no WHERE para CAS otimista. */
      expectedUpdatedAt: string | null;
    }
  | { ok: false; reason: "read_error"; message: string }
  | { ok: false; reason: "not_found" };

export function permissionsRecordFromRow(value: unknown): EmployeePermissions {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: EmployeePermissions = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (raw === true) (out as Record<string, boolean>)[key] = true;
    else if (raw === false) (out as Record<string, boolean>)[key] = false;
  }
  return out;
}

/**
 * Interpreta o resultado do SELECT de permissions.
 * Erro de leitura ≠ usuário inexistente; nunca assume `{}` em caso de erro.
 */
export function interpretPermissionsLoad(input: {
  data: PermissionsRow | null | undefined;
  error: { message?: string } | null | undefined;
}): LoadPermissionsResult {
  if (input.error) {
    return {
      ok: false,
      reason: "read_error",
      message: input.error.message || "Falha ao ler permissões do usuário.",
    };
  }
  if (!input.data) {
    return { ok: false, reason: "not_found" };
  }
  return { ok: true, row: input.data };
}

/**
 * Planeja o JSON final de permissions para merge/replace.
 * Em merge: exige leitura bem-sucedida da linha atual.
 */
export function planSystemUserPermissionsUpdate(input: {
  mode: NormalizePermissionsMode;
  patch: EmployeePermissions;
  load: LoadPermissionsResult;
}): MergePermissionsPlan {
  const load = input.load;
  if (load.ok === false) {
    if (load.reason === "read_error") {
      return { ok: false, reason: "read_error", message: load.message };
    }
    return { ok: false, reason: "not_found" };
  }

  if (input.mode === "replace") {
    return {
      ok: true,
      nextPermissions: normalizePermissionsForAdminSave(input.patch, { mode: "replace" }),
      expectedUpdatedAt: load.row.updated_at,
    };
  }

  const existing = permissionsRecordFromRow(load.row.permissions);
  return {
    ok: true,
    nextPermissions: normalizePermissionsForAdminSave(
      { ...existing, ...input.patch },
      { mode: "merge" }
    ),
    expectedUpdatedAt: load.row.updated_at,
  };
}

/**
 * Resultado de um UPDATE com compare-and-swap em updated_at.
 * Sem migration: usa a coluna updated_at já existente.
 */
export type OptimisticUpdateInterpret =
  | { ok: true; row: Record<string, unknown> }
  | { ok: false; reason: "write_error"; message: string }
  | { ok: false; reason: "conflict" }
  | { ok: false; reason: "not_found" };

export function interpretOptimisticPermissionsWrite(input: {
  data: Record<string, unknown> | null | undefined;
  error: { message?: string; code?: string } | null | undefined;
  /** true se o SELECT prévio já confirmou a existência do usuário */
  userWasFound: boolean;
}): OptimisticUpdateInterpret {
  if (input.error) {
    return {
      ok: false,
      reason: "write_error",
      message: input.error.message || "Falha ao atualizar permissões.",
    };
  }
  if (!input.data) {
    // 0 rows: ou sumiu, ou updated_at mudou (concorrência).
    return {
      ok: false,
      reason: input.userWasFound ? "conflict" : "not_found",
    };
  }
  return { ok: true, row: input.data };
}
