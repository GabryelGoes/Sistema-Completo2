/** Classificação de produtos na recepção do laboratório (persistido em service_orders). */

export type ModuleKind =
  | 'completo'
  | 'eletronico'
  | 'hidraulico'
  | 'pinca_freio'
  | 'outro';

export type ModuleVehicleKind = 'carro' | 'moto';

export const MODULE_KIND_OPTIONS: { value: ModuleKind; label: string }[] = [
  { value: 'completo', label: 'Módulo completo' },
  { value: 'eletronico', label: 'Módulo eletrônico' },
  { value: 'hidraulico', label: 'Módulo hidráulico' },
  { value: 'pinca_freio', label: 'Pinça de freio' },
  { value: 'outro', label: 'Outro produto' },
];

export const MODULE_VEHICLE_KIND_OPTIONS: { value: ModuleVehicleKind; label: string }[] = [
  { value: 'carro', label: 'Carro' },
  { value: 'moto', label: 'Moto' },
];

const MODULE_KIND_LABELS: Record<ModuleKind, string> = {
  completo: 'Módulo completo',
  eletronico: 'Módulo eletrônico',
  hidraulico: 'Módulo hidráulico',
  pinca_freio: 'Pinça de freio',
  outro: 'Outro produto',
};

const MODULE_VEHICLE_LABELS: Record<ModuleVehicleKind, string> = {
  carro: 'Carro',
  moto: 'Moto',
};

export function parseModuleKind(raw: unknown): ModuleKind | null {
  const s = String(raw ?? '').toLowerCase().trim();
  if (
    s === 'completo' ||
    s === 'eletronico' ||
    s === 'hidraulico' ||
    s === 'pinca_freio' ||
    s === 'outro'
  ) {
    return s;
  }
  return null;
}

export function parseModuleVehicleKind(raw: unknown): ModuleVehicleKind | null {
  const s = String(raw ?? '').toLowerCase().trim();
  if (s === 'carro' || s === 'moto') return s;
  return null;
}

export function moduleKindLabel(raw: string | null | undefined): string {
  const k = parseModuleKind(raw);
  return k ? MODULE_KIND_LABELS[k] : '—';
}

export function moduleVehicleKindLabel(raw: string | null | undefined): string {
  const k = parseModuleVehicleKind(raw);
  return k ? MODULE_VEHICLE_LABELS[k] : '—';
}

/** Rótulo exibido: para "outro", usa o texto livre quando existir. */
export function labProductDisplayLabel(
  kind: string | null | undefined,
  other: string | null | undefined
): string {
  const k = parseModuleKind(kind);
  if (k === 'outro') {
    const t = String(other ?? '').trim();
    return t || MODULE_KIND_LABELS.outro;
  }
  return moduleKindLabel(kind);
}
