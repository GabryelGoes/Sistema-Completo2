/**
 * SEC-03.0 — autorização centralizada.
 *
 * A permissão sai de workshop_system_users, pelo id da sessão e pelo WORKSHOP_ID.
 * O JSON do navegador não entra nesta função.
 *
 * mode off: não consulta o banco e não altera a resposta.
 * mode shadow: registra a decisão e segue a resposta atual.
 * mode enforce: nega (403 no chamador) quando a regra falha ou a consulta falha.
 * Falha de consulta nunca conta como autorização no modo de bloqueio.
 * Falha da telemetria não derruba a operação.
 */

import {
  productionAuthorizationPolicy,
  type AuthAction,
  type AuthorizationFamily,
  type AuthorizationPolicy,
  type AuthorizationRule,
  type FamilyMode,
  type PermissionKey,
} from "./authorizationPolicy.js";

export type SessionActor = {
  role: "admin" | "user";
  userId?: string;
};

export type PermissionRow = {
  permissions?: unknown;
  is_technician?: unknown;
} | null;

export type PermissionLoad =
  | { ok: true; row: PermissionRow }
  | { ok: false };

export type PermissionSource = {
  loadUser(workshopId: string, userId: string): Promise<PermissionLoad>;
};

export type AuthorizationEffect = "exempt" | "skipped" | "allow" | "deny" | "lookup_failed";

export type AuthorizationVerdict = {
  effect: AuthorizationEffect;
  block: boolean;
  family: string | null;
  rule: string | null;
  action: AuthAction | null;
  reason: string;
};

export type ShadowRecord = {
  kind: "sec03";
  family: string;
  rule: string;
  action: string;
  method: string;
  decision: "deny" | "lookup_failed";
  reason: string;
};

export type CachedLookup =
  | { status: "ready"; permissions: Record<string, unknown>; found: boolean }
  | { status: "failed" };

const REASON_CODES = new Set([
  "unauthenticated",
  "missing_identity",
  "not_in_workshop",
  "lookup_failed",
  "missing_permission",
  "missing_workshop",
  "admin",
  "full_access",
  "permission",
  "family_off",
  "no_rule",
  "exempt",
  "public_or_automated",
]);

const ACTIONS = new Set<AuthAction>(["read", "create", "update", "delete", "approve", "move"]);
const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

const requestCaches = new WeakMap<object, Map<string, CachedLookup>>();

/** Aceita o cliente do servidor sem comparar o builder genérico do Supabase. */
export type SupabasePermissionClient = {
  from(table: string): unknown;
};

type PermissionQuery = {
  select(columns: string): {
    eq(column: string, value: string): {
      eq(column: string, value: string): {
        maybeSingle(): Promise<{ data: PermissionRow; error: { message?: string } | null }>;
      };
    };
  };
};

export function permissionSourceFromSupabase(client: SupabasePermissionClient | null): PermissionSource {
  return {
    async loadUser(workshopId: string, userId: string): Promise<PermissionLoad> {
      if (!client || !workshopId || !userId) return { ok: false };
      try {
        const { data, error } = await (client.from("workshop_system_users") as PermissionQuery)
          .select("permissions, is_technician")
          .eq("id", userId)
          .eq("workshop_id", workshopId)
          .maybeSingle();
        if (error) return { ok: false };
        return { ok: true, row: data ?? null };
      } catch {
        return { ok: false };
      }
    },
  };
}

export function effectiveFamilyMode(family: Pick<AuthorizationFamily, "id" | "mode">, env: NodeJS.ProcessEnv = process.env): FamilyMode {
  const disabled = String(env.SEC03_AUTHORIZATION_DISABLED || "").trim().toLowerCase();
  if (disabled === "1" || disabled === "true") return "off";
  const listed = String(env.SEC03_DISABLE_FAMILIES || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (listed.includes(family.id)) return "off";
  if (family.mode === "shadow" || family.mode === "enforce") return family.mode;
  return "off";
}

export function authorizationHasEnforce(
  policy: AuthorizationPolicy = productionAuthorizationPolicy(),
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return policy.families.some((family) => effectiveFamilyMode(family, env) === "enforce");
}

export function normalizeRequestPath(method: string | undefined, pathOrUrl: string | undefined): { method: string; path: string } {
  const raw = String(pathOrUrl || "").split("?")[0];
  const path = raw.length > 1 && raw.endsWith("/") ? raw.slice(0, -1) : raw;
  return { method: String(method || "GET").toUpperCase(), path };
}

/** Rotas públicas, TV e cron. Não recebem a regra de funcionário. */
export function isPublicOrAutomatedRoute(method: string, path: string, actor: SessionActor | null): boolean {
  if (method === "GET" && path === "/api/health") return true;
  if (method === "POST" && path === "/api/auth/login") return true;
  if (method === "GET" && path === "/api/rda/health") return true;
  if ((method === "GET" || method === "POST") && path === "/api/rda/proactive/scan/cron") return true;
  if ((method === "GET" || method === "POST") && path === "/api/rda/productivity/deadlines/tick") return true;
  if ((method === "GET" || method === "POST") && path === "/api/quality-radar/weekly-cycle/prepare") return true;
  if (method === "GET" && (path === "/api/tv/display" || path === "/api/tv/playlist")) return true;
  // SEC-04: a lista da TV segue sem sessão. Com sessão, a regra de leitura pode valer no futuro.
  if (method === "GET" && path === "/api/service-orders" && !actor) return true;
  return false;
}

function familyById(policy: AuthorizationPolicy, id: string): AuthorizationFamily | undefined {
  return policy.families.find((family) => family.id === id);
}

function matchRule(policy: AuthorizationPolicy, method: string, path: string): AuthorizationRule | null {
  let found: AuthorizationRule | null = null;
  for (const rule of policy.rules) {
    if (!rule.methods.includes(method) || !rule.path.test(path)) continue;
    if (!found || rule.priority > found.priority) found = rule;
  }
  return found;
}

function matchUnmatchedFamily(policy: AuthorizationPolicy, path: string): AuthorizationFamily | null {
  let found: AuthorizationFamily | null = null;
  let score = -1;
  for (const family of policy.families) {
    if (family.unmatched !== "deny") continue;
    for (const prefix of family.prefixes) {
      if (path === prefix || path.startsWith(`${prefix}/`) || (prefix.endsWith("-") && path.startsWith(prefix))) {
        if (prefix.length > score) {
          found = family;
          score = prefix.length;
        }
      }
    }
  }
  return found;
}

function asPermissionMap(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function permissionGranted(permissions: Record<string, unknown>, key: PermissionKey, inherit: AuthorizationRule["inherit"]): boolean {
  const value = permissions[key];
  if (key === "patio_approve_budget_items" && inherit === "approve_budget_items") {
    if (value === true) return true;
    if (value === false) return false;
    return permissions.patio_edit_budgets === true;
  }
  return value === true;
}

function verdict(partial: Omit<AuthorizationVerdict, "block"> & { block?: boolean }): AuthorizationVerdict {
  return {
    effect: partial.effect,
    block: partial.block ?? false,
    family: partial.family,
    rule: partial.rule,
    action: partial.action,
    reason: partial.reason,
  };
}

function safeToken(value: string, pattern: RegExp, fallback: string): string {
  return pattern.test(value) ? value : fallback;
}

export function toShadowRecord(input: {
  family: string;
  rule: string;
  action: string;
  method: string;
  decision: "deny" | "lookup_failed";
  reason: string;
}): ShadowRecord {
  const action = ACTIONS.has(input.action as AuthAction) ? input.action : "read";
  return {
    kind: "sec03",
    family: safeToken(input.family, /^[a-z0-9_]+$/, "unknown"),
    rule: safeToken(input.rule, /^[a-z0-9_]+$/, "unknown"),
    action,
    method: METHODS.has(input.method) ? input.method : "GET",
    decision: input.decision === "lookup_failed" ? "lookup_failed" : "deny",
    reason: REASON_CODES.has(input.reason) ? input.reason : "missing_permission",
  };
}

function emitShadow(log: ((record: ShadowRecord) => void) | undefined, record: ShadowRecord): void {
  try {
    (log ?? defaultShadowLog)(record);
  } catch {
    /* Telemetria não pode derrubar a operação. */
  }
}

function defaultShadowLog(record: ShadowRecord): void {
  try {
    console.info(`[sec03] ${JSON.stringify(record)}`);
  } catch {
    /* ignora */
  }
}

async function loadCached(
  source: PermissionSource,
  cache: Map<string, CachedLookup>,
  workshopId: string,
  userId: string
): Promise<CachedLookup> {
  const key = `${workshopId}\n${userId}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let stored: CachedLookup;
  try {
    const loaded = await source.loadUser(workshopId, userId);
    if (!loaded.ok) {
      stored = { status: "failed" };
    } else if (!loaded.row) {
      stored = { status: "ready", permissions: {}, found: false };
    } else {
      stored = {
        status: "ready",
        permissions: asPermissionMap(loaded.row.permissions),
        found: true,
      };
    }
  } catch {
    stored = { status: "failed" };
  }
  cache.set(key, stored);
  return stored;
}

export async function decideAuthorization(input: {
  method: string;
  path: string;
  actor: SessionActor | null;
  workshopId: string | undefined;
  source: PermissionSource;
  policy?: AuthorizationPolicy;
  cache?: Map<string, CachedLookup>;
  log?: (record: ShadowRecord) => void;
  env?: NodeJS.ProcessEnv;
}): Promise<AuthorizationVerdict> {
  const policy = input.policy ?? productionAuthorizationPolicy();
  const env = input.env ?? process.env;
  const cache = input.cache ?? new Map<string, CachedLookup>();
  const { method, path } = normalizeRequestPath(input.method, input.path);

  if (isPublicOrAutomatedRoute(method, path, input.actor)) {
    return verdict({ effect: "exempt", family: null, rule: null, action: null, reason: "public_or_automated" });
  }

  const matched = matchRule(policy, method, path);
  const unmatchedFamily = matched ? null : matchUnmatchedFamily(policy, path);
  const family = matched ? familyById(policy, matched.family) : unmatchedFamily;
  if (!matched && !family) {
    return verdict({ effect: "skipped", family: null, rule: null, action: null, reason: "no_rule" });
  }
  if (!family) {
    return verdict({ effect: "skipped", family: null, rule: null, action: null, reason: "no_rule" });
  }

  const mode = effectiveFamilyMode(family, env);
  if (mode === "off") {
    return verdict({ effect: "skipped", family: family.id, rule: matched?.id ?? null, action: matched?.action ?? null, reason: "family_off" });
  }

  const finish = (effect: "allow" | "deny" | "lookup_failed", reason: string): AuthorizationVerdict => {
    const block = mode === "enforce" && effect !== "allow";
    if (effect !== "allow") {
      emitShadow(input.log, toShadowRecord({
        family: family.id,
        rule: matched?.id ?? "unmatched",
        action: matched?.action ?? "read",
        method,
        decision: effect === "lookup_failed" ? "lookup_failed" : "deny",
        reason,
      }));
    }
    return verdict({
      effect,
      block,
      family: family.id,
      rule: matched?.id ?? null,
      action: matched?.action ?? null,
      reason,
    });
  };

  if (!matched) {
    return finish("deny", "no_rule");
  }

  if (!input.actor || (input.actor.role !== "admin" && input.actor.role !== "user")) {
    return finish("deny", "unauthenticated");
  }
  if (input.actor.role === "admin") {
    return finish("allow", "admin");
  }
  if (!input.actor.userId?.trim()) {
    return finish("deny", "missing_identity");
  }
  if (!input.workshopId?.trim()) {
    return finish("lookup_failed", "missing_workshop");
  }

  const loaded = await loadCached(input.source, cache, input.workshopId, input.actor.userId.trim());
  if (loaded.status === "failed") return finish("lookup_failed", "lookup_failed");
  if (!loaded.found) return finish("deny", "not_in_workshop");
  if (loaded.permissions.full_access === true) return finish("allow", "full_access");

  const allowed = matched.anyOf.some((key) => permissionGranted(loaded.permissions, key, matched.inherit));
  if (!allowed) return finish("deny", "missing_permission");
  return finish("allow", "permission");
}

type ObservableRequest = {
  method?: string;
  path?: string;
  url?: string;
  auth?: { r?: string; u?: string };
};

function actorFromRequest(req: ObservableRequest): SessionActor | null {
  const role = req.auth?.r;
  if (role !== "admin" && role !== "user") return null;
  const userId = typeof req.auth?.u === "string" ? req.auth.u : undefined;
  return { role, userId };
}

export async function observeHttpAuthorization(
  req: ObservableRequest,
  deps: {
    workshopId: string | undefined;
    supabase: SupabasePermissionClient | null;
    policy?: AuthorizationPolicy;
    log?: (record: ShadowRecord) => void;
    env?: NodeJS.ProcessEnv;
  }
): Promise<AuthorizationVerdict> {
  const cache = requestCaches.get(req) ?? new Map<string, CachedLookup>();
  if (!requestCaches.has(req)) requestCaches.set(req, cache);
  const { method, path } = normalizeRequestPath(req.method, req.path || req.url);
  return decideAuthorization({
    method,
    path,
    actor: actorFromRequest(req),
    workshopId: deps.workshopId,
    source: permissionSourceFromSupabase(deps.supabase),
    policy: deps.policy,
    cache,
    log: deps.log,
    env: deps.env,
  });
}
