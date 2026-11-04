-- Radar de Qualidade — Fase 4: ciclo semanal, relatórios e versões.
-- INCREMENTAL. NÃO aplicar em produção sem autorização.
-- Preparação automática NÃO atribui notas. Ausência ≠ desempenho ruim.
-- Agendamento: preferir pg_cron → HTTP (como cleanup); Vercel Hobby sem cron semanal nativo.

-- ---------------------------------------------------------------------------
-- 1) Ciclo semanal (um por oficina + período) — chave idempotente
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workshop_quality_weekly_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  week_from DATE NOT NULL,
  week_to DATE NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',
      'in_progress',
      'awaiting_review',
      'approved',
      'archived'
    )),
  prepared_at TIMESTAMPTZ,
  prepared_by TEXT NOT NULL DEFAULT 'system'
    CHECK (prepared_by IN ('system', 'manual', 'cron')),
  notify_sent_at TIMESTAMPTZ,
  notes TEXT NOT NULL DEFAULT '',
  person_count INT NOT NULL DEFAULT 0,
  approved_count INT NOT NULL DEFAULT 0,
  skipped_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workshop_id, week_from, week_to)
);

CREATE INDEX IF NOT EXISTS idx_quality_weekly_cycles_workshop_status
  ON public.workshop_quality_weekly_cycles (workshop_id, status, week_from DESC);

-- ---------------------------------------------------------------------------
-- 2) Relatório individual (versão atual apontada; histórico em versions)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workshop_quality_weekly_person_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  cycle_id UUID NOT NULL REFERENCES public.workshop_quality_weekly_cycles(id) ON DELETE CASCADE,
  system_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  workshop_technician_id UUID REFERENCES public.workshop_technicians(id) ON DELETE SET NULL,
  person_name TEXT NOT NULL DEFAULT '',
  job_title TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',
      'in_progress',
      'awaiting_review',
      'approved',
      'archived',
      'skipped',
      'insufficient_data'
    )),
  weekly_review_id UUID REFERENCES public.workshop_quality_weekly_reviews(id) ON DELETE SET NULL,
  current_version INT NOT NULL DEFAULT 0,
  preliminary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  incomplete_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  skip_reason TEXT NOT NULL DEFAULT '',
  leader_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  leader_name TEXT NOT NULL DEFAULT '',
  approved_at TIMESTAMPTZ,
  approved_by_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  approved_by_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotência: um relatório por pessoa (SU ou WT) no ciclo
CREATE UNIQUE INDEX IF NOT EXISTS uq_quality_person_report_cycle_su
  ON public.workshop_quality_weekly_person_reports (cycle_id, system_user_id)
  WHERE system_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_quality_person_report_cycle_wt
  ON public.workshop_quality_weekly_person_reports (cycle_id, workshop_technician_id)
  WHERE workshop_technician_id IS NOT NULL AND system_user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_quality_person_reports_cycle
  ON public.workshop_quality_weekly_person_reports (cycle_id, status);

-- Versões imutáveis (correção cria nova; não apaga a anterior)
CREATE TABLE IF NOT EXISTS public.workshop_quality_weekly_person_report_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  report_id UUID NOT NULL REFERENCES public.workshop_quality_weekly_person_reports(id) ON DELETE CASCADE,
  version INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'awaiting_review', 'approved', 'superseded')),
  header_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  indicators_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  analysis_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  action_plan_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  conclusion_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  unavailable_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  created_by_name TEXT NOT NULL DEFAULT '',
  change_summary TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (report_id, version)
);

-- ---------------------------------------------------------------------------
-- 3) Relatório consolidado da equipe
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workshop_quality_weekly_team_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  cycle_id UUID NOT NULL REFERENCES public.workshop_quality_weekly_cycles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',
      'in_progress',
      'awaiting_review',
      'approved',
      'archived'
    )),
  current_version INT NOT NULL DEFAULT 0,
  approved_at TIMESTAMPTZ,
  approved_by_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  approved_by_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workshop_id, cycle_id)
);

CREATE TABLE IF NOT EXISTS public.workshop_quality_weekly_team_report_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  team_report_id UUID NOT NULL REFERENCES public.workshop_quality_weekly_team_reports(id) ON DELETE CASCADE,
  version INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'awaiting_review', 'approved', 'superseded')),
  body_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  unavailable_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  created_by_name TEXT NOT NULL DEFAULT '',
  change_summary TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_report_id, version)
);

-- ---------------------------------------------------------------------------
-- 4) Logs de execução do agendador
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workshop_quality_weekly_cron_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  trigger_source TEXT NOT NULL DEFAULT 'manual'
    CHECK (trigger_source IN ('cron', 'manual', 'vercel', 'pg_cron')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  ok BOOLEAN,
  skipped BOOLEAN NOT NULL DEFAULT false,
  skip_reason TEXT NOT NULL DEFAULT '',
  cycle_id UUID REFERENCES public.workshop_quality_weekly_cycles(id) ON DELETE SET NULL,
  persons_prepared INT NOT NULL DEFAULT 0,
  error_message TEXT NOT NULL DEFAULT '',
  detail_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_quality_weekly_cron_runs_workshop
  ON public.workshop_quality_weekly_cron_runs (workshop_id, started_at DESC);

-- ---------------------------------------------------------------------------
-- 5) RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.workshop_quality_weekly_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_quality_weekly_person_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_quality_weekly_person_report_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_quality_weekly_team_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_quality_weekly_team_report_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_quality_weekly_cron_runs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.workshop_quality_weekly_cycles IS
  'Ciclo semanal idempotente (workshop + week_from + week_to). Sem auto-nota.';
COMMENT ON TABLE public.workshop_quality_weekly_person_report_versions IS
  'Versões imutáveis do relatório individual; correção cria nova versão.';
COMMENT ON TABLE public.workshop_quality_weekly_cron_runs IS
  'Log de preparação automática (sem LLM longo).';
