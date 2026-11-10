-- RDA Fase 6 — Assistente de Produtividade (tarefas gerenciais/operacionais).
-- INCREMENTAL. NÃO executar em produção sem revisão.

-- ---------------------------------------------------------------------------
-- 1) Tarefas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rda_productivity_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'done', 'cancelled')),
  requester_user_id UUID,
  requester_name TEXT,
  assignee_user_id UUID,
  assignee_name TEXT,
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  ref_type TEXT
    CHECK (ref_type IS NULL OR ref_type IN ('service_order', 'vehicle', 'module')),
  ref_id TEXT,
  ref_label TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_by_user_id UUID,
  created_by_name TEXT,
  updated_by_user_id UUID,
  updated_by_name TEXT,
  client_request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.rda_productivity_tasks IS
  'RDA Fase 6 — tarefas de produtividade (delegação e acompanhamento).';
COMMENT ON COLUMN public.rda_productivity_tasks.client_request_id IS
  'Idempotência de criação (chat/API); único por oficina quando informado.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_rda_productivity_tasks_client_request
  ON public.rda_productivity_tasks (workshop_id, client_request_id)
  WHERE client_request_id IS NOT NULL AND length(trim(client_request_id)) > 0;

CREATE INDEX IF NOT EXISTS idx_rda_productivity_tasks_workshop_status
  ON public.rda_productivity_tasks (workshop_id, status, due_at NULLS LAST, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rda_productivity_tasks_assignee
  ON public.rda_productivity_tasks (workshop_id, assignee_user_id, status);

CREATE INDEX IF NOT EXISTS idx_rda_productivity_tasks_due
  ON public.rda_productivity_tasks (workshop_id, due_at)
  WHERE status IN ('pending', 'in_progress') AND due_at IS NOT NULL;

ALTER TABLE public.rda_productivity_tasks ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2) Histórico append-only
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rda_productivity_task_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.rda_productivity_tasks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  actor_user_id UUID,
  actor_name TEXT,
  note TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rda_productivity_task_events_task
  ON public.rda_productivity_task_events (task_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rda_productivity_task_events_workshop
  ON public.rda_productivity_task_events (workshop_id, created_at DESC);

ALTER TABLE public.rda_productivity_task_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.rda_productivity_task_events IS
  'Histórico append-only de alterações em tarefas RDA (auditoria).';

-- ---------------------------------------------------------------------------
-- 3) Deduplicação de notificações de produtividade
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rda_productivity_notification_dedupe (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  dedupe_key TEXT NOT NULL,
  task_id UUID REFERENCES public.rda_productivity_tasks(id) ON DELETE SET NULL,
  notification_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rda_productivity_notif_dedupe
  ON public.rda_productivity_notification_dedupe (workshop_id, dedupe_key);

CREATE INDEX IF NOT EXISTS idx_rda_productivity_notif_dedupe_task
  ON public.rda_productivity_notification_dedupe (task_id, created_at DESC);

ALTER TABLE public.rda_productivity_notification_dedupe ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.rda_productivity_notification_dedupe IS
  'Evita notificações repetidas (prazo próximo, vencida, etc.).';
