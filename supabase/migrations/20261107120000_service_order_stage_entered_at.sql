-- Permanência real na etapa da OS (Fase 3 — Gestão Inteligente do Pátio).
-- INCREMENTAL. NÃO aplicar em produção sem revisão explícita.
-- Não recria tabelas. Não apaga apontamentos nem histórico existente.

-- ---------------------------------------------------------------------------
-- 1) Coluna: entrada na etapa atual (NULL = legado / desconhecido)
-- ---------------------------------------------------------------------------
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS status_entered_at TIMESTAMPTZ;

COMMENT ON COLUMN public.service_orders.status_entered_at IS
  'Timestamp da entrada na etapa (status) atual. NULL = OS legada sem histórico confiável. NÃO usar updated_at como substituto.';

CREATE INDEX IF NOT EXISTS idx_service_orders_workshop_status_entered
  ON public.service_orders (workshop_id, status, status_entered_at DESC NULLS LAST);

-- ---------------------------------------------------------------------------
-- 2) Histórico append-only de transições de etapa
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_order_stage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  service_order_id UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_user_id UUID,
  source TEXT NOT NULL DEFAULT 'system',
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_so_stage_events_order_entered
  ON public.service_order_stage_events (service_order_id, entered_at DESC);

CREATE INDEX IF NOT EXISTS idx_so_stage_events_workshop_entered
  ON public.service_order_stage_events (workshop_id, entered_at DESC);

COMMENT ON TABLE public.service_order_stage_events IS
  'Histórico de mudanças de etapa (status) das OS. Append-only. Fonte para permanência real na etapa.';

ALTER TABLE public.service_order_stage_events ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3) Trigger: ao mudar status, atualiza status_entered_at e registra evento
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_service_order_status_entered_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status_entered_at IS NULL THEN
      NEW.status_entered_at := COALESCE(NEW.created_at, now());
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      NEW.status_entered_at := now();
      -- Sem EXCEPTION silencioso: falha do INSERT aborta o UPDATE (evita inconsistência).
      INSERT INTO public.service_order_stage_events (
        workshop_id, service_order_id, from_status, to_status, entered_at, source, meta
      ) VALUES (
        NEW.workshop_id,
        NEW.id,
        OLD.status,
        NEW.status,
        NEW.status_entered_at,
        'trigger',
        jsonb_build_object('order_type', to_jsonb(NEW.order_type))
      );
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_service_orders_status_entered_at ON public.service_orders;
CREATE TRIGGER trg_service_orders_status_entered_at
  BEFORE INSERT OR UPDATE OF status ON public.service_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_service_order_status_entered_at();

COMMENT ON FUNCTION public.trg_service_order_status_entered_at() IS
  'Mantém status_entered_at e histórico de etapas. Falha do INSERT propaga. Não altera updated_at.';

