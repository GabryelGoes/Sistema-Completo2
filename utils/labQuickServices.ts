/** Serviços rápidos configuráveis na avaliação técnica do laboratório (módulos ABS). */

export type LabQuickServiceColor =
  | 'violet'
  | 'sky'
  | 'amber'
  | 'indigo'
  | 'teal'
  | 'rose'
  | 'emerald';

export type LabQuickService = {
  id: string;
  label: string;
  color: LabQuickServiceColor;
  sortOrder: number;
  /** Exibir apenas para módulos ABS (completo / hidráulico / eletrônico). */
  absOnly: boolean;
  /** Permite marcar "pré-aprovada" (ex.: limpeza de válvulas). */
  allowPreApproval?: boolean;
};

export const LAB_VALVE_CLEANING_PRESET_ID = 'limpeza_valvulas';

export const DEFAULT_LAB_QUICK_SERVICES: LabQuickService[] = [
  {
    id: LAB_VALVE_CLEANING_PRESET_ID,
    label: 'Limpeza de Válvulas',
    color: 'violet',
    sortOrder: 0,
    absOnly: true,
    allowPreApproval: true,
  },
  {
    id: 'reparo_modulo_eletronico',
    label: 'Reparo Módulo Eletrônico',
    color: 'sky',
    sortOrder: 1,
    absOnly: true,
  },
  {
    id: 'substituicao_modulo_hidraulico',
    label: 'Substituição Módulo Hidráulico',
    color: 'amber',
    sortOrder: 2,
    absOnly: true,
  },
  {
    id: 'substituicao_modulo_eletronico',
    label: 'Substituição Módulo Eletrônico',
    color: 'indigo',
    sortOrder: 3,
    absOnly: true,
  },
  {
    id: 'reparo_valvulas_hidraulicas',
    label: 'Reparo das Válvulas Hidráulicas',
    color: 'teal',
    sortOrder: 4,
    absOnly: true,
  },
  {
    id: 'revisao_completa',
    label: 'Revisão Completa',
    color: 'rose',
    sortOrder: 5,
    absOnly: true,
  },
  {
    id: 'teste_bancada',
    label: 'Teste em Bancada',
    color: 'emerald',
    sortOrder: 6,
    absOnly: true,
  },
];

export const LAB_QUICK_SERVICES_CHANGED_EVENT = 'lab-quick-services-changed';

const ABS_MODULE_KIND_IDS = new Set(['completo', 'hidraulico', 'eletronico']);

let LAB_QUICK_SERVICES: LabQuickService[] = [...DEFAULT_LAB_QUICK_SERVICES];

export function slugifyLabQuickServiceId(raw: string): string {
  return String(raw ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

export function normalizeLabQuickServices(
  list: { id?: unknown; label?: unknown; color?: unknown; sortOrder?: unknown; absOnly?: unknown; allowPreApproval?: unknown }[] | null | undefined
): LabQuickService[] {
  if (!Array.isArray(list) || list.length === 0) {
    return [...DEFAULT_LAB_QUICK_SERVICES];
  }
  const seen = new Set<string>();
  const cleaned: LabQuickService[] = [];
  for (const item of list) {
    const label = String(item?.label ?? '').trim();
    let id = slugifyLabQuickServiceId(String(item?.id ?? '') || label);
    if (!id || !label) continue;
    if (seen.has(id)) {
      let n = 2;
      while (seen.has(`${id}_${n}`)) n += 1;
      id = `${id}_${n}`;
    }
    seen.add(id);
    const colorRaw = String(item?.color ?? 'violet').trim() as LabQuickServiceColor;
    const color = (
      ['violet', 'sky', 'amber', 'indigo', 'teal', 'rose', 'emerald'] as const
    ).includes(colorRaw)
      ? colorRaw
      : 'violet';
    cleaned.push({
      id,
      label,
      color,
      sortOrder: Number.isFinite(Number(item?.sortOrder)) ? Number(item.sortOrder) : cleaned.length,
      absOnly: item?.absOnly !== false,
      allowPreApproval: item?.allowPreApproval === true,
    });
  }
  cleaned.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'pt-BR'));
  return cleaned.length ? cleaned : [...DEFAULT_LAB_QUICK_SERVICES];
}

export function setLabQuickServices(list: LabQuickService[]): void {
  LAB_QUICK_SERVICES = normalizeLabQuickServices(list);
}

export function getLabQuickServices(): LabQuickService[] {
  return [...LAB_QUICK_SERVICES].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'pt-BR'));
}

export function isAbsModuleKind(kind: string | null | undefined): boolean {
  return ABS_MODULE_KIND_IDS.has(String(kind ?? '').trim());
}

export const LAB_QUICK_SERVICE_COLOR_CLASSES: Record<
  LabQuickServiceColor,
  { btn: string; btnHover: string }
> = {
  violet: {
    btn: 'border-violet-500/45 bg-violet-600 text-white shadow-violet-500/20',
    btnHover: 'hover:brightness-105',
  },
  sky: {
    btn: 'border-sky-500/45 bg-sky-600 text-white shadow-sky-500/20',
    btnHover: 'hover:brightness-105',
  },
  amber: {
    btn: 'border-amber-500/45 bg-amber-600 text-white shadow-amber-500/20',
    btnHover: 'hover:brightness-105',
  },
  indigo: {
    btn: 'border-indigo-500/45 bg-indigo-600 text-white shadow-indigo-500/20',
    btnHover: 'hover:brightness-105',
  },
  teal: {
    btn: 'border-teal-500/45 bg-teal-600 text-white shadow-teal-500/20',
    btnHover: 'hover:brightness-105',
  },
  rose: {
    btn: 'border-rose-500/45 bg-rose-600 text-white shadow-rose-500/20',
    btnHover: 'hover:brightness-105',
  },
  emerald: {
    btn: 'border-emerald-500/45 bg-emerald-600 text-white shadow-emerald-500/20',
    btnHover: 'hover:brightness-105',
  },
};

export const LAB_QUICK_SERVICE_COLOR_OPTIONS: { id: LabQuickServiceColor; label: string }[] = [
  { id: 'violet', label: 'Violeta' },
  { id: 'sky', label: 'Azul' },
  { id: 'amber', label: 'Âmbar' },
  { id: 'indigo', label: 'Índigo' },
  { id: 'teal', label: 'Verde-água' },
  { id: 'rose', label: 'Rosa' },
  { id: 'emerald', label: 'Esmeralda' },
];
