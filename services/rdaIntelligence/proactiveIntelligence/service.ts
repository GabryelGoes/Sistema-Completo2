import type { SupabaseClient } from "@supabase/supabase-js";
import type { RdaAuthContext } from "../types.js";
import { allowedKnowledgeVisibilitiesForAuth } from "../knowledge/access.js";
import { retrieveApprovedKnowledge } from "../knowledge/repository.js";
import {
  allowedProactiveCategories,
  canConfigureProactiveMonitor,
  canViewProactiveIntelligence,
} from "./access.js";
import {
  DEFAULT_PROACTIVE_MONITOR_CONFIG,
  parseProactiveMonitorConfig,
  RDA_PROACTIVE_ENABLED_KEY,
  RDA_PROACTIVE_INTERVAL_MINUTES_KEY,
  RDA_PROACTIVE_NOTIFY_KEY,
  RDA_PROACTIVE_REOPEN_HOURS_KEY,
} from "./config.js";
import { listAlertEvents, listProactiveAlerts, transitionProactiveAlert } from "./store.js";
import type {
  ProactiveAlertStatus,
  ProactiveAlertView,
  ProactiveCategory,
  ProactiveMonitorConfig,
  ProactiveSeverity,
} from "./types.js";

const DISCLAIMER =
  "Alertas são fatos/cálculos observados pelo monitor. Recomendações são hipóteses de ação — o RDA não altera etapas, estoque ou compras automaticamente.";

export function filterAlertsForAuth(
  alerts: ProactiveAlertView[],
  auth: RdaAuthContext | null | undefined,
  flags: { isTechnician: boolean; permissions: Record<string, boolean> } | null
): ProactiveAlertView[] {
  if (!auth) return [];
  const cats = new Set(
    allowedProactiveCategories({
      role: auth.role,
      flags,
      permissions: auth.permissions || flags?.permissions || null,
    })
  );
  return alerts.filter((a) => cats.has(a.category));
}

export async function queryProactiveDashboard(input: {
  workshopId: string;
  supabase: SupabaseClient;
  auth: RdaAuthContext;
  flags: { isTechnician: boolean; permissions: Record<string, boolean> } | null;
  getWorkshopSettingValue?: (key: string) => Promise<string | null>;
}): Promise<{
  disclaimer: string;
  summary: {
    active: number;
    critical: number;
    acknowledged: number;
    byCategory: Record<string, number>;
  };
  activeAlerts: ProactiveAlertView[];
  criticalAlerts: ProactiveAlertView[];
  recommendations: Array<{
    alertId: string;
    title: string;
    recommendation: string;
    severity: ProactiveSeverity;
    category: ProactiveCategory;
  }>;
  history: ProactiveAlertView[];
  config: ProactiveMonitorConfig;
  canConfigure: boolean;
  knowledgeHints: Array<{ knowledgeKey: string; title: string; excerpt: string }>;
  proposedKnowledgeDrafts: Array<{
    title: string;
    content: string;
    knowledgeKeyHint: string;
    category: string;
  }>;
}> {
  if (
    !canViewProactiveIntelligence({
      role: input.auth.role,
      userId: input.auth.userId,
      flags: input.flags,
      permissions: input.auth.permissions,
    })
  ) {
    throw new Error("Sem permissão para Monitoramento Proativo.");
  }

  const [activeRaw, historyRaw, settingsEntries] = await Promise.all([
    listProactiveAlerts({
      workshopId: input.workshopId,
      supabase: input.supabase,
      statuses: ["active", "acknowledged"],
      limit: 100,
    }),
    listProactiveAlerts({
      workshopId: input.workshopId,
      supabase: input.supabase,
      statuses: ["resolved", "dismissed"],
      limit: 40,
    }).catch(async () => {
      // Legacy: sem coluna status — histórico vazio
      return [] as ProactiveAlertView[];
    }),
    (async () => {
      const keys = [
        RDA_PROACTIVE_ENABLED_KEY,
        RDA_PROACTIVE_INTERVAL_MINUTES_KEY,
        RDA_PROACTIVE_REOPEN_HOURS_KEY,
        RDA_PROACTIVE_NOTIFY_KEY,
      ];
      const map: Record<string, string | null> = {};
      if (!input.getWorkshopSettingValue) return map;
      for (const k of keys) {
        map[k] = await input.getWorkshopSettingValue(k);
      }
      return map;
    })(),
  ]);

  const activeAlerts = filterAlertsForAuth(activeRaw, input.auth, input.flags);
  const history = filterAlertsForAuth(historyRaw, input.auth, input.flags);
  const criticalAlerts = activeAlerts.filter(
    (a) => a.severity === "critical" && a.status === "active"
  );

  const byCategory: Record<string, number> = {};
  for (const a of activeAlerts) {
    byCategory[a.category] = (byCategory[a.category] || 0) + 1;
  }

  const recommendations = activeAlerts
    .filter((a) => a.status === "active" && a.recommendation)
    .slice(0, 20)
    .map((a) => ({
      alertId: a.id,
      title: a.title,
      recommendation: a.recommendation,
      severity: a.severity,
      category: a.category,
    }));

  const config = parseProactiveMonitorConfig(settingsEntries);
  const canConfigure = canConfigureProactiveMonitor({
    role: input.auth.role,
    userId: input.auth.userId,
    flags: input.flags,
  });

  let knowledgeHints: Array<{ knowledgeKey: string; title: string; excerpt: string }> = [];
  try {
    const hits = await retrieveApprovedKnowledge(
      input.supabase,
      input.workshopId,
      "alerta monitoramento proativo pátio laboratório estoque produtividade",
      {
        limit: 5,
        allowedVisibilities: allowedKnowledgeVisibilitiesForAuth(input.auth),
      }
    );
    knowledgeHints = (hits || []).map((h) => ({
      knowledgeKey: h.knowledgeKey,
      title: h.title,
      excerpt: String(h.content || "").slice(0, 180),
    }));
  } catch {
    knowledgeHints = [];
  }

  const proposedKnowledgeDrafts = activeAlerts
    .filter((a) => a.category === "produtividade" && a.payload?.proposedKnowledge)
    .slice(0, 5)
    .map((a) => {
      const pk = a.payload.proposedKnowledge as {
        title?: string;
        content?: string;
        knowledgeKeyHint?: string;
        category?: string;
      };
      return {
        title: pk.title || a.title,
        content: pk.content || a.body,
        knowledgeKeyHint: pk.knowledgeKeyHint || `proactive:${a.alertKey}`,
        category: pk.category || "operacao",
      };
    });

  return {
    disclaimer: DISCLAIMER,
    summary: {
      active: activeAlerts.filter((a) => a.status === "active").length,
      critical: criticalAlerts.length,
      acknowledged: activeAlerts.filter((a) => a.status === "acknowledged").length,
      byCategory,
    },
    activeAlerts,
    criticalAlerts,
    recommendations,
    history,
    config,
    canConfigure,
    knowledgeHints,
    proposedKnowledgeDrafts,
  };
}

export async function queryProactiveAlertsForAssistant(input: {
  workshopId: string;
  supabase: SupabaseClient;
  auth: RdaAuthContext;
  flags: { isTechnician: boolean; permissions: Record<string, boolean> } | null;
  focus?: "attention" | "today" | "unresolved" | "critical" | "priority";
  category?: ProactiveCategory | null;
  severity?: ProactiveSeverity | null;
  limit?: number;
}) {
  const statuses: ProactiveAlertStatus[] =
    input.focus === "today"
      ? ["active", "acknowledged", "resolved"]
      : ["active", "acknowledged"];

  let alerts = await listProactiveAlerts({
    workshopId: input.workshopId,
    supabase: input.supabase,
    statuses,
    category: input.category || null,
    severity: input.severity || null,
    limit: 100,
  });
  alerts = filterAlertsForAuth(alerts, input.auth, input.flags);

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const dayIso = startOfDay.toISOString();

  if (input.focus === "today") {
    alerts = alerts.filter((a) => a.createdAt >= dayIso || a.lastSeenAt >= dayIso);
  } else if (input.focus === "critical") {
    alerts = alerts.filter((a) => a.severity === "critical" && a.status === "active");
  } else if (input.focus === "unresolved") {
    alerts = alerts.filter((a) => a.status === "active" || a.status === "acknowledged");
  } else if (input.focus === "attention") {
    alerts = alerts.filter((a) => a.status === "active");
  } else if (input.focus === "priority") {
    const rank = (s: ProactiveSeverity) =>
      s === "critical" ? 0 : s === "warning" ? 1 : 2;
    alerts = alerts
      .filter((a) => a.status === "active")
      .sort((a, b) => rank(a.severity) - rank(b.severity));
  }

  const limit = Math.min(Math.max(input.limit || 15, 1), 40);
  const sliced = alerts.slice(0, limit);

  return {
    disclaimer: DISCLAIMER,
    focus: input.focus || "attention",
    count: sliced.length,
    alerts: sliced.map((a) => ({
      id: a.id,
      alertKey: a.alertKey,
      category: a.category,
      severity: a.severity,
      status: a.status,
      title: a.title,
      body: a.body,
      evidence: a.evidence,
      recommendation: a.recommendation,
      refType: a.refType,
      refId: a.refId,
      createdAt: a.createdAt,
      lastSeenAt: a.lastSeenAt,
      provenance: "system_fact" as const,
    })),
    priorityHint:
      input.focus === "priority" && sliced[0]
        ? `Sugiro começar por: “${sliced[0].title}”. ${sliced[0].recommendation}`
        : null,
  };
}

export async function loadProactiveMonitorConfig(input: {
  getWorkshopSettingValue?: (key: string) => Promise<string | null>;
}): Promise<ProactiveMonitorConfig> {
  if (!input.getWorkshopSettingValue) return { ...DEFAULT_PROACTIVE_MONITOR_CONFIG };
  const map: Record<string, string | null> = {};
  for (const k of [
    RDA_PROACTIVE_ENABLED_KEY,
    RDA_PROACTIVE_INTERVAL_MINUTES_KEY,
    RDA_PROACTIVE_REOPEN_HOURS_KEY,
    RDA_PROACTIVE_NOTIFY_KEY,
  ]) {
    map[k] = await input.getWorkshopSettingValue(k);
  }
  return parseProactiveMonitorConfig(map);
}

export async function saveProactiveMonitorConfig(input: {
  config: Partial<ProactiveMonitorConfig>;
  setWorkshopSettingValue: (key: string, value: string) => Promise<void>;
}): Promise<ProactiveMonitorConfig> {
  const next = {
    ...DEFAULT_PROACTIVE_MONITOR_CONFIG,
    ...input.config,
  };
  const interval = Math.min(Math.max(Math.floor(next.intervalMinutes || 30), 5), 1440);
  const reopen = Math.min(Math.max(Math.floor(next.reopenAfterHours || 24), 1), 168);
  await input.setWorkshopSettingValue(
    RDA_PROACTIVE_ENABLED_KEY,
    next.enabled ? "true" : "false"
  );
  await input.setWorkshopSettingValue(RDA_PROACTIVE_INTERVAL_MINUTES_KEY, String(interval));
  await input.setWorkshopSettingValue(RDA_PROACTIVE_REOPEN_HOURS_KEY, String(reopen));
  await input.setWorkshopSettingValue(
    RDA_PROACTIVE_NOTIFY_KEY,
    next.notifyOnCreate ? "true" : "false"
  );
  return {
    enabled: !!next.enabled,
    intervalMinutes: interval,
    reopenAfterHours: reopen,
    notifyOnCreate: !!next.notifyOnCreate,
  };
}

export { listAlertEvents, transitionProactiveAlert, listProactiveAlerts };
