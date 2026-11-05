import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveRdaIntelligenceEnabled } from "../featureFlag.js";
import { RDA_PATIO_THRESHOLDS_SETTING_KEY } from "../patioIntelligence/thresholds.js";
import { RDA_LAB_THRESHOLDS_SETTING_KEY } from "../labEstoqueIntelligence/thresholds.js";
import { parseProactiveMonitorConfig } from "./config.js";
import { detectProactiveAlerts } from "./detectors.js";
import { upsertProactiveAlerts } from "./store.js";
import type { ProactiveScanResult } from "./types.js";

const STALE_LOCK_MS = 15 * 60 * 1000;

export type RunProactiveScanInput = {
  workshopId: string;
  supabase: SupabaseClient;
  triggerSource?: "manual" | "cron" | "vercel" | "legacy_management";
  /** Override: força mesmo se monitor desabilitado (manual gestão). */
  force?: boolean;
  settingValue?: string | null;
  getWorkshopSettingValue?: (key: string) => Promise<string | null>;
};

async function loadSettingsMap(
  get?: (key: string) => Promise<string | null>,
  keys: string[] = []
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  if (!get) return out;
  await Promise.all(
    keys.map(async (k) => {
      out[k] = await get(k);
    })
  );
  return out;
}

async function finishRun(
  supabase: SupabaseClient,
  runId: string | undefined,
  patch: Record<string, unknown>
): Promise<void> {
  if (!runId) return;
  await supabase
    .from("rda_proactive_scan_runs")
    .update({ finished_at: new Date().toISOString(), ...patch })
    .eq("id", runId);
}

/**
 * Varredura proativa com lock lógico (índice único unfinished) + stale recovery.
 * Idempotente: alertas dedupeados por alert_key; não notifica de novo se já ativo.
 */
export async function runProactiveScan(
  input: RunProactiveScanInput
): Promise<ProactiveScanResult> {
  if (
    !resolveRdaIntelligenceEnabled({
      settingValue: input.settingValue,
    })
  ) {
    return {
      ok: true,
      skipped: true,
      skipReason: "rda_intelligence_disabled",
      alertsCreated: 0,
      alertsUpdated: 0,
      alertsReopened: 0,
      alerts: [],
    };
  }

  const settings = await loadSettingsMap(input.getWorkshopSettingValue, [
    "rda_proactive_monitor_enabled",
    "rda_proactive_interval_minutes",
    "rda_proactive_reopen_after_hours",
    "rda_proactive_notify_on_create",
    RDA_PATIO_THRESHOLDS_SETTING_KEY,
    RDA_LAB_THRESHOLDS_SETTING_KEY,
  ]);
  const config = parseProactiveMonitorConfig(settings);

  if (!config.enabled && !input.force) {
    return {
      ok: true,
      skipped: true,
      skipReason: "monitor_disabled",
      alertsCreated: 0,
      alertsUpdated: 0,
      alertsReopened: 0,
      alerts: [],
    };
  }

  // Interval gate for cron/vercel (manual always runs)
  const trigger = input.triggerSource || "manual";
  if ((trigger === "cron" || trigger === "vercel") && !input.force) {
    const { data: last } = await input.supabase
      .from("rda_proactive_scan_runs")
      .select("started_at, finished_at, ok, skipped")
      .eq("workshop_id", input.workshopId)
      .not("finished_at", "is", null)
      .eq("ok", true)
      .eq("skipped", false)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last?.started_at) {
      const elapsedMin =
        (Date.now() - Date.parse(String(last.started_at))) / 60_000;
      if (Number.isFinite(elapsedMin) && elapsedMin < config.intervalMinutes) {
        return {
          ok: true,
          skipped: true,
          skipReason: `interval_not_elapsed_${config.intervalMinutes}m`,
          alertsCreated: 0,
          alertsUpdated: 0,
          alertsReopened: 0,
          alerts: [],
        };
      }
    }
  }

  // Stale lock cleanup
  const staleBefore = new Date(Date.now() - STALE_LOCK_MS).toISOString();
  await input.supabase
    .from("rda_proactive_scan_runs")
    .update({
      finished_at: new Date().toISOString(),
      ok: false,
      skipped: true,
      skip_reason: "stale_lock_recovered",
      error_message: "Lock expirado — recuperação automática.",
    })
    .eq("workshop_id", input.workshopId)
    .is("finished_at", null)
    .lt("started_at", staleBefore);

  let runId: string | undefined;
  const { data: runRow, error: lockErr } = await input.supabase
    .from("rda_proactive_scan_runs")
    .insert({
      workshop_id: input.workshopId,
      trigger_source: trigger,
      started_at: new Date().toISOString(),
      meta: { force: !!input.force },
    })
    .select("id")
    .maybeSingle();

  if (lockErr) {
    if (/unique|duplicate|uq_rda_proactive/i.test(lockErr.message)) {
      return {
        ok: true,
        skipped: true,
        skipReason: "already_running",
        alertsCreated: 0,
        alertsUpdated: 0,
        alertsReopened: 0,
        alerts: [],
      };
    }
    // Qualquer outra falha de lock: não executar sem proteção.
    console.warn("[proactive] lock insert failed:", lockErr.message);
    return {
      ok: false,
      skipped: false,
      alertsCreated: 0,
      alertsUpdated: 0,
      alertsReopened: 0,
      alerts: [],
      error: `lock_failed: ${lockErr.message}`,
    };
  }

  runId = (runRow as { id?: string } | null)?.id;
  if (!runId) {
    return {
      ok: false,
      skipped: false,
      alertsCreated: 0,
      alertsUpdated: 0,
      alertsReopened: 0,
      alerts: [],
      error: "lock_not_acquired",
    };
  }

  try {
    const drafts = await detectProactiveAlerts({
      workshopId: input.workshopId,
      supabase: input.supabase,
      patioThresholdsRaw: settings[RDA_PATIO_THRESHOLDS_SETTING_KEY],
      labThresholdsRaw: settings[RDA_LAB_THRESHOLDS_SETTING_KEY],
    });

    const upserted = await upsertProactiveAlerts({
      workshopId: input.workshopId,
      supabase: input.supabase,
      drafts,
      reopenAfterHours: config.reopenAfterHours,
      notifyOnCreate: config.notifyOnCreate,
    });

    await finishRun(input.supabase, runId, {
      ok: true,
      skipped: false,
      alerts_created: upserted.created,
      alerts_updated: upserted.updated,
      alerts_reopened: upserted.reopened,
      meta: {
        force: !!input.force,
        draftCount: drafts.length,
        intervalMinutes: config.intervalMinutes,
      },
    });

    return {
      ok: true,
      skipped: false,
      alertsCreated: upserted.created,
      alertsUpdated: upserted.updated,
      alertsReopened: upserted.reopened,
      alerts: upserted.alerts,
      runId,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await finishRun(input.supabase, runId, {
      ok: false,
      skipped: false,
      error_message: message.slice(0, 500),
    });
    return {
      ok: false,
      skipped: false,
      alertsCreated: 0,
      alertsUpdated: 0,
      alertsReopened: 0,
      alerts: [],
      runId,
      error: message,
    };
  }
}
