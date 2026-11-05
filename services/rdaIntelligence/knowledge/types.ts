/** Categorias da memória operacional (derivados não duplicam tabelas operacionais). */
export const RDA_KNOWLEDGE_CATEGORIES = [
  "procedure_technical",
  "operational_rule",
  "quality_standard",
  "managerial_guidance",
  "technical_validated",
  "management_preference",
  "operational_learning",
] as const;
export type RdaKnowledgeCategory = (typeof RDA_KNOWLEDGE_CATEGORIES)[number];

export const RDA_KNOWLEDGE_VISIBILITIES = ["workshop", "management", "restricted"] as const;
export type RdaKnowledgeVisibility = (typeof RDA_KNOWLEDGE_VISIBILITIES)[number];

export const RDA_KNOWLEDGE_LIFECYCLES = [
  "draft",
  "pending_approval",
  "approved",
  "retired",
] as const;
export type RdaKnowledgeLifecycle = (typeof RDA_KNOWLEDGE_LIFECYCLES)[number];

/** Classificação ao citar memória nas respostas do assistente. */
export const RDA_KNOWLEDGE_CITATION_KINDS = [
  "official_rule",
  "validated_technical",
  "historical",
  "ai_hypothesis",
  "pending_approval",
] as const;
export type RdaKnowledgeCitationKind = (typeof RDA_KNOWLEDGE_CITATION_KINDS)[number];

export type RdaKnowledgeItemRow = {
  id: string;
  workshop_id: string;
  knowledge_key: string;
  title: string;
  category: string;
  visibility: string;
  lifecycle: string;
  current_version: number;
  approved_version: number;
  pending_version: number | null;
  created_by_user_id: string | null;
  approved_by_user_id: string | null;
  approved_at: string | null;
  retired_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RdaKnowledgeVersionRow = {
  id: string;
  workshop_id: string;
  knowledge_item_id: string;
  version_number: number;
  content: string;
  structured_data: Record<string, unknown>;
  provenance: Record<string, unknown>;
  change_reason: string | null;
  proposed_by_user_id: string | null;
  proposed_by_label: string | null;
  created_at: string;
};

export type RdaKnowledgeAuditRow = {
  id: string;
  workshop_id: string;
  knowledge_item_id: string | null;
  event_type: string;
  prior_version: number | null;
  new_version: number | null;
  actor_user_id: string | null;
  actor_label: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type RdaKnowledgeDto = {
  id: string;
  knowledgeKey: string;
  title: string;
  category: string;
  visibility: string;
  lifecycle: RdaKnowledgeLifecycle | string;
  currentVersion: number;
  approvedVersion: number;
  pendingVersion: number | null;
  approvedAt: string | null;
  retiredAt: string | null;
  updatedAt: string;
  createdAt: string;
  approvedContent?: string | null;
  pendingContent?: string | null;
  citationKind?: RdaKnowledgeCitationKind;
};

/** Refs futuras a dados operacionais (sem duplicar o banco). */
export type RdaKnowledgeSourceRef = {
  kind:
    | "work_session"
    | "service_order"
    | "stock_part"
    | "pause_reason"
    | "technician"
    | "conversation"
    | "other";
  id?: string;
  label?: string;
};
