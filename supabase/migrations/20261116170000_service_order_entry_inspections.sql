-- Inspeção de Entrada do veículo (checklist versionado por OS).
-- Idempotente. Não altera checklists administrativos do Pátio.

CREATE TABLE IF NOT EXISTS public.service_order_entry_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  service_order_id UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  checklist_id TEXT NOT NULL,
  checklist_version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed')),
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  question_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  observations TEXT,
  anomaly_summary TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  responsible_user_id UUID,
  responsible_name TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  road_test_status TEXT NOT NULL DEFAULT 'not_requested'
    CHECK (road_test_status IN ('not_requested', 'blocked', 'cleared', 'performed')),
  road_test_confirmed_at TIMESTAMPTZ,
  road_test_confirmed_by TEXT,
  critical_cleared BOOLEAN NOT NULL DEFAULT FALSE,
  critical_cleared_at TIMESTAMPTZ,
  critical_cleared_by TEXT,
  critical_clearance_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT service_order_entry_inspections_so_unique UNIQUE (service_order_id)
);

CREATE INDEX IF NOT EXISTS idx_entry_inspections_workshop
  ON public.service_order_entry_inspections (workshop_id);

CREATE INDEX IF NOT EXISTS idx_entry_inspections_status
  ON public.service_order_entry_inspections (workshop_id, status);

COMMENT ON TABLE public.service_order_entry_inspections IS
  'Inspeção de Entrada por OS. question_snapshot congela o modelo usado; mudanças futuras de versão não apagam respostas antigas.';

CREATE TABLE IF NOT EXISTS public.service_order_entry_inspection_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id UUID NOT NULL REFERENCES public.service_order_entry_inspections(id) ON DELETE CASCADE,
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  service_order_id UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_user_id UUID,
  actor_name TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entry_inspection_events_inspection
  ON public.service_order_entry_inspection_events (inspection_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_entry_inspection_events_so
  ON public.service_order_entry_inspection_events (service_order_id, created_at DESC);

COMMENT ON TABLE public.service_order_entry_inspection_events IS
  'Histórico auditável da Inspeção de Entrada (início, respostas, liberação crítica, teste de rodagem).';

-- Realtime opcional (não falha se a publicação não existir).
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.service_order_entry_inspections;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
