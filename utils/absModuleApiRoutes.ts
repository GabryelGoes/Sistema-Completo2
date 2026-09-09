import type { Express } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  applyDevAbsModuleMovement,
  createDevAbsModule,
  getDevAbsModuleByPublicId,
  getDevAbsModuleMovements,
  listDevAbsModules,
  updateDevAbsModule,
} from './workshopAbsModuleDevMemory.js';
import {
  ABS_MODULE_CONDITIONS,
  ABS_MODULE_KINDS,
  ABS_MODULE_STATUSES,
  isValidAbsModulePublicId,
  looksLikeAbsModuleCode,
  normalizeAbsModuleCode,
  type AbsModuleCondition,
  type AbsModuleKind,
  type AbsModuleMovementType,
  type AbsModuleStatus,
  type WorkshopAbsModuleWriteInput,
} from './workshopAbsModules.js';

type AbsRouteDeps = {
  WORKSHOP_ID: string | undefined;
  supabaseAdmin: SupabaseClient | null;
};

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

function modulePayloadFromBody(body: Record<string, unknown>): WorkshopAbsModuleWriteInput {
  return {
    manufacturer: parseOptionalText(body.manufacturer),
    original_code: parseOptionalText(body.original_code ?? body.oem_code),
    application: parseOptionalText(body.application ?? body.vehicle_application),
    model: parseOptionalText(body.model),
    year_label: parseOptionalText(body.year_label ?? body.year),
    module_kind: parseKind(body.module_kind ?? body.module_type),
    condition: parseCondition(body.condition),
    unit_cost: parseMoney(body.unit_cost ?? body.cost, 0),
    unit_price: parseMoney(body.unit_price ?? body.sale_price, 0),
    supplier: parseOptionalText(body.supplier),
    location: parseOptionalText(body.location),
    notes: parseOptionalText(body.notes),
    status: body.status != null ? parseStatus(body.status) : 'disponivel',
    received_at: parseOptionalText(body.received_at ?? body.entry_date),
  };
}

function isDevMemoryActive(deps: AbsRouteDeps): boolean {
  return !(deps.supabaseAdmin && deps.WORKSHOP_ID);
}

export function registerAbsModuleRoutes(app: Express, deps: AbsRouteDeps) {
  const { WORKSHOP_ID, supabaseAdmin } = deps;

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
      return res.json({ module: data });
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
        module_kind: payload.module_kind || 'completo',
        condition: payload.condition || 'usado',
        unit_cost: payload.unit_cost ?? 0,
        unit_price: payload.unit_price ?? 0,
        supplier: payload.supplier,
        location: payload.location,
        notes: payload.notes,
        status: payload.status || 'disponivel',
        received_at: payload.received_at || new Date().toISOString(),
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
          unit_cost: payload.unit_cost,
          unit_price: payload.unit_price,
          supplier: payload.supplier,
          location: payload.location,
          notes: payload.notes,
          status: payload.status,
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
      };

      if (isDevMemoryActive(deps)) {
        try {
          const result = applyDevAbsModuleMovement(payload);
          return res.status(201).json(result);
        } catch (e: any) {
          const msg = e?.message ?? 'Falha na movimentação.';
          const status = /não encontrado/i.test(msg)
            ? 404
            : /inválid|informe|não está|já está/i.test(msg)
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
}
