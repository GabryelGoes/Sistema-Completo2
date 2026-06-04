/** Classificação de produtos na recepção do laboratório (persistido em service_orders). */

/**
 * O identificador do tipo de produto é um slug livre (ex.: "completo", "modulo_x").
 * Os rótulos são configuráveis pela oficina (tela de Configurações → Tipos de produto
 * do laboratório) e ficam num registro dinâmico carregado a partir das configurações.
 */
export type ModuleKind = string;

export type ModuleVehicleKind = 'carro' | 'moto';

export interface LabProductKind {
  id: string;
  label: string;
}

/** Tipo reservado para texto livre ("Outro produto"); sempre disponível. */
export const OTHER_MODULE_KIND_ID = 'outro';

/** Evento disparado quando os tipos de produto são alterados nas Configurações. */
export const LAB_PRODUCT_KINDS_CHANGED_EVENT = 'lab-product-kinds-changed';

/** Lista padrão (seed) — usada quando a oficina ainda não configurou nada. */
export const DEFAULT_LAB_PRODUCT_KINDS: LabProductKind[] = [
  { id: 'completo', label: 'Módulo completo' },
  { id: 'eletronico', label: 'Módulo eletrônico' },
  { id: 'hidraulico', label: 'Módulo hidráulico' },
  { id: 'pinca_freio', label: 'Pinça de freio' },
  { id: OTHER_MODULE_KIND_ID, label: 'Outro produto' },
];

/** Rótulos padrão dos tipos embutidos — usados como fallback de exibição. */
const DEFAULT_LABELS: Record<string, string> = DEFAULT_LAB_PRODUCT_KINDS.reduce(
  (acc, k) => {
    acc[k.id] = k.label;
    return acc;
  },
  {} as Record<string, string>
);

/** Registro mutável dos tipos atuais (atualizado a partir das configurações). */
let LAB_PRODUCT_KINDS: LabProductKind[] = [...DEFAULT_LAB_PRODUCT_KINDS];

/** Gera um id (slug) estável a partir de um rótulo. */
export function slugifyModuleKindId(raw: string): string {
  return String(raw ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

/** Normaliza uma lista vinda das configurações garantindo o tipo "outro" no final. */
export function normalizeLabProductKinds(
  list: { id?: unknown; label?: unknown }[] | null | undefined
): LabProductKind[] {
  if (!Array.isArray(list) || list.length === 0) {
    return [...DEFAULT_LAB_PRODUCT_KINDS];
  }
  const seen = new Set<string>();
  const cleaned: LabProductKind[] = [];
  for (const item of list) {
    const label = String(item?.label ?? '').trim();
    let id = slugifyModuleKindId(String(item?.id ?? '') || label);
    if (!id || !label) continue;
    if (seen.has(id)) {
      let n = 2;
      while (seen.has(`${id}_${n}`)) n += 1;
      id = `${id}_${n}`;
    }
    seen.add(id);
    cleaned.push({ id, label });
  }
  if (!cleaned.some((k) => k.id === OTHER_MODULE_KIND_ID)) {
    cleaned.push({ id: OTHER_MODULE_KIND_ID, label: DEFAULT_LABELS[OTHER_MODULE_KIND_ID] });
  }
  return cleaned.length ? cleaned : [...DEFAULT_LAB_PRODUCT_KINDS];
}

/** Atualiza o registro dinâmico (chamado ao carregar as configurações da oficina). */
export function setLabProductKinds(list: { id?: unknown; label?: unknown }[] | null | undefined): void {
  LAB_PRODUCT_KINDS = normalizeLabProductKinds(list);
}

/** Lista atual de tipos de produto. */
export function getLabProductKinds(): LabProductKind[] {
  return LAB_PRODUCT_KINDS;
}

export const MODULE_VEHICLE_KIND_OPTIONS: { value: ModuleVehicleKind; label: string }[] = [
  { value: 'carro', label: 'Automóveis' },
  { value: 'moto', label: 'Motocicletas' },
];

const MODULE_VEHICLE_LABELS: Record<ModuleVehicleKind, string> = {
  carro: 'Automóveis',
  moto: 'Motocicletas',
};

/** Opções para os selects de tipo de produto (derivadas do registro dinâmico). */
export function getModuleKindOptions(): { value: string; label: string }[] {
  return LAB_PRODUCT_KINDS.map((k) => ({ value: k.id, label: k.label }));
}

export function parseModuleKind(raw: unknown): ModuleKind | null {
  const s = String(raw ?? '').toLowerCase().trim();
  if (!s) return null;
  // Aceita qualquer slug válido (tipos configuráveis + registros legados).
  if (/^[a-z0-9_]+$/.test(s)) return s;
  return null;
}

export function parseModuleVehicleKind(raw: unknown): ModuleVehicleKind | null {
  const s = String(raw ?? '').toLowerCase().trim();
  if (s === 'carro' || s === 'moto') return s;
  return null;
}

export function moduleKindLabel(raw: string | null | undefined): string {
  const k = parseModuleKind(raw);
  if (!k) return '—';
  const found = LAB_PRODUCT_KINDS.find((x) => x.id === k);
  if (found) return found.label;
  if (DEFAULT_LABELS[k]) return DEFAULT_LABELS[k];
  return '—';
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
  if (k === OTHER_MODULE_KIND_ID) {
    const t = String(other ?? '').trim();
    return t || (DEFAULT_LABELS[OTHER_MODULE_KIND_ID] ?? 'Outro produto');
  }
  return moduleKindLabel(kind);
}
