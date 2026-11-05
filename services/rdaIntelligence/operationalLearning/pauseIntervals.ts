/**
 * Calcula durações reais de pausa a partir da timeline de eventos.
 * Não distribui paused_ms da sessão igualmente entre eventos.
 */

export type PauseTimelineEvent = {
  sessionId: string;
  eventType: string;
  occurredAt: string;
  pauseReasonId: string | null;
};

export type PauseInterval = {
  sessionId: string;
  reasonId: string;
  startedAt: string;
  endedAt: string | null;
  /** null se a pausa ainda não fechou (sem resume/finish/cancel). */
  durationMs: number | null;
};

export type PauseAttribution =
  | "full"
  | "clipped"
  /** Pausa ainda aberta: tempo no período é estimativa, não duração definitiva. */
  | "estimated_open"
  | "unknown";

export type PauseIntervalInPeriod = PauseInterval & {
  /**
   * Duração CONFIRMADA no período (só intervalos fechados).
   * null se aberta/desconhecida — nunca trate estimativa como definitiva.
   */
  durationMsInPeriod: number | null;
  /**
   * Estimativa clipada ao período para pausas ainda abertas.
   * Não usar como duração definitiva de serviço/pausa concluída.
   */
  estimatedDurationMsInPeriod: number | null;
  durationConfirmed: boolean;
  crossesPeriodBoundary: boolean;
  /** true se o intervalo cobre o período inteiro (início ≤ from e fim ≥ to ou ainda aberta). */
  spansEntirePeriod: boolean;
  attribution: PauseAttribution;
};

function parseTs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/**
 * Por sessão, ordena eventos e fecha cada `pause` no próximo resume/finish/cancel.
 */
export function computePauseIntervals(events: PauseTimelineEvent[]): PauseInterval[] {
  const bySession = new Map<string, PauseTimelineEvent[]>();
  for (const ev of events) {
    const list = bySession.get(ev.sessionId) || [];
    list.push(ev);
    bySession.set(ev.sessionId, list);
  }

  const out: PauseInterval[] = [];
  for (const [sessionId, list] of bySession) {
    const sorted = [...list].sort((a, b) => {
      const ta = parseTs(a.occurredAt) ?? 0;
      const tb = parseTs(b.occurredAt) ?? 0;
      if (ta !== tb) return ta - tb;
      return String(a.eventType).localeCompare(String(b.eventType));
    });

    let open: { reasonId: string; startedAt: string } | null = null;
    for (const ev of sorted) {
      const type = String(ev.eventType || "").toLowerCase();
      if (type === "pause") {
        if (open) {
          out.push({
            sessionId,
            reasonId: open.reasonId,
            startedAt: open.startedAt,
            endedAt: null,
            durationMs: null,
          });
        }
        open = {
          reasonId: ev.pauseReasonId || "unknown",
          startedAt: ev.occurredAt,
        };
        continue;
      }
      if (type === "resume" || type === "finish" || type === "cancel") {
        if (!open) continue;
        const start = parseTs(open.startedAt);
        const end = parseTs(ev.occurredAt);
        const durationMs =
          start != null && end != null && end >= start ? end - start : null;
        out.push({
          sessionId,
          reasonId: open.reasonId,
          startedAt: open.startedAt,
          endedAt: ev.occurredAt,
          durationMs,
        });
        open = null;
      }
    }
    if (open) {
      out.push({
        sessionId,
        reasonId: open.reasonId,
        startedAt: open.startedAt,
        endedAt: null,
        durationMs: null,
      });
    }
  }
  return out;
}

/**
 * Inclui intervalos que se sobrepõem ao período, inclusive os que o atravessam
 * por completo (início antes e fim depois / ainda abertos), sem evento interno.
 *
 * Duração confirmada só para intervalos fechados; abertas → estimativa separada.
 */
export function attributePauseIntervalsToPeriod(
  intervals: PauseInterval[],
  period: { from: string; to: string }
): PauseIntervalInPeriod[] {
  const from = parseTs(period.from);
  const to = parseTs(period.to);
  if (from == null || to == null) return [];

  const out: PauseIntervalInPeriod[] = [];
  for (const iv of intervals) {
    const start = parseTs(iv.startedAt);
    if (start == null) continue;
    const end = parseTs(iv.endedAt);

    const overlaps = start <= to && (end == null || end >= from);
    if (!overlaps) continue;

    const spansEntirePeriod = start <= from && (end == null || end >= to);
    const crosses =
      start < from || end == null || (end != null && end > to) || spansEntirePeriod;

    if (end == null) {
      // Ainda aberta: estimativa clipada — NÃO é duração definitiva
      const clipStart = Math.max(start, from);
      const clipEnd = to;
      const estimated =
        clipEnd >= clipStart ? clipEnd - clipStart : null;
      out.push({
        ...iv,
        durationMsInPeriod: null,
        estimatedDurationMsInPeriod: estimated,
        durationConfirmed: false,
        crossesPeriodBoundary: true,
        spansEntirePeriod,
        attribution: estimated != null ? "estimated_open" : "unknown",
      });
      continue;
    }

    const clipStart = Math.max(start, from);
    const clipEnd = Math.min(end, to);
    if (clipEnd < clipStart) {
      out.push({
        ...iv,
        durationMsInPeriod: null,
        estimatedDurationMsInPeriod: null,
        durationConfirmed: false,
        crossesPeriodBoundary: crosses,
        spansEntirePeriod,
        attribution: "unknown",
      });
      continue;
    }

    const clipped = clipEnd - clipStart;
    out.push({
      ...iv,
      durationMsInPeriod: clipped,
      estimatedDurationMsInPeriod: null,
      durationConfirmed: true,
      crossesPeriodBoundary: crosses,
      spansEntirePeriod,
      attribution: crosses ? "clipped" : "full",
    });
  }
  return out;
}

/** @deprecated Prefer attributePauseIntervalsToPeriod. */
export function intervalsOverlappingPeriod(
  intervals: PauseInterval[],
  period: { from: string; to: string }
): PauseInterval[] {
  return attributePauseIntervalsToPeriod(intervals, period).map((iv) => ({
    sessionId: iv.sessionId,
    reasonId: iv.reasonId,
    startedAt: iv.startedAt,
    endedAt: iv.endedAt,
    // Só duração confirmada; abertas ficam null
    durationMs: iv.durationMsInPeriod,
  }));
}
