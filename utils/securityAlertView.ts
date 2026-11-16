/** Leitura da Central para os alertas da SEC-05.1.2-C. Sem regra e sem segredo. */

export const SECURITY_ALERT_REFRESH_MS = 60_000;

export type SecurityAlertSeverity = "info" | "warning" | "important";
export type SecurityAlertStatus = "new" | "seen" | "resolved";

export function securityAlertSeverityLabel(severity: string): string {
  if (severity === "important") return "Importante";
  if (severity === "warning") return "Atenção";
  if (severity === "info") return "Informação";
  return "Gravidade não informada";
}

export function securityAlertStatusLabel(status: string): string {
  if (status === "new") return "Novo";
  if (status === "seen") return "Visualizado";
  if (status === "resolved") return "Resolvido";
  return "Estado não informado";
}

export function securityAlertSeverityRank(severity: string): number {
  if (severity === "important") return 0;
  if (severity === "warning") return 1;
  if (severity === "info") return 2;
  return 3;
}
