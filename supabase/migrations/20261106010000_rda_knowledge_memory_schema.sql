-- RDA Intelligence — Memória Permanente (schema de referência / greenfield).
-- Alinhado ao schema de produção + colunas de ops (approved/pending, pending_approval, purged).
-- CREATE IF NOT EXISTS — não recria em produção.
-- NÃO aplica automaticamente.

CREATE TABLE IF NOT EXISTS public.rda_knowledge_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  knowledge_key TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'operational_rule',
  visibility TEXT NOT NULL DEFAULT 'workshop'
    CHECK (visibility IN ('workshop', 'management', 'restricted')),
  lifecycle TEXT NOT NULL DEFAULT 'draft'
    CHECK (lifecycle IN ('draft', 'pending_approval', 'approved', 'retired', 'purged')),
  current_version INTEGER NOT NULL DEFAULT 0 CHECK (current_version >= 0),
  approved_version INTEGER NOT NULL DEFAULT 0 CHECK (approved_version >= 0),
  pending_version INTEGER CHECK (pending_version IS NULL OR pending_version > 0),
  created_by_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  approved_by_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_rda_knowledge_items_workshop_key UNIQUE (workshop_id, knowledge_key)
);

CREATE INDEX IF NOT EXISTS idx_rda_knowledge_items_workshop_lifecycle
  ON public.rda_knowledge_items (workshop_id, lifecycle, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.rda_knowledge_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  knowledge_item_id UUID NOT NULL REFERENCES public.rda_knowledge_items(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  content TEXT NOT NULL,
  structured_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  change_reason TEXT NOT NULL,
  proposed_by_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  proposed_by_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_rda_knowledge_versions_item_number UNIQUE (knowledge_item_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_rda_knowledge_versions_workshop_item
  ON public.rda_knowledge_versions (workshop_id, knowledge_item_id, version_number DESC);

CREATE TABLE IF NOT EXISTS public.rda_knowledge_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  knowledge_item_id UUID NOT NULL REFERENCES public.rda_knowledge_items(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'created',
      'version_proposed',
      'approved',
      'rejected',
      'retired',
      'restored',
      'purge_requested',
      'purged'
    )),
  prior_version INTEGER,
  new_version INTEGER,
  actor_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  actor_label TEXT,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rda_knowledge_audit_workshop
  ON public.rda_knowledge_audit (workshop_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.rda_knowledge_versions_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'rda_knowledge_versions é imutável (UPDATE/DELETE não permitido)';
END;
$$;

DROP TRIGGER IF EXISTS trg_rda_knowledge_versions_no_update ON public.rda_knowledge_versions;
CREATE TRIGGER trg_rda_knowledge_versions_no_update
  BEFORE UPDATE ON public.rda_knowledge_versions
  FOR EACH ROW EXECUTE FUNCTION public.rda_knowledge_versions_immutable();

DROP TRIGGER IF EXISTS trg_rda_knowledge_versions_no_delete ON public.rda_knowledge_versions;
CREATE TRIGGER trg_rda_knowledge_versions_no_delete
  BEFORE DELETE ON public.rda_knowledge_versions
  FOR EACH ROW EXECUTE FUNCTION public.rda_knowledge_versions_immutable();

CREATE OR REPLACE FUNCTION public.rda_knowledge_audit_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'rda_knowledge_audit é imutável (UPDATE/DELETE não permitido)';
END;
$$;

DROP TRIGGER IF EXISTS trg_rda_knowledge_audit_no_update ON public.rda_knowledge_audit;
CREATE TRIGGER trg_rda_knowledge_audit_no_update
  BEFORE UPDATE ON public.rda_knowledge_audit
  FOR EACH ROW EXECUTE FUNCTION public.rda_knowledge_audit_immutable();

DROP TRIGGER IF EXISTS trg_rda_knowledge_audit_no_delete ON public.rda_knowledge_audit;
CREATE TRIGGER trg_rda_knowledge_audit_no_delete
  BEFORE DELETE ON public.rda_knowledge_audit
  FOR EACH ROW EXECUTE FUNCTION public.rda_knowledge_audit_immutable();

ALTER TABLE public.rda_knowledge_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rda_knowledge_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rda_knowledge_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.rda_knowledge_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.rda_knowledge_versions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.rda_knowledge_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.rda_knowledge_items TO service_role;
GRANT SELECT, INSERT ON TABLE public.rda_knowledge_versions TO service_role;
GRANT SELECT, INSERT ON TABLE public.rda_knowledge_audit TO service_role;
