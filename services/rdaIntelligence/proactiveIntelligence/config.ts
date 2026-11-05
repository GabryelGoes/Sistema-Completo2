import type { ProactiveMonitorConfig } from "./types.js";

export const RDA_PROACTIVE_ENABLED_KEY = "rda_proactive_monitor_enabled";
export const RDA_PROACTIVE_INTERVAL_MINUTES_KEY = "rda_proactive_interval_minutes";
export const RDA_PROACTIVE_REOPEN_HOURS_KEY = "rda_proactive_reopen_after_hours";
export const RDA_PROACTIVE_NOTIFY_KEY = "rda_proactive_notify_on_create";

export const DEFAULT_PROACTIVE_MONITOR_CONFIG: ProactiveMonitorConfig = {
  enabled: true,
  intervalMinutes: 30,
  reopenAfterHours: 24,
  notifyOnCreate: true,
};

export function parseProactiveMonitorConfig(
  entries: Record<string, string | null | undefined>
): ProactiveMonitorConfig {
  const enabledRaw = entries[RDA_PROACTIVE_ENABLED_KEY];
  const enabled =
    enabledRaw == null || String(enabledRaw).trim() === ""
      ? DEFAULT_PROACTIVE_MONITOR_CONFIG.enabled
      : !/^(0|false|off|no)$/i.test(String(enabledRaw).trim());

  const interval = Number(entries[RDA_PROACTIVE_INTERVAL_MINUTES_KEY]);
  const intervalMinutes =
    Number.isFinite(interval) && interval >= 5 && interval <= 1440
      ? Math.floor(interval)
      : DEFAULT_PROACTIVE_MONITOR_CONFIG.intervalMinutes;

  const reopen = Number(entries[RDA_PROACTIVE_REOPEN_HOURS_KEY]);
  const reopenAfterHours =
    Number.isFinite(reopen) && reopen >= 1 && reopen <= 168
      ? Math.floor(reopen)
      : DEFAULT_PROACTIVE_MONITOR_CONFIG.reopenAfterHours;

  const notifyRaw = entries[RDA_PROACTIVE_NOTIFY_KEY];
  const notifyOnCreate =
    notifyRaw == null || String(notifyRaw).trim() === ""
      ? DEFAULT_PROACTIVE_MONITOR_CONFIG.notifyOnCreate
      : !/^(0|false|off|no)$/i.test(String(notifyRaw).trim());

  return { enabled, intervalMinutes, reopenAfterHours, notifyOnCreate };
}
