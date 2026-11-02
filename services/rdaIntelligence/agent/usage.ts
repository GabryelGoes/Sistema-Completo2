import type { SupabaseClient } from "@supabase/supabase-js";
import { RDA_DAILY_TOKEN_LIMIT_ENV_KEY } from "../types.js";

export function resolveDailyTokenLimit(): number {
  const raw =
    typeof process !== "undefined"
      ? process.env[RDA_DAILY_TOKEN_LIMIT_ENV_KEY]
      : undefined;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return 500_000;
}

export async function getTodayUsage(
  supabase: SupabaseClient,
  workshopId: string
): Promise<{
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requestCount: number;
}> {
  const day = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("rda_usage_daily")
    .select("prompt_tokens, completion_tokens, total_tokens, request_count")
    .eq("workshop_id", workshopId)
    .eq("day", day)
    .maybeSingle();
  return {
    promptTokens: Number((data as { prompt_tokens?: number } | null)?.prompt_tokens || 0),
    completionTokens: Number(
      (data as { completion_tokens?: number } | null)?.completion_tokens || 0
    ),
    totalTokens: Number((data as { total_tokens?: number } | null)?.total_tokens || 0),
    requestCount: Number((data as { request_count?: number } | null)?.request_count || 0),
  };
}

export async function assertUnderDailyLimit(
  supabase: SupabaseClient,
  workshopId: string
): Promise<{ ok: true } | { ok: false; error: string; used: number; limit: number }> {
  const limit = resolveDailyTokenLimit();
  const usage = await getTodayUsage(supabase, workshopId);
  if (usage.totalTokens >= limit) {
    return {
      ok: false,
      error: `Limite diário de tokens do RDA atingido (${usage.totalTokens}/${limit}).`,
      used: usage.totalTokens,
      limit,
    };
  }
  return { ok: true };
}

export async function recordTokenUsage(
  supabase: SupabaseClient,
  workshopId: string,
  usage: { promptTokens: number; completionTokens: number; totalTokens: number }
): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  const current = await getTodayUsage(supabase, workshopId);
  const prompt = Math.max(0, Math.floor(usage.promptTokens || 0));
  const completion = Math.max(0, Math.floor(usage.completionTokens || 0));
  const total = Math.max(0, Math.floor(usage.totalTokens || prompt + completion));
  await supabase.from("rda_usage_daily").upsert(
    {
      workshop_id: workshopId,
      day,
      prompt_tokens: current.promptTokens + prompt,
      completion_tokens: current.completionTokens + completion,
      total_tokens: current.totalTokens + total,
      request_count: current.requestCount + 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "workshop_id,day" }
  );
}
