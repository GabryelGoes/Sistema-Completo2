/** Identificadores internos de módulos ABS físicos (QR = public_id, ex.: ABS-000001). */

export const ABS_MODULE_ID_REGEX = /^ABS-\d{6}$/i;

export type AbsModuleKind = 'completo' | 'eletronico' | 'hidraulico' | 'outro';
/** @deprecated Prefer AbsModuleItemState + AbsModuleItemCondition */
export type AbsModuleCondition = 'novo' | 'usado' | 'revisado' | 'recuperado';
export type AbsModuleItemState = 'novo' | 'usado' | 'recondicionado';
export type AbsModuleItemCondition = 'perfeito' | 'com_avarias' | 'defeituoso' | 'nao_testado';
export type AbsModuleStatus = 'disponivel' | 'fora_estoque' | 'desmembrado' | 'reservado';
export type AbsModuleMovementType = 'entry' | 'exit' | 'transfer';
export type AbsModuleExitReason =
  | 'venda_avulsa'
  | 'ordem_servico'
  | 'cliente'
  | 'veiculo'
  | 'retorno'
  | 'ajuste'
  | 'laboratorio'
  | 'desmembramento'
  | 'outro';
export type AbsComponentScope = 'completo' | 'eletronico' | 'hidraulico';
export type AbsCodeRole = 'fabricante' | 'montadora' | 'alternativo';
export type AbsDisassembleDestination =
  | 'ordem_servico'
  | 'venda_direta'
  | 'laboratorio'
  | 'estoque';

export const ABS_MODULE_KIND_OPTIONS: { value: AbsModuleKind; label: string }[] = [
  { value: 'completo', label: 'Módulo completo' },
  { value: 'eletronico', label: 'Módulo eletrônico' },
  { value: 'hidraulico', label: 'Módulo hidráulico' },
  { value: 'outro', label: 'Outro' },
];

export const ABS_MODULE_CONDITION_OPTIONS: { value: AbsModuleCondition; label: string }[] = [
  { value: 'novo', label: 'Novo' },
  { value: 'usado', label: 'Usado' },
  { value: 'revisado', label: 'Revisado' },
  { value: 'recuperado', label: 'Recuperado' },
];

export const ABS_MODULE_ITEM_STATE_OPTIONS: { value: AbsModuleItemState; label: string }[] = [
  { value: 'novo', label: 'Novo' },
  { value: 'usado', label: 'Usado' },
  { value: 'recondicionado', label: 'Recondicionado' },
];

export const ABS_MODULE_ITEM_CONDITION_OPTIONS: {
  value: AbsModuleItemCondition;
  label: string;
}[] = [
  { value: 'perfeito', label: 'Perfeito' },
  { value: 'com_avarias', label: 'Com avarias' },
  { value: 'defeituoso', label: 'Defeituoso' },
  { value: 'nao_testado', label: 'Não testado' },
];

export const ABS_MODULE_STATUS_OPTIONS: { value: AbsModuleStatus; label: string }[] = [
  { value: 'disponivel', label: 'Disponível' },
  { value: 'reservado', label: 'Reservado' },
  { value: 'fora_estoque', label: 'Fora do estoque' },
  { value: 'desmembrado', label: 'Desmembrado' },
];

export const ABS_MODULE_EXIT_REASON_OPTIONS: { value: AbsModuleExitReason; label: string }[] = [
  { value: 'venda_avulsa', label: 'Baixa por venda' },
  { value: 'ordem_servico', label: 'Ordem de serviço' },
  { value: 'laboratorio', label: 'Laboratório' },
  { value: 'cliente', label: 'Cliente' },
  { value: 'veiculo', label: 'Veículo' },
  { value: 'desmembramento', label: 'Desmembramento' },
  { value: 'outro', label: 'Outro motivo' },
];

export const ABS_CODE_ROLE_OPTIONS: { value: AbsCodeRole; label: string }[] = [
  { value: 'fabricante', label: 'Fabricante' },
  { value: 'montadora', label: 'Montadora' },
  { value: 'alternativo', label: 'Alternativo' },
];

export const ABS_DISASSEMBLE_DESTINATION_OPTIONS: {
  value: AbsDisassembleDestination;
  label: string;
}[] = [
  { value: 'ordem_servico', label: 'Ordem de serviço' },
  { value: 'venda_direta', label: 'Venda direta' },
  { value: 'laboratorio', label: 'Laboratório' },
  { value: 'estoque', label: 'Estoque' },
];

export const ABS_MODULE_KINDS = ABS_MODULE_KIND_OPTIONS.map((o) => o.value);
export const ABS_MODULE_CONDITIONS = ABS_MODULE_CONDITION_OPTIONS.map((o) => o.value);
export const ABS_MODULE_STATUSES = ABS_MODULE_STATUS_OPTIONS.map((o) => o.value);
export const ABS_MODULE_ITEM_STATES = ABS_MODULE_ITEM_STATE_OPTIONS.map((o) => o.value);
export const ABS_MODULE_ITEM_CONDITIONS = ABS_MODULE_ITEM_CONDITION_OPTIONS.map((o) => o.value);

export type WorkshopAbsModuleCode = {
  id: string;
  workshop_id?: string;
  model_id: string;
  component_scope: AbsComponentScope;
  code_role: AbsCodeRole;
  code_value: string;
  sort_order: number;
  created_at?: string;
};

export type WorkshopAbsModuleApplication = {
  id: string;
  workshop_id?: string;
  model_id: string;
  component_scope: AbsComponentScope;
  vehicle_brand: string | null;
  vehicle_model: string | null;
  generation: string | null;
  year_from: number | null;
  year_to: number | null;
  engine: string | null;
  version: string | null;
  notes: string | null;
  sort_order: number;
  created_at?: string;
};

export type WorkshopAbsModulePhoto = {
  id: string;
  photo_url: string;
  sort_order: number;
};

export type WorkshopAbsModuleModel = {
  id: string;
  workshop_id?: string;
  manufacturer: string | null;
  family: string | null;
  module_kind: AbsModuleKind;
  notes: string | null;
  fingerprint?: string;
  created_at: string;
  updated_at: string;
  codes?: WorkshopAbsModuleCode[];
  applications?: WorkshopAbsModuleApplication[];
  photos?: WorkshopAbsModulePhoto[];
  available_qty?: number;
  total_qty?: number;
  units?: WorkshopAbsModule[];
};

export type WorkshopAbsModule = {
  id: string;
  workshop_id?: string;
  public_id: string;
  manufacturer: string | null;
  original_code: string | null;
  application: string | null;
  model: string | null;
  year_label: string | null;
  module_kind: AbsModuleKind;
  condition: AbsModuleCondition;
  item_state: AbsModuleItemState;
  item_condition: AbsModuleItemCondition;
  damage_description: string | null;
  unit_cost: number;
  unit_price: number;
  supplier: string | null;
  location: string | null;
  notes: string | null;
  status: AbsModuleStatus;
  model_id: string | null;
  sequence_number: number | null;
  parent_complete_id: string | null;
  received_at: string;
  created_at: string;
  updated_at: string;
  catalog_model?: WorkshopAbsModuleModel | null;
  photos?: WorkshopAbsModulePhoto[];
};

export type WorkshopAbsModuleMovement = {
  id: string;
  workshop_id?: string;
  module_id: string;
  movement_type: AbsModuleMovementType;
  from_status: string | null;
  to_status: string | null;
  from_location: string | null;
  to_location: string | null;
  reason_type: AbsModuleExitReason | string | null;
  reason_ref: string | null;
  notes: string | null;
  recorded_by_name: string | null;
  service_order_id?: string | null;
  created_at: string;
};

export type WorkshopAbsModuleDisassembly = {
  id: string;
  workshop_id?: string;
  source_module_id: string;
  withdrawn_kind: 'eletronico' | 'hidraulico';
  remaining_module_id: string;
  withdrawn_module_id: string;
  destination: AbsDisassembleDestination;
  destination_ref: string | null;
  service_order_id: string | null;
  cost_original: number;
  cost_remaining: number;
  cost_withdrawn: number;
  cost_adjustment_authorized: boolean;
  cost_adjustment_note: string | null;
  notes: string | null;
  recorded_by_name: string | null;
  created_at: string;
};

export type WorkshopAbsModuleCodeInput = {
  component_scope: AbsComponentScope;
  code_role?: AbsCodeRole;
  code_value: string;
  sort_order?: number;
};

export type WorkshopAbsModuleApplicationInput = {
  component_scope: AbsComponentScope;
  vehicle_brand?: string | null;
  vehicle_model?: string | null;
  generation?: string | null;
  year_from?: number | null;
  year_to?: number | null;
  engine?: string | null;
  version?: string | null;
  notes?: string | null;
  sort_order?: number;
};

export type WorkshopAbsModuleModelWriteInput = {
  manufacturer?: string | null;
  family?: string | null;
  module_kind?: AbsModuleKind;
  notes?: string | null;
  codes?: WorkshopAbsModuleCodeInput[];
  applications?: WorkshopAbsModuleApplicationInput[];
  photo_urls?: string[];
};

export type WorkshopAbsModuleWriteInput = {
  manufacturer?: string | null;
  original_code?: string | null;
  application?: string | null;
  model?: string | null;
  year_label?: string | null;
  module_kind?: AbsModuleKind;
  condition?: AbsModuleCondition;
  item_state?: AbsModuleItemState;
  item_condition?: AbsModuleItemCondition;
  damage_description?: string | null;
  unit_cost?: number;
  unit_price?: number;
  supplier?: string | null;
  location?: string | null;
  notes?: string | null;
  status?: AbsModuleStatus;
  received_at?: string | null;
  model_id?: string | null;
  /** Cadastro em um passo: cria/resolve modelo + unidade */
  catalog?: WorkshopAbsModuleModelWriteInput;
  photo_urls?: string[];
};

export type WorkshopAbsModuleSearchResult = {
  query: string;
  availableUnits: WorkshopAbsModule[];
  availableViaDisassembly: WorkshopAbsModule[];
};

export type WorkshopAbsDisassembleInput = {
  withdrawn_kind: 'eletronico' | 'hidraulico';
  destination: AbsDisassembleDestination;
  destination_ref?: string | null;
  service_order_id?: string | null;
  cost_remaining?: number | null;
  cost_withdrawn?: number | null;
  cost_adjustment_authorized?: boolean;
  cost_adjustment_note?: string | null;
  remaining_location?: string | null;
  withdrawn_location?: string | null;
  notes?: string | null;
  recorded_by_name?: string | null;
  remaining_primary_code?: string | null;
  withdrawn_primary_code?: string | null;
};

export type WorkshopAbsDisassembleResult = {
  source: WorkshopAbsModule;
  remaining: WorkshopAbsModule;
  withdrawn: WorkshopAbsModule;
  disassembly: WorkshopAbsModuleDisassembly;
};

/**
 * Pistolas USB (HID) muitas vezes assumem teclado US enquanto o SO está em
 * ABNT/outro layout: o hífen de ABS-000001 vira `;`, `/`, `'` etc.
 */
function normalizeAbsScanText(raw: string): string {
  return String(raw ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[;/_·–—´`'′]/g, '-')
    .replace(/﹣|－/g, '-')
    .toUpperCase();
}

/** Normaliza conteúdo lido da câmera/pistola para ID ABS (remove URL/espaços). */
export function normalizeAbsModuleCode(raw: string): string | null {
  let s = String(raw ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
  if (!s) return null;

  try {
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s);
      const parts = u.pathname.split('/').filter(Boolean);
      s = parts[parts.length - 1] || s;
      const q = u.searchParams.get('id') || u.searchParams.get('code');
      if (q) {
        const fromQuery = normalizeAbsModuleCode(q);
        if (fromQuery) return fromQuery;
      }
    }
  } catch {
    // ignore
  }

  s = normalizeAbsScanText(s);

  if (ABS_MODULE_ID_REGEX.test(s)) return s;

  // ABS000001 / ABS.000001 / ABS_000001 → ABS-000001
  const glued = s.match(/^ABS[-_.]?(\d{6})$/i);
  if (glued?.[1]) return `ABS-${glued[1]}`;

  // Só os 6 dígitos com prefixo ABS truncado por layout (ex.: "ABS000001").
  const digits = s.match(/^ABS(\d{6})$/i);
  if (digits?.[1]) return `ABS-${digits[1]}`;

  return null;
}

export function isAbsModuleCode(raw: string): boolean {
  return normalizeAbsModuleCode(raw) != null;
}

/** Heurística rápida: parece ID de módulo ABS (mesmo com hífen deformado pelo teclado). */
export function looksLikeAbsModuleCode(raw: string): boolean {
  const s = normalizeAbsScanText(raw);
  if (!s) return false;
  if (/^ABS-/i.test(s)) return true;
  if (/^ABS[-_.]?\d{4,}/i.test(s)) return true;
  if (/^ABS\d{4,}/i.test(s)) return true;
  return normalizeAbsModuleCode(raw) != null;
}

export function formatAbsModulePublicId(n: number): string {
  const safe = Math.max(1, Math.floor(n));
  return `ABS-${String(safe).padStart(6, '0')}`;
}

export function nextAbsModulePublicId(seq: number): string {
  return formatAbsModulePublicId(seq);
}

export function isValidAbsModulePublicId(raw: string): boolean {
  return ABS_MODULE_ID_REGEX.test(String(raw || '').trim());
}

export function formatAbsModuleSequence(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return `#${Math.floor(Number(n))}`;
}

/** Marcas de aplicação (veículo) únicas, na ordem cadastrada. */
export function formatAbsApplicationBrands(
  apps: WorkshopAbsModuleApplication[] | null | undefined
): string {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const a of apps || []) {
    const brand = String(a.vehicle_brand || '').trim();
    if (!brand) continue;
    const key = brand.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(brand);
  }
  return out.join(' · ');
}

/**
 * Veículos de aplicação para etiqueta.
 * Uma marca: só os modelos. Várias marcas: "VW Gol · Fiat Palio".
 */
export function formatAbsApplicationVehicles(
  apps: WorkshopAbsModuleApplication[] | null | undefined
): string {
  const list = apps || [];
  const brands = new Set(
    list.map((a) => String(a.vehicle_brand || '').trim()).filter(Boolean).map((b) => b.toLowerCase())
  );
  const multiBrand = brands.size > 1;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const a of list) {
    const brand = String(a.vehicle_brand || '').trim();
    const model = String(a.vehicle_model || '').trim();
    if (!model && !brand) continue;
    const label = multiBrand
      ? [brand, model].filter(Boolean).join(' ')
      : model || brand;
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out.join(' · ');
}

export function absModelFingerprint(
  manufacturer: string | null | undefined,
  primaryCode: string | null | undefined,
  moduleKind: string | null | undefined
): string {
  const m = String(manufacturer || '').trim() || '_';
  const c = String(primaryCode || '').trim() || '_';
  const k = String(moduleKind || 'outro').trim() || 'outro';
  return `${m}|${c}|${k}`.toLowerCase();
}

export function absModuleKindLabel(kind: string | null | undefined): string {
  return ABS_MODULE_KIND_OPTIONS.find((o) => o.value === kind)?.label ?? 'Módulo ABS';
}

export function absModuleConditionLabel(condition: string | null | undefined): string {
  return ABS_MODULE_CONDITION_OPTIONS.find((o) => o.value === condition)?.label ?? '—';
}

export function absModuleItemStateLabel(state: string | null | undefined): string {
  return ABS_MODULE_ITEM_STATE_OPTIONS.find((o) => o.value === state)?.label ?? '—';
}

export function absModuleItemConditionLabel(condition: string | null | undefined): string {
  return ABS_MODULE_ITEM_CONDITION_OPTIONS.find((o) => o.value === condition)?.label ?? '—';
}

export function absModuleStatusLabel(status: string | null | undefined): string {
  return ABS_MODULE_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? String(status || '—');
}

export function absModuleMovementLabel(type: AbsModuleMovementType | string): string {
  if (type === 'entry') return 'Entrada';
  if (type === 'exit') return 'Saída';
  if (type === 'transfer') return 'Transferência';
  return String(type || '—');
}

export function absModuleExitReasonLabel(reason: string | null | undefined): string {
  return ABS_MODULE_EXIT_REASON_OPTIONS.find((o) => o.value === reason)?.label ?? reason ?? '—';
}

export function absDisassembleDestinationLabel(d: string | null | undefined): string {
  return ABS_DISASSEMBLE_DESTINATION_OPTIONS.find((o) => o.value === d)?.label ?? d ?? '—';
}

export function formatAbsModuleMoney(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatAbsModuleWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(iso);
  }
}

export function describeAbsModuleMovement(m: WorkshopAbsModuleMovement): string {
  const type = absModuleMovementLabel(m.movement_type);
  if (m.movement_type === 'transfer') {
    return `Transferido ${m.from_location || '—'} → ${m.to_location || '—'}`;
  }
  if (m.movement_type === 'exit') {
    const reason = absModuleExitReasonLabel(m.reason_type);
    const ref = m.reason_ref ? ` · ${m.reason_ref}` : '';
    return `Saída — ${reason}${ref}`;
  }
  if (m.movement_type === 'entry') {
    return m.notes || m.reason_ref || 'Entrada / retorno ao estoque';
  }
  return type;
}

export function primaryCodeForScope(
  codes: WorkshopAbsModuleCode[] | undefined,
  scope: AbsComponentScope
): string | null {
  const list = (codes || [])
    .filter((c) => c.component_scope === scope && String(c.code_value || '').trim())
    .sort((a, b) => a.sort_order - b.sort_order);
  return list[0]?.code_value ?? null;
}

export function legacyConditionToItemFields(condition: AbsModuleCondition | string | undefined): {
  item_state: AbsModuleItemState;
  item_condition: AbsModuleItemCondition;
} {
  if (condition === 'novo') return { item_state: 'novo', item_condition: 'perfeito' };
  if (condition === 'revisado' || condition === 'recuperado') {
    return { item_state: 'recondicionado', item_condition: 'nao_testado' };
  }
  return { item_state: 'usado', item_condition: 'nao_testado' };
}
