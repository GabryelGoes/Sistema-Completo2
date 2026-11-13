/**
 * Compara rotas registradas com as regras da SEC-03.
 * Não altera modo, resposta nem permissão. Rota sem regra continua aberta.
 */

import {
  findMatchingRules,
  isPublicOrAutomatedRoute,
  normalizeRequestPath,
} from "./authorizeRequest.js";
import {
  productionAuthorizationPolicy,
  type AuthorizationPolicy,
  type AuthorizationRule,
} from "./authorizationPolicy.js";

export type ScannedRoute = {
  method: string;
  path: string;
  file: string;
  line: number;
};

export type CoverageKind = "public" | "protected" | "uncovered";

export type RouteAudit = {
  method: string;
  path: string;
  samplePath: string;
  file: string;
  line: number;
  kind: CoverageKind;
  matches: Array<{ id: string; family: string; priority: number; action: string }>;
  winnerId: string | null;
  overlap: boolean;
  conflict: boolean;
};

export type AuthorizationCoverage = {
  routes: RouteAudit[];
  publicRoutes: RouteAudit[];
  protectedRoutes: RouteAudit[];
  uncoveredRoutes: RouteAudit[];
  overlaps: RouteAudit[];
  conflicts: RouteAudit[];
  orphanRuleIds: string[];
};

export function samplePathForRoute(path: string): string {
  return path
    .split("?")[0]
    .replace(/:[A-Za-z0-9_]+/g, "sample")
    .replace(/\*/g, "sample");
}

function describe(rule: AuthorizationRule): RouteAudit["matches"][number] {
  return { id: rule.id, family: rule.family, priority: rule.priority, action: rule.action };
}

export function auditRoute(route: ScannedRoute, policy: AuthorizationPolicy = productionAuthorizationPolicy()): RouteAudit {
  const normalized = normalizeRequestPath(route.method, route.path);
  const samplePath = samplePathForRoute(normalized.path);
  const matches = findMatchingRules(policy, normalized.method, samplePath)
    .map(describe)
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  const top = matches[0]?.priority ?? 0;
  const winners = matches.filter((match) => match.priority === top);
  const conflict = winners.length > 1;
  const overlap = matches.length > 1;
  const winnerId = winners.length === 1 ? winners[0].id : null;
  const kind: CoverageKind = isPublicOrAutomatedRoute(normalized.method, samplePath, null)
    ? "public"
    : matches.length === 0
      ? "uncovered"
      : "protected";
  return {
    method: normalized.method,
    path: normalized.path,
    samplePath,
    file: route.file,
    line: route.line,
    kind,
    matches,
    winnerId,
    overlap,
    conflict,
  };
}

export function auditAuthorizationCoverage(
  routes: ScannedRoute[],
  policy: AuthorizationPolicy = productionAuthorizationPolicy()
): AuthorizationCoverage {
  const audited = routes.map((route) => auditRoute(route, policy));
  const seen = new Set<string>();
  for (const route of audited) {
    for (const match of route.matches) seen.add(match.id);
  }
  return {
    routes: audited,
    publicRoutes: audited.filter((route) => route.kind === "public"),
    protectedRoutes: audited.filter((route) => route.kind === "protected"),
    uncoveredRoutes: audited.filter((route) => route.kind === "uncovered"),
    overlaps: audited.filter((route) => route.overlap),
    conflicts: audited.filter((route) => route.conflict),
    orphanRuleIds: policy.rules.map((rule) => rule.id).filter((id) => !seen.has(id)),
  };
}
