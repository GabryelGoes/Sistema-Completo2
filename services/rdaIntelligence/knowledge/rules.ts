/**
 * Regras puras da memória permanente (testáveis sem banco).
 */
import type {
  RdaKnowledgeCategory,
  RdaKnowledgeCitationKind,
  RdaKnowledgeLifecycle,
  RdaKnowledgeVisibility,
} from "./types.js";
import {
  RDA_KNOWLEDGE_CATEGORIES,
  RDA_KNOWLEDGE_LIFECYCLES,
  RDA_KNOWLEDGE_VISIBILITIES,
} from "./types.js";

export function isRdaKnowledgeCategory(v: unknown): v is RdaKnowledgeCategory {
  return typeof v === "string" && (RDA_KNOWLEDGE_CATEGORIES as readonly string[]).includes(v);
}

export function isRdaKnowledgeLifecycle(v: unknown): v is RdaKnowledgeLifecycle {
  return typeof v === "string" && (RDA_KNOWLEDGE_LIFECYCLES as readonly string[]).includes(v);
}

export function isRdaKnowledgeVisibility(v: unknown): v is RdaKnowledgeVisibility {
  return typeof v === "string" && (RDA_KNOWLEDGE_VISIBILITIES as readonly string[]).includes(v);
}

export function normalizeKnowledgeKey(raw: string): string {
  return String(raw || "")
    .trim()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 120);
}

/** Só versão aprovada vigente entra como regra oficial. */
export function isOfficialRetrievalEligible(item: {
  lifecycle: string;
  approvedVersion: number;
}): boolean {
  if (item.approvedVersion <= 0) return false;
  if (item.lifecycle === "retired" || item.lifecycle === "draft") return false;
  // approved OU pending_approval (revisão em curso) — a oficial continua sendo approved_version
  return item.lifecycle === "approved" || item.lifecycle === "pending_approval";
}

export function citationKindForItem(item: {
  lifecycle: string;
  approvedVersion: number;
  category?: string;
}): RdaKnowledgeCitationKind {
  if (item.lifecycle === "pending_approval" && item.approvedVersion <= 0) {
    return "pending_approval";
  }
  if (!isOfficialRetrievalEligible(item)) {
    if (item.lifecycle === "retired") return "historical";
    return "pending_approval";
  }
  if (item.category === "technical_validated" || item.category === "procedure_technical") {
    return "validated_technical";
  }
  return "official_rule";
}

/**
 * Após approve: approved = pending anterior; pending limpo.
 * Simula efeito no cabeçalho (teste de versionamento).
 */
export function applyApproveToHeader(item: {
  approvedVersion: number;
  pendingVersion: number | null;
  lifecycle: string;
}): { ok: true; approvedVersion: number; pendingVersion: null; lifecycle: "approved" } | { ok: false; code: string } {
  if (item.pendingVersion == null || item.pendingVersion <= 0) {
    return { ok: false, code: "RDA_KNOWLEDGE_NO_PENDING" };
  }
  return {
    ok: true,
    approvedVersion: item.pendingVersion,
    pendingVersion: null,
    lifecycle: "approved",
  };
}

/**
 * Propose sobre item existente: não pode haver pending; tip sobe; approved permanece.
 */
export function applyProposeRevisionToHeader(item: {
  currentVersion: number;
  approvedVersion: number;
  pendingVersion: number | null;
  lifecycle: string;
}): { ok: true; currentVersion: number; pendingVersion: number; lifecycle: "pending_approval"; approvedVersion: number } | { ok: false; code: string } {
  if (item.pendingVersion != null) {
    return { ok: false, code: "RDA_KNOWLEDGE_PENDING_EXISTS" };
  }
  if (item.lifecycle === "retired") {
    return { ok: false, code: "RDA_KNOWLEDGE_RETIRED" };
  }
  const next = Math.max(0, item.currentVersion) + 1;
  return {
    ok: true,
    currentVersion: next,
    pendingVersion: next,
    lifecycle: "pending_approval",
    approvedVersion: item.approvedVersion,
  };
}

/** Optimistic lock: updated_at esperado deve bater. */
export function concurrencyAllowsUpdate(
  actualUpdatedAt: string | null | undefined,
  expectedUpdatedAt: string | null | undefined
): boolean {
  if (expectedUpdatedAt == null || expectedUpdatedAt === "") return true;
  return String(actualUpdatedAt || "") === String(expectedUpdatedAt);
}

/**
 * Detecta conflitos entre conhecimentos oficiais recuperados
 * (mesma knowledge_key não ocorre; conflitos = regras mutuamente exclusivas no texto).
 */
export function findKnowledgeConflicts(
  items: Array<{ knowledgeKey: string; title: string; content: string }>
): Array<{ a: string; b: string; reason: string }> {
  const conflicts: Array<{ a: string; b: string; reason: string }> = [];
  // Heurística leve: dois itens com a mesma chave normalizada de título “sempre/nunca” opostos
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      const aLower = a.content.toLowerCase();
      const bLower = b.content.toLowerCase();
      const aNever = /\bnunca\b/.test(aLower) || /\bproibido\b/.test(aLower);
      const bAlways = /\bsempre\b/.test(bLower) || /\bobrigat[oó]rio\b/.test(bLower);
      const bNever = /\bnunca\b/.test(bLower) || /\bproibido\b/.test(bLower);
      const aAlways = /\bsempre\b/.test(aLower) || /\bobrigat[oó]rio\b/.test(aLower);
      if ((aNever && bAlways) || (bNever && aAlways)) {
        // Só sinaliza se parecerem sobre o mesmo tema (overlap de tokens significativos)
        const tokensA = new Set(
          aLower
            .split(/[^a-z0-9à-ü]+/i)
            .filter((t) => t.length > 4)
        );
        let overlap = 0;
        for (const t of bLower.split(/[^a-z0-9à-ü]+/i)) {
          if (t.length > 4 && tokensA.has(t)) overlap += 1;
        }
        if (overlap >= 2) {
          conflicts.push({
            a: a.knowledgeKey,
            b: b.knowledgeKey,
            reason: "Possível inconsistência (sempre/nunca) entre conhecimentos oficiais.",
          });
        }
      }
    }
  }
  return conflicts;
}

export function categoryLabel(category: string): string {
  switch (category) {
    case "procedure_technical":
      return "Procedimento técnico";
    case "operational_rule":
      return "Regra operacional";
    case "quality_standard":
      return "Padrão de qualidade";
    case "managerial_guidance":
      return "Orientação gerencial";
    case "technical_validated":
      return "Conhecimento técnico validado";
    case "management_preference":
      return "Preferência da gestão";
    case "operational_learning":
      return "Aprendizado operacional";
    default:
      return category || "Conhecimento";
  }
}

export function lifecycleLabel(lifecycle: string): string {
  switch (lifecycle) {
    case "draft":
      return "Rascunho";
    case "pending_approval":
      return "Aguardando aprovação";
    case "approved":
      return "Aprovado";
    case "retired":
      return "Retirado de uso";
    default:
      return lifecycle;
  }
}

/**
 * Heurística: mensagem do usuário parece orientação permanente?
 * (o LLM também avalia; isto alimenta sugestão no backend).
 */
export function looksLikePermanentGuidance(message: string): boolean {
  const m = String(message || "").toLowerCase();
  if (m.length < 24) return false;
  return (
    /\bsempre\b/.test(m) ||
    /\bnunca\b/.test(m) ||
    /\bquero que\b/.test(m) ||
    /\bpassa a (ser|valer)\b/.test(m) ||
    /\bregra\b/.test(m) ||
    /\borienta(ç|c)[aã]o\b/.test(m) ||
    /\bprioridade\b/.test(m) ||
    /\bsinaliz(ar|e|ado)\b/.test(m)
  );
}
