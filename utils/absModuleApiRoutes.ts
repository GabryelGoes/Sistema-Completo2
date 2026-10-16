import type { Express } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  applyDevAbsModuleMovement,
  createDevAbsModule,
  createDevAbsModuleModel,
  deleteDevAbsModule,
  deleteDevAbsModuleModel,
  disassembleDevAbsModule,
  getDevAbsDisassemblyForModule,
  getDevAbsModuleByPublicId,
  getDevAbsModuleModel,
  getDevAbsModuleMovements,
  listDevAbsAllMovements,
  listDevAbsModuleModels,
  listDevAbsModules,
  listDevAbsSaleMovements,
  searchDevAbsModules,
  updateDevAbsModule,
  updateDevAbsModuleModel,
} from './workshopAbsModuleDevMemory.js';
import {
  ABS_MODULE_CONDITIONS,
  ABS_MODULE_ITEM_CONDITIONS,
  ABS_MODULE_ITEM_STATES,
  ABS_MODULE_KINDS,
  ABS_MODULE_STATUSES,
  absModelFingerprint,
  isValidAbsModulePublicId,
  legacyConditionToItemFields,
  looksLikeAbsModuleCode,
  normalizeAbsModuleCode,
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
  type WorkshopAbsModuleApplicationInput,
  type WorkshopAbsModuleCodeInput,
  type WorkshopAbsModuleModelWriteInput,
  type WorkshopAbsModuleWriteInput,
} from './workshopAbsModules.js';
import { buildWorkshopAbsModulesAnalytics } from './workshopAbsModulesAnalytics.js';

type AbsRouteDeps = {
  WORKSHOP_ID: string | undefined;
  supabaseAdmin: SupabaseClient | null;
  /** Instância multer (memoryStorage) para upload de fotos. */
  upload?: { single: (field: string) => unknown };
  photosBucket?: string;
  /**
   * Senha exigida para excluir unidades/modelos ABS do estoque
   * (Gerência e/ou senha de proteção do estoque).
   */
  verifyDeletePassword?: (password: string) => Promise<boolean>;
};

function passwordFromDeleteReq(req: {
  body?: unknown;
  query?: unknown;
  headers?: Record<string, unknown>;
}): string {
  const body = (req.body || {}) as { password?: unknown; adminPassword?: unknown };
  if (typeof body.password === 'string' && body.password.trim()) return body.password.trim();
  if (typeof body.adminPassword === 'string' && body.adminPassword.trim()) {
    return body.adminPassword.trim();
  }
  const q = (req.query || {}) as { password?: unknown; adminPassword?: unknown };
  if (typeof q.password === 'string' && q.password.trim()) return q.password.trim();
  if (typeof q.adminPassword === 'string' && q.adminPassword.trim()) {
    return q.adminPassword.trim();
  }
  const header = req.headers?.['x-admin-password'];
  if (typeof header === 'string' && header.trim()) return header.trim();
  return '';
}

async function requireAbsDeletePassword(
  deps: AbsRouteDeps,
  req: { body?: unknown; query?: unknown; headers?: Record<string, unknown> }
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const pwd = passwordFromDeleteReq(req);
  if (!pwd) {
    return { ok: false, status: 400, error: 'Informe a senha do administrador para excluir.' };
  }
  if (!deps.verifyDeletePassword) {
    // Sem callback: só libera em modo memória (dev). Com Supabase, falha fechado.
    if (!isDevMemoryActive(deps)) {
      return {
        ok: false,
        status: 500,
        error: 'Verificação de senha para exclusão ABS não configurada.',
      };
    }
    return { ok: true };
  }
  const ok = await deps.verifyDeletePassword(pwd);
  if (!ok) {
    return {
      ok: false,
      status: 401,
      error:
        'Senha incorreta. Use a senha da Gerência (admin) ou a senha de proteção do estoque em Alterar senhas.',
    };
  }
  return { ok: true };
}

export const ABS_MODULE_PHOTOS_MAX = 8;

function parseOptionalText(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s || null;
}

function parseMoney(value: unknown, fallback = 0): number {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function parseKind(value: unknown): AbsModuleKind {
  const v = String(value || '').trim();
  return (ABS_MODULE_KINDS as readonly string[]).includes(v) ? (v as AbsModuleKind) : 'completo';
}

function parseCondition(value: unknown): AbsModuleCondition {
  const v = String(value || '').trim();
  return (ABS_MODULE_CONDITIONS as readonly string[]).includes(v)
    ? (v as AbsModuleCondition)
    : 'usado';
}

function parseStatus(value: unknown): AbsModuleStatus {
  const v = String(value || '').trim();
  return (ABS_MODULE_STATUSES as readonly string[]).includes(v)
    ? (v as AbsModuleStatus)
    : 'disponivel';
}

function parseItemState(value: unknown, fallback: AbsModuleItemState = 'usado'): AbsModuleItemState {
  const v = String(value || '').trim();
  return (ABS_MODULE_ITEM_STATES as readonly string[]).includes(v)
    ? (v as AbsModuleItemState)
    : fallback;
}

function parseItemCondition(
  value: unknown,
  fallback: AbsModuleItemCondition = 'nao_testado'
): AbsModuleItemCondition {
  const v = String(value || '').trim();
  return (ABS_MODULE_ITEM_CONDITIONS as readonly string[]).includes(v)
    ? (v as AbsModuleItemCondition)
    : fallback;
}

function parseScope(value: unknown, fallback: AbsComponentScope = 'completo'): AbsComponentScope {
  const v = String(value || '').trim();
  if (v === 'completo' || v === 'eletronico' || v === 'hidraulico') return v;
  return fallback;
}

function parseCodeRole(value: unknown): AbsCodeRole {
  const v = String(value || '').trim();
  if (v === 'fabricante' || v === 'montadora' || v === 'alternativo') return v;
  return 'fabricante';
}

function scopeForKind(kind: AbsModuleKind): AbsComponentScope {
  if (kind === 'hidraulico') return 'hidraulico';
  if (kind === 'eletronico') return 'eletronico';
  if (kind === 'completo') return 'completo';
  return 'eletronico';
}

function parseCodes(raw: unknown): WorkshopAbsModuleCodeInput[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: WorkshopAbsModuleCodeInput[] = [];
  raw.forEach((c, i) => {
    if (!c || typeof c !== 'object') return;
    const row = c as Record<string, unknown>;
    const code_value = parseOptionalText(row.code_value);
    if (!code_value) return;
    out.push({
      component_scope: parseScope(row.component_scope),
      code_role: parseCodeRole(row.code_role),
      code_value,
      sort_order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : i,
    });
  });
  return out;
}

function parseApplications(raw: unknown): WorkshopAbsModuleApplicationInput[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.map((a, i) => {
    const row = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>;
    return {
      component_scope: parseScope(row.component_scope),
      vehicle_brand: parseOptionalText(row.vehicle_brand),
      vehicle_model: parseOptionalText(row.vehicle_model),
      generation: parseOptionalText(row.generation),
      year_from:
        row.year_from != null && Number.isFinite(Number(row.year_from))
          ? Number(row.year_from)
          : null,
      year_to:
        row.year_to != null && Number.isFinite(Number(row.year_to)) ? Number(row.year_to) : null,
      engine: parseOptionalText(row.engine),
      version: parseOptionalText(row.version),
      notes: parseOptionalText(row.notes),
      sort_order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : i,
    } satisfies WorkshopAbsModuleApplicationInput;
  });
}

function parsePhotoUrls(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.map((u) => String(u || '').trim()).filter(Boolean);
}

function parseCatalog(raw: unknown): WorkshopAbsModuleModelWriteInput | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const c = raw as Record<string, unknown>;
  return {
    manufacturer: parseOptionalText(c.manufacturer),
    family: parseOptionalText(c.family),
    module_kind: c.module_kind != null ? parseKind(c.module_kind) : undefined,
    notes: parseOptionalText(c.notes),
    codes: parseCodes(c.codes),
    applications: parseApplications(c.applications),
    photo_urls: parsePhotoUrls(c.photo_urls),
  };
}

function modulePayloadFromBody(body: Record<string, unknown>): WorkshopAbsModuleWriteInput {
  const condition = parseCondition(body.condition);
  const legacy = legacyConditionToItemFields(condition);
  return {
    manufacturer: parseOptionalText(body.manufacturer),
    original_code: parseOptionalText(body.original_code ?? body.oem_code),
    application: parseOptionalText(body.application ?? body.vehicle_application),
    model: parseOptionalText(body.model),
    year_label: parseOptionalText(body.year_label ?? body.year),
    module_kind: parseKind(body.module_kind ?? body.module_type),
    condition,
    item_state: parseItemState(body.item_state, legacy.item_state),
    item_condition: parseItemCondition(body.item_condition, legacy.item_condition),
    damage_description: parseOptionalText(body.damage_description),
    unit_cost: parseMoney(body.unit_cost ?? body.cost, 0),
    unit_price: parseMoney(body.unit_price ?? body.sale_price, 0),
    supplier: parseOptionalText(body.supplier),
    location: parseOptionalText(body.location),
    notes: parseOptionalText(body.notes),
    status: body.status != null ? parseStatus(body.status) : 'disponivel',
    received_at: parseOptionalText(body.received_at ?? body.entry_date),
    model_id: parseOptionalText(body.model_id),
    catalog: parseCatalog(body.catalog),
    photo_urls: parsePhotoUrls(body.photo_urls),
  };
}

function modelPayloadFromBody(body: Record<string, unknown>): WorkshopAbsModuleModelWriteInput {
  return {
    manufacturer: parseOptionalText(body.manufacturer),
    family: parseOptionalText(body.family),
    module_kind: body.module_kind != null ? parseKind(body.module_kind) : undefined,
    notes: parseOptionalText(body.notes),
    codes: parseCodes(body.codes),
    applications: parseApplications(body.applications),
    photo_urls: parsePhotoUrls(body.photo_urls),
  };
}

function primaryCodeFromCodes(
  codes: WorkshopAbsModuleCodeInput[] | undefined,
  kind: AbsModuleKind,
  fallback?: string | null
): string | null {
  const scope = scopeForKind(kind);
  const scoped = (codes || [])
    .filter((c) => c.component_scope === scope && String(c.code_value || '').trim())
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  if (scoped[0]) return scoped[0].code_value;
  const any = (codes || []).find((c) => String(c.code_value || '').trim());
  if (any) return any.code_value;
  return parseOptionalText(fallback);
}

function isDevMemoryActive(deps: AbsRouteDeps): boolean {
  return !(deps.supabaseAdmin && deps.WORKSHOP_ID);
}

type AbsDisassembleRpcRow = {
  source: Record<string, unknown>;
  remaining: Record<string, unknown>;
  withdrawn: Record<string, unknown>;
  disassembly: Record<string, unknown>;
};

/**
 * Função SQL antiga cria public_id novo para a peça que sai (venda/OS/lab).
 * Corrige: a saída volta a usar a etiqueta do completo; remove a unidade espúria.
 */
async function repairDisassembleKeepOriginalLabel(
  supabaseAdmin: SupabaseClient,
  workshopId: string,
  originalPublicId: string,
  row: AbsDisassembleRpcRow,
  input: WorkshopAbsDisassembleInput
): Promise<AbsDisassembleRpcRow> {
  const sourceId = String(row.source.id || '');
  const withdrawnId = String(row.withdrawn.id || '');
  const withdrawnPublicId = String(row.withdrawn.public_id || '')
    .trim()
    .toUpperCase();
  const original = originalPublicId.trim().toUpperCase();

  if (!sourceId || !withdrawnId) {
    throw new Error('Resposta de desmembramento incompleta para correção de etiqueta.');
  }
  if (sourceId === withdrawnId || withdrawnPublicId === original) {
    return row;
  }

  const wdModelId = row.withdrawn.model_id;
  const wdSeq = Number(row.withdrawn.sequence_number);
  if (!wdModelId || !Number.isFinite(wdSeq)) {
    throw new Error('Dados da peça retirada incompletos para correção de etiqueta.');
  }

  const disassemblyId = String(row.disassembly.id || '');
  if (disassemblyId) {
    const { error: dErr } = await supabaseAdmin
      .from('workshop_abs_module_disassemblies')
      .update({ withdrawn_module_id: sourceId })
      .eq('id', disassemblyId)
      .eq('workshop_id', workshopId);
    if (dErr) throw new Error(dErr.message);
  }

  // Libera o par (model_id, sequence_number) da unidade espúria.
  const { data: tempSeq, error: seqErr } = await supabaseAdmin.rpc(
    'next_workshop_abs_module_sequence',
    { p_model_id: wdModelId }
  );
  if (seqErr) throw new Error(seqErr.message);
  const freedSeq = Number(tempSeq);
  const { error: bumpErr } = await supabaseAdmin
    .from('workshop_abs_modules')
    .update({
      sequence_number: Number.isFinite(freedSeq) ? freedSeq : wdSeq + 1_000_000,
    })
    .eq('id', withdrawnId)
    .eq('workshop_id', workshopId);
  if (bumpErr) throw new Error(bumpErr.message);

  const exitReason =
    input.destination === 'ordem_servico'
      ? 'ordem_servico'
      : input.destination === 'venda_direta'
        ? 'venda_avulsa'
        : input.destination === 'laboratorio'
          ? 'laboratorio'
          : 'desmembramento';

  const { data: fixedSource, error: uErr } = await supabaseAdmin
    .from('workshop_abs_modules')
    .update({
      module_kind: row.withdrawn.module_kind,
      model_id: wdModelId,
      sequence_number: wdSeq,
      original_code: row.withdrawn.original_code,
      unit_cost: row.withdrawn.unit_cost,
      status: 'fora_estoque',
      location: row.withdrawn.location ?? null,
      notes:
        input.notes ||
        `Desmembramento: saída ${input.withdrawn_kind} (etiqueta original ${original})`,
      parent_complete_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sourceId)
    .eq('workshop_id', workshopId)
    .select('*')
    .single();
  if (uErr) throw new Error(uErr.message);

  const { error: movErr } = await supabaseAdmin.from('workshop_abs_module_movements').insert({
    workshop_id: workshopId,
    module_id: sourceId,
    movement_type: 'exit',
    from_status: 'desmembrado',
    to_status: 'fora_estoque',
    from_location: row.source.location ?? null,
    to_location: row.withdrawn.location ?? null,
    reason_type: exitReason,
    reason_ref: input.destination_ref,
    notes:
      input.notes ||
      `Desmembramento → ${input.destination} (mantém etiqueta ${original})`,
    recorded_by_name: input.recorded_by_name,
    service_order_id: input.service_order_id,
  });
  if (movErr) throw new Error(movErr.message);

  await supabaseAdmin
    .from('workshop_abs_module_movements')
    .delete()
    .eq('module_id', withdrawnId)
    .eq('workshop_id', workshopId);
  await supabaseAdmin
    .from('workshop_abs_module_unit_photos')
    .delete()
    .eq('module_id', withdrawnId)
    .eq('workshop_id', workshopId);

  const { error: delErr } = await supabaseAdmin
    .from('workshop_abs_modules')
    .delete()
    .eq('id', withdrawnId)
    .eq('workshop_id', workshopId);
  if (delErr) throw new Error(delErr.message);

  let disassembly: Record<string, unknown> = {
    ...row.disassembly,
    withdrawn_module_id: sourceId,
  };
  if (disassemblyId) {
    const { data: disFresh } = await supabaseAdmin
      .from('workshop_abs_module_disassemblies')
      .select('*')
      .eq('id', disassemblyId)
      .maybeSingle();
    if (disFresh) disassembly = disFresh as Record<string, unknown>;
  }

  return {
    source: fixedSource as Record<string, unknown>,
    remaining: row.remaining,
    withdrawn: fixedSource as Record<string, unknown>,
    disassembly,
  };
}

/** Exclui unidade física e vínculos (desmembramentos / parent). Não reutiliza public_id. */
async function deleteAbsModuleUnit(
  supabaseAdmin: SupabaseClient,
  workshopId: string,
  publicId: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data: mod, error: modErr } = await supabaseAdmin
    .from('workshop_abs_modules')
    .select('id, public_id')
    .eq('workshop_id', workshopId)
    .eq('public_id', publicId)
    .maybeSingle();
  if (modErr) return { ok: false, status: 500, error: modErr.message };
  if (!mod) return { ok: false, status: 404, error: 'Módulo ABS não encontrado.' };

  await supabaseAdmin
    .from('workshop_abs_module_disassemblies')
    .delete()
    .eq('workshop_id', workshopId)
    .or(
      `source_module_id.eq.${mod.id},remaining_module_id.eq.${mod.id},withdrawn_module_id.eq.${mod.id}`
    );

  await supabaseAdmin
    .from('workshop_abs_modules')
    .update({ parent_complete_id: null, updated_at: new Date().toISOString() })
    .eq('workshop_id', workshopId)
    .eq('parent_complete_id', mod.id);

  await supabaseAdmin
    .from('workshop_abs_module_unit_photos')
    .delete()
    .eq('module_id', mod.id)
    .eq('workshop_id', workshopId);

  await supabaseAdmin
    .from('workshop_abs_module_movements')
    .delete()
    .eq('module_id', mod.id)
    .eq('workshop_id', workshopId);

  const { error: delErr } = await supabaseAdmin
    .from('workshop_abs_modules')
    .delete()
    .eq('id', mod.id)
    .eq('workshop_id', workshopId);
  if (delErr) return { ok: false, status: 500, error: delErr.message };
  return { ok: true };
}

async function replaceModelCodes(
  supabaseAdmin: SupabaseClient,
  workshopId: string,
  modelId: string,
  codes: WorkshopAbsModuleCodeInput[]
) {
  await supabaseAdmin.from('workshop_abs_module_codes').delete().eq('model_id', modelId);
  if (!codes.length) return;
  const rows = codes.map((c, i) => ({
    workshop_id: workshopId,
    model_id: modelId,
    component_scope: c.component_scope,
    code_role: c.code_role || 'fabricante',
    code_value: c.code_value,
    sort_order: c.sort_order ?? i,
  }));
  const { error } = await supabaseAdmin.from('workshop_abs_module_codes').insert(rows);
  if (error) throw new Error(error.message);
}

async function replaceModelApplications(
  supabaseAdmin: SupabaseClient,
  workshopId: string,
  modelId: string,
  apps: WorkshopAbsModuleApplicationInput[]
) {
  await supabaseAdmin.from('workshop_abs_module_applications').delete().eq('model_id', modelId);
  if (!apps.length) return;
  const rows = apps.map((a, i) => ({
    workshop_id: workshopId,
    model_id: modelId,
    component_scope: a.component_scope,
    vehicle_brand: a.vehicle_brand ?? null,
    vehicle_model: a.vehicle_model ?? null,
    generation: a.generation ?? null,
    year_from: a.year_from ?? null,
    year_to: a.year_to ?? null,
    engine: a.engine ?? null,
    version: a.version ?? null,
    notes: a.notes ?? null,
    sort_order: a.sort_order ?? i,
  }));
  const { error } = await supabaseAdmin.from('workshop_abs_module_applications').insert(rows);
  if (error) throw new Error(error.message);
}

async function replaceModelPhotos(
  supabaseAdmin: SupabaseClient,
  workshopId: string,
  modelId: string,
  urls: string[]
) {
  await supabaseAdmin.from('workshop_abs_module_model_photos').delete().eq('model_id', modelId);
  if (!urls.length) return;
  const rows = urls.map((photo_url, i) => ({
    workshop_id: workshopId,
    model_id: modelId,
    photo_url,
    sort_order: i,
  }));
  const { error } = await supabaseAdmin.from('workshop_abs_module_model_photos').insert(rows);
  if (error) throw new Error(error.message);
}

async function insertUnitPhotos(
  supabaseAdmin: SupabaseClient,
  workshopId: string,
  moduleId: string,
  urls: string[] | undefined
) {
  if (!urls?.length) return;
  const rows = urls.map((photo_url, i) => ({
    workshop_id: workshopId,
    module_id: moduleId,
    photo_url,
    sort_order: i,
  }));
  const { error } = await supabaseAdmin.from('workshop_abs_module_unit_photos').insert(rows);
  if (error) throw new Error(error.message);
}

async function loadUnitPhotos(
  supabaseAdmin: SupabaseClient,
  workshopId: string,
  moduleId: string
): Promise<{ id: string; photo_url: string; sort_order: number }[]> {
  const { data, error } = await supabaseAdmin
    .from('workshop_abs_module_unit_photos')
    .select('id, photo_url, sort_order')
    .eq('workshop_id', workshopId)
    .eq('module_id', moduleId)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map((p) => ({
    id: String(p.id),
    photo_url: String(p.photo_url),
    sort_order: Number(p.sort_order ?? 0),
  }));
}

async function attachUnitPhotos(
  supabaseAdmin: SupabaseClient,
  workshopId: string,
  mod: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const id = String(mod.id || '');
  if (!id) return { ...mod, photos: [] };
  const photos = await loadUnitPhotos(supabaseAdmin, workshopId, id);
  return { ...mod, photos };
}

async function resolveOrCreateModelId(
  supabaseAdmin: SupabaseClient,
  workshopId: string,
  opts: {
    manufacturer?: string | null;
    family?: string | null;
    module_kind: AbsModuleKind;
    primary_code?: string | null;
    notes?: string | null;
    codes?: WorkshopAbsModuleCodeInput[];
    applications?: WorkshopAbsModuleApplicationInput[];
    photo_urls?: string[];
  }
): Promise<string> {
  const { data: modelId, error } = await supabaseAdmin.rpc('resolve_or_create_abs_module_model', {
    p_workshop_id: workshopId,
    p_manufacturer: opts.manufacturer ?? null,
    p_family: opts.family ?? null,
    p_module_kind: opts.module_kind,
    p_primary_code: opts.primary_code ?? null,
    p_notes: opts.notes ?? null,
  });
  if (error) throw new Error(error.message);
  const id = String(modelId);
  if (opts.codes?.length) {
    // merge: insert missing codes (do not wipe if resolve reused existing model)
    const { data: existing } = await supabaseAdmin
      .from('workshop_abs_module_codes')
      .select('code_value, component_scope')
      .eq('model_id', id);
    const have = new Set(
      (existing || []).map((c) => `${c.component_scope}|${String(c.code_value).trim().toLowerCase()}`)
    );
    const toInsert = opts.codes
      .filter((c) => {
        const key = `${c.component_scope}|${c.code_value.trim().toLowerCase()}`;
        return c.code_value.trim() && !have.has(key);
      })
      .map((c, i) => ({
        workshop_id: workshopId,
        model_id: id,
        component_scope: c.component_scope,
        code_role: c.code_role || 'fabricante',
        code_value: c.code_value,
        sort_order: c.sort_order ?? i,
      }));
    if (toInsert.length) {
      const { error: cErr } = await supabaseAdmin.from('workshop_abs_module_codes').insert(toInsert);
      if (cErr) throw new Error(cErr.message);
    }
  }
  if (opts.applications?.length) {
    const { count } = await supabaseAdmin
      .from('workshop_abs_module_applications')
      .select('id', { count: 'exact', head: true })
      .eq('model_id', id);
    if (!count) {
      await replaceModelApplications(supabaseAdmin, workshopId, id, opts.applications);
    }
  }
  if (opts.photo_urls?.length) {
    const { count } = await supabaseAdmin
      .from('workshop_abs_module_model_photos')
      .select('id', { count: 'exact', head: true })
      .eq('model_id', id);
    if (!count) {
      await replaceModelPhotos(supabaseAdmin, workshopId, id, opts.photo_urls);
    }
  }
  return id;
}

async function fetchModelBundle(
  supabaseAdmin: SupabaseClient,
  workshopId: string,
  modelId: string,
  includeUnits: boolean
) {
  const { data: model, error } = await supabaseAdmin
    .from('workshop_abs_module_models')
    .select('*')
    .eq('workshop_id', workshopId)
    .eq('id', modelId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!model) return null;

  const [{ data: codes }, { data: applications }, { data: photos }, { data: units }] =
    await Promise.all([
      supabaseAdmin
        .from('workshop_abs_module_codes')
        .select('*')
        .eq('model_id', modelId)
        .order('sort_order', { ascending: true }),
      supabaseAdmin
        .from('workshop_abs_module_applications')
        .select('*')
        .eq('model_id', modelId)
        .order('sort_order', { ascending: true }),
      supabaseAdmin
        .from('workshop_abs_module_model_photos')
        .select('id, photo_url, sort_order')
        .eq('model_id', modelId)
        .order('sort_order', { ascending: true }),
      includeUnits
        ? supabaseAdmin
            .from('workshop_abs_modules')
            .select('*')
            .eq('workshop_id', workshopId)
            .eq('model_id', modelId)
            .order('sequence_number', { ascending: true })
        : Promise.resolve({ data: null as unknown[] | null }),
    ]);

  const unitList = includeUnits ? units || [] : [];
  const available_qty = (unitList as { status?: string }[]).filter(
    (u) => u.status === 'disponivel'
  ).length;

  return {
    ...model,
    codes: codes || [],
    applications: applications || [],
    photos: photos || [],
    available_qty: includeUnits
      ? available_qty
      : undefined,
    total_qty: includeUnits ? unitList.length : undefined,
    units: includeUnits ? unitList : undefined,
  };
}

export function registerAbsModuleRoutes(app: Express, deps: AbsRouteDeps) {
  const { WORKSHOP_ID, supabaseAdmin, upload, photosBucket } = deps;
  const photoUpload = upload?.single?.('file') as
    | ((req: unknown, res: unknown, next: (err?: unknown) => void) => void)
    | undefined;

  // -------- Models --------
  app.get('/api/abs-module-models', async (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      const kindRaw = String(req.query.kind || '').trim();
      const kind =
        kindRaw && (ABS_MODULE_KINDS as readonly string[]).includes(kindRaw)
          ? (kindRaw as AbsModuleKind)
          : '';

      if (isDevMemoryActive(deps)) {
        const status = String(req.query.status || '').trim() as AbsModuleStatus | '';
        return res.json({
          models: listDevAbsModuleModels({
            q,
            kind,
            status: (ABS_MODULE_STATUSES as readonly string[]).includes(status)
              ? status
              : '',
          }),
        });
      }

      let query = supabaseAdmin!
        .from('workshop_abs_module_models')
        .select('*')
        .eq('workshop_id', WORKSHOP_ID!)
        .order('updated_at', { ascending: false });
      if (kind) query = query.eq('module_kind', kind);
      const { data: modelRows, error } = await query.limit(300);
      if (error) {
        console.error('[API] GET /api/abs-module-models:', error);
        return res.status(500).json({ error: error.message });
      }

      const ids = (modelRows || []).map((m) => m.id);
      const [{ data: codes }, { data: applications }, { data: units }] = await Promise.all([
        ids.length
          ? supabaseAdmin!
              .from('workshop_abs_module_codes')
              .select('*')
              .in('model_id', ids)
              .order('sort_order', { ascending: true })
          : Promise.resolve({ data: [] as Record<string, unknown>[] }),
        ids.length
          ? supabaseAdmin!
              .from('workshop_abs_module_applications')
              .select('*')
              .in('model_id', ids)
              .order('sort_order', { ascending: true })
          : Promise.resolve({ data: [] as Record<string, unknown>[] }),
        ids.length
          ? supabaseAdmin!
              .from('workshop_abs_modules')
              .select('id, model_id, status')
              .eq('workshop_id', WORKSHOP_ID!)
              .in('model_id', ids)
          : Promise.resolve({ data: [] as { id: string; model_id: string; status: string }[] }),
      ]);

      const codesByModel = new Map<string, unknown[]>();
      for (const c of codes || []) {
        const mid = String((c as { model_id: string }).model_id);
        if (!codesByModel.has(mid)) codesByModel.set(mid, []);
        codesByModel.get(mid)!.push(c);
      }
      const appsByModel = new Map<string, unknown[]>();
      for (const a of applications || []) {
        const mid = String((a as { model_id: string }).model_id);
        if (!appsByModel.has(mid)) appsByModel.set(mid, []);
        appsByModel.get(mid)!.push(a);
      }
      const availableByModel = new Map<string, number>();
      const totalByModel = new Map<string, number>();
      for (const u of units || []) {
        totalByModel.set(u.model_id, (totalByModel.get(u.model_id) || 0) + 1);
        if (u.status !== 'disponivel') continue;
        availableByModel.set(u.model_id, (availableByModel.get(u.model_id) || 0) + 1);
      }

      let models = (modelRows || []).map((m) => ({
        ...m,
        codes: codesByModel.get(m.id) || [],
        applications: (appsByModel.get(m.id) || []) as Array<Record<string, unknown>>,
        available_qty: availableByModel.get(m.id) || 0,
        total_qty: totalByModel.get(m.id) || 0,
      }));

      // Componentes sem app `completo`: herdam a original do módulo completo pai
      // (desmembramento), para a lista não mostrar montadora/modelo secundários.
      const needOriginal = models.filter(
        (m) =>
          (m.module_kind === 'eletronico' || m.module_kind === 'hidraulico') &&
          !(m.applications || []).some((a) => String(a.component_scope || '') === 'completo')
      );
      if (needOriginal.length && (units || []).length) {
        const needIds = new Set(needOriginal.map((m) => String(m.id)));
        const unitIds = (units || [])
          .filter((u) => needIds.has(String(u.model_id)))
          .map((u) => String(u.id));
        if (unitIds.length) {
          const { data: disRows } = await supabaseAdmin!
            .from('workshop_abs_module_disassemblies')
            .select('source_module_id, remaining_module_id, withdrawn_module_id')
            .eq('workshop_id', WORKSHOP_ID!)
            .or(
              `remaining_module_id.in.(${unitIds.join(',')}),withdrawn_module_id.in.(${unitIds.join(',')})`
            );
          const unitToSource = new Map<string, string>();
          for (const d of disRows || []) {
            const src = String(d.source_module_id || '');
            if (!src) continue;
            if (d.remaining_module_id) unitToSource.set(String(d.remaining_module_id), src);
            if (d.withdrawn_module_id) unitToSource.set(String(d.withdrawn_module_id), src);
          }
          const sourceModuleIds = [...new Set(unitToSource.values())];
          if (sourceModuleIds.length) {
            const { data: srcMods } = await supabaseAdmin!
              .from('workshop_abs_modules')
              .select('id, model_id')
              .in('id', sourceModuleIds);
            const sourceModelByUnit = new Map<string, string>();
            const srcModelByModule = new Map(
              (srcMods || []).map((s) => [String(s.id), String(s.model_id || '')])
            );
            for (const [unitId, srcModId] of unitToSource) {
              const mid = srcModelByModule.get(srcModId);
              if (mid) sourceModelByUnit.set(unitId, mid);
            }
            const sourceModelIds = [...new Set(sourceModelByUnit.values())].filter(Boolean);
            const { data: srcApps } =
              sourceModelIds.length > 0
                ? await supabaseAdmin!
                    .from('workshop_abs_module_applications')
                    .select('*')
                    .in('model_id', sourceModelIds)
                    .eq('component_scope', 'completo')
                    .order('sort_order', { ascending: true })
                : { data: [] as Record<string, unknown>[] };
            const firstCompletoByModel = new Map<string, Record<string, unknown>>();
            for (const a of srcApps || []) {
              const mid = String((a as { model_id: string }).model_id);
              if (!firstCompletoByModel.has(mid)) firstCompletoByModel.set(mid, a as Record<string, unknown>);
            }
            const unitModelId = new Map(
              (units || []).map((u) => [String(u.id), String(u.model_id)])
            );
            const injectByTargetModel = new Map<string, Record<string, unknown>>();
            for (const [unitId, srcModelId] of sourceModelByUnit) {
              const targetModelId = unitModelId.get(unitId);
              const app = firstCompletoByModel.get(srcModelId);
              if (targetModelId && app && !injectByTargetModel.has(targetModelId)) {
                injectByTargetModel.set(targetModelId, app);
              }
            }
            models = models.map((m) => {
              const inject = injectByTargetModel.get(String(m.id));
              if (!inject) return m;
              if ((m.applications || []).some((a) => String(a.component_scope || '') === 'completo')) {
                return m;
              }
              return {
                ...m,
                applications: [
                  {
                    ...inject,
                    id: `inherited-${m.id}`,
                    model_id: m.id,
                    component_scope: 'completo',
                    sort_order: 0,
                  },
                  ...(m.applications || []),
                ],
              };
            });
          }
        }
      }

      if (q) {
        const ql = q.toLowerCase();
        models = models.filter((m) => {
          const hay = [
            m.manufacturer,
            m.family,
            m.notes,
            m.module_kind,
            ...((m.codes as { code_value?: string }[]) || []).map((c) => c.code_value),
            ...((m.applications as { vehicle_brand?: string; vehicle_model?: string }[]) || []).flatMap(
              (a) => [a.vehicle_brand, a.vehicle_model]
            ),
          ]
            .join(' ')
            .toLowerCase();
          return hay.includes(ql);
        });
      }

      // Sempre omite modelos sem unidade disponível — vendidos/saídas não
      // aparecem na lista ABS (ficam no histórico de vendas).
      models = models.filter((m) => Number(m.available_qty || 0) > 0);

      const statusFilter = String(req.query.status || '').trim();
      if (statusFilter && statusFilter !== 'disponivel' && (units || []).length) {
        const modelIdsWithStatus = new Set(
          (units || [])
            .filter((u) => String(u.status || '') === statusFilter)
            .map((u) => String(u.model_id))
        );
        models = models.filter((m) => modelIdsWithStatus.has(String(m.id)));
      }

      return res.json({ models });
    } catch (err: any) {
      console.error('[API] GET /api/abs-module-models:', err);
      return res.status(500).json({ error: err?.message ?? 'Erro desconhecido' });
    }
  });

  app.get('/api/abs-module-models/:id', async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'ID do modelo inválido.' });

      if (isDevMemoryActive(deps)) {
        const model = getDevAbsModuleModel(id);
        if (!model) return res.status(404).json({ error: 'Modelo ABS não encontrado.' });
        return res.json({ model });
      }

      const model = await fetchModelBundle(supabaseAdmin!, WORKSHOP_ID!, id, true);
      if (!model) return res.status(404).json({ error: 'Modelo ABS não encontrado.' });
      return res.json({ model });
    } catch (err: any) {
      console.error('[API] GET /api/abs-module-models/:id:', err);
      return res.status(500).json({ error: err?.message ?? 'Erro desconhecido' });
    }
  });

  app.post('/api/abs-module-models', async (req, res) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const payload = modelPayloadFromBody(body);
      const kind = payload.module_kind || 'completo';
      const primary = primaryCodeFromCodes(payload.codes, kind, null);

      if (isDevMemoryActive(deps)) {
        try {
          const model = createDevAbsModuleModel({ ...payload, module_kind: kind });
          return res.status(201).json({ model });
        } catch (e: any) {
          return res.status(400).json({ error: e?.message ?? 'Falha ao criar modelo.' });
        }
      }

      const fingerprint = absModelFingerprint(payload.manufacturer, primary, kind);
      const insertRow = {
        workshop_id: WORKSHOP_ID,
        manufacturer: payload.manufacturer ?? null,
        family: payload.family ?? null,
        module_kind: kind,
        notes: payload.notes ?? null,
        fingerprint,
      };
      const { data: created, error } = await supabaseAdmin!
        .from('workshop_abs_module_models')
        .insert(insertRow)
        .select('*')
        .single();
      if (error) {
        if (/unique|duplicate/i.test(error.message)) {
          return res.status(400).json({
            error: 'Já existe um modelo ABS com este fingerprint (fabricante/código/tipo).',
          });
        }
        return res.status(500).json({ error: error.message });
      }

      if (payload.codes) {
        await replaceModelCodes(supabaseAdmin!, WORKSHOP_ID!, created.id, payload.codes);
      } else if (primary) {
        await replaceModelCodes(supabaseAdmin!, WORKSHOP_ID!, created.id, [
          {
            component_scope: scopeForKind(kind),
            code_role: 'fabricante',
            code_value: primary,
            sort_order: 0,
          },
        ]);
      }
      if (payload.applications) {
        await replaceModelApplications(
          supabaseAdmin!,
          WORKSHOP_ID!,
          created.id,
          payload.applications
        );
      }
      if (payload.photo_urls) {
        await replaceModelPhotos(supabaseAdmin!, WORKSHOP_ID!, created.id, payload.photo_urls);
      }

      const model = await fetchModelBundle(supabaseAdmin!, WORKSHOP_ID!, created.id, true);
      return res.status(201).json({ model });
    } catch (err: any) {
      console.error('[API] POST /api/abs-module-models:', err);
      return res.status(500).json({ error: err?.message ?? 'Erro desconhecido' });
    }
  });

  app.put('/api/abs-module-models/:id', async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'ID do modelo inválido.' });
      const body = (req.body || {}) as Record<string, unknown>;
      const payload = modelPayloadFromBody(body);

      if (isDevMemoryActive(deps)) {
        const model = updateDevAbsModuleModel(id, payload);
        if (!model) return res.status(404).json({ error: 'Modelo ABS não encontrado.' });
        return res.json({ model });
      }

      const { data: existing, error: exErr } = await supabaseAdmin!
        .from('workshop_abs_module_models')
        .select('*')
        .eq('workshop_id', WORKSHOP_ID!)
        .eq('id', id)
        .maybeSingle();
      if (exErr) return res.status(500).json({ error: exErr.message });
      if (!existing) return res.status(404).json({ error: 'Modelo ABS não encontrado.' });

      if (payload.codes !== undefined) {
        await replaceModelCodes(supabaseAdmin!, WORKSHOP_ID!, id, payload.codes);
      }
      if (payload.applications !== undefined) {
        await replaceModelApplications(supabaseAdmin!, WORKSHOP_ID!, id, payload.applications);
      }
      if (payload.photo_urls !== undefined) {
        await replaceModelPhotos(supabaseAdmin!, WORKSHOP_ID!, id, payload.photo_urls);
      }

      const { data: codesAfter } = await supabaseAdmin!
        .from('workshop_abs_module_codes')
        .select('*')
        .eq('model_id', id)
        .order('sort_order', { ascending: true });
      const kind = payload.module_kind ?? (existing.module_kind as AbsModuleKind);
      const manufacturer =
        payload.manufacturer !== undefined ? payload.manufacturer : existing.manufacturer;
      const primary =
        primaryCodeForScope(
          (codesAfter || []) as Parameters<typeof primaryCodeForScope>[0],
          scopeForKind(kind)
        ) ||
        (codesAfter || [])[0]?.code_value ||
        null;

      const { error: upErr } = await supabaseAdmin!
        .from('workshop_abs_module_models')
        .update({
          manufacturer,
          family: payload.family !== undefined ? payload.family : existing.family,
          module_kind: kind,
          notes: payload.notes !== undefined ? payload.notes : existing.notes,
          fingerprint: absModelFingerprint(manufacturer, primary, kind),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('workshop_id', WORKSHOP_ID!);
      if (upErr) return res.status(500).json({ error: upErr.message });

      const model = await fetchModelBundle(supabaseAdmin!, WORKSHOP_ID!, id, true);
      return res.json({ model });
    } catch (err: any) {
      console.error('[API] PUT /api/abs-module-models/:id:', err);
      return res.status(500).json({ error: err?.message ?? 'Erro desconhecido' });
    }
  });

  app.delete('/api/abs-module-models/:id', async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'ID do modelo inválido.' });
      const auth = await requireAbsDeletePassword(deps, req);
      if (auth.ok === false) return res.status(auth.status).json({ error: auth.error });
      const force =
        String(req.query.force || req.body?.force || '').toLowerCase() === '1' ||
        String(req.query.force || req.body?.force || '').toLowerCase() === 'true';

      if (isDevMemoryActive(deps)) {
        const result = deleteDevAbsModuleModel(id, { force });
        if (!result.ok) {
          return res.status(result.error?.includes('possui') ? 409 : 404).json({ error: result.error });
        }
        return res.json({ ok: true, deletedUnits: result.deletedUnits ?? 0 });
      }

      const { data: existing, error: exErr } = await supabaseAdmin!
        .from('workshop_abs_module_models')
        .select('id')
        .eq('workshop_id', WORKSHOP_ID!)
        .eq('id', id)
        .maybeSingle();
      if (exErr) return res.status(500).json({ error: exErr.message });
      if (!existing) return res.status(404).json({ error: 'Modelo ABS não encontrado.' });

      const { data: unitRows, error: uErr } = await supabaseAdmin!
        .from('workshop_abs_modules')
        .select('public_id')
        .eq('workshop_id', WORKSHOP_ID!)
        .eq('model_id', id);
      if (uErr) return res.status(500).json({ error: uErr.message });
      const units = unitRows || [];
      if (units.length > 0 && !force) {
        return res.status(409).json({
          error: `Este modelo possui ${units.length} unidade(s). Exclua as unidades ou confirme a exclusão completa.`,
          unit_count: units.length,
        });
      }

      for (const u of units) {
        const pid = String(u.public_id || '').toUpperCase();
        await deleteAbsModuleUnit(supabaseAdmin!, WORKSHOP_ID!, pid);
      }

      await supabaseAdmin!
        .from('workshop_abs_module_codes')
        .delete()
        .eq('model_id', id)
        .eq('workshop_id', WORKSHOP_ID!);
      await supabaseAdmin!
        .from('workshop_abs_module_applications')
        .delete()
        .eq('model_id', id)
        .eq('workshop_id', WORKSHOP_ID!);
      await supabaseAdmin!
        .from('workshop_abs_module_model_photos')
        .delete()
        .eq('model_id', id)
        .eq('workshop_id', WORKSHOP_ID!);

      const { error: delErr } = await supabaseAdmin!
        .from('workshop_abs_module_models')
        .delete()
        .eq('id', id)
        .eq('workshop_id', WORKSHOP_ID!);
      if (delErr) return res.status(500).json({ error: delErr.message });
      return res.json({ ok: true, deletedUnits: units.length });
    } catch (err: any) {
      console.error('[API] DELETE /api/abs-module-models/:id:', err);
      return res.status(500).json({ error: err?.message ?? 'Erro desconhecido' });
    }
  });

  // -------- Histórico global / vendas (antes de :publicId) --------
  const mapMovementWithModule = (row: Record<string, unknown>) => {
    const mod = (row.module || {}) as Record<string, unknown>;
    const { module: _drop, ...rest } = row;
    return {
      ...rest,
      public_id: String(mod.public_id || ''),
      module_kind: mod.module_kind ?? null,
      manufacturer: mod.manufacturer ?? null,
      sequence_number: mod.sequence_number ?? null,
      status: mod.status ?? null,
      original_code: mod.original_code ?? null,
      unit_cost: mod.unit_cost ?? null,
      unit_price: mod.unit_price ?? null,
    };
  };

  const absMovementModuleSelect = `
          *,
          module:workshop_abs_modules!inner (
            public_id,
            module_kind,
            manufacturer,
            sequence_number,
            status,
            original_code,
            unit_cost,
            unit_price
          )
        `;

  app.get('/api/abs-modules/movements', async (req, res) => {
    try {
      const limitRaw = Number(req.query.limit);
      const limit = Number.isFinite(limitRaw)
        ? Math.max(1, Math.min(1000, Math.floor(limitRaw)))
        : 300;

      if (isDevMemoryActive(deps)) {
        return res.json({ movements: listDevAbsAllMovements(limit) });
      }

      const { data, error } = await supabaseAdmin!
        .from('workshop_abs_module_movements')
        .select(absMovementModuleSelect)
        .eq('workshop_id', WORKSHOP_ID!)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) {
        console.error('[API] GET /api/abs-modules/movements:', error);
        return res.status(500).json({ error: error.message });
      }

      return res.json({
        movements: (data || []).map((row) => mapMovementWithModule(row as Record<string, unknown>)),
      });
    } catch (err: any) {
      console.error('[API] GET /api/abs-modules/movements:', err);
      return res.status(500).json({ error: err?.message ?? 'Erro desconhecido' });
    }
  });

  app.get('/api/abs-modules/sales', async (req, res) => {
    try {
      const limitRaw = Number(req.query.limit);
      const limit = Number.isFinite(limitRaw)
        ? Math.max(1, Math.min(1000, Math.floor(limitRaw)))
        : 400;

      if (isDevMemoryActive(deps)) {
        return res.json({ sales: listDevAbsSaleMovements(limit) });
      }

      const { data, error } = await supabaseAdmin!
        .from('workshop_abs_module_movements')
        .select(absMovementModuleSelect)
        .eq('workshop_id', WORKSHOP_ID!)
        .eq('movement_type', 'exit')
        .eq('to_status', 'fora_estoque')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) {
        console.error('[API] GET /api/abs-modules/sales:', error);
        return res.status(500).json({ error: error.message });
      }

      return res.json({
        sales: (data || []).map((row) => mapMovementWithModule(row as Record<string, unknown>)),
      });
    } catch (err: any) {
      console.error('[API] GET /api/abs-modules/sales:', err);
      return res.status(500).json({ error: err?.message ?? 'Erro desconhecido' });
    }
  });

  // -------- Analytics (antes de :publicId) --------
  app.get('/api/abs-modules/analytics', async (req, res) => {
    try {
      const presetRaw = String(req.query.preset || '30d');
      const validPresets = new Set(['7d', '30d', '90d', 'month', 'year']);
      const preset = validPresets.has(presetRaw) ? presetRaw : '30d';

      const now = new Date();
      const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      let from: Date;
      let periodLabel: string;
      if (preset === '7d') {
        from = new Date(to);
        from.setDate(from.getDate() - 6);
        periodLabel = 'Últimos 7 dias';
      } else if (preset === '90d') {
        from = new Date(to);
        from.setDate(from.getDate() - 89);
        periodLabel = 'Últimos 90 dias';
      } else if (preset === 'year') {
        from = new Date(now.getFullYear(), 0, 1);
        periodLabel = `Ano ${now.getFullYear()}`;
      } else if (preset === 'month') {
        from = new Date(now.getFullYear(), now.getMonth(), 1);
        periodLabel = 'Este mês';
      } else {
        from = new Date(to);
        from.setDate(from.getDate() - 29);
        periodLabel = 'Últimos 30 dias';
      }
      from.setHours(0, 0, 0, 0);

      if (isDevMemoryActive(deps)) {
        const modules = listDevAbsModules({}).map((m) => ({
          id: m.id,
          public_id: m.public_id,
          manufacturer: m.manufacturer,
          original_code: m.original_code,
          module_kind: m.module_kind,
          status: m.status,
          unit_price: Number(m.unit_price) || 0,
          unit_cost: Number(m.unit_cost) || 0,
          model_id: m.model_id,
          created_at: m.created_at,
        }));
        const movements = modules.flatMap((m) =>
          getDevAbsModuleMovements(m.public_id).map((mv) => ({
            id: mv.id,
            module_id: m.id,
            movement_type: mv.movement_type,
            created_at: mv.created_at,
          }))
        );
        return res.json(
          buildWorkshopAbsModulesAnalytics({
            modules,
            movements,
            from,
            to,
            periodLabel: `${periodLabel} (dev)`,
          })
        );
      }

      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: 'Servidor não configurado.' });
      }

      const fromIso = from.toISOString();
      const toIso = to.toISOString();
      const [modulesRes, movementsRes] = await Promise.all([
        supabaseAdmin
          .from('workshop_abs_modules')
          .select(
            'id, public_id, manufacturer, original_code, module_kind, status, unit_price, unit_cost, model_id, created_at'
          )
          .eq('workshop_id', WORKSHOP_ID),
        supabaseAdmin
          .from('workshop_abs_module_movements')
          .select('id, module_id, movement_type, created_at')
          .eq('workshop_id', WORKSHOP_ID)
          .gte('created_at', fromIso)
          .lte('created_at', toIso),
      ]);
      if (modulesRes.error) {
        console.error('[API] GET /api/abs-modules/analytics modules:', modulesRes.error);
        return res.status(500).json({ error: modulesRes.error.message });
      }
      if (movementsRes.error) {
        console.error('[API] GET /api/abs-modules/analytics movements:', movementsRes.error);
        return res.status(500).json({ error: movementsRes.error.message });
      }

      const modules = (modulesRes.data || []).map((m) => ({
        id: String(m.id),
        public_id: String(m.public_id || ''),
        manufacturer: (m.manufacturer as string) ?? null,
        original_code: (m.original_code as string) ?? null,
        module_kind: String(m.module_kind || 'outro'),
        status: String(m.status || 'disponivel'),
        unit_price: Number(m.unit_price) || 0,
        unit_cost: Number(m.unit_cost) || 0,
        model_id: m.model_id != null ? String(m.model_id) : null,
        created_at: String(m.created_at || ''),
      }));
      const movements = (movementsRes.data || []).map((mv) => ({
        id: String(mv.id),
        module_id: String(mv.module_id),
        movement_type: String(mv.movement_type || ''),
        created_at: String(mv.created_at || ''),
      }));

      return res.json(
        buildWorkshopAbsModulesAnalytics({
          modules,
          movements,
          from,
          to,
          periodLabel,
        })
      );
    } catch (err: any) {
      console.error('[API] GET /api/abs-modules/analytics:', err);
      return res.status(500).json({ error: err?.message ?? 'Erro desconhecido' });
    }
  });

  // -------- Modules list / create --------
  app.get('/api/abs-modules', async (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      const statusRaw = String(req.query.status || '').trim();
      const status =
        statusRaw && (ABS_MODULE_STATUSES as readonly string[]).includes(statusRaw)
          ? (statusRaw as AbsModuleStatus)
          : '';

      if (isDevMemoryActive(deps)) {
        return res.json({ modules: listDevAbsModules({ q, status }) });
      }

      let query = supabaseAdmin!
        .from('workshop_abs_modules')
        .select('*')
        .eq('workshop_id', WORKSHOP_ID!)
        .order('created_at', { ascending: false });
      if (status) query = query.eq('status', status);
      if (q) {
        const like = `%${q}%`;
        query = query.or(
          [
            `public_id.ilike.${like}`,
            `manufacturer.ilike.${like}`,
            `original_code.ilike.${like}`,
            `application.ilike.${like}`,
            `model.ilike.${like}`,
            `location.ilike.${like}`,
            `supplier.ilike.${like}`,
          ].join(',')
        );
      }
      const { data, error } = await query.limit(300);
      if (error) {
        console.error('[API] GET /api/abs-modules:', error);
        return res.status(500).json({ error: error.message });
      }
      return res.json({ modules: data || [] });
    } catch (err: any) {
      console.error('[API] GET /api/abs-modules:', err);
      return res.status(500).json({ error: err?.message ?? 'Erro desconhecido' });
    }
  });

  app.get('/api/abs-modules/lookup', async (req, res) => {
    try {
      const raw = String(req.query.code ?? req.query.public_id ?? '').trim();
      if (!raw) return res.status(400).json({ error: 'Informe o código (code).', found: false });

      if (looksLikeAbsModuleCode(raw) && !normalizeAbsModuleCode(raw)) {
        return res.status(400).json({
          error: 'ID de módulo ABS inválido. Use o formato ABS-000001.',
          found: false,
          public_id: raw.toUpperCase(),
        });
      }

      const publicId = normalizeAbsModuleCode(raw);
      if (!publicId) {
        return res.status(400).json({ error: 'Código não é um ID de módulo ABS.', found: false });
      }

      if (isDevMemoryActive(deps)) {
        const mod = getDevAbsModuleByPublicId(publicId);
        if (!mod) return res.json({ found: false, public_id: publicId });
        return res.json({ found: true, module: mod });
      }

      const { data, error } = await supabaseAdmin!
        .from('workshop_abs_modules')
        .select('*')
        .eq('workshop_id', WORKSHOP_ID!)
        .eq('public_id', publicId)
        .maybeSingle();
      if (error) {
        console.error('[API] GET /api/abs-modules/lookup:', error);
        return res.status(500).json({ error: error.message, found: false });
      }
      if (!data) return res.json({ found: false, public_id: publicId });
      return res.json({ found: true, module: data });
    } catch (err: any) {
      console.error('[API] GET /api/abs-modules/lookup:', err);
      return res.status(500).json({ error: err?.message ?? 'Erro desconhecido', found: false });
    }
  });

  // Register BEFORE /api/abs-modules/:publicId
  app.get('/api/abs-modules/search', async (req, res) => {
    try {
      const q = String(req.query.q || '').trim();

      if (isDevMemoryActive(deps)) {
        return res.json(searchDevAbsModules(q));
      }

      if (!q) {
        return res.json({ query: q, availableUnits: [], availableViaDisassembly: [] });
      }

      const like = `%${q}%`;
      const { data: codeHits } = await supabaseAdmin!
        .from('workshop_abs_module_codes')
        .select('model_id')
        .eq('workshop_id', WORKSHOP_ID!)
        .ilike('code_value', like);
      const { data: appHits } = await supabaseAdmin!
        .from('workshop_abs_module_applications')
        .select('model_id')
        .eq('workshop_id', WORKSHOP_ID!)
        .or(
          [
            `vehicle_brand.ilike.${like}`,
            `vehicle_model.ilike.${like}`,
            `generation.ilike.${like}`,
            `engine.ilike.${like}`,
            `version.ilike.${like}`,
            `notes.ilike.${like}`,
          ].join(',')
        );

      const modelIds = [
        ...new Set([
          ...(codeHits || []).map((r) => r.model_id),
          ...(appHits || []).map((r) => r.model_id),
        ]),
      ];

      let unitsQuery = supabaseAdmin!
        .from('workshop_abs_modules')
        .select('*')
        .eq('workshop_id', WORKSHOP_ID!)
        .eq('status', 'disponivel')
        .in('module_kind', ['eletronico', 'hidraulico'])
        .or(
          [
            `public_id.ilike.${like}`,
            `manufacturer.ilike.${like}`,
            `original_code.ilike.${like}`,
            `application.ilike.${like}`,
            `model.ilike.${like}`,
            ...(modelIds.length ? [`model_id.in.(${modelIds.join(',')})`] : []),
          ].join(',')
        )
        .order('public_id', { ascending: true })
        .limit(100);

      // sequence_number match when q is numeric
      const seqNum = Number(q.replace(/^#/, ''));
      if (Number.isFinite(seqNum) && String(Math.floor(seqNum)) === q.replace(/^#/, '')) {
        unitsQuery = supabaseAdmin!
          .from('workshop_abs_modules')
          .select('*')
          .eq('workshop_id', WORKSHOP_ID!)
          .eq('status', 'disponivel')
          .in('module_kind', ['eletronico', 'hidraulico'])
          .or(
            [
              `public_id.ilike.${like}`,
              `manufacturer.ilike.${like}`,
              `original_code.ilike.${like}`,
              `application.ilike.${like}`,
              `model.ilike.${like}`,
              `sequence_number.eq.${Math.floor(seqNum)}`,
              ...(modelIds.length ? [`model_id.in.(${modelIds.join(',')})`] : []),
            ].join(',')
          )
          .order('public_id', { ascending: true })
          .limit(100);
      }

      const { data: availableUnits, error: uErr } = await unitsQuery;
      if (uErr) {
        console.error('[API] GET /api/abs-modules/search units:', uErr);
        return res.status(500).json({ error: uErr.message });
      }

      const { data: availableViaDisassembly, error: cErr } = await supabaseAdmin!
        .from('workshop_abs_modules')
        .select('*')
        .eq('workshop_id', WORKSHOP_ID!)
        .eq('status', 'disponivel')
        .eq('module_kind', 'completo')
        .or(
          [
            `public_id.ilike.${like}`,
            `manufacturer.ilike.${like}`,
            `original_code.ilike.${like}`,
            `application.ilike.${like}`,
            `model.ilike.${like}`,
            ...(modelIds.length ? [`model_id.in.(${modelIds.join(',')})`] : []),
          ].join(',')
        )
        .order('public_id', { ascending: true })
        .limit(100);
      if (cErr) {
        console.error('[API] GET /api/abs-modules/search completo:', cErr);
        return res.status(500).json({ error: cErr.message });
      }

      return res.json({
        query: q,
        availableUnits: availableUnits || [],
        availableViaDisassembly: availableViaDisassembly || [],
      });
    } catch (err: any) {
      console.error('[API] GET /api/abs-modules/search:', err);
      return res.status(500).json({ error: err?.message ?? 'Erro desconhecido' });
    }
  });

  app.get('/api/abs-modules/:publicId/movements', async (req, res) => {
    try {
      const publicId = normalizeAbsModuleCode(String(req.params.publicId || '')) || '';
      if (!isValidAbsModulePublicId(publicId)) {
        return res.status(400).json({ error: 'ID de módulo ABS inválido.' });
      }

      if (isDevMemoryActive(deps)) {
        const mod = getDevAbsModuleByPublicId(publicId);
        if (!mod) return res.status(404).json({ error: 'Módulo ABS não encontrado.' });
        return res.json({ movements: getDevAbsModuleMovements(publicId) });
      }

      const { data: mod, error: modErr } = await supabaseAdmin!
        .from('workshop_abs_modules')
        .select('id')
        .eq('workshop_id', WORKSHOP_ID!)
        .eq('public_id', publicId)
        .maybeSingle();
      if (modErr) return res.status(500).json({ error: modErr.message });
      if (!mod) return res.status(404).json({ error: 'Módulo ABS não encontrado.' });

      const { data, error } = await supabaseAdmin!
        .from('workshop_abs_module_movements')
        .select('*')
        .eq('module_id', mod.id)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ movements: data || [] });
    } catch (err: any) {
      console.error('[API] GET /api/abs-modules/:publicId/movements:', err);
      return res.status(500).json({ error: err?.message ?? 'Erro desconhecido' });
    }
  });

  app.get('/api/abs-modules/:publicId/disassembly', async (req, res) => {
    try {
      const publicId = normalizeAbsModuleCode(String(req.params.publicId || '')) || '';
      if (!isValidAbsModulePublicId(publicId)) {
        return res.status(400).json({ error: 'ID de módulo ABS inválido.' });
      }

      if (isDevMemoryActive(deps)) {
        const detail = getDevAbsDisassemblyForModule(publicId);
        if (!detail) {
          return res.status(404).json({ error: 'Desmembramento não encontrado para este módulo.' });
        }
        return res.json(detail);
      }

      const { data: mod, error: modErr } = await supabaseAdmin!
        .from('workshop_abs_modules')
        .select('*')
        .eq('workshop_id', WORKSHOP_ID!)
        .eq('public_id', publicId)
        .maybeSingle();
      if (modErr) return res.status(500).json({ error: modErr.message });
      if (!mod) return res.status(404).json({ error: 'Módulo ABS não encontrado.' });

      const { data: disRow, error: disErr } = await supabaseAdmin!
        .from('workshop_abs_module_disassemblies')
        .select('*')
        .eq('workshop_id', WORKSHOP_ID!)
        .or(
          `source_module_id.eq.${mod.id},remaining_module_id.eq.${mod.id},withdrawn_module_id.eq.${mod.id}`
        )
        .maybeSingle();
      if (disErr) return res.status(500).json({ error: disErr.message });
      if (!disRow) {
        return res.status(404).json({ error: 'Desmembramento não encontrado para este módulo.' });
      }

      const ids = [
        disRow.source_module_id,
        disRow.remaining_module_id,
        disRow.withdrawn_module_id,
      ].filter(Boolean);

      const { data: modulesRows, error: modsErr } = await supabaseAdmin!
        .from('workshop_abs_modules')
        .select('*')
        .eq('workshop_id', WORKSHOP_ID!)
        .in('id', ids);
      if (modsErr) return res.status(500).json({ error: modsErr.message });

      const byId = new Map((modulesRows || []).map((m) => [String(m.id), m]));
      const source = byId.get(String(disRow.source_module_id));
      const remaining = byId.get(String(disRow.remaining_module_id));
      const withdrawn = byId.get(String(disRow.withdrawn_module_id));
      if (!source || !remaining || !withdrawn) {
        return res.status(500).json({ error: 'Unidades do desmembramento incompletas.' });
      }

      const loadMovements = async (moduleId: string) => {
        const { data, error } = await supabaseAdmin!
          .from('workshop_abs_module_movements')
          .select('*')
          .eq('module_id', moduleId)
          .order('created_at', { ascending: true })
          .limit(100);
        if (error) throw new Error(error.message);
        return data || [];
      };

      const [sourceMov, remainingMov, withdrawnMov] = await Promise.all([
        loadMovements(String(source.id)),
        loadMovements(String(remaining.id)),
        loadMovements(String(withdrawn.id)),
      ]);

      const attachCatalog = async (row: Record<string, unknown>) => {
        const modelId = row.model_id ? String(row.model_id) : null;
        if (!modelId) return { ...row, catalog_model: null };
        try {
          const catalog_model = await fetchModelBundle(
            supabaseAdmin!,
            WORKSHOP_ID!,
            modelId,
            false
          );
          return { ...row, catalog_model };
        } catch {
          return { ...row, catalog_model: null };
        }
      };

      const [sourceFull, remainingFull, withdrawnFull] = await Promise.all([
        attachCatalog(source as Record<string, unknown>),
        attachCatalog(remaining as Record<string, unknown>),
        attachCatalog(withdrawn as Record<string, unknown>),
      ]);

      return res.json({
        disassembly: disRow,
        source: sourceFull,
        remaining: remainingFull,
        withdrawn: withdrawnFull,
        movements: {
          source: sourceMov,
          remaining: remainingMov,
          withdrawn: withdrawnMov,
        },
      });
    } catch (err: any) {
      console.error('[API] GET /api/abs-modules/:publicId/disassembly:', err);
      return res.status(500).json({ error: err?.message ?? 'Erro desconhecido' });
    }
  });

  app.post('/api/abs-modules/:publicId/disassemble', async (req, res) => {
    try {
      const publicId = normalizeAbsModuleCode(String(req.params.publicId || '')) || '';
      if (!isValidAbsModulePublicId(publicId)) {
        return res.status(400).json({ error: 'ID de módulo ABS inválido.' });
      }
      const body = (req.body || {}) as Record<string, unknown>;
      const input: WorkshopAbsDisassembleInput = {
        withdrawn_kind: String(body.withdrawn_kind || '').trim() as 'eletronico' | 'hidraulico',
        destination: String(body.destination || '').trim() as AbsDisassembleDestination,
        destination_ref: parseOptionalText(body.destination_ref),
        service_order_id: parseOptionalText(body.service_order_id),
        cost_remaining:
          body.cost_remaining != null && body.cost_remaining !== ''
            ? parseMoney(body.cost_remaining, NaN)
            : null,
        cost_withdrawn:
          body.cost_withdrawn != null && body.cost_withdrawn !== ''
            ? parseMoney(body.cost_withdrawn, NaN)
            : null,
        cost_adjustment_authorized: Boolean(body.cost_adjustment_authorized),
        cost_adjustment_note: parseOptionalText(body.cost_adjustment_note),
        remaining_location: parseOptionalText(body.remaining_location),
        withdrawn_location: parseOptionalText(body.withdrawn_location),
        notes: parseOptionalText(body.notes),
        recorded_by_name: parseOptionalText(body.recorded_by_name),
        remaining_primary_code: parseOptionalText(body.remaining_primary_code),
        withdrawn_primary_code: parseOptionalText(body.withdrawn_primary_code),
      };

      if (isDevMemoryActive(deps)) {
        try {
          const result = disassembleDevAbsModule(publicId, input);
          return res.status(201).json(result);
        } catch (e: any) {
          const msg = e?.message ?? 'Falha no desmembramento.';
          const status = /não encontrado/i.test(msg)
            ? 404
            : /inválid|informe|somente|já foi|deve igualar|não está/i.test(msg)
              ? 400
              : 500;
          return res.status(status).json({ error: msg });
        }
      }

      const { data: mod, error: modErr } = await supabaseAdmin!
        .from('workshop_abs_modules')
        .select('id')
        .eq('workshop_id', WORKSHOP_ID!)
        .eq('public_id', publicId)
        .maybeSingle();
      if (modErr) return res.status(500).json({ error: modErr.message });
      if (!mod) return res.status(404).json({ error: 'Módulo ABS não encontrado.' });

      const { data, error } = await supabaseAdmin!.rpc('disassemble_workshop_abs_module', {
        p_workshop_id: WORKSHOP_ID,
        p_source_module_id: mod.id,
        p_withdrawn_kind: input.withdrawn_kind,
        p_destination: input.destination,
        p_destination_ref: input.destination_ref,
        p_service_order_id: input.service_order_id,
        p_cost_remaining: input.cost_remaining,
        p_cost_withdrawn: input.cost_withdrawn,
        p_cost_adjustment_authorized: input.cost_adjustment_authorized ?? false,
        p_cost_adjustment_note: input.cost_adjustment_note,
        p_remaining_location: input.remaining_location,
        p_withdrawn_location: input.withdrawn_location,
        p_notes: input.notes,
        p_recorded_by_name: input.recorded_by_name,
        p_remaining_primary_code: input.remaining_primary_code,
        p_withdrawn_primary_code: input.withdrawn_primary_code,
      });
      if (error) return res.status(400).json({ error: error.message });
      const raw = data as {
        source?: Record<string, unknown>;
        remaining?: Record<string, unknown>;
        withdrawn?: Record<string, unknown>;
        disassembly?: Record<string, unknown>;
      } | null;
      if (!raw?.source || !raw?.remaining || !raw?.withdrawn || !raw?.disassembly) {
        return res.status(500).json({ error: 'Resposta inválida do desmembramento.' });
      }

      let row: AbsDisassembleRpcRow = {
        source: raw.source,
        remaining: raw.remaining,
        withdrawn: raw.withdrawn,
        disassembly: raw.disassembly,
      };

      // Venda/OS/lab: a saída DEVE manter a etiqueta do completo.
      // Se a RPC antiga gerou public_id novo, corrige antes de responder.
      const withdrawnPid = String(row.withdrawn.public_id || '')
        .trim()
        .toUpperCase();
      if (input.destination !== 'estoque' && withdrawnPid !== publicId) {
        console.warn(
          `[API] desassemble: RPC gerou etiqueta nova para saída (${withdrawnPid}); corrigindo para ${publicId}.`
        );
        try {
          row = await repairDisassembleKeepOriginalLabel(
            supabaseAdmin!,
            WORKSHOP_ID!,
            publicId,
            row,
            input
          );
        } catch (repairErr: any) {
          console.error('[API] Falha ao corrigir etiqueta da saída:', repairErr);
          return res.status(500).json({
            error:
              repairErr?.message ||
              'Desmembramento criou etiqueta nova na saída. Aplique a migration sale_keeps_label e tente de novo.',
          });
        }
      }

      return res.status(201).json(row);
    } catch (err: any) {
      console.error('[API] POST /api/abs-modules/:publicId/disassemble:', err);
      return res.status(500).json({ error: err?.message ?? 'Erro desconhecido' });
    }
  });

  app.get('/api/abs-modules/:publicId', async (req, res) => {
    try {
      const publicId = normalizeAbsModuleCode(String(req.params.publicId || '')) || '';
      if (!isValidAbsModulePublicId(publicId)) {
        return res.status(400).json({ error: 'ID de módulo ABS inválido.' });
      }

      if (isDevMemoryActive(deps)) {
        const mod = getDevAbsModuleByPublicId(publicId);
        if (!mod) return res.status(404).json({ error: 'Módulo ABS não encontrado.' });
        return res.json({ module: mod });
      }

      const { data, error } = await supabaseAdmin!
        .from('workshop_abs_modules')
        .select('*')
        .eq('workshop_id', WORKSHOP_ID!)
        .eq('public_id', publicId)
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      if (!data) return res.status(404).json({ error: 'Módulo ABS não encontrado.' });
      const withPhotos = await attachUnitPhotos(
        supabaseAdmin!,
        WORKSHOP_ID!,
        data as Record<string, unknown>
      );
      const modelId = withPhotos.model_id != null ? String(withPhotos.model_id) : '';
      let catalog_model: Record<string, unknown> | null = null;
      if (modelId) {
        try {
          catalog_model = (await fetchModelBundle(supabaseAdmin!, WORKSHOP_ID!, modelId, false)) as
            | Record<string, unknown>
            | null;
        } catch {
          catalog_model = null;
        }
      }
      return res.json({ module: { ...withPhotos, catalog_model } });
    } catch (err: any) {
      console.error('[API] GET /api/abs-modules/:publicId:', err);
      return res.status(500).json({ error: err?.message ?? 'Erro desconhecido' });
    }
  });

  app.post('/api/abs-modules', async (req, res) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const payload = modulePayloadFromBody(body);
      const recordedByName = parseOptionalText(body.recorded_by_name);

      if (isDevMemoryActive(deps)) {
        const created = createDevAbsModule(payload, recordedByName);
        return res.status(201).json({ module: created });
      }

      const kind = payload.module_kind || 'completo';
      let modelId = payload.model_id || null;

      if (!modelId && payload.catalog) {
        const cat = payload.catalog;
        const catKind = cat.module_kind || kind;
        modelId = await resolveOrCreateModelId(supabaseAdmin!, WORKSHOP_ID!, {
          manufacturer: cat.manufacturer ?? payload.manufacturer,
          family: cat.family ?? payload.model,
          module_kind: catKind,
          primary_code: primaryCodeFromCodes(
            cat.codes,
            catKind,
            payload.original_code
          ),
          notes: cat.notes,
          codes: cat.codes,
          applications: cat.applications,
          photo_urls: cat.photo_urls,
        });
      } else if (!modelId) {
        modelId = await resolveOrCreateModelId(supabaseAdmin!, WORKSHOP_ID!, {
          manufacturer: payload.manufacturer,
          family: payload.model,
          module_kind: kind,
          primary_code: payload.original_code,
        });
      }

      const { data: sequenceNumber, error: seqErr } = await supabaseAdmin!.rpc(
        'next_workshop_abs_module_sequence',
        { p_model_id: modelId }
      );
      if (seqErr) return res.status(500).json({ error: seqErr.message });

      const { data: publicId, error: idErr } = await supabaseAdmin!.rpc(
        'next_workshop_abs_module_public_id',
        { p_workshop_id: WORKSHOP_ID }
      );
      if (idErr) return res.status(500).json({ error: idErr.message });

      const insertRow = {
        workshop_id: WORKSHOP_ID,
        public_id: publicId,
        manufacturer: payload.manufacturer,
        original_code: payload.original_code,
        application: payload.application,
        model: payload.model,
        year_label: payload.year_label,
        module_kind: kind,
        condition: payload.condition || 'usado',
        item_state: payload.item_state || 'usado',
        item_condition: payload.item_condition || 'nao_testado',
        damage_description: payload.damage_description ?? null,
        unit_cost: payload.unit_cost ?? 0,
        unit_price: payload.unit_price ?? 0,
        supplier: payload.supplier,
        location: payload.location,
        notes: payload.notes,
        status: payload.status || 'disponivel',
        received_at: payload.received_at || new Date().toISOString(),
        model_id: modelId,
        sequence_number: sequenceNumber,
      };

      const { data, error } = await supabaseAdmin!
        .from('workshop_abs_modules')
        .insert(insertRow)
        .select('*')
        .single();
      if (error) {
        console.error('[API] POST /api/abs-modules:', error);
        return res.status(500).json({ error: error.message });
      }

      try {
        await insertUnitPhotos(supabaseAdmin!, WORKSHOP_ID!, data.id, payload.photo_urls);
      } catch (photoErr: any) {
        console.error('[API] POST /api/abs-modules photos:', photoErr);
      }

      await supabaseAdmin!.from('workshop_abs_module_movements').insert({
        workshop_id: WORKSHOP_ID,
        module_id: data.id,
        movement_type: 'entry',
        from_status: null,
        to_status: data.status,
        from_location: null,
        to_location: data.location || null,
        notes: 'Cadastro inicial',
        recorded_by_name: recordedByName,
      });

      return res.status(201).json({ module: data });
    } catch (err: any) {
      console.error('[API] POST /api/abs-modules:', err);
      return res.status(500).json({ error: err?.message ?? 'Erro desconhecido' });
    }
  });

  app.put('/api/abs-modules/:publicId', async (req, res) => {
    try {
      const publicId = normalizeAbsModuleCode(String(req.params.publicId || '')) || '';
      if (!isValidAbsModulePublicId(publicId)) {
        return res.status(400).json({ error: 'ID de módulo ABS inválido.' });
      }
      const body = (req.body || {}) as Record<string, unknown>;
      const payload = modulePayloadFromBody(body);

      if (isDevMemoryActive(deps)) {
        const updated = updateDevAbsModule(publicId, payload);
        if (!updated) return res.status(404).json({ error: 'Módulo ABS não encontrado.' });
        return res.json({ module: updated });
      }

      const { data, error } = await supabaseAdmin!
        .from('workshop_abs_modules')
        .update({
          manufacturer: payload.manufacturer,
          original_code: payload.original_code,
          application: payload.application,
          model: payload.model,
          year_label: payload.year_label,
          module_kind: payload.module_kind,
          condition: payload.condition,
          item_state: payload.item_state,
          item_condition: payload.item_condition,
          damage_description: payload.damage_description,
          unit_cost: payload.unit_cost,
          unit_price: payload.unit_price,
          supplier: payload.supplier,
          location: payload.location,
          notes: payload.notes,
          status: payload.status,
          ...(payload.model_id ? { model_id: payload.model_id } : {}),
          ...(payload.received_at ? { received_at: payload.received_at } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('workshop_id', WORKSHOP_ID!)
        .eq('public_id', publicId)
        .select('*')
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      if (!data) return res.status(404).json({ error: 'Módulo ABS não encontrado.' });
      return res.json({ module: data });
    } catch (err: any) {
      console.error('[API] PUT /api/abs-modules/:publicId:', err);
      return res.status(500).json({ error: err?.message ?? 'Erro desconhecido' });
    }
  });

  app.post('/api/abs-modules/:publicId/movements', async (req, res) => {
    try {
      const publicId = normalizeAbsModuleCode(String(req.params.publicId || '')) || '';
      if (!isValidAbsModulePublicId(publicId)) {
        return res.status(400).json({ error: 'ID de módulo ABS inválido.' });
      }

      const body = (req.body || {}) as Record<string, unknown>;
      const movementType = String(body.movement_type || '').trim() as AbsModuleMovementType;
      if (!['entry', 'exit', 'transfer'].includes(movementType)) {
        return res.status(400).json({ error: 'Tipo de movimentação inválido.' });
      }

      const payload = {
        public_id: publicId,
        movement_type: movementType,
        to_location: parseOptionalText(body.to_location),
        reason_type: parseOptionalText(body.reason_type ?? body.related_type),
        reason_ref: parseOptionalText(body.reason_ref ?? body.related_label ?? body.related_id),
        notes: parseOptionalText(body.notes),
        recorded_by_name: parseOptionalText(body.recorded_by_name),
        service_order_id: parseOptionalText(body.service_order_id),
      };

      if (isDevMemoryActive(deps)) {
        try {
          const result = applyDevAbsModuleMovement(payload);
          return res.status(201).json(result);
        } catch (e: any) {
          const msg = e?.message ?? 'Falha na movimentação.';
          const status = /não encontrado/i.test(msg)
            ? 404
            : /inválid|informe|não está|já está|desmembrado|não pode/i.test(msg)
              ? 400
              : 500;
          return res.status(status).json({ error: msg });
        }
      }

      const { data: mod, error: modErr } = await supabaseAdmin!
        .from('workshop_abs_modules')
        .select('id')
        .eq('workshop_id', WORKSHOP_ID!)
        .eq('public_id', publicId)
        .maybeSingle();
      if (modErr) return res.status(500).json({ error: modErr.message });
      if (!mod) return res.status(404).json({ error: 'Módulo ABS não encontrado.' });

      const { data, error } = await supabaseAdmin!.rpc('apply_workshop_abs_module_movement', {
        p_workshop_id: WORKSHOP_ID,
        p_module_id: mod.id,
        p_movement_type: payload.movement_type,
        p_to_location: payload.to_location,
        p_reason_type: payload.reason_type,
        p_reason_ref: payload.reason_ref,
        p_notes: payload.notes,
        p_recorded_by_name: payload.recorded_by_name,
        p_service_order_id: payload.service_order_id,
      });
      if (error) return res.status(400).json({ error: error.message });
      const row = data as { module?: unknown; movement?: unknown } | null;
      if (!row?.module) {
        return res.status(500).json({ error: 'Resposta inválida da movimentação.' });
      }
      return res.status(201).json({ module: row.module, movement: row.movement });
    } catch (err: any) {
      console.error('[API] POST /api/abs-modules/:publicId/movements:', err);
      return res.status(500).json({ error: err?.message ?? 'Erro desconhecido' });
    }
  });

  app.post('/api/abs-modules/:publicId/photo', async (req, res, next) => {
    const run = async () => {
      try {
        const publicId = normalizeAbsModuleCode(String(req.params.publicId || '')) || '';
        if (!isValidAbsModulePublicId(publicId)) {
          return res.status(400).json({ error: 'ID de módulo ABS inválido.' });
        }

        const file = (req as { file?: { buffer: Buffer; mimetype?: string; originalname?: string } })
          .file;
        if (!file) return res.status(400).json({ error: 'Arquivo não enviado.' });
        const mime = file.mimetype || 'application/octet-stream';
        if (!mime.startsWith('image/')) {
          return res.status(400).json({ error: 'Envie apenas imagem.' });
        }

        if (isDevMemoryActive(deps)) {
          const mod = getDevAbsModuleByPublicId(publicId);
          if (!mod) return res.status(404).json({ error: 'Módulo ABS não encontrado.' });
          const dataUrl = `data:${mime};base64,${file.buffer.toString('base64')}`;
          const updated = updateDevAbsModule(publicId, {
            photo_urls: [...(mod.photos || []).map((p) => p.photo_url), dataUrl],
          });
          return res.status(201).json({ module: updated });
        }

        if (!photosBucket) {
          return res.status(500).json({ error: 'Bucket de fotos não configurado.' });
        }

        const { data: mod, error: modErr } = await supabaseAdmin!
          .from('workshop_abs_modules')
          .select('id, public_id')
          .eq('workshop_id', WORKSHOP_ID!)
          .eq('public_id', publicId)
          .maybeSingle();
        if (modErr) return res.status(500).json({ error: modErr.message });
        if (!mod) return res.status(404).json({ error: 'Módulo ABS não encontrado.' });

        const { count, error: countErr } = await supabaseAdmin!
          .from('workshop_abs_module_unit_photos')
          .select('id', { count: 'exact', head: true })
          .eq('module_id', mod.id)
          .eq('workshop_id', WORKSHOP_ID!);
        if (countErr) return res.status(500).json({ error: countErr.message });
        if ((count ?? 0) >= ABS_MODULE_PHOTOS_MAX) {
          return res
            .status(400)
            .json({ error: `Máximo de ${ABS_MODULE_PHOTOS_MAX} fotos por módulo.` });
        }

        const ext = (file.originalname?.split('.').pop() || 'jpg').toLowerCase();
        const safeExt = /^[a-z0-9]+$/.test(ext) ? ext : 'jpg';
        const pathInBucket = `${WORKSHOP_ID}/abs-modules/${mod.id}/${Date.now()}.${safeExt}`;

        const { error: uploadErr } = await supabaseAdmin!.storage
          .from(photosBucket)
          .upload(pathInBucket, file.buffer, { contentType: mime, upsert: true });
        if (uploadErr) return res.status(500).json({ error: uploadErr.message });

        const {
          data: { publicUrl },
        } = supabaseAdmin!.storage.from(photosBucket).getPublicUrl(pathInBucket);
        const photoUrl = `${publicUrl}${publicUrl.includes('?') ? '&' : '?'}v=${Date.now()}`;

        const { error: insertErr } = await supabaseAdmin!
          .from('workshop_abs_module_unit_photos')
          .insert({
            workshop_id: WORKSHOP_ID,
            module_id: mod.id,
            photo_url: photoUrl,
            sort_order: count ?? 0,
          });
        if (insertErr) return res.status(500).json({ error: insertErr.message });

        const { data: full, error: loadErr } = await supabaseAdmin!
          .from('workshop_abs_modules')
          .select('*')
          .eq('id', mod.id)
          .maybeSingle();
        if (loadErr || !full) {
          return res.status(500).json({ error: loadErr?.message ?? 'Falha ao recarregar módulo.' });
        }
        const withPhotos = await attachUnitPhotos(
          supabaseAdmin!,
          WORKSHOP_ID!,
          full as Record<string, unknown>
        );
        return res.status(201).json({ module: withPhotos });
      } catch (err: any) {
        console.error('[API] POST /api/abs-modules/:publicId/photo:', err);
        return res.status(500).json({ error: err?.message ?? 'Erro desconhecido' });
      }
    };

    if (photoUpload) {
      photoUpload(req, res, (err?: unknown) => {
        if (err) {
          const msg = err instanceof Error ? err.message : 'Falha no upload.';
          return res.status(400).json({ error: msg });
        }
        void run();
      });
      return;
    }
    return res.status(500).json({ error: 'Upload multipart não configurado.' });
  });

  app.delete('/api/abs-modules/:publicId/photos/:photoId', async (req, res) => {
    try {
      const publicId = normalizeAbsModuleCode(String(req.params.publicId || '')) || '';
      const photoId = String(req.params.photoId || '').trim();
      if (!isValidAbsModulePublicId(publicId)) {
        return res.status(400).json({ error: 'ID de módulo ABS inválido.' });
      }
      if (!photoId) return res.status(400).json({ error: 'ID da foto inválido.' });

      if (isDevMemoryActive(deps)) {
        const mod = getDevAbsModuleByPublicId(publicId);
        if (!mod) return res.status(404).json({ error: 'Módulo ABS não encontrado.' });
        const nextUrls = (mod.photos || [])
          .filter((p) => p.id !== photoId)
          .map((p) => p.photo_url);
        const updated = updateDevAbsModule(publicId, { photo_urls: nextUrls });
        return res.json({ module: updated });
      }

      const { data: mod, error: modErr } = await supabaseAdmin!
        .from('workshop_abs_modules')
        .select('id')
        .eq('workshop_id', WORKSHOP_ID!)
        .eq('public_id', publicId)
        .maybeSingle();
      if (modErr) return res.status(500).json({ error: modErr.message });
      if (!mod) return res.status(404).json({ error: 'Módulo ABS não encontrado.' });

      const { error: delErr } = await supabaseAdmin!
        .from('workshop_abs_module_unit_photos')
        .delete()
        .eq('id', photoId)
        .eq('module_id', mod.id)
        .eq('workshop_id', WORKSHOP_ID!);
      if (delErr) return res.status(500).json({ error: delErr.message });

      const { data: remaining } = await supabaseAdmin!
        .from('workshop_abs_module_unit_photos')
        .select('id')
        .eq('module_id', mod.id)
        .eq('workshop_id', WORKSHOP_ID!)
        .order('sort_order', { ascending: true });
      let order = 0;
      for (const row of remaining || []) {
        await supabaseAdmin!
          .from('workshop_abs_module_unit_photos')
          .update({ sort_order: order++ })
          .eq('id', row.id);
      }

      const { data: full, error: loadErr } = await supabaseAdmin!
        .from('workshop_abs_modules')
        .select('*')
        .eq('id', mod.id)
        .maybeSingle();
      if (loadErr || !full) {
        return res.status(500).json({ error: loadErr?.message ?? 'Falha ao recarregar módulo.' });
      }
      const withPhotos = await attachUnitPhotos(
        supabaseAdmin!,
        WORKSHOP_ID!,
        full as Record<string, unknown>
      );
      return res.json({ module: withPhotos });
    } catch (err: any) {
      console.error('[API] DELETE /api/abs-modules/:publicId/photos/:photoId:', err);
      return res.status(500).json({ error: err?.message ?? 'Erro desconhecido' });
    }
  });

  app.delete('/api/abs-modules/:publicId', async (req, res) => {
    try {
      const publicId = normalizeAbsModuleCode(String(req.params.publicId || '')) || '';
      if (!isValidAbsModulePublicId(publicId)) {
        return res.status(400).json({ error: 'ID de módulo ABS inválido.' });
      }
      const auth = await requireAbsDeletePassword(deps, req);
      if (auth.ok === false) return res.status(auth.status).json({ error: auth.error });

      if (isDevMemoryActive(deps)) {
        const ok = deleteDevAbsModule(publicId);
        if (!ok) return res.status(404).json({ error: 'Módulo ABS não encontrado.' });
        return res.json({ ok: true, public_id: publicId });
      }

      const result = await deleteAbsModuleUnit(supabaseAdmin!, WORKSHOP_ID!, publicId);
      if (result.ok === false) {
        return res.status(result.status).json({ error: result.error });
      }
      return res.json({ ok: true, public_id: publicId });
    } catch (err: any) {
      console.error('[API] DELETE /api/abs-modules/:publicId:', err);
      return res.status(500).json({ error: err?.message ?? 'Erro desconhecido' });
    }
  });
}
