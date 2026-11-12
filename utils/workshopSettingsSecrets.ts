/**
 * Credenciais de configuração da oficina.
 * A API só devolve indicadores. Texto vazio não regrava o valor já salvo.
 * A verificação (exclusão de veículo, estoque, login da Gerência) fica nos handlers existentes.
 */

export const WORKSHOP_SETTINGS_WRITE_KEYS = [
  "patioLoginEnabled",
  "patioPin",
  "adminPassword",
  "adminDisplayName",
  "adminPhotoUrl",
  "technicianAccessReception",
  "technicianAccessAgenda",
  "technicianAccessPatio",
  "vehicleDeletePassword",
  "stockGuardPassword",
  "appAppearance",
  "labProductKinds",
  "labQuickServices",
  "labelTemplates",
  "aiImproveTextLevel",
] as const;

export type WorkshopSettingsWriteKey = (typeof WORKSHOP_SETTINGS_WRITE_KEYS)[number];

export type WorkshopSettingsWriteBody = Partial<Record<WorkshopSettingsWriteKey, unknown>>;

const SECRET_DB_KEYS = {
  patioPin: "patio_pin",
  vehicleDeletePassword: "vehicle_delete_password",
  stockGuardPassword: "stock_guard_password",
  adminPassword: "admin_password",
} as const;

export type WorkshopSecretFlags = {
  patioPinConfigured: boolean;
  vehicleDeletePasswordConfigured: boolean;
  stockGuardPasswordConfigured: boolean;
};

const RESPONSE_SECRET_KEYS = ["patioPin", "vehicleDeletePassword", "stockGuardPassword"] as const;

export function pickWorkshopSettingsWrite(body: unknown): WorkshopSettingsWriteBody {
  if (!body || typeof body !== "object") return {};
  const src = body as Record<string, unknown>;
  const out: WorkshopSettingsWriteBody = {};
  for (const key of WORKSHOP_SETTINGS_WRITE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(src, key)) {
      out[key] = src[key];
    }
  }
  return out;
}

/** Valor efetivo de credencial. Ausente, vazio ou só espaços não alteram o banco. */
export function effectiveSecretValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function requestsEffectiveCredentialChange(body: WorkshopSettingsWriteBody): boolean {
  return (
    effectiveSecretValue(body.patioPin) !== null ||
    effectiveSecretValue(body.vehicleDeletePassword) !== null ||
    effectiveSecretValue(body.stockGuardPassword) !== null ||
    effectiveSecretValue(body.adminPassword) !== null
  );
}

export function rejectCredentialChange(isAdmin: boolean, body: unknown): boolean {
  return !isAdmin && requestsEffectiveCredentialChange(pickWorkshopSettingsWrite(body));
}

export function plannedSecretWrites(body: WorkshopSettingsWriteBody): Array<{ key: string; value: string }> {
  const rows: Array<{ key: string; value: string }> = [];
  const pin = effectiveSecretValue(body.patioPin);
  if (pin) rows.push({ key: SECRET_DB_KEYS.patioPin, value: pin });
  const vehicle = effectiveSecretValue(body.vehicleDeletePassword);
  if (vehicle) rows.push({ key: SECRET_DB_KEYS.vehicleDeletePassword, value: vehicle });
  const stock = effectiveSecretValue(body.stockGuardPassword);
  if (stock) rows.push({ key: SECRET_DB_KEYS.stockGuardPassword, value: stock });
  const admin = effectiveSecretValue(body.adminPassword);
  if (admin) rows.push({ key: SECRET_DB_KEYS.adminPassword, value: admin });
  return rows;
}

export function workshopSecretFlags(
  map: Record<string, string | null | undefined>
): WorkshopSecretFlags {
  const configured = (key: string) => Boolean(String(map[key] ?? "").trim());
  return {
    patioPinConfigured: configured(SECRET_DB_KEYS.patioPin),
    vehicleDeletePasswordConfigured: configured(SECRET_DB_KEYS.vehicleDeletePassword),
    stockGuardPasswordConfigured: configured(SECRET_DB_KEYS.stockGuardPassword),
  };
}

export function withWorkshopSecretFlags<T extends Record<string, unknown>>(
  base: T,
  map: Record<string, string | null | undefined>
): T & WorkshopSecretFlags {
  return { ...base, ...workshopSecretFlags(map) };
}

export function responseExposesSecrets(
  payload: Record<string, unknown>,
  samples: string[] = []
): boolean {
  if (RESPONSE_SECRET_KEYS.some((key) => Object.prototype.hasOwnProperty.call(payload, key))) {
    return true;
  }
  const encoded = JSON.stringify(payload);
  return samples.some((sample) => sample.trim() !== "" && encoded.includes(sample));
}
