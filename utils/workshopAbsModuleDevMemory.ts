/**
 * Módulos ABS em memória quando Supabase não está configurado (dev / Cloud Agent).
 * Espelha catálogo (modelos/códigos/aplicações), sequências, busca e desmembramento.
 */
import {
  absModelFingerprint,
  formatAbsModulePublicId,
  isValidAbsModulePublicId,
  legacyConditionToItemFields,
  primaryCodeForScope,
  type AbsCodeRole,
  type AbsComponentScope,
  type AbsDisassembleDestination,
  type AbsModuleCondition,
  type AbsModuleItemCondition,
  type AbsModuleItemState,
  type AbsModuleKind,
  type AbsModuleMovementType,
  type AbsModuleStatus,
  type WorkshopAbsDisassembleInput,
  type WorkshopAbsDisassembleResult,
  type WorkshopAbsModule,
  type WorkshopAbsModuleApplication,
  type WorkshopAbsModuleApplicationInput,
  type WorkshopAbsModuleCode,
  type WorkshopAbsModuleCodeInput,
  type WorkshopAbsModuleDisassembly,
  type WorkshopAbsModuleModel,
  type WorkshopAbsModuleModelWriteInput,
  type WorkshopAbsModuleMovement,
  type WorkshopAbsModulePhoto,
  type WorkshopAbsModuleSearchResult,
  type WorkshopAbsModuleWriteInput,
} from './workshopAbsModules.js';

type AbsModuleRow = WorkshopAbsModule & {
  movements: WorkshopAbsModuleMovement[];
  photos: WorkshopAbsModulePhoto[];
};

type AbsModelRow = WorkshopAbsModuleModel & {
  codes: WorkshopAbsModuleCode[];
  applications: WorkshopAbsModuleApplication[];
  photos: WorkshopAbsModulePhoto[];
};

const WORKSHOP_DEV_ID = 'dev-workshop';
const modules = new Map<string, AbsModuleRow>();
const models = new Map<string, AbsModelRow>();
const disassemblies = new Map<string, WorkshopAbsModuleDisassembly>();
/** public_id global (ABS-000001…) */
let publicSeq = 0;
/** sequence_number por model_id */
const modelSeq = new Map<string, number>();

function nowIso(): string {
  return new Date().toISOString();
}

function trimOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function cloneModule(row: AbsModuleRow): WorkshopAbsModule {
  const { movements: _m, ...mod } = row;
  return {
    ...mod,
    photos: (mod.photos || []).map((p) => ({ ...p })),
  };
}

function cloneModel(row: AbsModelRow, opts?: { includeUnits?: boolean }): WorkshopAbsModuleModel {
  const units = opts?.includeUnits
    ? Array.from(modules.values())
        .filter((u) => u.model_id === row.id)
        .map(cloneModule)
        .sort((a, b) => (a.sequence_number ?? 0) - (b.sequence_number ?? 0))
    : undefined;
  const available_qty = Array.from(modules.values()).filter(
    (u) => u.model_id === row.id && u.status === 'disponivel'
  ).length;
  const total_qty = Array.from(modules.values()).filter((u) => u.model_id === row.id).length;
  return {
    id: row.id,
    workshop_id: row.workshop_id,
    manufacturer: row.manufacturer,
    family: row.family,
    module_kind: row.module_kind,
    notes: row.notes,
    fingerprint: row.fingerprint,
    created_at: row.created_at,
    updated_at: row.updated_at,
    codes: row.codes.map((c) => ({ ...c })),
    applications: row.applications.map((a) => ({ ...a })),
    photos: row.photos.map((p) => ({ ...p })),
    available_qty,
    total_qty,
    ...(units ? { units } : {}),
  };
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
  const s = String(v || '').trim();
  if (s === 'fora_estoque' || s === 'desmembrado' || s === 'reservado' || s === 'disponivel') {
    return s;
  }
  return 'disponivel';
}

function parseItemState(v: unknown, fallback: AbsModuleItemState = 'usado'): AbsModuleItemState {
  const s = String(v || '').trim();
  if (s === 'novo' || s === 'usado' || s === 'recondicionado') return s;
  return fallback;
}

function parseItemCondition(
  v: unknown,
  fallback: AbsModuleItemCondition = 'nao_testado'
): AbsModuleItemCondition {
  const s = String(v || '').trim();
  if (s === 'perfeito' || s === 'com_avarias' || s === 'defeituoso' || s === 'nao_testado') return s;
  return fallback;
}

function parseScope(v: unknown, fallback: AbsComponentScope = 'completo'): AbsComponentScope {
  const s = String(v || '').trim();
  if (s === 'completo' || s === 'eletronico' || s === 'hidraulico') return s;
  return fallback;
}

function parseCodeRole(v: unknown): AbsCodeRole {
  const s = String(v || '').trim();
  if (s === 'fabricante' || s === 'montadora' || s === 'alternativo') return s;
  return 'fabricante';
}

function scopeForKind(kind: AbsModuleKind): AbsComponentScope {
  if (kind === 'hidraulico') return 'hidraulico';
  if (kind === 'eletronico') return 'eletronico';
  if (kind === 'completo') return 'completo';
  return 'eletronico';
}

function nextPublicId(): string {
  publicSeq += 1;
  return formatAbsModulePublicId(publicSeq);
}

function nextSequenceForModel(modelId: string): number {
  const cur = modelSeq.get(modelId) ?? 0;
  const next = cur + 1;
  modelSeq.set(modelId, next);
  return next;
}

function buildCodes(
  modelId: string,
  inputs: WorkshopAbsModuleCodeInput[] | undefined
): WorkshopAbsModuleCode[] {
  if (!inputs?.length) return [];
  const out: WorkshopAbsModuleCode[] = [];
  inputs.forEach((c, i) => {
    const code_value = String(c.code_value || '').trim();
    if (!code_value) return;
    out.push({
      id: crypto.randomUUID(),
      workshop_id: WORKSHOP_DEV_ID,
      model_id: modelId,
      component_scope: parseScope(c.component_scope),
      code_role: parseCodeRole(c.code_role),
      code_value,
      sort_order: c.sort_order ?? i,
      created_at: nowIso(),
    });
  });
  return out;
}

function buildApplications(
  modelId: string,
  inputs: WorkshopAbsModuleApplicationInput[] | undefined
): WorkshopAbsModuleApplication[] {
  if (!inputs?.length) return [];
  return inputs.map((a, i) => ({
    id: crypto.randomUUID(),
    workshop_id: WORKSHOP_DEV_ID,
    model_id: modelId,
    component_scope: parseScope(a.component_scope),
    vehicle_brand: trimOrNull(a.vehicle_brand),
    vehicle_model: trimOrNull(a.vehicle_model),
    generation: trimOrNull(a.generation),
    year_from: a.year_from != null && Number.isFinite(Number(a.year_from)) ? Number(a.year_from) : null,
    year_to: a.year_to != null && Number.isFinite(Number(a.year_to)) ? Number(a.year_to) : null,
    engine: trimOrNull(a.engine),
    version: trimOrNull(a.version),
    notes: trimOrNull(a.notes),
    sort_order: a.sort_order ?? i,
    created_at: nowIso(),
  }));
}

function buildPhotos(urls: string[] | undefined): WorkshopAbsModulePhoto[] {
  if (!urls?.length) return [];
  const out: WorkshopAbsModulePhoto[] = [];
  urls.forEach((u, i) => {
    const photo_url = String(u || '').trim();
    if (!photo_url) return;
    out.push({ id: crypto.randomUUID(), photo_url, sort_order: i });
  });
  return out;
}

function primaryCodeFromInput(
  codes: WorkshopAbsModuleCodeInput[] | undefined,
  kind: AbsModuleKind,
  fallback?: string | null
): string | null {
  const scope = scopeForKind(kind);
  const fromCodes = (codes || [])
    .filter((c) => parseScope(c.component_scope, scope) === scope && String(c.code_value || '').trim())
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  if (fromCodes[0]) return String(fromCodes[0].code_value).trim();
  const any = (codes || []).find((c) => String(c.code_value || '').trim());
  if (any) return String(any.code_value).trim();
  return trimOrNull(fallback);
}

function findModelByFingerprint(fp: string): AbsModelRow | undefined {
  for (const m of models.values()) {
    if (m.fingerprint === fp) return m;
  }
  return undefined;
}

function resolveOrCreateModel(opts: {
  manufacturer?: string | null;
  family?: string | null;
  module_kind?: AbsModuleKind;
  primary_code?: string | null;
  notes?: string | null;
  codes?: WorkshopAbsModuleCodeInput[];
  applications?: WorkshopAbsModuleApplicationInput[];
  photo_urls?: string[];
}): AbsModelRow {
  const kind = parseKind(opts.module_kind);
  const manufacturer = trimOrNull(opts.manufacturer);
  const family = trimOrNull(opts.family);
  const primary = primaryCodeFromInput(opts.codes, kind, opts.primary_code);
  const fp = absModelFingerprint(manufacturer, primary, kind);
  const existing = findModelByFingerprint(fp);
  if (existing) {
    if (opts.codes?.length && existing.codes.length === 0) {
      existing.codes = buildCodes(existing.id, opts.codes);
    } else if (primary && !existing.codes.some((c) => c.code_value === primary)) {
      existing.codes.push({
        id: crypto.randomUUID(),
        workshop_id: WORKSHOP_DEV_ID,
        model_id: existing.id,
        component_scope: scopeForKind(kind),
        code_role: 'fabricante',
        code_value: primary,
        sort_order: existing.codes.length,
        created_at: nowIso(),
      });
    }
    if (opts.applications?.length && existing.applications.length === 0) {
      existing.applications = buildApplications(existing.id, opts.applications);
    }
    return existing;
  }

  const id = crypto.randomUUID();
  const t = nowIso();
  let codes = buildCodes(id, opts.codes);
  if (!codes.length && primary) {
    codes = [
      {
        id: crypto.randomUUID(),
        workshop_id: WORKSHOP_DEV_ID,
        model_id: id,
        component_scope: scopeForKind(kind),
        code_role: 'fabricante',
        code_value: primary,
        sort_order: 0,
        created_at: t,
      },
    ];
  }
  const row: AbsModelRow = {
    id,
    workshop_id: WORKSHOP_DEV_ID,
    manufacturer,
    family,
    module_kind: kind,
    notes: trimOrNull(opts.notes),
    fingerprint: fp,
    created_at: t,
    updated_at: t,
    codes,
    applications: buildApplications(id, opts.applications),
    photos: buildPhotos(opts.photo_urls),
  };
  models.set(id, row);
  modelSeq.set(id, 0);
  return row;
}

function modelMatchesQuery(model: AbsModelRow, q: string): boolean {
  if (!q) return true;
  const hay = [
    model.manufacturer,
    model.family,
    model.notes,
    model.module_kind,
    ...model.codes.map((c) => c.code_value),
    ...model.applications.flatMap((a) => [
      a.vehicle_brand,
      a.vehicle_model,
      a.generation,
      a.engine,
      a.version,
      a.notes,
      a.year_from != null ? String(a.year_from) : '',
      a.year_to != null ? String(a.year_to) : '',
    ]),
  ]
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

function unitMatchesSearch(row: AbsModuleRow, q: string): boolean {
  if (!q) return true;
  const model = row.model_id ? models.get(row.model_id) : undefined;
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
    row.sequence_number != null ? String(row.sequence_number) : '',
    row.sequence_number != null ? `#${row.sequence_number}` : '',
    ...(model?.codes.map((c) => c.code_value) || []),
    ...(model?.applications.flatMap((a) => [
      a.vehicle_brand,
      a.vehicle_model,
      a.generation,
      a.engine,
      a.version,
      a.notes,
    ]) || []),
    model?.manufacturer,
    model?.family,
  ]
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

function modelCatalogMatches(model: AbsModelRow | undefined, q: string): boolean {
  if (!model || !q) return false;
  return modelMatchesQuery(model, q);
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

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
      return unitMatchesSearch(row, q);
    })
    .map(cloneModule)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function getDevAbsModuleByPublicId(publicId: string): WorkshopAbsModule | null {
  const key = String(publicId || '').trim().toUpperCase();
  const row = modules.get(key);
  if (!row) return null;
  const mod = cloneModule(row);
  if (row.model_id && models.has(row.model_id)) {
    mod.catalog_model = cloneModel(models.get(row.model_id)!);
  }
  return mod;
}

export function getDevAbsModuleById(id: string): WorkshopAbsModule | null {
  for (const row of modules.values()) {
    if (row.id === id) return getDevAbsModuleByPublicId(row.public_id);
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
  const kind = parseKind(input.module_kind ?? input.catalog?.module_kind);
  const condition = parseCondition(input.condition);
  const legacy = legacyConditionToItemFields(condition);
  const item_state = parseItemState(input.item_state, legacy.item_state);
  const item_condition = parseItemCondition(input.item_condition, legacy.item_condition);

  let modelRow: AbsModelRow | undefined;

  if (input.model_id && models.has(input.model_id)) {
    modelRow = models.get(input.model_id)!;
  } else if (input.catalog) {
    const cat = input.catalog;
    modelRow = resolveOrCreateModel({
      manufacturer: cat.manufacturer ?? input.manufacturer,
      family: cat.family ?? input.model,
      module_kind: cat.module_kind ?? kind,
      primary_code: primaryCodeFromInput(cat.codes, parseKind(cat.module_kind ?? kind), input.original_code),
      notes: cat.notes,
      codes: cat.codes,
      applications: cat.applications,
      photo_urls: cat.photo_urls,
    });
  } else {
    modelRow = resolveOrCreateModel({
      manufacturer: input.manufacturer,
      family: input.model,
      module_kind: kind,
      primary_code: input.original_code,
      notes: null,
    });
  }

  const publicId = nextPublicId();
  const sequence_number = nextSequenceForModel(modelRow.id);
  const t = nowIso();
  const status = parseStatus(input.status);
  const location = trimOrNull(input.location);
  const original_code =
    trimOrNull(input.original_code) ||
    primaryCodeForScope(modelRow.codes, scopeForKind(modelRow.module_kind)) ||
    null;

  const row: AbsModuleRow = {
    id: crypto.randomUUID(),
    workshop_id: WORKSHOP_DEV_ID,
    public_id: publicId,
    manufacturer: trimOrNull(input.manufacturer) ?? modelRow.manufacturer,
    original_code,
    application: trimOrNull(input.application),
    model: trimOrNull(input.model) ?? modelRow.family,
    year_label: trimOrNull(input.year_label),
    module_kind: kind,
    condition,
    item_state,
    item_condition,
    damage_description: trimOrNull(input.damage_description),
    unit_cost: Number(input.unit_cost ?? 0) || 0,
    unit_price: Number(input.unit_price ?? 0) || 0,
    supplier: trimOrNull(input.supplier),
    location,
    notes: trimOrNull(input.notes),
    status,
    model_id: modelRow.id,
    sequence_number,
    parent_complete_id: null,
    received_at: input.received_at || t,
    created_at: t,
    updated_at: t,
    photos: buildPhotos(input.photo_urls),
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
    service_order_id: null,
    created_at: t,
  });

  modules.set(publicId, row);
  const out = cloneModule(row);
  out.catalog_model = cloneModel(modelRow);
  return out;
}

export function updateDevAbsModule(
  publicId: string,
  input: WorkshopAbsModuleWriteInput
): WorkshopAbsModule | null {
  const key = String(publicId || '').trim().toUpperCase();
  const row = modules.get(key);
  if (!row) return null;
  if (input.manufacturer !== undefined) row.manufacturer = trimOrNull(input.manufacturer);
  if (input.original_code !== undefined) row.original_code = trimOrNull(input.original_code);
  if (input.application !== undefined) row.application = trimOrNull(input.application);
  if (input.model !== undefined) row.model = trimOrNull(input.model);
  if (input.year_label !== undefined) row.year_label = trimOrNull(input.year_label);
  if (input.module_kind !== undefined) row.module_kind = parseKind(input.module_kind);
  if (input.condition !== undefined) {
    row.condition = parseCondition(input.condition);
    if (input.item_state === undefined || input.item_condition === undefined) {
      const legacy = legacyConditionToItemFields(row.condition);
      if (input.item_state === undefined) row.item_state = legacy.item_state;
      if (input.item_condition === undefined) row.item_condition = legacy.item_condition;
    }
  }
  if (input.item_state !== undefined) row.item_state = parseItemState(input.item_state);
  if (input.item_condition !== undefined) {
    row.item_condition = parseItemCondition(input.item_condition);
  }
  if (input.damage_description !== undefined) {
    row.damage_description = trimOrNull(input.damage_description);
  }
  if (input.unit_cost !== undefined) row.unit_cost = Number(input.unit_cost ?? 0) || 0;
  if (input.unit_price !== undefined) row.unit_price = Number(input.unit_price ?? 0) || 0;
  if (input.supplier !== undefined) row.supplier = trimOrNull(input.supplier);
  if (input.location !== undefined) row.location = trimOrNull(input.location);
  if (input.notes !== undefined) row.notes = trimOrNull(input.notes);
  if (input.status !== undefined) row.status = parseStatus(input.status);
  if (input.received_at !== undefined && input.received_at) row.received_at = input.received_at;
  if (input.model_id !== undefined && input.model_id && models.has(input.model_id)) {
    row.model_id = input.model_id;
  }
  if (input.photo_urls !== undefined) row.photos = buildPhotos(input.photo_urls);
  row.updated_at = nowIso();
  return getDevAbsModuleByPublicId(row.public_id);
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
  service_order_id?: string | null;
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

  if (row.status === 'desmembrado') {
    throw new Error(`Módulo ${row.public_id} foi desmembrado e não pode ser movimentado.`);
  }

  const fromStatus = row.status;
  const fromLocation = row.location;
  let toStatus = fromStatus;
  let toLocation = fromLocation;

  if (movementType === 'exit') {
    if (row.status !== 'disponivel' && row.status !== 'reservado') {
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
    if (row.status !== 'disponivel' && row.status !== 'reservado') {
      throw new Error(`Módulo ${row.public_id} não pode ser transferido no status atual.`);
    }
    const nextLoc = String(input.to_location || '').trim();
    if (!nextLoc) throw new Error('Informe o novo local.');
    toLocation = nextLoc;
  }

  const t = nowIso();
  const movement: WorkshopAbsModuleMovement = {
    id: crypto.randomUUID(),
    workshop_id: WORKSHOP_DEV_ID,
    module_id: row.id,
    movement_type: movementType,
    from_status: fromStatus,
    to_status: toStatus,
    from_location: fromLocation,
    to_location: toLocation,
    reason_type: trimOrNull(input.reason_type),
    reason_ref: trimOrNull(input.reason_ref),
    notes: trimOrNull(input.notes),
    recorded_by_name: input.recorded_by_name || null,
    service_order_id: trimOrNull(input.service_order_id),
    created_at: t,
  };

  row.status = toStatus;
  if (movementType === 'transfer' || (movementType === 'entry' && toLocation !== fromLocation)) {
    row.location = toLocation;
  }
  row.updated_at = t;
  row.movements.push(movement);
  return { module: cloneModule(row), movement };
}

// ---------------------------------------------------------------------------
// Models / catalog
// ---------------------------------------------------------------------------

export function listDevAbsModuleModels(filters?: {
  q?: string;
  kind?: AbsModuleKind | '';
}): WorkshopAbsModuleModel[] {
  const q = String(filters?.q || '').trim().toLowerCase();
  const kind = filters?.kind || '';
  return Array.from(models.values())
    .filter((m) => {
      if (kind && m.module_kind !== kind) return false;
      return modelMatchesQuery(m, q);
    })
    .map((m) => cloneModel(m))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export function getDevAbsModuleModel(id: string): WorkshopAbsModuleModel | null {
  const row = models.get(String(id || ''));
  if (!row) return null;
  return cloneModel(row, { includeUnits: true });
}

export function createDevAbsModuleModel(
  input: WorkshopAbsModuleModelWriteInput
): WorkshopAbsModuleModel {
  const kind = parseKind(input.module_kind);
  const manufacturer = trimOrNull(input.manufacturer);
  const primary = primaryCodeFromInput(input.codes, kind, null);
  const fp = absModelFingerprint(manufacturer, primary, kind);
  if (findModelByFingerprint(fp)) {
    throw new Error('Já existe um modelo ABS com este fingerprint (fabricante/código/tipo).');
  }
  const id = crypto.randomUUID();
  const t = nowIso();
  let codes = buildCodes(id, input.codes);
  if (!codes.length && primary) {
    codes = [
      {
        id: crypto.randomUUID(),
        workshop_id: WORKSHOP_DEV_ID,
        model_id: id,
        component_scope: scopeForKind(kind),
        code_role: 'fabricante',
        code_value: primary,
        sort_order: 0,
        created_at: t,
      },
    ];
  }
  const row: AbsModelRow = {
    id,
    workshop_id: WORKSHOP_DEV_ID,
    manufacturer,
    family: trimOrNull(input.family),
    module_kind: kind,
    notes: trimOrNull(input.notes),
    fingerprint: fp,
    created_at: t,
    updated_at: t,
    codes,
    applications: buildApplications(id, input.applications),
    photos: buildPhotos(input.photo_urls),
  };
  models.set(id, row);
  modelSeq.set(id, 0);
  return cloneModel(row, { includeUnits: true });
}

export function updateDevAbsModuleModel(
  id: string,
  input: WorkshopAbsModuleModelWriteInput
): WorkshopAbsModuleModel | null {
  const row = models.get(String(id || ''));
  if (!row) return null;

  if (input.manufacturer !== undefined) row.manufacturer = trimOrNull(input.manufacturer);
  if (input.family !== undefined) row.family = trimOrNull(input.family);
  if (input.module_kind !== undefined) row.module_kind = parseKind(input.module_kind);
  if (input.notes !== undefined) row.notes = trimOrNull(input.notes);

  if (input.codes !== undefined) {
    row.codes = buildCodes(row.id, input.codes);
  }
  if (input.applications !== undefined) {
    row.applications = buildApplications(row.id, input.applications);
  }
  if (input.photo_urls !== undefined) {
    row.photos = buildPhotos(input.photo_urls);
  }

  const primary =
    primaryCodeForScope(row.codes, scopeForKind(row.module_kind)) ||
    row.codes[0]?.code_value ||
    null;
  row.fingerprint = absModelFingerprint(row.manufacturer, primary, row.module_kind);
  row.updated_at = nowIso();
  return cloneModel(row, { includeUnits: true });
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export function searchDevAbsModules(qRaw: string): WorkshopAbsModuleSearchResult {
  const query = String(qRaw || '').trim();
  const q = query.toLowerCase();
  if (!q) {
    return { query, availableUnits: [], availableViaDisassembly: [] };
  }

  const availableUnits = Array.from(modules.values())
    .filter(
      (u) =>
        u.status === 'disponivel' &&
        (u.module_kind === 'eletronico' || u.module_kind === 'hidraulico') &&
        unitMatchesSearch(u, q)
    )
    .map(cloneModule)
    .sort((a, b) => a.public_id.localeCompare(b.public_id));

  const availableViaDisassembly = Array.from(modules.values())
    .filter((u) => {
      if (u.status !== 'disponivel' || u.module_kind !== 'completo') return false;
      const model = u.model_id ? models.get(u.model_id) : undefined;
      return (
        unitMatchesSearch(u, q) ||
        modelCatalogMatches(model, q) ||
        String(u.public_id).toLowerCase().includes(q) ||
        String(u.manufacturer || '')
          .toLowerCase()
          .includes(q)
      );
    })
    .map(cloneModule)
    .sort((a, b) => a.public_id.localeCompare(b.public_id));

  return { query, availableUnits, availableViaDisassembly };
}

// ---------------------------------------------------------------------------
// Disassemble
// ---------------------------------------------------------------------------

function copyAppsToModel(
  sourceModel: AbsModelRow,
  targetModel: AbsModelRow,
  scope: AbsComponentScope
) {
  const has = targetModel.applications.some((a) => a.component_scope === scope);
  if (has) return;
  for (const a of sourceModel.applications.filter((x) => x.component_scope === scope)) {
    targetModel.applications.push({
      ...a,
      id: crypto.randomUUID(),
      model_id: targetModel.id,
      created_at: nowIso(),
    });
  }
}

export function disassembleDevAbsModule(
  publicId: string,
  input: WorkshopAbsDisassembleInput
): WorkshopAbsDisassembleResult {
  const key = String(publicId || '').trim().toUpperCase();
  if (!isValidAbsModulePublicId(key)) throw new Error('ID de módulo ABS inválido.');
  const src = modules.get(key);
  if (!src) throw new Error('Módulo ABS de origem não encontrado.');

  const withdrawnKind = input.withdrawn_kind;
  if (withdrawnKind !== 'eletronico' && withdrawnKind !== 'hidraulico') {
    throw new Error('Informe se a peça retirada é eletrônica ou hidráulica.');
  }
  const destination = input.destination as AbsDisassembleDestination;
  if (
    destination !== 'ordem_servico' &&
    destination !== 'venda_direta' &&
    destination !== 'laboratorio' &&
    destination !== 'estoque'
  ) {
    throw new Error('Destino de desmembramento inválido.');
  }

  if (src.module_kind !== 'completo') {
    throw new Error('Somente módulos completos podem ser desmembrados.');
  }
  if (src.status !== 'disponivel') {
    throw new Error(`Módulo ${src.public_id} não está disponível para desmembramento.`);
  }
  for (const d of disassemblies.values()) {
    if (d.source_module_id === src.id) {
      throw new Error('Este módulo já foi desmembrado.');
    }
  }

  const srcModel = src.model_id ? models.get(src.model_id) : undefined;
  if (!srcModel) throw new Error('Modelo do módulo de origem não encontrado.');

  const remainingKind: AbsModuleKind =
    withdrawnKind === 'eletronico' ? 'hidraulico' : 'eletronico';

  let withdrawnCode =
    trimOrNull(input.withdrawn_primary_code) ||
    primaryCodeForScope(srcModel.codes, withdrawnKind) ||
    src.original_code;
  let remainingCode =
    trimOrNull(input.remaining_primary_code) ||
    primaryCodeForScope(srcModel.codes, remainingKind) ||
    src.original_code;

  const remainingModel = resolveOrCreateModel({
    manufacturer: src.manufacturer,
    family: srcModel.family ?? src.model,
    module_kind: remainingKind,
    primary_code: remainingCode,
  });
  const withdrawnModel = resolveOrCreateModel({
    manufacturer: src.manufacturer,
    family: srcModel.family ?? src.model,
    module_kind: withdrawnKind,
    primary_code: withdrawnCode,
  });

  copyAppsToModel(srcModel, remainingModel, remainingKind);
  copyAppsToModel(srcModel, withdrawnModel, withdrawnKind);

  withdrawnCode =
    trimOrNull(input.withdrawn_primary_code) ||
    primaryCodeForScope(withdrawnModel.codes, withdrawnKind) ||
    withdrawnCode;
  remainingCode =
    trimOrNull(input.remaining_primary_code) ||
    primaryCodeForScope(remainingModel.codes, remainingKind) ||
    remainingCode;

  const costOriginal = Number(src.unit_cost ?? 0) || 0;
  const costRemaining =
    input.cost_remaining != null && Number.isFinite(Number(input.cost_remaining))
      ? Number(input.cost_remaining)
      : Math.round((costOriginal / 2) * 100) / 100;
  const costWithdrawn =
    input.cost_withdrawn != null && Number.isFinite(Number(input.cost_withdrawn))
      ? Number(input.cost_withdrawn)
      : Math.round((costOriginal - costRemaining) * 100) / 100;

  if (
    Math.abs(costRemaining + costWithdrawn - costOriginal) > 0.01 &&
    !input.cost_adjustment_authorized
  ) {
    throw new Error(
      `A soma dos custos dos componentes (${(costRemaining + costWithdrawn).toFixed(2)}) deve igualar o custo do completo (${costOriginal.toFixed(2)}). Autorize o ajuste se necessário.`
    );
  }

  const remainingSeq = nextSequenceForModel(remainingModel.id);
  const withdrawnSeq = nextSequenceForModel(withdrawnModel.id);
  const remainingPublicId = nextPublicId();
  const withdrawnPublicId = nextPublicId();
  const t = nowIso();
  const withdrawnStatus: AbsModuleStatus =
    destination === 'estoque' ? 'disponivel' : 'fora_estoque';

  src.status = 'desmembrado';
  src.updated_at = t;
  src.movements.push({
    id: crypto.randomUUID(),
    workshop_id: WORKSHOP_DEV_ID,
    module_id: src.id,
    movement_type: 'exit',
    from_status: 'disponivel',
    to_status: 'desmembrado',
    from_location: src.location,
    to_location: src.location,
    reason_type: 'desmembramento',
    reason_ref: trimOrNull(input.destination_ref),
    notes: trimOrNull(input.notes) || 'Desmembramento de módulo completo',
    recorded_by_name: trimOrNull(input.recorded_by_name),
    service_order_id: trimOrNull(input.service_order_id),
    created_at: t,
  });

  const remaining: AbsModuleRow = {
    id: crypto.randomUUID(),
    workshop_id: WORKSHOP_DEV_ID,
    public_id: remainingPublicId,
    manufacturer: src.manufacturer,
    original_code: remainingCode,
    application: src.application,
    model: src.model,
    year_label: src.year_label,
    module_kind: remainingKind,
    condition: src.condition,
    item_state: src.item_state,
    item_condition: src.item_condition,
    damage_description: src.damage_description,
    unit_cost: costRemaining,
    unit_price: src.unit_price,
    supplier: src.supplier,
    location: trimOrNull(input.remaining_location) || src.location,
    notes: `Componente restante do desmembramento de ${src.public_id}`,
    status: 'disponivel',
    model_id: remainingModel.id,
    sequence_number: remainingSeq,
    parent_complete_id: src.id,
    received_at: t,
    created_at: t,
    updated_at: t,
    photos: [],
    movements: [],
  };
  remaining.movements.push({
    id: crypto.randomUUID(),
    workshop_id: WORKSHOP_DEV_ID,
    module_id: remaining.id,
    movement_type: 'entry',
    from_status: null,
    to_status: 'disponivel',
    from_location: null,
    to_location: remaining.location,
    reason_type: 'desmembramento',
    reason_ref: src.public_id,
    notes: 'Unidade criada no desmembramento (restante)',
    recorded_by_name: trimOrNull(input.recorded_by_name),
    service_order_id: null,
    created_at: t,
  });

  const withdrawn: AbsModuleRow = {
    id: crypto.randomUUID(),
    workshop_id: WORKSHOP_DEV_ID,
    public_id: withdrawnPublicId,
    manufacturer: src.manufacturer,
    original_code: withdrawnCode,
    application: src.application,
    model: src.model,
    year_label: src.year_label,
    module_kind: withdrawnKind,
    condition: src.condition,
    item_state: src.item_state,
    item_condition: src.item_condition,
    damage_description: src.damage_description,
    unit_cost: costWithdrawn,
    unit_price: src.unit_price,
    supplier: src.supplier,
    location:
      destination === 'estoque'
        ? trimOrNull(input.withdrawn_location) || src.location
        : trimOrNull(input.withdrawn_location),
    notes: `Componente retirado do desmembramento de ${src.public_id}`,
    status: withdrawnStatus,
    model_id: withdrawnModel.id,
    sequence_number: withdrawnSeq,
    parent_complete_id: src.id,
    received_at: t,
    created_at: t,
    updated_at: t,
    photos: [],
    movements: [],
  };
  withdrawn.movements.push({
    id: crypto.randomUUID(),
    workshop_id: WORKSHOP_DEV_ID,
    module_id: withdrawn.id,
    movement_type: destination === 'estoque' ? 'entry' : 'exit',
    from_status: null,
    to_status: withdrawnStatus,
    from_location: null,
    to_location: withdrawn.location,
    reason_type:
      destination === 'ordem_servico'
        ? 'ordem_servico'
        : destination === 'venda_direta'
          ? 'venda_avulsa'
          : destination === 'laboratorio'
            ? 'laboratorio'
            : 'desmembramento',
    reason_ref: trimOrNull(input.destination_ref),
    notes: `Unidade criada no desmembramento (retirada → ${destination})`,
    recorded_by_name: trimOrNull(input.recorded_by_name),
    service_order_id: trimOrNull(input.service_order_id),
    created_at: t,
  });

  modules.set(remainingPublicId, remaining);
  modules.set(withdrawnPublicId, withdrawn);

  const disassembly: WorkshopAbsModuleDisassembly = {
    id: crypto.randomUUID(),
    workshop_id: WORKSHOP_DEV_ID,
    source_module_id: src.id,
    withdrawn_kind: withdrawnKind,
    remaining_module_id: remaining.id,
    withdrawn_module_id: withdrawn.id,
    destination,
    destination_ref: trimOrNull(input.destination_ref),
    service_order_id: trimOrNull(input.service_order_id),
    cost_original: costOriginal,
    cost_remaining: costRemaining,
    cost_withdrawn: costWithdrawn,
    cost_adjustment_authorized: Boolean(input.cost_adjustment_authorized),
    cost_adjustment_note: trimOrNull(input.cost_adjustment_note),
    notes: trimOrNull(input.notes),
    recorded_by_name: trimOrNull(input.recorded_by_name),
    created_at: t,
  };
  disassemblies.set(disassembly.id, disassembly);

  return {
    source: cloneModule(src),
    remaining: cloneModule(remaining),
    withdrawn: cloneModule(withdrawn),
    disassembly: { ...disassembly },
  };
}

export function resetDevAbsModulesForTests() {
  modules.clear();
  models.clear();
  disassemblies.clear();
  publicSeq = 0;
  modelSeq.clear();
}
