/**
 * Agregação de intervalos efetivos de trabalho por calendário
 * no fuso da oficina (America/Sao_Paulo).
 */

export const WORKSHOP_TIME_ZONE = "America/Sao_Paulo";

export type TimeInterval = { startMs: number; endMs: number };

/** Recorta um intervalo ao intervalo [fromMs, toMs]. */
export function clipInterval(
  interval: TimeInterval,
  fromMs: number | null,
  toMs: number | null
): TimeInterval | null {
  const start = Math.max(interval.startMs, fromMs ?? -Infinity);
  const end = Math.min(interval.endMs, toMs ?? Infinity);
  if (!(end > start)) return null;
  return { startMs: start, endMs: end };
}

export function sumIntervalsMs(intervals: TimeInterval[]): number {
  let total = 0;
  for (const i of intervals) {
    if (i.endMs > i.startMs) total += i.endMs - i.startMs;
  }
  return total;
}

/** YYYY-MM-DD no fuso informado. */
export function calendarDayKey(ms: number, timeZone: string = WORKSHOP_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

/**
 * Início (00:00) do dia civil seguinte a `dayKey` no fuso, em ms UTC.
 * Usa varredura de 15 min — suficiente para DST no Brasil.
 */
export function nextCalendarDayStartMs(
  dayKey: string,
  timeZone: string = WORKSHOP_TIME_ZONE
): number {
  // dayKey é YYYY-MM-DD; começa perto do meio-dia UTC daquele dia e avança.
  const [y, m, d] = dayKey.split("-").map((x) => Number(x));
  let cursor = Date.UTC(y, m - 1, d, 3, 0, 0); // ~00:00 BRT
  // Garante que estamos no dayKey
  for (let i = 0; i < 96; i++) {
    if (calendarDayKey(cursor, timeZone) === dayKey) break;
    cursor += 15 * 60_000;
  }
  for (let i = 0; i < 200; i++) {
    cursor += 15 * 60_000;
    if (calendarDayKey(cursor, timeZone) !== dayKey) {
      // Volta ao primeiro instante do novo dia (aproxima por passo fino)
      let start = cursor - 15 * 60_000;
      for (let j = 0; j < 15 * 60; j++) {
        const t = start + j * 1000;
        if (calendarDayKey(t, timeZone) !== dayKey) return t;
      }
      return cursor;
    }
  }
  return cursor;
}

/**
 * Divide um intervalo contínuo em pedaços por dia civil no fuso.
 * Retorna mapa dayKey → ms.
 */
export function splitIntervalByCalendarDay(
  interval: TimeInterval,
  timeZone: string = WORKSHOP_TIME_ZONE
): Map<string, number> {
  const out = new Map<string, number>();
  let cursor = interval.startMs;
  const end = interval.endMs;
  if (!(end > cursor)) return out;

  let guard = 0;
  while (cursor < end && guard < 4000) {
    guard += 1;
    const day = calendarDayKey(cursor, timeZone);
    const nextStart = nextCalendarDayStartMs(day, timeZone);
    const sliceEnd = Math.min(end, nextStart);
    const ms = Math.max(0, sliceEnd - cursor);
    if (ms > 0) out.set(day, (out.get(day) || 0) + ms);
    cursor = sliceEnd;
  }
  return out;
}

export function mergeDayMaps(into: Map<string, number>, add: Map<string, number>): void {
  for (const [k, v] of add) into.set(k, (into.get(k) || 0) + v);
}

/**
 * Reconstrói intervalos produtivos a partir da timeline de eventos
 * (start → pause/finish fecha produtivo; resume → pause/finish).
 */
export function productiveIntervalsFromEvents(
  events: Array<{ eventType: string; occurredAt: string }>,
  opts?: { openUntilMs?: number; status?: string }
): TimeInterval[] {
  const sorted = [...events].sort(
    (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt)
  );
  const intervals: TimeInterval[] = [];
  let openStart: number | null = null;
  for (const ev of sorted) {
    const at = Date.parse(ev.occurredAt);
    if (!Number.isFinite(at)) continue;
    if (ev.eventType === "start" || ev.eventType === "resume") {
      openStart = at;
    } else if (ev.eventType === "pause" || ev.eventType === "finish" || ev.eventType === "cancel") {
      if (openStart != null && at > openStart) {
        intervals.push({ startMs: openStart, endMs: at });
      }
      openStart = null;
    }
  }
  if (openStart != null && opts?.status === "running") {
    const until = opts.openUntilMs ?? Date.now();
    if (until > openStart) intervals.push({ startMs: openStart, endMs: until });
  }
  return intervals;
}

export function pausedIntervalsFromEvents(
  events: Array<{ eventType: string; occurredAt: string; pauseReasonId?: string | null }>,
  opts?: { openUntilMs?: number; status?: string }
): Array<TimeInterval & { reasonId: string }> {
  const sorted = [...events].sort(
    (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt)
  );
  const intervals: Array<TimeInterval & { reasonId: string }> = [];
  let open: { startMs: number; reasonId: string } | null = null;
  for (const ev of sorted) {
    const at = Date.parse(ev.occurredAt);
    if (!Number.isFinite(at)) continue;
    if (ev.eventType === "pause") {
      open = { startMs: at, reasonId: String(ev.pauseReasonId || "other") };
    } else if (ev.eventType === "resume" || ev.eventType === "finish" || ev.eventType === "cancel") {
      if (open && at > open.startMs) {
        intervals.push({ startMs: open.startMs, endMs: at, reasonId: open.reasonId });
      }
      open = null;
    }
  }
  if (open && opts?.status === "paused") {
    const until = opts.openUntilMs ?? Date.now();
    if (until > open.startMs) {
      intervals.push({ startMs: open.startMs, endMs: until, reasonId: open.reasonId });
    }
  }
  return intervals;
}
