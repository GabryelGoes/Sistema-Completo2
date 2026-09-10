/** Identificadores internos de módulos ABS físicos (QR = public_id, ex.: ABS-000001). */

export const ABS_MODULE_ID_REGEX = /^ABS-\d{6}$/i;

export type AbsModuleKind = 'completo' | 'eletronico' | 'hidraulico' | 'outro';
export type AbsModuleCondition = 'novo' | 'usado' | 'revisado' | 'recuperado';
export type AbsModuleStatus = 'disponivel' | 'fora_estoque';
export type AbsModuleMovementType = 'entry' | 'exit' | 'transfer';
export type AbsModuleExitReason =
  | 'venda_avulsa'
  | 'ordem_servico'
  | 'cliente'
  | 'veiculo'
  | 'retorno'
  | 'ajuste'
  | 'outro';

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

export const ABS_MODULE_STATUS_OPTIONS: { value: AbsModuleStatus; label: string }[] = [
  { value: 'disponivel', label: 'Disponível' },
  { value: 'fora_estoque', label: 'Fora do estoque' },
];

export const ABS_MODULE_EXIT_REASON_OPTIONS: { value: AbsModuleExitReason; label: string }[] = [
  { value: 'venda_avulsa', label: 'Baixa por venda' },
  { value: 'ordem_servico', label: 'Ordem de serviço' },
  { value: 'cliente', label: 'Cliente' },
  { value: 'veiculo', label: 'Veículo' },
  { value: 'outro', label: 'Outro motivo' },
];

export const ABS_MODULE_KINDS = ABS_MODULE_KIND_OPTIONS.map((o) => o.value);
export const ABS_MODULE_CONDITIONS = ABS_MODULE_CONDITION_OPTIONS.map((o) => o.value);
export const ABS_MODULE_STATUSES = ABS_MODULE_STATUS_OPTIONS.map((o) => o.value);

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
  unit_cost: number;
  unit_price: number;
  supplier: string | null;
  location: string | null;
  notes: string | null;
  status: AbsModuleStatus;
  received_at: string;
  created_at: string;
  updated_at: string;
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
  created_at: string;
};

export type WorkshopAbsModuleWriteInput = {
  manufacturer?: string | null;
  original_code?: string | null;
  application?: string | null;
  model?: string | null;
  year_label?: string | null;
  module_kind?: AbsModuleKind;
  condition?: AbsModuleCondition;
  unit_cost?: number;
  unit_price?: number;
  supplier?: string | null;
  location?: string | null;
  notes?: string | null;
  status?: AbsModuleStatus;
  received_at?: string | null;
};

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
      if (q && ABS_MODULE_ID_REGEX.test(q.trim())) s = q.trim();
    }
  } catch {
    // ignore
  }

  s = s.replace(/\s+/g, '').toUpperCase();
  if (!ABS_MODULE_ID_REGEX.test(s)) return null;
  return s;
}

export function isAbsModuleCode(raw: string): boolean {
  return normalizeAbsModuleCode(raw) != null;
}

/** Heurística rápida: começa com ABS- (mesmo se dígitos incompletos). */
export function looksLikeAbsModuleCode(raw: string): boolean {
  const s = String(raw ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();
  return /^ABS-/i.test(s);
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

export function absModuleKindLabel(kind: string | null | undefined): string {
  return ABS_MODULE_KIND_OPTIONS.find((o) => o.value === kind)?.label ?? 'Módulo ABS';
}

export function absModuleConditionLabel(condition: string | null | undefined): string {
  return ABS_MODULE_CONDITION_OPTIONS.find((o) => o.value === condition)?.label ?? '—';
}

export function absModuleStatusLabel(status: string | null | undefined): string {
  return status === 'fora_estoque' ? 'Fora do estoque' : 'Disponível';
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
