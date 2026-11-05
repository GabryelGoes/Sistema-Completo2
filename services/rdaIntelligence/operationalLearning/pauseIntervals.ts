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

function parseTs(iso: string): number | null {
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
          // Pause sem fechamento explícito antes de outra pause → duração desconhecida
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

export function intervalsOverlappingPeriod(
  intervals: PauseInterval[],
  period: { from: string; to: string }
): PauseInterval[] {
  const from = parseTs(period.from);
  const to = parseTs(period.to);
  if (from == null || to == null) return intervals;
  return intervals.filter((iv) => {
    const start = parseTs(iv.startedAt);
    if (start == null) return false;
    // Inclui pausas que começaram no período (critério principal de contagem).
    return start >= from && start <= to;
  });
}
