/**
 * Regras puras — ciclo semanal / relatórios Fase 4.
 * Sem I/O. Sem auto-nota. Ausência ≠ desempenho ruim.
 */

export const WEEKLY_CYCLE_SETTING_KEYS = {
  enabled: "quality_weekly_cycle_enabled",
  weekday: "quality_weekly_cycle_weekday", // 0=dom … 5=sex
  hour: "quality_weekly_cycle_hour",
  minute: "quality_weekly_cycle_minute",
  timezone: "quality_weekly_cycle_timezone",
} as const;

export type WeeklyCycleScheduleConfig = {
  enabled: boolean;
  weekday: number; // 0–6, default 5 (sexta)
  hour: number; // default 16
  minute: number; // default 0
  timezone: string; // America/Sao_Paulo
};

export const DEFAULT_WEEKLY_CYCLE_SCHEDULE: WeeklyCycleScheduleConfig = {
  enabled: true,
  weekday: 5,
  hour: 16,
  minute: 0,
  timezone: "America/Sao_Paulo",
};

export const PERSON_REPORT_STATUSES = [
  "pending",
  "in_progress",
  "awaiting_review",
  "approved",
  "archived",
  "skipped",
  "insufficient_data",
] as const;

export type PersonReportStatus = (typeof PERSON_REPORT_STATUSES)[number];

export const CYCLE_STATUSES = [
  "pending",
  "in_progress",
  "awaiting_review",
  "approved",
  "archived",
] as const;

export type CycleStatus = (typeof CYCLE_STATUSES)[number];

export type PersonReportIndicators = {
  servicesPatio: number | null;
  servicesLab: number | null;
  productiveHours: number | null;
  pausedHours: number | null;
  evaluationsCount: number | null;
  occurrencesCount: number | null;
  reworkHintCount: number | null;
  recognitionsCount: number | null;
  goalsDoneCount: number | null;
  meetingsCount: number | null;
};

export type PersonReportAnalysis = {
  overall: string;
  strengths: string;
  bestSkills: string;
  difficulties: string;
  errorsAndCorrectives: string;
  evolutionVsPrior: string;
  technicalDevelopment: string;
  autonomyAndOrganization: string;
  collaboration: string;
};

export type PersonReportActionPlan = {
  improvements: string;
  trainings: string;
  nextWeekGoals: string;
  ownersAndDeadlines: string;
};

export type PersonReportConclusion = {
  periodSynthesis: string;
  leaderObservations: string;
  directorateDiscussionPoints: string;
};

export type PersonReportBody = {
  header: {
    personName: string;
    jobTitle: string;
    periodFrom: string;
    periodTo: string;
    leaderName: string;
    elaboratedAt: string;
  };
  indicators: PersonReportIndicators;
  analysis: PersonReportAnalysis;
  actionPlan: PersonReportActionPlan;
  conclusion: PersonReportConclusion;
  unavailableFields: string[];
};

export type TeamReportBody = {
  weekSummary: string;
  teamWins: string;
  recurringDifficulties: string;
  trainingNeeds: string;
  observedImprovements: string;
  operationalIssues: string;
  pdiSituation: string;
  nextWeekCommitments: string;
  unavailableFields: string[];
  /** Sem ranking entre funções/níveis diferentes. */
  noteNoRanking: string;
};

export const EMPTY_ANALYSIS: PersonReportAnalysis = {
  overall: "",
  strengths: "",
  bestSkills: "",
  difficulties: "",
  errorsAndCorrectives: "",
  evolutionVsPrior: "",
  technicalDevelopment: "",
  autonomyAndOrganization: "",
  collaboration: "",
};

export const EMPTY_ACTION: PersonReportActionPlan = {
  improvements: "",
  trainings: "",
  nextWeekGoals: "",
  ownersAndDeadlines: "",
};

export const EMPTY_CONCLUSION: PersonReportConclusion = {
  periodSynthesis: "",
  leaderObservations: "",
  directorateDiscussionPoints: "",
};

export function parseWeeklyCycleSchedule(
  settings: Record<string, string | null | undefined>
): WeeklyCycleScheduleConfig {
  const enabledRaw = String(settings[WEEKLY_CYCLE_SETTING_KEYS.enabled] ?? "true").toLowerCase();
  const weekday = Number(settings[WEEKLY_CYCLE_SETTING_KEYS.weekday] ?? 5);
  const hour = Number(settings[WEEKLY_CYCLE_SETTING_KEYS.hour] ?? 16);
  const minute = Number(settings[WEEKLY_CYCLE_SETTING_KEYS.minute] ?? 0);
  const timezone =
    String(settings[WEEKLY_CYCLE_SETTING_KEYS.timezone] || "").trim() ||
    DEFAULT_WEEKLY_CYCLE_SCHEDULE.timezone;
  return {
    enabled: enabledRaw !== "false" && enabledRaw !== "0" && enabledRaw !== "off",
    weekday: Number.isFinite(weekday) ? Math.min(6, Math.max(0, Math.floor(weekday))) : 5,
    hour: Number.isFinite(hour) ? Math.min(23, Math.max(0, Math.floor(hour))) : 16,
    minute: Number.isFinite(minute) ? Math.min(59, Math.max(0, Math.floor(minute))) : 0,
    timezone,
  };
}

/** Partes de data/hora no fuso (Intl). */
export function zonedParts(
  date: Date,
  timeZone: string
): { weekday: number; hour: number; minute: number; y: number; m: number; d: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  const wdMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const weekday = wdMap[get("weekday")] ?? date.getUTCDay();
  let hour = Number(get("hour"));
  // Alguns engines usam 24 para meia-noite
  if (hour === 24) hour = 0;
  return {
    weekday,
    hour,
    minute: Number(get("minute")),
    y: Number(get("year")),
    m: Number(get("month")),
    d: Number(get("day")),
  };
}

/**
 * Janela de disparo: mesmo weekday + horário dentro de ±30 min
 * (cron diário na Vercel Hobby chama e esta função decide se age).
 */
export function shouldRunWeeklyPrepareNow(
  config: WeeklyCycleScheduleConfig,
  now = new Date()
): { run: boolean; reason: string; local: ReturnType<typeof zonedParts> } {
  const local = zonedParts(now, config.timezone);
  if (!config.enabled) {
    return { run: false, reason: "Agendamento desabilitado nos ajustes.", local };
  }
  if (local.weekday !== config.weekday) {
    return {
      run: false,
      reason: `Hoje não é o dia configurado (local=${local.weekday}, config=${config.weekday}).`,
      local,
    };
  }
  const targetMin = config.hour * 60 + config.minute;
  const nowMin = local.hour * 60 + local.minute;
  const delta = Math.abs(nowMin - targetMin);
  if (delta > 30) {
    return {
      run: false,
      reason: `Fora da janela de ±30min do horário ${config.hour}:${String(config.minute).padStart(2, "0")} (${config.timezone}).`,
      local,
    };
  }
  return { run: true, reason: "Dentro da janela de agendamento.", local };
}

/** Semana seg–dom no fuso (datas YYYY-MM-DD locais). */
export function weekBoundsInTimeZone(
  now: Date,
  timeZone: string
): { weekFrom: string; weekTo: string } {
  const local = zonedParts(now, timeZone);
  // Construir Date UTC aproximado do "meio-dia local" e recuar até segunda
  const noonUtcGuess = Date.UTC(local.y, local.m - 1, local.d, 15, 0, 0);
  // Ajuste fino: calcular weekday já temos
  const diffToMon = local.weekday === 0 ? -6 : 1 - local.weekday;
  const mon = new Date(noonUtcGuess);
  mon.setUTCDate(mon.getUTCDate() + diffToMon);
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  const iso = (x: Date) => {
    const p = zonedParts(x, timeZone);
    return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
  };
  // Para mon/sun usamos offset de dias a partir do "hoje" local
  const todayParts = local;
  const monOffset = diffToMon;
  const makeDate = (offsetDays: number) => {
    const base = Date.UTC(todayParts.y, todayParts.m - 1, todayParts.d, 12, 0, 0);
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + offsetDays);
    const p = zonedParts(d, timeZone);
    // zonedParts on UTC noon may drift — use calendar arithmetic on y-m-d
    const cal = new Date(Date.UTC(todayParts.y, todayParts.m - 1, todayParts.d + offsetDays));
    const y = cal.getUTCFullYear();
    const m = String(cal.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(cal.getUTCDate()).padStart(2, "0");
    void p;
    return `${y}-${m}-${dd}`;
  };
  return { weekFrom: makeDate(monOffset), weekTo: makeDate(monOffset + 6) };
}

export function msToHours(ms: number | null | undefined): number | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  return Math.round((ms / 3600000) * 10) / 10;
}

export function buildUnavailableFields(indicators: PersonReportIndicators): string[] {
  const out: string[] = [];
  const map: Array<[keyof PersonReportIndicators, string]> = [
    ["servicesPatio", "Serviços Pátio"],
    ["servicesLab", "Serviços Laboratório"],
    ["productiveHours", "Horas produtivas"],
    ["pausedHours", "Horas em pausa"],
    ["evaluationsCount", "Avaliações"],
    ["occurrencesCount", "Ocorrências"],
    ["reworkHintCount", "Retrabalhos"],
    ["recognitionsCount", "Registros positivos"],
    ["goalsDoneCount", "Metas concluídas"],
    ["meetingsCount", "Reuniões/feedbacks"],
  ];
  for (const [k, label] of map) {
    if (indicators[k] == null) out.push(`${label}: indisponível`);
  }
  return out;
}

export function emptyTeamReportBody(): TeamReportBody {
  return {
    weekSummary: "",
    teamWins: "",
    recurringDifficulties: "",
    trainingNeeds: "",
    observedImprovements: "",
    operationalIssues: "",
    pdiSituation: "",
    nextWeekCommitments: "",
    unavailableFields: [],
    noteNoRanking:
      "Este consolidado não ranqueia profissionais de níveis ou funções diferentes.",
  };
}

/** Comparação simples semana atual vs anterior (só campos numéricos disponíveis). */
export function compareIndicatorWeeks(
  current: PersonReportIndicators,
  previous: PersonReportIndicators | null
): Array<{ field: string; current: number | null; previous: number | null; delta: number | null }> {
  if (!previous) return [];
  const fields: Array<{ key: keyof PersonReportIndicators; label: string }> = [
    { key: "servicesPatio", label: "Serviços Pátio" },
    { key: "servicesLab", label: "Serviços Lab" },
    { key: "productiveHours", label: "Horas produtivas" },
    { key: "occurrencesCount", label: "Ocorrências" },
    { key: "recognitionsCount", label: "Positivos" },
    { key: "goalsDoneCount", label: "Metas concluídas" },
  ];
  return fields.map(({ key, label }) => {
    const c = current[key];
    const p = previous[key];
    const delta = c != null && p != null ? c - p : null;
    return { field: label, current: c, previous: p, delta };
  });
}
