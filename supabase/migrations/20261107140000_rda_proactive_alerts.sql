-- RDA Fase 5 — Monitoramento Proativo (alertas enriquecidos).
-- INCREMENTAL sobre rda_management_alerts. NÃO executar em produção sem revisão.

-- ---------------------------------------------------------------------------
-- 1) Colunas adicionais no alerta (compatível com linhas existentes)
-- ---------------------------------------------------------------------------
ALTER TABLE public.rda_management_alerts
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'patio'
    CHECK (category IN ('patio', 'laboratorio', 'estoque', 'produtividade')),
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'acknowledged', 'resolved', 'dismissed')),
  ADD COLUMN IF NOT EXISTS recommendation TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS evidence TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ref_type TEXT,
  ADD COLUMN IF NOT EXISTS ref_id TEXT,
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acknowledged_by UUID,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_by UUID,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

COMMENT ON COLUMN public.rda_management_alerts.category IS
  'patio | laboratorio | estoque | produtividade';
COMMENT ON COLUMN public.rda_management_alerts.status IS
  'active | acknowledged | resolved | dismissed';
COMMENT ON COLUMN public.rda_management_alerts.recommendation IS
  'Ação recomendada (não executada automaticamente).';
COMMENT ON COLUMN public.rda_management_alerts.evidence IS
  'Evidência factual que justificou o alerta.';
COMMENT ON COLUMN public.rda_management_alerts.last_seen_at IS
  'Última vez que o monitor ainda observou a condição (dedupe).';

-- Backfill status a partir de dismissed_at legado
UPDATE public.rda_management_alerts
SET status = 'dismissed'
WHERE dismissed_at IS NOT NULL AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_rda_mgmt_alerts_workshop_status
  ON public.rda_management_alerts (workshop_id, status, severity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rda_mgmt_alerts_workshop_category
  ON public.rda_management_alerts (workshop_id, category, status);

-- ---------------------------------------------------------------------------
-- 2) Histórico de mudanças de status
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rda_management_alert_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  alert_id UUID NOT NULL REFERENCES public.rda_management_alerts(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_user_id UUID,
  note TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rda_mgmt_alert_events_alert
  ON public.rda_management_alert_events (alert_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rda_mgmt_alert_events_workshop
  ON public.rda_management_alert_events (workshop_id, created_at DESC);

ALTER TABLE public.rda_management_alert_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.rda_management_alert_events IS
  'Histórico append-only de mudanças de status dos alertas RDA.';

-- ---------------------------------------------------------------------------
-- 3) Execuções do monitor (lock + auditoria)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rda_proactive_scan_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  ok BOOLEAN,
  skipped BOOLEAN NOT NULL DEFAULT false,
  skip_reason TEXT,
  trigger_source TEXT NOT NULL DEFAULT 'manual',
  alerts_created INT NOT NULL DEFAULT 0,
  alerts_updated INT NOT NULL DEFAULT 0,
  alerts_reopened INT NOT NULL DEFAULT 0,
  error_message TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_rda_proactive_scan_runs_workshop
  ON public.rda_proactive_scan_runs (workshop_id, started_at DESC);

-- No máximo uma execução "em andamento" recente por oficina (lock lógico).
CREATE UNIQUE INDEX IF NOT EXISTS uq_rda_proactive_scan_running
  ON public.rda_proactive_scan_runs (workshop_id)
  WHERE finished_at IS NULL;

ALTER TABLE public.rda_proactive_scan_runs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.rda_proactive_scan_runs IS
  'Auditoria e lock de varreduras proativas do RDA (Fase 5).';
