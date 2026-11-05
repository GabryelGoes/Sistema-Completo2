import type { OpsPeriod, OpsSessionFact } from "./types.js";

function parseTs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** Sessão finished/cancelled atribuída ao período pelo encerramento (ended_at). */
export function finishedSessionInPeriod(
  fact: Pick<OpsSessionFact, "status" | "endedAt">,
  period: OpsPeriod
): boolean {
  if (fact.status !== "finished" && fact.status !== "cancelled") return false;
  const ended = parseTs(fact.endedAt);
  const from = parseTs(period.from);
  const to = parseTs(period.to);
  if (ended == null || from == null || to == null) return false;
  return ended >= from && ended <= to;
}

/**
 * Sessão aberta (running/paused) relevante ao período:
 * iniciou até o fim do período (ainda aberta — atravessa ou está dentro).
 */
export function openSessionRelevantToPeriod(
  fact: Pick<OpsSessionFact, "status" | "startedAt">,
  period: OpsPeriod
): boolean {
  if (fact.status !== "running" && fact.status !== "paused") return false;
  const started = parseTs(fact.startedAt);
  const to = parseTs(period.to);
  if (started == null || to == null) return false;
  return started <= to;
}

/**
 * Separa fatos: finished/cancelled pelo ended_at; abertas à parte.
 * Inclui finished iniciadas antes do período e encerradas dentro dele.
 */
export function partitionFactsByPeriod(
  facts: OpsSessionFact[],
  period: OpsPeriod
): { finishedOrCancelled: OpsSessionFact[]; open: OpsSessionFact[]; excluded: OpsSessionFact[] } {
  const finishedOrCancelled: OpsSessionFact[] = [];
  const open: OpsSessionFact[] = [];
  const excluded: OpsSessionFact[] = [];
  for (const f of facts) {
    if (f.status === "finished" || f.status === "cancelled") {
      if (finishedSessionInPeriod(f, period)) finishedOrCancelled.push(f);
      else excluded.push(f);
      continue;
    }
    if (f.status === "running" || f.status === "paused") {
      if (openSessionRelevantToPeriod(f, period)) open.push(f);
      else excluded.push(f);
      continue;
    }
    excluded.push(f);
  }
  return { finishedOrCancelled, open, excluded };
}

/** Fatos efetivos para agregação no período (finished no período + abertas relevantes). */
export function factsForPeriodAnalysis(
  facts: OpsSessionFact[],
  period: OpsPeriod
): OpsSessionFact[] {
  const { finishedOrCancelled, open } = partitionFactsByPeriod(facts, period);
  return [...finishedOrCancelled, ...open];
}
