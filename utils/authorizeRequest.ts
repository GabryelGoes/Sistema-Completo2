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
 * Uma exceção inesperada só nega a rota cuja família está em enforce.
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

export type TechnicianLinkLoad =
  | { ok: true; linked: boolean }
  | { ok: false };

export type PermissionSource = {
  loadUser(workshopId: string, userId: string): Promise<PermissionLoad>;
  /**
   * Vínculo confirmado em workshop_quality_person_links.
   * Ausência da função conta como falha de consulta, nunca como vínculo.
   */
  loadTechnicianLink?(
    workshopId: string,
    systemUserId: string,
    technicianId: string
  ): Promise<TechnicianLinkLoad>;
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
  "self",
  "not_self",
  "field_forbidden",
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

type LinkQuery = {
  select(columns: string): {
    eq(column: string, value: string): {
      eq(column: string, value: string): {
        eq(column: string, value: string): {
          maybeSingle(): Promise<{ data: { id?: string } | null; error: { message?: string } | null }>;
        };
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
    async loadTechnicianLink(workshopId, systemUserId, technicianId) {
      if (!client || !workshopId || !systemUserId || !technicianId) return { ok: false };
      try {
        const { data, error } = await (client.from("workshop_quality_person_links") as LinkQuery)
          .select("id")
          .eq("workshop_id", workshopId)
          .eq("system_user_id", systemUserId)
          .eq("workshop_technician_id", technicianId)
          .maybeSingle();
        if (error) return { ok: false };
        return { ok: true, linked: Boolean(data?.id) };
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

export function findMatchingRules(policy: AuthorizationPolicy, method: string, path: string): AuthorizationRule[] {
  const normalized = normalizeRequestPath(method, path);
  return policy.rules.filter((rule) => rule.methods.includes(normalized.method) && rule.path.test(normalized.path));
}

function matchRule(policy: AuthorizationPolicy, method: string, path: string): AuthorizationRule | null {
  let found: AuthorizationRule | null = null;
  for (const rule of findMatchingRules(policy, method, path)) {
    if (!found || rule.priority > found.priority) found = rule;
  }
  return found;
}

/**
 * Negar no catch só quando a rota desta requisição está em enforce.
 * Outra família em enforce não alcança esta rota. Rota pública, cron ou sem regra segue.
 * Se a classificação falhar, não estende o bloqueio.
 */
export function unexpectedFailureDenies(input: {
  method: string;
  path: string;
  actor: SessionActor | null;
  policy?: AuthorizationPolicy;
  env?: NodeJS.ProcessEnv;
}): boolean {
  try {
    const policy = input.policy ?? productionAuthorizationPolicy();
    const env = input.env ?? process.env;
    const { method, path } = normalizeRequestPath(input.method, input.path);
    if (isPublicOrAutomatedRoute(method, path, input.actor)) return false;
    const matches = findMatchingRules(policy, method, path);
    if (matches.length > 0) {
      const top = matches.reduce((max, rule) => Math.max(max, rule.priority), 0);
      return matches.some((rule) => {
        if (rule.priority !== top) return false;
        const family = familyById(policy, rule.family);
        return !!family && effectiveFamilyMode(family, env) === "enforce";
      });
    }
    const unmatched = matchUnmatchedFamily(policy, path);
    return !!unmatched && effectiveFamilyMode(unmatched, env) === "enforce";
  } catch {
    return false;
  }
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

/**
 * Volume do modo sombra.
 * O mapa guarda só família, regra, motivo e o instante do último registro.
 * Não guarda senha, token, cliente, corpo nem caminho.
 *
 * Em serverless (Vercel) cada instância tem a própria memória, e um cold start
 * zera o mapa. O limite não se coordena entre instâncias: a mesma combinação
 * pode aparecer uma vez por instância dentro da janela.
 */
export const SHADOW_LOG_WINDOW_MS = 15 * 60 * 1000;
const SHADOW_LOG_MAX_KEYS = 200;
const shadowLogSeen = new Map<string, number>();

export function resetShadowLogLimiter(): void {
  shadowLogSeen.clear();
}

export function shadowLogIdentity(record: ShadowRecord): string {
  const safe = toShadowRecord(record);
  return `${safe.family}|${safe.rule}|${safe.reason}`;
}

export function shouldEmitShadowLog(record: ShadowRecord, now = Date.now()): boolean {
  const key = shadowLogIdentity(record);
  const previous = shadowLogSeen.get(key);
  if (previous !== undefined && now - previous < SHADOW_LOG_WINDOW_MS) return false;
  shadowLogSeen.set(key, now);
  if (shadowLogSeen.size > SHADOW_LOG_MAX_KEYS) {
    const cutoff = now - SHADOW_LOG_WINDOW_MS;
    for (const [entry, at] of shadowLogSeen) {
      if (at < cutoff) shadowLogSeen.delete(entry);
    }
    while (shadowLogSeen.size > SHADOW_LOG_MAX_KEYS) {
      const oldest = shadowLogSeen.keys().next().value;
      if (oldest === undefined) break;
      shadowLogSeen.delete(oldest);
    }
  }
  return true;
}

function emitShadow(log: ((record: ShadowRecord) => void) | undefined, record: ShadowRecord): void {
  try {
    if (!shouldEmitShadowLog(record)) return;
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
  fields?: readonly string[];
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
  if (allowed) return finish("allow", "permission");

  if (matched.ownership === "session_user") {
    return finish("allow", "self");
  }

  if (matched.ownership === "linked_technician") {
    const technicianId = technicianIdFromPath(path);
    if (!technicianId) return finish("deny", "not_self");
    let link: TechnicianLinkLoad;
    try {
      if (!input.source.loadTechnicianLink) link = { ok: false };
      else {
        link = await input.source.loadTechnicianLink(
          input.workshopId,
          input.actor.userId.trim(),
          technicianId
        );
      }
    } catch {
      link = { ok: false };
    }
    if (!link.ok) return finish("lookup_failed", "lookup_failed");
    if (!link.linked) return finish("deny", "not_self");
    if (matched.selfFields && !selfFieldsAllowed(matched.selfFields, input.fields)) {
      return finish("deny", "field_forbidden");
    }
    return finish("allow", "self");
  }

  return finish("deny", "missing_permission");
}

function selfFieldsAllowed(allowed: readonly string[], present: readonly string[] | undefined): boolean {
  if (!present) return false;
  const accepted = new Set(allowed);
  return present.every((field) => accepted.has(field));
}

/** Nomes dos campos presentes no corpo. Não devolve valores. */
export function listedBodyFields(body: unknown): string[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) return [];
  return Object.keys(body as Record<string, unknown>).filter((key) => key !== "__proto__" && key !== "constructor");
}

function technicianIdFromPath(path: string): string | null {
  const photo = /^\/api\/workshop-technicians\/([^/]+)\/photo$/.exec(path);
  if (photo?.[1] && photo[1] !== "photo") return photo[1];
  const item = /^\/api\/workshop-technicians\/([^/]+)$/.exec(path);
  return item?.[1] ?? null;
}

type ObservableRequest = {
  method?: string;
  path?: string;
  url?: string;
  body?: unknown;
  auth?: { r?: string; u?: string };
};

function actorFromRequest(req: ObservableRequest): SessionActor | null {
  const role = req.auth?.r;
  if (role !== "admin" && role !== "user") return null;
  const userId = typeof req.auth?.u === "string" ? req.auth.u : undefined;
  return { role, userId };
}

export async function guardHttpAuthorization(
  req: ObservableRequest,
  deps: {
    workshopId: string | undefined;
    supabase: SupabasePermissionClient | null;
    policy?: AuthorizationPolicy;
    log?: (record: ShadowRecord) => void;
    env?: NodeJS.ProcessEnv;
  },
  run: (
    req: ObservableRequest,
    deps: {
      workshopId: string | undefined;
      supabase: SupabasePermissionClient | null;
      policy?: AuthorizationPolicy;
      log?: (record: ShadowRecord) => void;
      env?: NodeJS.ProcessEnv;
    }
  ) => Promise<AuthorizationVerdict> = observeHttpAuthorization
): Promise<AuthorizationVerdict> {
  try {
    return await run(req, deps);
  } catch {
    return verdict({
      effect: "lookup_failed",
      block: unexpectedFailureDenies({
        method: req.method || "GET",
        path: req.path || req.url || "",
        actor: actorFromRequest(req),
        policy: deps.policy,
        env: deps.env,
      }),
      family: null,
      rule: null,
      action: null,
      reason: "lookup_failed",
    });
  }
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
    fields: listedBodyFields(req.body),
  });
}
