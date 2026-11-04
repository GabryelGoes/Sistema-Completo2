-- Radar de Qualidade — Fase 3: Revisão Semanal com RDA + memória profissional.
-- INCREMENTAL. NÃO aplicar em produção sem autorização.
-- Rascunhos NÃO viram avaliações definitivas sem aprovação humana.
-- Classificação: system_fact | leader_observation | ai_suggestion | unconfirmed.

-- ---------------------------------------------------------------------------
-- 1) Sessões de revisão gerencial (individual ou equipe)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workshop_quality_weekly_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'person'
    CHECK (scope IN ('person', 'team')),
  system_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  workshop_technician_id UUID REFERENCES public.workshop_technicians(id) ON DELETE SET NULL,
  person_name TEXT NOT NULL DEFAULT '',
  week_from DATE NOT NULL,
  week_to DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'draft_ready', 'approved', 'rejected', 'archived')),
  rda_conversation_id UUID,
  topics_covered JSONB NOT NULL DEFAULT '[]'::jsonb,
  incomplete_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  progress_pct INT NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  opened_by_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  opened_by_name TEXT NOT NULL DEFAULT '',
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quality_weekly_reviews_workshop
  ON public.workshop_quality_weekly_reviews (workshop_id, week_from DESC, status);

CREATE INDEX IF NOT EXISTS idx_quality_weekly_reviews_person_su
  ON public.workshop_quality_weekly_reviews (workshop_id, system_user_id, week_from DESC)
  WHERE system_user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) Observações classificadas (fatos vs percepções)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workshop_quality_review_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  review_id UUID NOT NULL REFERENCES public.workshop_quality_weekly_reviews(id) ON DELETE CASCADE,
  classification TEXT NOT NULL
    CHECK (classification IN (
      'system_fact',
      'leader_observation',
      'ai_suggestion',
      'unconfirmed'
    )),
  category TEXT NOT NULL DEFAULT 'geral',
  content TEXT NOT NULL DEFAULT '',
  source_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  created_by_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quality_review_obs_review
  ON public.workshop_quality_review_observations (review_id, created_at);

-- ---------------------------------------------------------------------------
-- 3) Rascunho do relatório semanal (aprovação humana obrigatória)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workshop_quality_weekly_review_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  review_id UUID NOT NULL REFERENCES public.workshop_quality_weekly_reviews(id) ON DELETE CASCADE,
  version INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'edited', 'approved', 'rejected')),
  week_summary TEXT NOT NULL DEFAULT '',
  strengths TEXT NOT NULL DEFAULT '',
  difficulties TEXT NOT NULL DEFAULT '',
  observed_skills TEXT NOT NULL DEFAULT '',
  evolution TEXT NOT NULL DEFAULT '',
  recommended_actions TEXT NOT NULL DEFAULT '',
  proposed_goals TEXT NOT NULL DEFAULT '',
  follow_ups TEXT NOT NULL DEFAULT '',
  body_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_by TEXT NOT NULL DEFAULT 'rda'
    CHECK (generated_by IN ('rda', 'leader', 'system')),
  edited_by_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  edited_by_name TEXT NOT NULL DEFAULT '',
  decided_by_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  decided_by_name TEXT NOT NULL DEFAULT '',
  decided_at TIMESTAMPTZ,
  decision_note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_quality_weekly_draft_review_version
  ON public.workshop_quality_weekly_review_drafts (review_id, version);

CREATE INDEX IF NOT EXISTS idx_quality_weekly_drafts_review
  ON public.workshop_quality_weekly_review_drafts (review_id, version DESC);

-- ---------------------------------------------------------------------------
-- 4) Auditoria de decisões sobre rascunhos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workshop_quality_weekly_review_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  review_id UUID NOT NULL REFERENCES public.workshop_quality_weekly_reviews(id) ON DELETE CASCADE,
  draft_id UUID REFERENCES public.workshop_quality_weekly_review_drafts(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  actor_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  actor_name TEXT NOT NULL DEFAULT '',
  detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quality_weekly_audit_review
  ON public.workshop_quality_weekly_review_audit (review_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 5) RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.workshop_quality_weekly_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_quality_review_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_quality_weekly_review_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_quality_weekly_review_audit ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.workshop_quality_weekly_reviews IS
  'Revisão Semanal com RDA (Radar Fase 3). Decisões humanas; sem auto-promoção.';
COMMENT ON COLUMN public.workshop_quality_review_observations.classification IS
  'system_fact | leader_observation | ai_suggestion | unconfirmed — nunca promover hipótese a fato.';
COMMENT ON TABLE public.workshop_quality_weekly_review_drafts IS
  'Rascunho editável; aprovação humana obrigatória antes de consolidar.';
