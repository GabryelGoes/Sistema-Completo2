-- Radar de Qualidade — Fase 1 (incremental).
-- Identidade estável, ocorrências enriquecidas, reconhecimentos positivos, auditoria e soft-delete.
-- NÃO aplicar em produção sem autorização. Preserva dados existentes.

-- ---------------------------------------------------------------------------
-- 1) Vínculo auditável técnico (WT) ↔ usuário do sistema (SU)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workshop_quality_person_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  workshop_technician_id UUID NOT NULL REFERENCES public.workshop_technicians(id) ON DELETE CASCADE,
  system_user_id UUID NOT NULL REFERENCES public.workshop_system_users(id) ON DELETE CASCADE,
  confirmed_by_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  confirmed_by_name TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workshop_id, workshop_technician_id),
  UNIQUE (workshop_id, system_user_id)
);

CREATE INDEX IF NOT EXISTS idx_quality_person_links_workshop
  ON public.workshop_quality_person_links (workshop_id);

COMMENT ON TABLE public.workshop_quality_person_links IS
  'Vínculo confirmado entre cadastro de técnico e usuário do sistema (Radar).';

CREATE TABLE IF NOT EXISTS public.workshop_quality_person_link_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  workshop_technician_id UUID NOT NULL REFERENCES public.workshop_technicians(id) ON DELETE CASCADE,
  system_user_id UUID NOT NULL REFERENCES public.workshop_system_users(id) ON DELETE CASCADE,
  normalized_name_hint TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  proposed_reason TEXT NOT NULL DEFAULT '',
  proposed_by_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  proposed_by_name TEXT NOT NULL DEFAULT '',
  decided_by_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  decided_by_name TEXT NOT NULL DEFAULT '',
  decision_note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_quality_person_link_proposals_pending
  ON public.workshop_quality_person_link_proposals (workshop_id, workshop_technician_id, system_user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_quality_person_link_proposals_status
  ON public.workshop_quality_person_link_proposals (workshop_id, status, created_at DESC);

COMMENT ON TABLE public.workshop_quality_person_link_proposals IS
  'Propostas de unificação de identidade — exigem confirmação gerencial quando ambíguas.';

-- ---------------------------------------------------------------------------
-- 2) Ocorrências: campos novos + soft-delete (sem DROP de dados)
-- ---------------------------------------------------------------------------
ALTER TABLE public.workshop_technician_incidents
  ADD COLUMN IF NOT EXISTS system_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fault_attribution TEXT NOT NULL DEFAULT 'investigacao',
  ADD COLUMN IF NOT EXISTS outcome_result TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_by_name TEXT NOT NULL DEFAULT '';

-- fault_attribution check (idempotente via drop/add)
DO $$
BEGIN
  ALTER TABLE public.workshop_technician_incidents
    DROP CONSTRAINT IF EXISTS workshop_technician_incidents_fault_attribution_check;
  ALTER TABLE public.workshop_technician_incidents
    ADD CONSTRAINT workshop_technician_incidents_fault_attribution_check
    CHECK (fault_attribution IN (
      'investigacao',
      'erro_comprovado',
      'fator_externo',
      'nao_aplicavel'
    ));
EXCEPTION WHEN others THEN
  RAISE NOTICE 'fault_attribution check: %', SQLERRM;
END $$;

-- Ampliar categorias (mantém as antigas)
DO $$
BEGIN
  ALTER TABLE public.workshop_technician_incidents
    DROP CONSTRAINT IF EXISTS workshop_technician_incidents_category_check;
  ALTER TABLE public.workshop_technician_incidents
    ADD CONSTRAINT workshop_technician_incidents_category_check
    CHECK (category IN (
      'montagem',
      'diagnostico',
      'retrabalho',
      'prazo',
      'comunicacao',
      'seguranca',
      'peca_material',
      'cliente',
      'organizacao',
      'procedimentos',
      'outro'
    ));
EXCEPTION WHEN others THEN
  RAISE NOTICE 'category check: %', SQLERRM;
END $$;

CREATE INDEX IF NOT EXISTS idx_workshop_technician_incidents_system_user
  ON public.workshop_technician_incidents (workshop_id, system_user_id)
  WHERE system_user_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_workshop_technician_incidents_active
  ON public.workshop_technician_incidents (workshop_id, occurred_at DESC)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.workshop_technician_incidents.system_user_id IS
  'Usuário do sistema vinculado (identidade estável); complementar a technician_id.';
COMMENT ON COLUMN public.workshop_technician_incidents.fault_attribution IS
  'investigacao | erro_comprovado | fator_externo | nao_aplicavel — não assume culpa automaticamente.';
COMMENT ON COLUMN public.workshop_technician_incidents.outcome_result IS
  'Resultado / desfecho da ocorrência.';
COMMENT ON COLUMN public.workshop_technician_incidents.deleted_at IS
  'Exclusão lógica; histórico e anexos permanecem.';

-- ---------------------------------------------------------------------------
-- 3) Auditoria de alterações de ocorrências (append-only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workshop_technician_incident_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  incident_id UUID NOT NULL REFERENCES public.workshop_technician_incidents(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  actor_name TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'soft_delete', 'restore')),
  previous_snapshot JSONB,
  next_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incident_revisions_incident
  ON public.workshop_technician_incident_revisions (incident_id, created_at DESC);

COMMENT ON TABLE public.workshop_technician_incident_revisions IS
  'Histórico append-only de alterações em ocorrências do Radar.';

-- ---------------------------------------------------------------------------
-- 4) Reconhecimentos / registros positivos (independentes do cronômetro)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workshop_technician_recognitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  technician_id UUID REFERENCES public.workshop_technicians(id) ON DELETE SET NULL,
  system_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  person_name TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'outro'
    CHECK (category IN (
      'diagnostico_complexo',
      'qualidade_execucao',
      'autonomia',
      'iniciativa',
      'organizacao',
      'colaboracao',
      'evolucao',
      'procedimentos',
      'ajuda_colegas',
      'melhoria_oficina',
      'outro'
    )),
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  service_order_id UUID REFERENCES public.service_orders(id) ON DELETE SET NULL,
  service_order_label TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  registered_by_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  registered_by_name TEXT NOT NULL DEFAULT '',
  deleted_at TIMESTAMPTZ,
  deleted_by_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  deleted_by_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recognitions_workshop_occurred
  ON public.workshop_technician_recognitions (workshop_id, occurred_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_recognitions_person
  ON public.workshop_technician_recognitions (workshop_id, technician_id, system_user_id)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.workshop_technician_recognitions IS
  'Registros positivos independentes das avaliações pós-cronômetro.';

-- ---------------------------------------------------------------------------
-- 5) RLS (service_role via API; sem políticas públicas)
-- ---------------------------------------------------------------------------
ALTER TABLE public.workshop_quality_person_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_quality_person_link_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_technician_incident_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_technician_recognitions ENABLE ROW LEVEL SECURITY;
