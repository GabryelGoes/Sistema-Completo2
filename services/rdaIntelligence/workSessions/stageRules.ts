/**
 * Regras de etapa × tipo de tempo (diagnóstico vs execução).
 * Funções puras — usadas no FE, BE e espelhadas nas RPCs SQL.
 */

export const RDA_WORK_TIME_KINDS = ["execution", "diagnostic"] as const;
export type RdaWorkTimeKind = (typeof RDA_WORK_TIME_KINDS)[number];

/** Motivo de pausa automática ao sair da etapa produtiva. */
export const RDA_PAUSE_REASON_STAGE_CHANGE = "stage_change" as const;

/** Etapa que autoriza tempo de execução (produtivo de serviço). */
export const RDA_EXECUTION_OS_STATUS = "EM_SERVICO" as const;
/** Etapa que autoriza tempo de diagnóstico / análise. */
export const RDA_DIAGNOSTIC_OS_STATUS = "AVALIACAO_TECNICA" as const;

export function isRdaWorkTimeKind(v: unknown): v is RdaWorkTimeKind {
  return typeof v === "string" && (RDA_WORK_TIME_KINDS as readonly string[]).includes(v);
}

/** Qual tipo de apontamento a etapa permite iniciar/retomar. null = nenhum (espera). */
export function timeKindAllowedForOsStatus(osStatus: string | null | undefined): RdaWorkTimeKind | null {
  const s = String(osStatus || "").trim().toUpperCase();
  if (s === RDA_EXECUTION_OS_STATUS) return "execution";
  if (s === RDA_DIAGNOSTIC_OS_STATUS) return "diagnostic";
  return null;
}

export function osStatusRequiredForTimeKind(kind: RdaWorkTimeKind): string {
  return kind === "diagnostic" ? RDA_DIAGNOSTIC_OS_STATUS : RDA_EXECUTION_OS_STATUS;
}

export function canStartOrResumeTimeKind(
  kind: RdaWorkTimeKind,
  osStatus: string | null | undefined
): boolean {
  return timeKindAllowedForOsStatus(osStatus) === kind;
}

/**
 * Quais time_kinds running devem ser auto-pausados ao mudar a etapa.
 * Sessões já pausadas/finalizadas não entram aqui (só running).
 */
export function timeKindsToAutoPauseOnStageChange(input: {
  previousStatus: string;
  nextStatus: string;
}): RdaWorkTimeKind[] {
  const prev = String(input.previousStatus || "").trim().toUpperCase();
  const next = String(input.nextStatus || "").trim().toUpperCase();
  if (prev === next) return [];
  const out: RdaWorkTimeKind[] = [];
  // Saiu de EM_SERVICO → pausa execução
  if (prev === RDA_EXECUTION_OS_STATUS && next !== RDA_EXECUTION_OS_STATUS) {
    out.push("execution");
  }
  // Saiu de AVALIACAO_TECNICA → pausa diagnóstico
  if (prev === RDA_DIAGNOSTIC_OS_STATUS && next !== RDA_DIAGNOSTIC_OS_STATUS) {
    out.push("diagnostic");
  }
  // Defesa: se a próxima etapa não autoriza um kind, e a sessão ainda estiver running
  // (ex.: status inconsistente), também pausa.
  if (!out.includes("execution") && next !== RDA_EXECUTION_OS_STATUS) {
    // só se já não estamos em execução — evita pausar ao entrar em EM_SERVICO
  }
  return out;
}

export function timeKindLabel(kind: RdaWorkTimeKind): string {
  return kind === "diagnostic" ? "Diagnóstico" : "Execução";
}

export type OsTimeIndicators = {
  diagnosticMs: number;
  executionMs: number;
  pausedMs: number;
  /** Diagnóstico + execução + pausas (apontamentos da OS). */
  totalOsMs: number;
};

export function aggregateOsTimeIndicators(
  sessions: Array<{
    timeKind?: RdaWorkTimeKind | string | null;
    liveProductiveMs?: number;
    productiveMs?: number;
    livePausedMs?: number;
    pausedMs?: number;
  }>
): OsTimeIndicators {
  let diagnosticMs = 0;
  let executionMs = 0;
  let pausedMs = 0;
  for (const s of sessions) {
    const prod = Math.max(0, Number(s.liveProductiveMs ?? s.productiveMs ?? 0));
    const pause = Math.max(0, Number(s.livePausedMs ?? s.pausedMs ?? 0));
    pausedMs += pause;
    const kind = String(s.timeKind || "execution");
    if (kind === "diagnostic") diagnosticMs += prod;
    else executionMs += prod;
  }
  return {
    diagnosticMs,
    executionMs,
    pausedMs,
    totalOsMs: diagnosticMs + executionMs + pausedMs,
  };
}
