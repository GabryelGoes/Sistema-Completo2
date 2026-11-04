-- Radar de Qualidade — Fase 2: competências, níveis, PDI, reuniões/feedbacks.
-- INCREMENTAL. NÃO aplicar em produção sem autorização.
-- Ausência de avaliação ≠ NULL (nunca 0 automático).

-- ---------------------------------------------------------------------------
-- 1) Catálogo de competências
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workshop_quality_competencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL CHECK (kind IN ('technical', 'professional')),
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workshop_id, code)
);

CREATE INDEX IF NOT EXISTS idx_quality_competencies_workshop
  ON public.workshop_quality_competencies (workshop_id, kind, sort_order);

-- Rubrica 1–5 por competência (critérios claros)
CREATE TABLE IF NOT EXISTS public.workshop_quality_competency_rubrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  competency_id UUID NOT NULL REFERENCES public.workshop_quality_competencies(id) ON DELETE CASCADE,
  level INT NOT NULL CHECK (level BETWEEN 1 AND 5),
  label TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  UNIQUE (competency_id, level)
);

-- ---------------------------------------------------------------------------
-- 2) Níveis de carreira (configuráveis; sem promoção automática)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workshop_quality_career_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workshop_id, code)
);

CREATE TABLE IF NOT EXISTS public.workshop_quality_career_level_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  career_level_id UUID NOT NULL REFERENCES public.workshop_quality_career_levels(id) ON DELETE CASCADE,
  competency_id UUID NOT NULL REFERENCES public.workshop_quality_competencies(id) ON DELETE CASCADE,
  min_level INT NOT NULL CHECK (min_level BETWEEN 1 AND 5),
  UNIQUE (career_level_id, competency_id)
);

-- Atribuição atual de nível (manual)
CREATE TABLE IF NOT EXISTS public.workshop_quality_person_career (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  system_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  workshop_technician_id UUID REFERENCES public.workshop_technicians(id) ON DELETE SET NULL,
  person_name TEXT NOT NULL DEFAULT '',
  career_level_id UUID REFERENCES public.workshop_quality_career_levels(id) ON DELETE SET NULL,
  notes TEXT NOT NULL DEFAULT '',
  assigned_by_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  assigned_by_name TEXT NOT NULL DEFAULT '',
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_quality_person_career_su
  ON public.workshop_quality_person_career (workshop_id, system_user_id)
  WHERE system_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_quality_person_career_wt
  ON public.workshop_quality_person_career (workshop_id, workshop_technician_id)
  WHERE workshop_technician_id IS NOT NULL AND system_user_id IS NULL;

-- ---------------------------------------------------------------------------
-- 3) Avaliações de competência (NULL = não avaliado)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workshop_quality_competency_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  system_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  workshop_technician_id UUID REFERENCES public.workshop_technicians(id) ON DELETE SET NULL,
  person_name TEXT NOT NULL DEFAULT '',
  competency_id UUID NOT NULL REFERENCES public.workshop_quality_competencies(id) ON DELETE CASCADE,
  -- NULL = sem avaliação (nunca tratar como zero)
  score INT CHECK (score IS NULL OR (score BETWEEN 1 AND 5)),
  assessed_at TIMESTAMPTZ,
  assessed_by_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  assessed_by_name TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_quality_comp_assess_su
  ON public.workshop_quality_competency_assessments (workshop_id, system_user_id, competency_id)
  WHERE system_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_quality_comp_assess_wt
  ON public.workshop_quality_competency_assessments (workshop_id, workshop_technician_id, competency_id)
  WHERE workshop_technician_id IS NOT NULL AND system_user_id IS NULL;

CREATE TABLE IF NOT EXISTS public.workshop_quality_competency_assessment_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  assessment_id UUID NOT NULL REFERENCES public.workshop_quality_competency_assessments(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  actor_name TEXT NOT NULL DEFAULT '',
  previous_score INT,
  next_score INT,
  previous_note TEXT,
  next_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 4) PDI
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workshop_quality_pdi_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  system_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  workshop_technician_id UUID REFERENCES public.workshop_technicians(id) ON DELETE SET NULL,
  person_name TEXT NOT NULL DEFAULT '',
  current_situation TEXT NOT NULL DEFAULT '',
  strengths_summary TEXT NOT NULL DEFAULT '',
  development_summary TEXT NOT NULL DEFAULT '',
  owner_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  owner_name TEXT NOT NULL DEFAULT '',
  target_date DATE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'completed', 'archived')),
  created_by_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  created_by_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quality_pdi_person
  ON public.workshop_quality_pdi_plans (workshop_id, system_user_id, status);

CREATE TABLE IF NOT EXISTS public.workshop_quality_pdi_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.workshop_quality_pdi_plans(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  competency_id UUID REFERENCES public.workshop_quality_competencies(id) ON DELETE SET NULL,
  training_needed TEXT NOT NULL DEFAULT '',
  evidence TEXT NOT NULL DEFAULT '',
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'done', 'blocked', 'cancelled')),
  progress_note TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workshop_quality_pdi_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.workshop_quality_pdi_plans(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  actor_name TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 5) Reuniões e feedbacks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workshop_quality_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'individual'
    CHECK (kind IN (
      'individual',
      'feedback_positive',
      'feedback_corrective',
      'follow_up',
      'other'
    )),
  title TEXT NOT NULL DEFAULT '',
  agenda TEXT NOT NULL DEFAULT '',
  observations TEXT NOT NULL DEFAULT '',
  outcomes TEXT NOT NULL DEFAULT '',
  system_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  workshop_technician_id UUID REFERENCES public.workshop_technicians(id) ON DELETE SET NULL,
  person_name TEXT NOT NULL DEFAULT '',
  participants TEXT NOT NULL DEFAULT '',
  held_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  follow_up_at DATE,
  employee_ack_at TIMESTAMPTZ,
  employee_ack_note TEXT NOT NULL DEFAULT '',
  registered_by_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  registered_by_name TEXT NOT NULL DEFAULT '',
  deleted_at TIMESTAMPTZ,
  deleted_by_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  deleted_by_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quality_meetings_workshop
  ON public.workshop_quality_meetings (workshop_id, held_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.workshop_quality_meeting_commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL REFERENCES public.workshop_quality_meetings(id) ON DELETE CASCADE,
  description TEXT NOT NULL DEFAULT '',
  owner_name TEXT NOT NULL DEFAULT '',
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'done', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 6) RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.workshop_quality_competencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_quality_competency_rubrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_quality_career_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_quality_career_level_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_quality_person_career ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_quality_competency_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_quality_competency_assessment_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_quality_pdi_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_quality_pdi_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_quality_pdi_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_quality_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_quality_meeting_commitments ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.workshop_quality_competencies IS 'Matriz configurável de competências (Radar Fase 2).';
COMMENT ON COLUMN public.workshop_quality_competency_assessments.score IS 'NULL = não avaliado; nunca interpretar como zero.';
COMMENT ON TABLE public.workshop_quality_career_levels IS 'Níveis de carreira configuráveis; promoção é decisão humana.';
COMMENT ON TABLE public.workshop_quality_pdi_plans IS 'Plano de desenvolvimento individual.';
COMMENT ON TABLE public.workshop_quality_meetings IS 'Reuniões e feedbacks com histórico e ciência opcional.';
