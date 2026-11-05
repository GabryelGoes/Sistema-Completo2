-- Schema INICIAL EXATO (auditoria produção) para homologação da memória RDA.
-- Sem approved_version/pending_version; lifecycle sem pending_approval;
-- versions.change_reason NOT NULL; audit.knowledge_item_id NOT NULL;
-- event_type CHECK restrito; triggers imutáveis em versions/audit.
-- Somente para banco de teste — não aplicar em produção.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE ROLE anon NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE authenticated NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE service_role NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.workshops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'homolog'
);

CREATE TABLE IF NOT EXISTS public.workshop_system_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID REFERENCES public.workshops(id) ON DELETE SET NULL
);

CREATE TABLE public.rda_knowledge_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  knowledge_key TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'operational_rule',
  visibility TEXT NOT NULL DEFAULT 'workshop'
    CHECK (visibility IN ('workshop', 'management', 'restricted')),
  lifecycle TEXT NOT NULL DEFAULT 'draft'
    CHECK (lifecycle IN ('draft', 'approved', 'retired')),
  current_version INTEGER NOT NULL DEFAULT 0 CHECK (current_version >= 0),
  created_by_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  approved_by_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_rda_knowledge_items_workshop_key UNIQUE (workshop_id, knowledge_key)
);

CREATE TABLE public.rda_knowledge_versions (
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

CREATE TABLE public.rda_knowledge_audit (
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

CREATE OR REPLACE FUNCTION public.rda_knowledge_versions_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'rda_knowledge_versions é imutável (UPDATE/DELETE não permitido)';
END;
$$;

CREATE TRIGGER trg_rda_knowledge_versions_no_update
  BEFORE UPDATE ON public.rda_knowledge_versions
  FOR EACH ROW EXECUTE FUNCTION public.rda_knowledge_versions_immutable();

CREATE TRIGGER trg_rda_knowledge_versions_no_delete
  BEFORE DELETE ON public.rda_knowledge_versions
  FOR EACH ROW EXECUTE FUNCTION public.rda_knowledge_versions_immutable();

CREATE OR REPLACE FUNCTION public.rda_knowledge_audit_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'rda_knowledge_audit é imutável (UPDATE/DELETE não permitido)';
END;
$$;

CREATE TRIGGER trg_rda_knowledge_audit_no_update
  BEFORE UPDATE ON public.rda_knowledge_audit
  FOR EACH ROW EXECUTE FUNCTION public.rda_knowledge_audit_immutable();

CREATE TRIGGER trg_rda_knowledge_audit_no_delete
  BEFORE DELETE ON public.rda_knowledge_audit
  FOR EACH ROW EXECUTE FUNCTION public.rda_knowledge_audit_immutable();

ALTER TABLE public.rda_knowledge_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rda_knowledge_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rda_knowledge_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.rda_knowledge_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.rda_knowledge_versions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.rda_knowledge_audit FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.rda_knowledge_items TO service_role;
GRANT SELECT, INSERT ON TABLE public.rda_knowledge_versions TO service_role;
GRANT SELECT, INSERT ON TABLE public.rda_knowledge_audit TO service_role;
