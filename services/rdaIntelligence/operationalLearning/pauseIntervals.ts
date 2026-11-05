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

export type PauseIntervalInPeriod = PauseInterval & {
  /** Duração atribuída ao período (clipada aos limites). null se desconhecida. */
  durationMsInPeriod: number | null;
  /** true se o intervalo começa antes ou termina depois do período (ou ainda aberto). */
  crossesPeriodBoundary: boolean;
  /** full = inteiro no período; clipped = atravessa limite; unknown = sem fechamento útil. */
  attribution: "full" | "clipped" | "unknown";
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
 * Inclui intervalos que se sobrepõem ao período:
 * - iniciados no período, ou
 * - encerrados no período (mesmo que iniciados antes), ou
 * - ainda abertos que começaram antes/durante e atravessam o recorte.
 *
 * Duração reportada = clipada ao período — nunca a duração integral se atravessar limites.
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

    // Sobreposição com [from, to]
    const overlaps =
      start <= to && (end == null || end >= from);
    if (!overlaps) continue;

    const crosses =
      start < from || end == null || (end != null && end > to);

    let durationMsInPeriod: number | null = null;
    let attribution: PauseIntervalInPeriod["attribution"] = "unknown";

    if (end == null) {
      // Aberta: clipamos até o fim do período se já começou
      const clipStart = Math.max(start, from);
      const clipEnd = to;
      if (clipEnd >= clipStart) {
        durationMsInPeriod = clipEnd - clipStart;
        attribution = "clipped";
      } else {
        durationMsInPeriod = null;
        attribution = "unknown";
      }
    } else {
      const clipStart = Math.max(start, from);
      const clipEnd = Math.min(end, to);
      if (clipEnd >= clipStart) {
        durationMsInPeriod = clipEnd - clipStart;
        attribution = crosses ? "clipped" : "full";
      } else {
        durationMsInPeriod = null;
        attribution = "unknown";
      }
    }

    out.push({
      ...iv,
      durationMsInPeriod,
      crossesPeriodBoundary: crosses,
      attribution,
    });
  }
  return out;
}

/** @deprecated Prefer attributePauseIntervalsToPeriod (inclui iniciadas antes e clipa). */
export function intervalsOverlappingPeriod(
  intervals: PauseInterval[],
  period: { from: string; to: string }
): PauseInterval[] {
  return attributePauseIntervalsToPeriod(intervals, period).map((iv) => ({
    sessionId: iv.sessionId,
    reasonId: iv.reasonId,
    startedAt: iv.startedAt,
    endedAt: iv.endedAt,
    durationMs: iv.durationMsInPeriod,
  }));
}
