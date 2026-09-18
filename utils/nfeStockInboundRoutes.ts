/**
 * Rotas de Entrada de estoque por NF-e (chave 44 dígitos → XML → conferência → estoque).
 */
import type { Express, Request, Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateNfeAccessKey } from "./nfeAccessKey.js";
import { parseNfeXml } from "./nfeXmlParse.js";
import {
  buildNfeLookupItems,
  nfeEntryPublicPayload,
  type NfeMatchPartSnapshot,
} from "../services/nfe/nfeInboundService.js";
import {
  loadNfeSefazConfig,
  nfeSefazClient,
  NfeSefazNotConfiguredError,
  NfeSefazNotImplementedError,
} from "../services/nfe/index.js";

type RegisterOpts = {
  supabaseAdmin: SupabaseClient | null;
  workshopId: string | null;
  workshopPartSelect: () => string;
  ensureWorkshopPartBarcodeCapability: () => Promise<boolean | void>;
  stripUnsupportedWorkshopPartPatch: (patch: Record<string, unknown>) => Record<string, unknown>;
  respondWorkshopPart: (res: Response, row: Record<string, unknown>) => Promise<unknown> | unknown;
  parseWorkshopPartBody: (
    body: Record<string, unknown>,
    forCreate: boolean
  ) => { patch: Record<string, unknown>; errors: string[] };
};

function sefazConfigPayload() {
  const config = loadNfeSefazConfig();
  const missing = nfeSefazClient.setupChecklist();
  return {
    certificate_ready: nfeSefazClient.isCertificateReady(),
    environment: config.environment,
    uf: config.uf,
    allow_xml_body_import: config.allowXmlBodyImport,
    missing_env: missing,
    instructions: [
      "Coloque o certificado A1 (.pfx) apenas no servidor (nunca no PWA).",
      "Defina NFE_CERT_PFX_PATH (ou NFE_CERT_PFX_BASE64) e NFE_CERT_PASSWORD.",
      "Defina NFE_UF (ex.: SP) e NFE_CNPJ (CNPJ da oficina, 14 dígitos).",
      "Defina NFE_SEFAZ_ENVIRONMENT=homologacao ou producao.",
      "Enquanto o DistDFe não estiver ativo, use NFE_ALLOW_XML_BODY_IMPORT=true e envie o XML oficial no lookup.",
    ],
  };
}

async function loadPartsForMatch(
  supabaseAdmin: SupabaseClient,
  workshopId: string,
  workshopPartSelect: () => string
): Promise<NfeMatchPartSnapshot[]> {
  const { data, error } = await supabaseAdmin
    .from("workshop_parts")
    .select(workshopPartSelect())
    .eq("workshop_id", workshopId)
    .order("name", { ascending: true })
    .limit(5000);
  if (error) throw new Error(error.message);
  return ((data || []) as unknown as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    name: String(row.name ?? ""),
    barcode: (row.barcode as string | null) ?? null,
    original_code: (row.original_code as string | null) ?? null,
    numeric_code: (row.numeric_code as string | null) ?? null,
    stock_qty: row.stock_qty != null ? Number(row.stock_qty) : 0,
    unit_of_measure: (row.unit_of_measure as string | null) ?? "UN",
    unit_cost: row.unit_cost != null ? Number(row.unit_cost) : 0,
    ncm_code: (row.ncm_code as string | null) ?? null,
  }));
}

async function resolveNfeXml(accessKey: string, xmlBody: string | null): Promise<{ xml: string; source: string }> {
  const config = loadNfeSefazConfig();
  const trimmedXml = xmlBody?.trim() || "";

  if (trimmedXml) {
    if (!config.allowXmlBodyImport) {
      throw Object.assign(new Error("Importação de XML no body está desabilitada (NFE_ALLOW_XML_BODY_IMPORT)."), {
        status: 403,
        code: "NFE_XML_BODY_DISABLED",
      });
    }
    return { xml: trimmedXml, source: "xml_body" };
  }

  try {
    const result = await nfeSefazClient.fetchXmlByAccessKey(accessKey);
    return { xml: result.xml, source: result.source };
  } catch (err) {
    if (err instanceof NfeSefazNotConfiguredError) {
      throw Object.assign(err, {
        status: 503,
        sefaz: sefazConfigPayload(),
        hint:
          "Envie o campo xml com o XML oficial da NF-e (portal SEFAZ) enquanto o certificado não estiver operacional, " +
          "ou configure as variáveis NFE_* no servidor.",
      });
    }
    if (err instanceof NfeSefazNotImplementedError) {
      throw Object.assign(err, {
        status: 503,
        sefaz: sefazConfigPayload(),
        hint:
          "Certificado detectado, mas DistDFe ainda não está ativo. " +
          "Envie o XML oficial no body (NFE_ALLOW_XML_BODY_IMPORT=true) ou complete o cliente SEFAZ.",
      });
    }
    throw err;
  }
}

export function registerNfeStockInboundRoutes(app: Express, opts: RegisterOpts) {
  const {
    supabaseAdmin,
    workshopId,
    workshopPartSelect,
    ensureWorkshopPartBarcodeCapability,
    stripUnsupportedWorkshopPartPatch,
    respondWorkshopPart,
    parseWorkshopPartBody,
  } = opts;

  app.get("/api/workshop-parts/nfe/status", (_req, res) => {
    return res.json({ ok: true, sefaz: sefazConfigPayload() });
  });

  app.get("/api/workshop-parts/nfe/by-access-key/:accessKey", async (req, res) => {
    try {
      if (!supabaseAdmin || !workshopId) {
        return res.status(500).json({ error: "Supabase ou WORKSHOP_ID não configurados." });
      }
      const validated = validateNfeAccessKey(String(req.params.accessKey || ""));
      if (validated.ok === false) return res.status(400).json({ error: validated.error });

      const { data, error } = await supabaseAdmin
        .from("workshop_nfe_stock_entries")
        .select(
          "id, access_key, nfe_number, nfe_series, issued_at, supplier_cnpj, supplier_name, total_amount, status, confirmed_at, confirmed_by_name, created_at"
        )
        .eq("workshop_id", workshopId)
        .eq("access_key", validated.accessKey)
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) {
        if (/workshop_nfe_stock_entries/i.test(error.message || "")) {
          return res.status(500).json({
            error:
              "Tabelas de NF-e não encontradas. Aplique a migration workshop_nfe_stock_inbound.",
          });
        }
        throw new Error(error.message);
      }

      const confirmed = (data || []).find((e) => e.status === "confirmed") || null;
      return res.json({
        access_key: validated.accessKey,
        already_imported: !!confirmed,
        confirmed_entry: confirmed,
        entries: data || [],
      });
    } catch (err: any) {
      console.error("[API] Erro em GET /api/workshop-parts/nfe/by-access-key:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.post("/api/workshop-parts/nfe/lookup", async (req, res) => {
    try {
      if (!supabaseAdmin || !workshopId) {
        return res.status(500).json({ error: "Supabase ou WORKSHOP_ID não configurados." });
      }

      const body = (req.body || {}) as Record<string, unknown>;
      const validated = validateNfeAccessKey(String(body.access_key ?? body.chave ?? ""));
      if (validated.ok === false) return res.status(400).json({ error: validated.error });

      const xmlFromBody =
        typeof body.xml === "string" && body.xml.trim() ? String(body.xml) : null;

      // Duplicidade: NF já confirmada
      const { data: existingRows, error: existingErr } = await supabaseAdmin
        .from("workshop_nfe_stock_entries")
        .select(
          "id, access_key, nfe_number, nfe_series, issued_at, supplier_cnpj, supplier_name, total_amount, status, confirmed_at, confirmed_by_name, created_at"
        )
        .eq("workshop_id", workshopId)
        .eq("access_key", validated.accessKey)
        .order("created_at", { ascending: false });

      if (existingErr) {
        if (/workshop_nfe_stock_entries/i.test(existingErr.message || "")) {
          return res.status(500).json({
            error:
              "Tabelas de NF-e não encontradas. Aplique a migration workshop_nfe_stock_inbound.",
          });
        }
        throw new Error(existingErr.message);
      }

      const confirmed = (existingRows || []).find((e) => e.status === "confirmed");
      if (confirmed) {
        return res.status(409).json({
          error: "Esta NF-e já foi lançada no estoque.",
          code: "NFE_ALREADY_IMPORTED",
          entry: confirmed,
        });
      }

      let xmlResult: { xml: string; source: string };
      try {
        xmlResult = await resolveNfeXml(validated.accessKey, xmlFromBody);
      } catch (e: any) {
        const status = Number(e?.status) || 500;
        return res.status(status).json({
          error: e?.message || "Falha ao obter XML da NF-e.",
          code: e?.code || "NFE_XML_FETCH_FAILED",
          sefaz: e?.sefaz || sefazConfigPayload(),
          hint: e?.hint,
        });
      }

      const parsed = parseNfeXml(xmlResult.xml);
      if (parsed.accessKey !== validated.accessKey) {
        return res.status(400).json({
          error: `A chave do XML (${parsed.accessKey}) não confere com a chave lida (${validated.accessKey}).`,
        });
      }

      const draftExisting = (existingRows || []).find((e) => e.status === "draft");

      const entryPayload = {
        workshop_id: workshopId,
        access_key: validated.accessKey,
        nfe_number: parsed.number,
        nfe_series: parsed.series,
        issued_at: parsed.issuedAt,
        supplier_cnpj: parsed.supplierCnpj,
        supplier_name: parsed.supplierName,
        total_amount: parsed.totalAmount,
        xml_content: xmlResult.xml,
        status: "draft",
        updated_at: new Date().toISOString(),
      };

      let entryId: string;
      if (draftExisting?.id) {
        const { data: updated, error: updErr } = await supabaseAdmin
          .from("workshop_nfe_stock_entries")
          .update(entryPayload)
          .eq("id", draftExisting.id)
          .eq("workshop_id", workshopId)
          .select(
            "id, access_key, nfe_number, nfe_series, issued_at, supplier_cnpj, supplier_name, total_amount, status, confirmed_at, confirmed_by_name, created_at"
          )
          .single();
        if (updErr) throw new Error(updErr.message);
        entryId = String(updated.id);
        await supabaseAdmin
          .from("workshop_nfe_stock_entry_items")
          .delete()
          .eq("entry_id", entryId)
          .eq("workshop_id", workshopId);
      } else {
        const { data: inserted, error: insErr } = await supabaseAdmin
          .from("workshop_nfe_stock_entries")
          .insert(entryPayload)
          .select(
            "id, access_key, nfe_number, nfe_series, issued_at, supplier_cnpj, supplier_name, total_amount, status, confirmed_at, confirmed_by_name, created_at"
          )
          .single();
        if (insErr) throw new Error(insErr.message);
        entryId = String(inserted.id);
      }

      const itemRows = parsed.products.map((p) => ({
        entry_id: entryId,
        workshop_id: workshopId,
        line_number: p.lineNumber,
        product_code: p.productCode,
        ean: p.ean,
        description: p.description,
        ncm: p.ncm,
        unit: p.unit,
        quantity: p.quantity,
        unit_price: p.unitPrice,
        total_price: p.totalPrice,
        selected: true,
        part_id: null as string | null,
      }));

      // Auto-match EAN/código antes de persistir
      await ensureWorkshopPartBarcodeCapability();
      const parts = await loadPartsForMatch(supabaseAdmin, workshopId, workshopPartSelect);
      const matchedPreview = buildNfeLookupItems(parsed, parts);
      for (const row of itemRows) {
        const m = matchedPreview.find((x) => x.line_number === row.line_number);
        if (m?.matched_part_id) row.part_id = m.matched_part_id;
      }

      const { data: insertedItems, error: itemsErr } = await supabaseAdmin
        .from("workshop_nfe_stock_entry_items")
        .insert(itemRows)
        .select("id, line_number, part_id, selected");
      if (itemsErr) throw new Error(itemsErr.message);

      const { data: entryRow, error: entryReadErr } = await supabaseAdmin
        .from("workshop_nfe_stock_entries")
        .select(
          "id, access_key, nfe_number, nfe_series, issued_at, supplier_cnpj, supplier_name, total_amount, status, confirmed_at, confirmed_by_name, created_at"
        )
        .eq("id", entryId)
        .single();
      if (entryReadErr) throw new Error(entryReadErr.message);

      const items = buildNfeLookupItems(
        parsed,
        parts,
        (insertedItems || []) as Array<{
          id: string;
          line_number: number;
          part_id?: string | null;
          selected?: boolean | null;
        }>
      );

      return res.json({
        source: xmlResult.source,
        sefaz: sefazConfigPayload(),
        entry: nfeEntryPublicPayload(entryRow as Record<string, unknown>, items),
      });
    } catch (err: any) {
      console.error("[API] Erro em POST /api/workshop-parts/nfe/lookup:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.post("/api/workshop-parts/nfe/:entryId/map-item", async (req, res) => {
    try {
      if (!supabaseAdmin || !workshopId) {
        return res.status(500).json({ error: "Supabase ou WORKSHOP_ID não configurados." });
      }
      const entryId = String(req.params.entryId || "").trim();
      const body = (req.body || {}) as Record<string, unknown>;
      const itemId = String(body.item_id ?? "").trim();
      const partId = body.part_id == null || body.part_id === "" ? null : String(body.part_id).trim();
      const selected =
        body.selected === undefined ? undefined : Boolean(body.selected);

      if (!entryId || !itemId) {
        return res.status(400).json({ error: "Informe entryId e item_id." });
      }

      const { data: entry, error: entryErr } = await supabaseAdmin
        .from("workshop_nfe_stock_entries")
        .select("id, status")
        .eq("id", entryId)
        .eq("workshop_id", workshopId)
        .maybeSingle();
      if (entryErr) throw new Error(entryErr.message);
      if (!entry) return res.status(404).json({ error: "NF-e não encontrada." });
      if (entry.status !== "draft") {
        return res.status(409).json({ error: "Só é possível mapear itens em rascunho." });
      }

      if (partId) {
        const { data: part, error: partErr } = await supabaseAdmin
          .from("workshop_parts")
          .select("id")
          .eq("id", partId)
          .eq("workshop_id", workshopId)
          .maybeSingle();
        if (partErr) throw new Error(partErr.message);
        if (!part) return res.status(404).json({ error: "Produto do estoque não encontrado." });
      }

      const patch: Record<string, unknown> = {};
      if (partId !== undefined) patch.part_id = partId;
      if (selected !== undefined) patch.selected = selected;

      const { data: item, error: itemErr } = await supabaseAdmin
        .from("workshop_nfe_stock_entry_items")
        .update(patch)
        .eq("id", itemId)
        .eq("entry_id", entryId)
        .eq("workshop_id", workshopId)
        .select("id, line_number, part_id, selected, description, ean, product_code, quantity, unit_price, total_price")
        .single();
      if (itemErr) throw new Error(itemErr.message);

      return res.json({ item });
    } catch (err: any) {
      console.error("[API] Erro em POST /api/workshop-parts/nfe/:entryId/map-item:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.post("/api/workshop-parts/nfe/:entryId/create-part", async (req, res) => {
    try {
      if (!supabaseAdmin || !workshopId) {
        return res.status(500).json({ error: "Supabase ou WORKSHOP_ID não configurados." });
      }
      const entryId = String(req.params.entryId || "").trim();
      const body = (req.body || {}) as Record<string, unknown>;
      const itemId = String(body.item_id ?? "").trim();
      if (!entryId || !itemId) {
        return res.status(400).json({ error: "Informe entryId e item_id." });
      }

      const { data: entry, error: entryErr } = await supabaseAdmin
        .from("workshop_nfe_stock_entries")
        .select("id, status")
        .eq("id", entryId)
        .eq("workshop_id", workshopId)
        .maybeSingle();
      if (entryErr) throw new Error(entryErr.message);
      if (!entry) return res.status(404).json({ error: "NF-e não encontrada." });
      if (entry.status !== "draft") {
        return res.status(409).json({ error: "Só é possível cadastrar produtos em rascunho." });
      }

      const { data: item, error: itemErr } = await supabaseAdmin
        .from("workshop_nfe_stock_entry_items")
        .select("*")
        .eq("id", itemId)
        .eq("entry_id", entryId)
        .eq("workshop_id", workshopId)
        .maybeSingle();
      if (itemErr) throw new Error(itemErr.message);
      if (!item) return res.status(404).json({ error: "Item da NF-e não encontrado." });

      const nameOverride =
        typeof body.name === "string" && body.name.trim() ? body.name.trim() : null;
      const unitPriceOverride =
        body.unit_price !== undefined && body.unit_price !== null && body.unit_price !== ""
          ? Number(body.unit_price)
          : Number(item.unit_price ?? 0);

      const createBody: Record<string, unknown> = {
        name: nameOverride || item.description || `Produto NF ${item.line_number}`,
        barcode: item.ean || null,
        original_code: item.product_code || null,
        ncm_code: item.ncm || null,
        unit_of_measure: item.unit || "UN",
        unit_cost: Number(item.unit_price ?? 0),
        unit_price: Number.isFinite(unitPriceOverride) ? Math.max(0, unitPriceOverride) : 0,
        stock_qty: 0,
      };

      const { patch, errors } = parseWorkshopPartBody(createBody, true);
      if (errors.length) return res.status(400).json({ error: errors[0] });

      await ensureWorkshopPartBarcodeCapability();
      const safePatch = stripUnsupportedWorkshopPartPatch(patch);

      const { data: partRaw, error: partErr } = await supabaseAdmin
        .from("workshop_parts")
        .insert({ workshop_id: workshopId, sort_order: 0, stock_qty: 0, ...safePatch })
        .select(workshopPartSelect())
        .single();
      if (partErr) {
        if (partErr.code === "23505") {
          return res.status(409).json({
            error: "Já existe um produto com este nome ou código de barras.",
          });
        }
        throw new Error(partErr.message);
      }
      const part = partRaw as unknown as Record<string, unknown>;

      const { error: linkErr } = await supabaseAdmin
        .from("workshop_nfe_stock_entry_items")
        .update({ part_id: part.id, selected: true })
        .eq("id", itemId)
        .eq("entry_id", entryId)
        .eq("workshop_id", workshopId);
      if (linkErr) throw new Error(linkErr.message);

      return await respondWorkshopPart(res.status(201), {
        ...part,
        nfe_item_id: itemId,
      });
    } catch (err: any) {
      console.error("[API] Erro em POST /api/workshop-parts/nfe/:entryId/create-part:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.post("/api/workshop-parts/nfe/:entryId/confirm", async (req, res) => {
    try {
      if (!supabaseAdmin || !workshopId) {
        return res.status(500).json({ error: "Supabase ou WORKSHOP_ID não configurados." });
      }
      const entryId = String(req.params.entryId || "").trim();
      if (!entryId) return res.status(400).json({ error: "entryId ausente." });

      const body = (req.body || {}) as Record<string, unknown>;
      const recordedByName =
        typeof body.recorded_by_name === "string" && body.recorded_by_name.trim()
          ? body.recorded_by_name.trim()
          : null;

      const rawItems = Array.isArray(body.items) ? body.items : null;
      if (!rawItems || rawItems.length === 0) {
        return res.status(400).json({ error: "Informe a lista de itens para confirmação." });
      }

      // Revalida no banco: não confia só no frontend
      const { data: dbItems, error: dbItemsErr } = await supabaseAdmin
        .from("workshop_nfe_stock_entry_items")
        .select("id, part_id, selected, quantity, description")
        .eq("entry_id", entryId)
        .eq("workshop_id", workshopId);
      if (dbItemsErr) throw new Error(dbItemsErr.message);
      if (!dbItems?.length) {
        return res.status(404).json({ error: "Itens da NF-e não encontrados." });
      }

      const byId = new Map(dbItems.map((i) => [String(i.id), i]));
      const rpcItems: Array<{ item_id: string; part_id: string | null; selected: boolean }> = [];

      for (const raw of rawItems) {
        const row = raw as Record<string, unknown>;
        const itemId = String(row.item_id ?? "").trim();
        if (!itemId || !byId.has(itemId)) {
          return res.status(400).json({ error: `Item inválido: ${itemId || "(vazio)"}` });
        }
        const selected = row.selected === undefined ? true : Boolean(row.selected);
        const partId =
          row.part_id == null || row.part_id === ""
            ? byId.get(itemId)?.part_id ?? null
            : String(row.part_id).trim();
        if (selected && !partId) {
          const desc = byId.get(itemId)?.description || itemId;
          return res.status(400).json({
            error: `Produto sem vínculo no estoque: ${desc}`,
          });
        }
        rpcItems.push({
          item_id: itemId,
          part_id: selected ? String(partId) : null,
          selected,
        });
      }

      const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc(
        "confirm_workshop_nfe_stock_inbound",
        {
          p_workshop_id: workshopId,
          p_entry_id: entryId,
          p_recorded_by_name: recordedByName,
          p_items: rpcItems,
        }
      );

      if (rpcError) {
        const msg = rpcError.message || "Falha ao confirmar entrada.";
        if (/já foi lançada/i.test(msg)) {
          return res.status(409).json({ error: msg, code: "NFE_ALREADY_IMPORTED" });
        }
        if (/confirm_workshop_nfe_stock_inbound/i.test(msg) || rpcError.code === "PGRST202") {
          return res.status(500).json({
            error:
              "Função de confirmação NF-e ausente. Aplique a migration workshop_nfe_stock_inbound.",
          });
        }
        const status = /não encontrad|inválid|Selecione|sem vínculo/i.test(msg) ? 400 : 500;
        return res.status(status).json({ error: msg });
      }

      const { data: entry, error: entryErr } = await supabaseAdmin
        .from("workshop_nfe_stock_entries")
        .select(
          "id, access_key, nfe_number, nfe_series, issued_at, supplier_cnpj, supplier_name, total_amount, status, confirmed_at, confirmed_by_name, created_at"
        )
        .eq("id", entryId)
        .single();
      if (entryErr) throw new Error(entryErr.message);

      return res.json({
        ok: true,
        entry,
        result: rpcData,
      });
    } catch (err: any) {
      console.error("[API] Erro em POST /api/workshop-parts/nfe/:entryId/confirm:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // silencia unused Request type if any
  void (null as unknown as Request);
}
