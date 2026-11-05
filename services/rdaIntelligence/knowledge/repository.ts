import type { SupabaseClient } from "@supabase/supabase-js";
import {
  citationKindForItem,
  isOfficialRetrievalEligible,
  normalizeKnowledgeKey,
} from "./rules.js";
import type {
  RdaKnowledgeAuditRow,
  RdaKnowledgeDto,
  RdaKnowledgeItemRow,
  RdaKnowledgeVersionRow,
} from "./types.js";

export function mapKnowledgeItem(
  row: RdaKnowledgeItemRow,
  extras?: { approvedContent?: string | null; pendingContent?: string | null }
): RdaKnowledgeDto {
  const approvedVersion = Number(row.approved_version || 0);
  const lifecycle = String(row.lifecycle || "draft");
  return {
    id: row.id,
    knowledgeKey: row.knowledge_key,
    title: row.title,
    category: row.category,
    visibility: row.visibility,
    lifecycle,
    currentVersion: Number(row.current_version || 0),
    approvedVersion,
    pendingVersion: row.pending_version == null ? null : Number(row.pending_version),
    approvedAt: row.approved_at,
    retiredAt: row.retired_at,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
    approvedContent: extras?.approvedContent ?? null,
    pendingContent: extras?.pendingContent ?? null,
    citationKind: citationKindForItem({
      lifecycle,
      approvedVersion,
      category: row.category,
    }),
  };
}

async function loadVersionContent(
  supabase: SupabaseClient,
  workshopId: string,
  itemId: string,
  versionNumber: number | null | undefined
): Promise<string | null> {
  if (versionNumber == null || versionNumber <= 0) return null;
  const { data } = await supabase
    .from("rda_knowledge_versions")
    .select("content")
    .eq("workshop_id", workshopId)
    .eq("knowledge_item_id", itemId)
    .eq("version_number", versionNumber)
    .maybeSingle();
  return data?.content != null ? String(data.content) : null;
}

export async function listKnowledgeItems(
  supabase: SupabaseClient,
  workshopId: string,
  opts?: {
    lifecycle?: string | string[];
    category?: string;
    q?: string;
    limit?: number;
    includeContent?: boolean;
  }
): Promise<RdaKnowledgeDto[]> {
  const limit = Math.min(Math.max(opts?.limit ?? 80, 1), 200);
  let query = supabase
    .from("rda_knowledge_items")
    .select("*")
    .eq("workshop_id", workshopId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (opts?.lifecycle) {
    const ls = Array.isArray(opts.lifecycle) ? opts.lifecycle : [opts.lifecycle];
    query = query.in("lifecycle", ls);
  }
  if (opts?.category) query = query.eq("category", opts.category);
  if (opts?.q && opts.q.trim()) {
    const q = `%${opts.q.trim()}%`;
    query = query.or(`title.ilike.${q},knowledge_key.ilike.${q}`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data || []) as RdaKnowledgeItemRow[];
  const out: RdaKnowledgeDto[] = [];
  for (const row of rows) {
    if (!opts?.includeContent) {
      out.push(mapKnowledgeItem(row));
      continue;
    }
    const [approvedContent, pendingContent] = await Promise.all([
      loadVersionContent(supabase, workshopId, row.id, row.approved_version),
      loadVersionContent(supabase, workshopId, row.id, row.pending_version),
    ]);
    out.push(mapKnowledgeItem(row, { approvedContent, pendingContent }));
  }
  return out;
}

export async function getKnowledgeItemDetail(
  supabase: SupabaseClient,
  workshopId: string,
  itemId: string
): Promise<{
  item: RdaKnowledgeDto;
  versions: RdaKnowledgeVersionRow[];
  audit: RdaKnowledgeAuditRow[];
} | null> {
  const { data: row, error } = await supabase
    .from("rda_knowledge_items")
    .select("*")
    .eq("workshop_id", workshopId)
    .eq("id", itemId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return null;
  const itemRow = row as RdaKnowledgeItemRow;
  const [approvedContent, pendingContent, versionsRes, auditRes] = await Promise.all([
    loadVersionContent(supabase, workshopId, itemRow.id, itemRow.approved_version),
    loadVersionContent(supabase, workshopId, itemRow.id, itemRow.pending_version),
    supabase
      .from("rda_knowledge_versions")
      .select("*")
      .eq("workshop_id", workshopId)
      .eq("knowledge_item_id", itemId)
      .order("version_number", { ascending: false }),
    supabase
      .from("rda_knowledge_audit")
      .select("*")
      .eq("workshop_id", workshopId)
      .eq("knowledge_item_id", itemId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (versionsRes.error) throw new Error(versionsRes.error.message);
  if (auditRes.error) throw new Error(auditRes.error.message);
  return {
    item: mapKnowledgeItem(itemRow, { approvedContent, pendingContent }),
    versions: (versionsRes.data || []) as RdaKnowledgeVersionRow[],
    audit: (auditRes.data || []) as RdaKnowledgeAuditRow[],
  };
}

/**
 * Recuperação contextual: somente conteúdos oficiais (approved_version).
 * Conteúdo tratado como DADO — nunca instrução privilegiada.
 * `allowedVisibilities` é OBRIGATÓRIO (política por ator).
 */
export async function retrieveApprovedKnowledge(
  supabase: SupabaseClient,
  workshopId: string,
  queryText: string,
  opts: { limit?: number; allowedVisibilities: string[] }
): Promise<
  Array<{
    knowledgeKey: string;
    title: string;
    category: string;
    version: number;
    content: string;
    citationKind: string;
    itemId: string;
    visibility: string;
  }>
> {
  const allowed = (opts.allowedVisibilities || []).filter(Boolean);
  if (!allowed.length) {
    throw new Error("allowedVisibilities é obrigatório para recuperação de memória.");
  }
  const limit = Math.min(Math.max(opts?.limit ?? 8, 1), 20);
  const { data, error } = await supabase
    .from("rda_knowledge_items")
    .select("*")
    .eq("workshop_id", workshopId)
    .gt("approved_version", 0)
    .in("lifecycle", ["approved", "pending_approval"])
    .in("visibility", allowed)
    .order("updated_at", { ascending: false })
    .limit(80);
  if (error) throw new Error(error.message);

  const q = String(queryText || "").toLowerCase();
  const tokens = q
    .split(/[^a-z0-9à-ü]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length > 2);
  const scored: Array<{
    row: RdaKnowledgeItemRow;
    score: number;
  }> = [];

  for (const raw of data || []) {
    const row = raw as RdaKnowledgeItemRow;
    if (
      !isOfficialRetrievalEligible({
        lifecycle: row.lifecycle,
        approvedVersion: Number(row.approved_version || 0),
      })
    ) {
      continue;
    }
    if (!allowed.includes(row.visibility)) {
      continue;
    }
    const hay = `${row.title} ${row.knowledge_key} ${row.category}`.toLowerCase();
    let score = 0;
    for (const t of tokens) {
      if (hay.includes(t)) score += 2;
    }
    if (!tokens.length) score = 1;
    if (score > 0) scored.push({ row, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, limit);
  const results: Array<{
    knowledgeKey: string;
    title: string;
    category: string;
    version: number;
    content: string;
    citationKind: string;
    itemId: string;
    visibility: string;
  }> = [];

  for (const { row } of top) {
    const content = await loadVersionContent(
      supabase,
      workshopId,
      row.id,
      row.approved_version
    );
    if (!content) continue;
    // Refinar score com conteúdo
    let contentHit = false;
    for (const t of tokens) {
      if (content.toLowerCase().includes(t)) {
        contentHit = true;
        break;
      }
    }
    if (tokens.length && !contentHit && scored.find((s) => s.row.id === row.id)!.score < 2) {
      continue;
    }
    results.push({
      knowledgeKey: row.knowledge_key,
      title: row.title,
      category: row.category,
      version: Number(row.approved_version),
      content,
      citationKind: citationKindForItem({
        lifecycle: row.lifecycle,
        approvedVersion: Number(row.approved_version),
        category: row.category,
      }),
      itemId: row.id,
      visibility: row.visibility,
    });
  }
  return results;
}

export async function callKnowledgeRpc(
  supabase: SupabaseClient,
  fn:
    | "rda_knowledge_propose"
    | "rda_knowledge_approve"
    | "rda_knowledge_retire"
    | "rda_knowledge_restore"
    | "rda_knowledge_reject_pending"
    | "rda_knowledge_purge",
  params: Record<string, unknown>
): Promise<{ data: Record<string, unknown> | null; error: string | null; missingFn: boolean }> {
  const { data, error } = await supabase.rpc(fn, params);
  if (error) {
    const msg = error.message || String(error);
    const missingFn = /could not find|does not exist|function/i.test(msg);
    return { data: null, error: msg, missingFn };
  }
  if (data && typeof data === "object") {
    return { data: data as Record<string, unknown>, error: null, missingFn: false };
  }
  return { data: null, error: "RPC sem resposta", missingFn: false };
}

export function suggestKnowledgeKeyFromTitle(title: string): string {
  const base = normalizeKnowledgeKey(title);
  return base || `conhecimento_${Date.now().toString(36)}`;
}
