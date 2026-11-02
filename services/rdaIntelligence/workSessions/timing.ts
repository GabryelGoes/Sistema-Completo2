import type { RdaWorkSessionStatus } from "./types.js";

export function asNonNegInt(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.floor(v);
}

export function computeLiveTotals(input: {
  status: RdaWorkSessionStatus;
  productiveMs: number;
  pausedMs: number;
  segmentStartedAt: string | null;
  currentPauseStartedAt: string | null;
  serverNowMs: number;
}): { liveProductiveMs: number; livePausedMs: number } {
  let liveProductiveMs = asNonNegInt(input.productiveMs);
  let livePausedMs = asNonNegInt(input.pausedMs);
  if (input.status === "running" && input.segmentStartedAt) {
    const started = Date.parse(input.segmentStartedAt);
    if (Number.isFinite(started) && input.serverNowMs > started) {
      liveProductiveMs += input.serverNowMs - started;
    }
  }
  if (input.status === "paused" && input.currentPauseStartedAt) {
    const started = Date.parse(input.currentPauseStartedAt);
    if (Number.isFinite(started) && input.serverNowMs > started) {
      livePausedMs += input.serverNowMs - started;
    }
  }
  return { liveProductiveMs, livePausedMs };
}

export function formatDurationHms(totalMs: number): string {
  const ms = Math.max(0, Math.floor(totalMs));
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function newClientMutationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `mut_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
