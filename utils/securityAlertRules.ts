/**
 * SEC-05.1.2-C: regras determinísticas de alerta.
 * O histórico omite eventos barulhentos por cinco minutos, então volume
 * só usa o contador ativo. Nenhum alerta bloqueia usuário ou aparelho.
 */

export const SECURITY_ALERT_EVENT_CAP = 500;
export const SECURITY_ALERT_BUCKET_CAP = 200;
export const SECURITY_ALERT_LIST_CAP = 100;
export const SECURITY_ALERT_EVAL_GAP_MS = 45_000;
export const SECURITY_ALERT_LOOKBACK_MS = 24 * 60 * 60 * 1000;

export const SECURITY_ALERT_VOLUME_UNAVAILABLE =
  "Os contadores reais de tentativa não estão no banco compartilhado. O histórico omite repetições por cinco minutos e não foi usado como total de tentativas.";

export const VOLUME_RULES = {
  login_ip: { threshold: 6, hardLimit: 10, windowMinutes: 5, title: "Muitas tentativas de login por origem" },
  login_account: { threshold: 15, hardLimit: 30, windowMinutes: 15, title: "Muitas tentativas de login em uma conta" },
  password_ip: { threshold: 6, hardLimit: 10, windowMinutes: 15, title: "Muitas trocas de senha por origem" },
  password_account: { threshold: 5, hardLimit: 8, windowMinutes: 15, title: "Muitas trocas de senha em uma conta" },
} as const;

export type VolumeKind = keyof typeof VOLUME_RULES;
export type AlertSeverity = "info" | "warning" | "important";
export type AlertStatus = "new" | "seen" | "resolved";

export type VolumeBucket = {
  kind: VolumeKind;
  hitCount: number;
  resetAt: string;
};

export type AlertSourceEvent = {
  id: string;
  eventType: string;
  occurredAt: string;
};

export type StoredSecurityAlert = {
  id: string;
  dedupeKey: string;
  status: AlertStatus;
  severity: AlertSeverity;
  occurrenceCount: number;
  evidence: Record<string, unknown>;
};

export type PlannedSecurityAlert = {
  action: "insert" | "update";
  id?: string;
  dedupeKey: string;
  ruleId: string;
  severity: AlertSeverity;
  title: string;
  explanation: string;
  occurrenceCount: number;
  conditionActive: boolean;
  evidence: Record<string, unknown>;
};

const VOLUME_PREFIX: Record<string, VolumeKind> = {
  "login:ip:": "login_ip",
  "login:account:": "login_account",
  "password:ip:": "password_ip",
  "password:account:": "password_account",
};

export function classifyRateLimitBuckets(
  rows: Array<{ bucket_key?: unknown; hit_count?: unknown; reset_at?: unknown }>,
  now: number
): { buckets: VolumeBucket[]; truncated: boolean } {
  const truncated = rows.length > SECURITY_ALERT_BUCKET_CAP;
  const source = truncated ? rows.slice(0, SECURITY_ALERT_BUCKET_CAP) : rows;
  const buckets: VolumeBucket[] = [];
  for (const row of source) {
    const key = typeof row.bucket_key === "string" ? row.bucket_key : "";
    const kind = Object.entries(VOLUME_PREFIX).find(([prefix]) => key.startsWith(prefix))?.[1];
    if (!kind) continue;
    const hitCount = typeof row.hit_count === "number" ? row.hit_count : Number.NaN;
    const resetAt = typeof row.reset_at === "string" ? Date.parse(row.reset_at) : Number.NaN;
    if (!Number.isInteger(hitCount) || hitCount < 1 || !Number.isFinite(resetAt) || resetAt <= now) continue;
    buckets.push({ kind, hitCount, resetAt: new Date(resetAt).toISOString() });
  }
  return { buckets, truncated };
}

export function nextSecurityAlertStatus(from: string, to: string): "seen" | "resolved" | null {
  if (from === "new" && (to === "seen" || to === "resolved")) return to;
  if (from === "seen" && to === "resolved") return "resolved";
  return null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function cursorOf(alert: StoredSecurityAlert | undefined): { until: string; id: string } {
  return {
    until: text(alert?.evidence.countedUntil),
    id: text(alert?.evidence.countedId),
  };
}

function isAfterCursor(event: AlertSourceEvent, until: string, id: string): boolean {
  if (!until) return true;
  if (event.occurredAt > until) return true;
  if (event.occurredAt === until && id && event.id > id) return true;
  return false;
}

function latestResolved(alerts: StoredSecurityAlert[], dedupeKey: string): StoredSecurityAlert | undefined {
  return alerts
    .filter((alert) => alert.dedupeKey === dedupeKey && alert.status === "resolved")
    .sort((a, b) => text(b.evidence.countedUntil).localeCompare(text(a.evidence.countedUntil)))[0];
}

function openAlert(alerts: StoredSecurityAlert[], dedupeKey: string): StoredSecurityAlert | undefined {
  return alerts.find((alert) => alert.dedupeKey === dedupeKey && alert.status !== "resolved");
}

type RecordedRule = {
  id: string;
  types: string[];
  omittedRepeats: boolean;
  severity: (count: number, removedCount: number) => AlertSeverity;
  title: string;
  explain: (count: number, removedCount: number, truncated: boolean) => string;
};

const RECORDED_RULES: RecordedRule[] = [
  {
    id: "recorded_rate_limit",
    types: ["rate_limited"],
    omittedRepeats: true,
    severity: (count) => (count >= 3 ? "important" : "warning"),
    title: "Bloqueio por excesso de tentativas",
    explain: (count, _removed, truncated) =>
      `O sistema registrou ${count} bloqueio(s) porque o contador de tentativas atingiu o limite. Repetições no mesmo processo podem ter sido omitidas por cinco minutos. Este número conta os registros, não cada tentativa.${truncated ? " A leitura do período passou do limite." : ""}`,
  },
  {
    id: "recorded_session_check",
    types: ["session_check_unavailable"],
    omittedRepeats: true,
    severity: (count) => (count >= 3 ? "important" : "warning"),
    title: "Falha ao confirmar sessões",
    explain: (count, _removed, truncated) =>
      `A consulta que confirma a sessão falhou em ${count} registro(s). Repetições no mesmo processo podem ter sido omitidas por cinco minutos.${truncated ? " A leitura do período passou do limite." : ""}`,
  },
  {
    id: "recorded_rate_limit_down",
    types: ["rate_limit_unavailable"],
    omittedRepeats: true,
    severity: () => "important",
    title: "Contador de tentativas indisponível",
    explain: (count, _removed, truncated) =>
      `O contador de tentativas ficou indisponível em ${count} registro(s). Enquanto isso, o login pode ter sido recusado por falha do contador.${truncated ? " A leitura do período passou do limite." : ""}`,
  },
  {
    id: "admin_password",
    types: ["password_changed"],
    omittedRepeats: false,
    severity: () => "important",
    title: "Senha alterada",
    explain: (count) => `Um administrador alterou senha em ${count} registro(s).`,
  },
  {
    id: "admin_permissions",
    types: ["permissions_changed"],
    omittedRepeats: false,
    severity: () => "important",
    title: "Permissões alteradas",
    explain: (count) => `As permissões de funcionário mudaram em ${count} registro(s).`,
  },
  {
    id: "admin_employee",
    types: ["employee_created", "employee_removed"],
    omittedRepeats: false,
    severity: (_count, removedCount) => (removedCount > 0 ? "important" : "warning"),
    title: "Cadastro de funcionários alterado",
    explain: (count, removedCount) =>
      `O cadastro de funcionários mudou em ${count} registro(s), dos quais ${removedCount} são remoções.`,
  },
  {
    id: "admin_settings",
    types: ["security_settings_changed"],
    omittedRepeats: false,
    severity: () => "important",
    title: "Configuração sensível alterada",
    explain: (count) => `Uma configuração sensível da oficina mudou em ${count} registro(s).`,
  },
  {
    id: "admin_device_session",
    types: ["device_blocked_admin", "device_unblocked", "session_revoked_admin"],
    omittedRepeats: false,
    severity: () => "important",
    title: "Sessão ou aparelho alterado por um administrador",
    explain: (count) =>
      `Um administrador bloqueou, desbloqueou ou encerrou sessões em ${count} registro(s). A central não bloqueia aparelhos por conta própria.`,
  },
  {
    id: "recorded_device_block",
    types: ["device_blocked"],
    omittedRepeats: true,
    severity: () => "warning",
    title: "Acesso recusado em aparelho bloqueado",
    explain: (count, _events, truncated) =>
      `Um aparelho já bloqueado recusou acesso em ${count} registro(s). Repetições no mesmo processo podem ter sido omitidas por cinco minutos.${truncated ? " A leitura do período passou do limite." : ""}`,
  },
];

function planRecorded(
  rule: RecordedRule,
  events: AlertSourceEvent[],
  stored: StoredSecurityAlert[],
  truncated: boolean
): PlannedSecurityAlert | null {
  const matching = events
    .filter((event) => rule.types.includes(event.eventType))
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));
  if (!matching.length) return null;
  const current = openAlert(stored, rule.id);
  const baseline = current || latestResolved(stored, rule.id);
  const cursor = cursorOf(baseline);
  const fresh = matching.filter((event) => isAfterCursor(event, cursor.until, cursor.id));
  if (!fresh.length) return null;
  const last = fresh[fresh.length - 1];
  const occurrenceCount = current ? current.occurrenceCount + fresh.length : fresh.length;
  const previousRemoved = typeof current?.evidence.removedCount === "number" ? current.evidence.removedCount : 0;
  const removedCount = previousRemoved + fresh.filter((event) => event.eventType === "employee_removed").length;
  return {
    action: current ? "update" : "insert",
    id: current?.id,
    dedupeKey: rule.id,
    ruleId: rule.id,
    severity: rule.severity(occurrenceCount, removedCount),
    title: rule.title,
    explanation: rule.explain(occurrenceCount, removedCount, truncated),
    occurrenceCount,
    conditionActive: true,
    evidence: {
      source: "recorded",
      recordedCount: occurrenceCount,
      removedCount,
      omittedRepeats: rule.omittedRepeats,
      truncated,
      countedUntil: last.occurredAt,
      countedId: last.id,
    },
  };
}

function planVolume(
  kind: VolumeKind,
  buckets: VolumeBucket[],
  stored: StoredSecurityAlert[],
  truncated: boolean
): PlannedSecurityAlert | null {
  const rule = VOLUME_RULES[kind];
  const dedupeKey = `volume_${kind}`;
  const hot = buckets.filter((bucket) => bucket.kind === kind && bucket.hitCount >= rule.threshold);
  const current = openAlert(stored, dedupeKey);
  if (!hot.length) {
    if (!current || current.evidence.conditionActive === false) return null;
    const peak = typeof current.evidence.maxHits === "number" ? current.evidence.maxHits : current.occurrenceCount;
    return {
      action: "update",
      id: current.id,
      dedupeKey,
      ruleId: dedupeKey,
      severity: current.severity === "important" || peak >= rule.hardLimit ? "important" : "warning",
      title: rule.title,
      explanation: `Na última leitura, a janela ativa já não estava nesse patamar. O maior valor visto neste alerta foi ${peak} de ${rule.hardLimit}. O número veio do contador ativo, não do histórico.`,
      occurrenceCount: current.occurrenceCount,
      conditionActive: false,
      evidence: { ...current.evidence, source: "counter", conditionActive: false },
    };
  }
  const maxHits = hot.reduce((max, bucket) => Math.max(max, bucket.hitCount), 0);
  const resetAt = hot.reduce((max, bucket) => (bucket.resetAt > max ? bucket.resetAt : max), hot[0].resetAt);
  const resolved = latestResolved(stored, dedupeKey);
  if (!current && text(resolved?.evidence.resetAt) === resetAt) return null;
  const peak = Math.max(maxHits, typeof current?.evidence.maxHits === "number" ? current.evidence.maxHits : 0);
  if (
    current &&
    current.evidence.conditionActive !== false &&
    current.evidence.resetAt === resetAt &&
    current.evidence.maxHits === peak &&
    current.occurrenceCount === hot.length
  ) {
    return null;
  }
  const severity: AlertSeverity = maxHits >= rule.hardLimit ? "important" : "warning";
  return {
    action: current ? "update" : "insert",
    id: current?.id,
    dedupeKey,
    ruleId: dedupeKey,
    severity: peak >= rule.hardLimit ? "important" : severity,
    title: rule.title,
    explanation: `O contador ativo registra até ${maxHits} tentativas na janela de ${rule.windowMinutes} minutos, em ${hot.length} grupo(s). O bloqueio automático ocorre em ${rule.hardLimit}. Este número vem do contador, não do histórico, porque o histórico omite repetições por cinco minutos.${truncated ? " A leitura dos contadores passou do limite." : ""}`,
    occurrenceCount: hot.length,
    conditionActive: true,
    evidence: {
      source: "counter",
      maxHits: peak,
      threshold: rule.threshold,
      hardLimit: rule.hardLimit,
      windowMinutes: rule.windowMinutes,
      bucketCount: hot.length,
      resetAt,
      truncated,
      omittedRepeats: false,
      conditionActive: true,
      severity,
    },
  };
}

export function planSecurityAlerts(input: {
  volumeSource: "postgres" | "unavailable";
  buckets: VolumeBucket[];
  bucketsTruncated?: boolean;
  events: AlertSourceEvent[];
  eventsTruncated?: boolean;
  stored: StoredSecurityAlert[];
}): { plans: PlannedSecurityAlert[]; limitations: string[] } {
  const limitations: string[] = [];
  const plans: PlannedSecurityAlert[] = [];
  if (input.volumeSource !== "postgres") limitations.push(SECURITY_ALERT_VOLUME_UNAVAILABLE);
  else {
    if (input.bucketsTruncated) {
      limitations.push("A leitura dos contadores passou do limite. O aviso de volume pode estar incompleto.");
    }
    for (const kind of Object.keys(VOLUME_RULES) as VolumeKind[]) {
      const plan = planVolume(kind, input.buckets, input.stored, input.bucketsTruncated === true);
      if (plan) plans.push(plan);
    }
  }
  if (input.eventsTruncated) {
    limitations.push("A leitura dos eventos do período passou do limite. A conta dos alertas pode estar incompleta.");
  }
  for (const rule of RECORDED_RULES) {
    const plan = planRecorded(rule, input.events, input.stored, input.eventsTruncated === true);
    if (plan) plans.push(plan);
  }
  return { plans, limitations };
}

const EVIDENCE_NUMBERS = ["recordedCount", "maxHits", "threshold", "hardLimit", "windowMinutes", "bucketCount"] as const;

export function publicAlertEvidence(raw: unknown): Record<string, string | number | boolean> {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: Record<string, string | number | boolean> = {
    source: source.source === "counter" ? "counter" : "recorded",
  };
  for (const key of EVIDENCE_NUMBERS) {
    if (typeof source[key] === "number" && Number.isFinite(source[key])) out[key] = source[key] as number;
  }
  if (typeof source.truncated === "boolean") out.truncated = source.truncated;
  if (typeof source.omittedRepeats === "boolean") out.omittedRepeats = source.omittedRepeats;
  if (typeof source.conditionActive === "boolean") out.conditionActive = source.conditionActive;
  return out;
}
