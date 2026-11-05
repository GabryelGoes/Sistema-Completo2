import type { SupabaseClient } from "@supabase/supabase-js";
import { runProactiveScan } from "../proactiveIntelligence/runner.js";

export type ManagementScanResult = {
  alertsCreated: number;
  alertsUpdated?: number;
  alertsReopened?: number;
  skipped?: boolean;
  skipReason?: string;
  alerts: Array<{ alertKey: string; title: string; severity: string; category?: string }>;
};

/**
 * Compatibilidade Fase 1–4: a varredura de gestão agora delega ao motor proativo (Fase 5).
 * Mantém o contrato { alertsCreated, alerts } usado pelas rotas legadas.
 */
export async function runManagementScan(input: {
  workshopId: string;
  supabase: SupabaseClient;
  settingValue?: string | null;
  getWorkshopSettingValue?: (key: string) => Promise<string | null>;
}): Promise<ManagementScanResult> {
  const result = await runProactiveScan({
    workshopId: input.workshopId,
    supabase: input.supabase,
    settingValue: input.settingValue,
    getWorkshopSettingValue: input.getWorkshopSettingValue,
    triggerSource: "legacy_management",
    force: true,
  });
  return {
    alertsCreated: result.alertsCreated,
    alertsUpdated: result.alertsUpdated,
    alertsReopened: result.alertsReopened,
    skipped: result.skipped,
    skipReason: result.skipReason,
    alerts: result.alerts,
  };
}
