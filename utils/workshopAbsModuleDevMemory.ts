/**
 * Módulos ABS em memória quando Supabase não está configurado (dev / Cloud Agent).
 */
import {
  formatAbsModulePublicId,
  isValidAbsModulePublicId,
  type AbsModuleCondition,
  type AbsModuleKind,
  type AbsModuleMovementType,
  type AbsModuleStatus,
  type WorkshopAbsModule,
  type WorkshopAbsModuleMovement,
  type WorkshopAbsModuleWriteInput,
} from './workshopAbsModules.js';

type AbsModuleRow = WorkshopAbsModule & {
  movements: WorkshopAbsModuleMovement[];
};

const WORKSHOP_DEV_ID = 'dev-workshop';
const modules = new Map<string, AbsModuleRow>();
let seq = 0;

function cloneModule(row: AbsModuleRow): WorkshopAbsModule {
  const { movements: _m, ...mod } = row;
  return { ...mod };
}

function parseKind(v: unknown): AbsModuleKind {
  const s = String(v || '').trim();
  if (s === 'eletronico' || s === 'hidraulico' || s === 'outro' || s === 'completo') return s;
  return 'completo';
}

function parseCondition(v: unknown): AbsModuleCondition {
  const s = String(v || '').trim();
  if (s === 'novo' || s === 'usado' || s === 'revisado' || s === 'recuperado') return s;
  return 'usado';
}

function parseStatus(v: unknown): AbsModuleStatus {
  return String(v || '').trim() === 'fora_estoque' ? 'fora_estoque' : 'disponivel';
}

export function listDevAbsModules(filters?: {
  q?: string;
  status?: AbsModuleStatus | '';
}): WorkshopAbsModule[] {
  const q = String(filters?.q || '').trim().toLowerCase();
  const status = filters?.status || '';
  return Array.from(modules.values())
    .filter((row) => {
      if (status && row.status !== status) return false;
      if (!q) return true;
      const hay = [
        row.public_id,
        row.manufacturer,
        row.original_code,
        row.application,
        row.model,
        row.year_label,
        row.location,
        row.supplier,
        row.notes,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    })
    .map(cloneModule)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function getDevAbsModuleByPublicId(publicId: string): WorkshopAbsModule | null {
  const key = String(publicId || '').trim().toUpperCase();
  const row = modules.get(key);
  return row ? cloneModule(row) : null;
}

export function getDevAbsModuleById(id: string): WorkshopAbsModule | null {
  for (const row of modules.values()) {
    if (row.id === id) return cloneModule(row);
  }
  return null;
}

export function getDevAbsModuleMovements(publicId: string): WorkshopAbsModuleMovement[] {
  const key = String(publicId || '').trim().toUpperCase();
  const row = modules.get(key);
  if (!row) return [];
  return [...row.movements].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function createDevAbsModule(
  input: WorkshopAbsModuleWriteInput,
  recordedByName?: string | null
): WorkshopAbsModule {
  seq += 1;
  const publicId = formatAbsModulePublicId(seq);
  const now = new Date().toISOString();
  const status = parseStatus(input.status);
  const location = input.location != null ? String(input.location).trim() || null : null;
  const row: AbsModuleRow = {
    id: crypto.randomUUID(),
    workshop_id: WORKSHOP_DEV_ID,
    public_id: publicId,
    manufacturer: input.manufacturer != null ? String(input.manufacturer).trim() || null : null,
    original_code: input.original_code != null ? String(input.original_code).trim() || null : null,
    application: input.application != null ? String(input.application).trim() || null : null,
    model: input.model != null ? String(input.model).trim() || null : null,
    year_label: input.year_label != null ? String(input.year_label).trim() || null : null,
    module_kind: parseKind(input.module_kind),
    condition: parseCondition(input.condition),
    unit_cost: Number(input.unit_cost ?? 0) || 0,
    unit_price: Number(input.unit_price ?? 0) || 0,
    supplier: input.supplier != null ? String(input.supplier).trim() || null : null,
    location,
    notes: input.notes != null ? String(input.notes).trim() || null : null,
    status,
    received_at: input.received_at || now,
    created_at: now,
    updated_at: now,
    movements: [],
  };
  row.movements.push({
    id: crypto.randomUUID(),
    workshop_id: WORKSHOP_DEV_ID,
    module_id: row.id,
    movement_type: 'entry',
    from_status: null,
    to_status: status,
    from_location: null,
    to_location: location,
    reason_type: null,
    reason_ref: null,
    notes: 'Cadastro inicial',
    recorded_by_name: recordedByName || null,
    created_at: now,
  });
  modules.set(publicId, row);
  return cloneModule(row);
}

export function updateDevAbsModule(
  publicId: string,
  input: WorkshopAbsModuleWriteInput
): WorkshopAbsModule | null {
  const key = String(publicId || '').trim().toUpperCase();
  const row = modules.get(key);
  if (!row) return null;
  if (input.manufacturer !== undefined) {
    row.manufacturer = input.manufacturer != null ? String(input.manufacturer).trim() || null : null;
  }
  if (input.original_code !== undefined) {
    row.original_code =
      input.original_code != null ? String(input.original_code).trim() || null : null;
  }
  if (input.application !== undefined) {
    row.application = input.application != null ? String(input.application).trim() || null : null;
  }
  if (input.model !== undefined) {
    row.model = input.model != null ? String(input.model).trim() || null : null;
  }
  if (input.year_label !== undefined) {
    row.year_label = input.year_label != null ? String(input.year_label).trim() || null : null;
  }
  if (input.module_kind !== undefined) row.module_kind = parseKind(input.module_kind);
  if (input.condition !== undefined) row.condition = parseCondition(input.condition);
  if (input.unit_cost !== undefined) row.unit_cost = Number(input.unit_cost ?? 0) || 0;
  if (input.unit_price !== undefined) row.unit_price = Number(input.unit_price ?? 0) || 0;
  if (input.supplier !== undefined) {
    row.supplier = input.supplier != null ? String(input.supplier).trim() || null : null;
  }
  if (input.location !== undefined) {
    row.location = input.location != null ? String(input.location).trim() || null : null;
  }
  if (input.notes !== undefined) {
    row.notes = input.notes != null ? String(input.notes).trim() || null : null;
  }
  if (input.status !== undefined) row.status = parseStatus(input.status);
  if (input.received_at !== undefined && input.received_at) row.received_at = input.received_at;
  row.updated_at = new Date().toISOString();
  return cloneModule(row);
}

export function applyDevAbsModuleMovement(input: {
  public_id?: string;
  module_id?: string;
  movement_type: AbsModuleMovementType;
  to_location?: string | null;
  reason_type?: string | null;
  reason_ref?: string | null;
  notes?: string | null;
  recorded_by_name?: string | null;
}): { module: WorkshopAbsModule; movement: WorkshopAbsModuleMovement } {
  let row: AbsModuleRow | undefined;
  if (input.module_id) {
    for (const r of modules.values()) {
      if (r.id === input.module_id) {
        row = r;
        break;
      }
    }
  } else if (input.public_id) {
    const key = String(input.public_id).trim().toUpperCase();
    if (!isValidAbsModulePublicId(key)) throw new Error('ID de módulo ABS inválido.');
    row = modules.get(key);
  }
  if (!row) throw new Error('Módulo ABS não encontrado.');

  const movementType = input.movement_type;
  if (movementType !== 'entry' && movementType !== 'exit' && movementType !== 'transfer') {
    throw new Error('Tipo de movimentação inválido.');
  }

  const fromStatus = row.status;
  const fromLocation = row.location;
  let toStatus = fromStatus;
  let toLocation = fromLocation;

  if (movementType === 'exit') {
    if (row.status !== 'disponivel') {
      throw new Error(`Módulo ${row.public_id} não está disponível para saída.`);
    }
    toStatus = 'fora_estoque';
  } else if (movementType === 'entry') {
    if (row.status !== 'fora_estoque') {
      throw new Error(`Módulo ${row.public_id} já está disponível no estoque.`);
    }
    toStatus = 'disponivel';
    if (input.to_location != null && String(input.to_location).trim()) {
      toLocation = String(input.to_location).trim();
    }
  } else if (movementType === 'transfer') {
    const nextLoc = String(input.to_location || '').trim();
    if (!nextLoc) throw new Error('Informe o novo local.');
    toLocation = nextLoc;
  }

  const now = new Date().toISOString();
  const movement: WorkshopAbsModuleMovement = {
    id: crypto.randomUUID(),
    workshop_id: WORKSHOP_DEV_ID,
    module_id: row.id,
    movement_type: movementType,
    from_status: fromStatus,
    to_status: toStatus,
    from_location: fromLocation,
    to_location: toLocation,
    reason_type: input.reason_type ? String(input.reason_type).trim() || null : null,
    reason_ref: input.reason_ref ? String(input.reason_ref).trim() || null : null,
    notes: input.notes ? String(input.notes).trim() || null : null,
    recorded_by_name: input.recorded_by_name || null,
    created_at: now,
  };

  row.status = toStatus;
  if (movementType === 'transfer' || (movementType === 'entry' && toLocation !== fromLocation)) {
    row.location = toLocation;
  }
  row.updated_at = now;
  row.movements.push(movement);
  return { module: cloneModule(row), movement };
}

export function resetDevAbsModulesForTests() {
  modules.clear();
  seq = 0;
}
