-- RDA Intelligence — runtime (conversas, auditoria, uso, insights, alertas).
-- Aplicar no Supabase da oficina SOMENTE com autorização explícita.
-- Não inclui dados existentes; só CREATE IF NOT EXISTS.
-- NÃO inclui bootstrap/seed fictício.

-- Conversas do assistente
CREATE TABLE IF NOT EXISTS public.rda_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  created_by_role TEXT NOT NULL CHECK (created_by_role IN ('admin', 'user')),
  title TEXT,
  context_service_order_id UUID REFERENCES public.service_orders(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rda_conversations_workshop_updated
  ON public.rda_conversations (workshop_id, updated_at DESC);

-- Mensagens
CREATE TABLE IF NOT EXISTS public.rda_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.rda_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  content TEXT NOT NULL DEFAULT '',
  tool_call_id TEXT,
  tool_name TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rda_messages_conversation
  ON public.rda_messages (conversation_id, created_at ASC);

-- Auditoria de tools
CREATE TABLE IF NOT EXISTS public.rda_tool_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.rda_conversations(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL,
  actor_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  tool_id TEXT NOT NULL,
  allowed BOOLEAN NOT NULL,
  reason TEXT,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rda_tool_audit_workshop
  ON public.rda_tool_audit (workshop_id, created_at DESC);

-- Uso diário (limites)
CREATE TABLE IF NOT EXISTS public.rda_usage_daily (
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  prompt_tokens BIGINT NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
  completion_tokens BIGINT NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
  total_tokens BIGINT NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
  request_count INT NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workshop_id, day)
);

-- Insights técnicos por OS (fatos vs hipóteses)
CREATE TABLE IF NOT EXISTS public.rda_os_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  service_order_id UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('pending', 'ready', 'failed', 'stale')),
  facts JSONB NOT NULL DEFAULT '[]'::jsonb,
  hypotheses JSONB NOT NULL DEFAULT '[]'::jsonb,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary TEXT NOT NULL DEFAULT '',
  model TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workshop_id, service_order_id)
);

CREATE INDEX IF NOT EXISTS idx_rda_os_insights_workshop
  ON public.rda_os_insights (workshop_id, updated_at DESC);

-- Alertas de gestão gerados pelo RDA
CREATE TABLE IF NOT EXISTS public.rda_management_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  alert_key TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  notification_id UUID,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workshop_id, alert_key)
);

CREATE INDEX IF NOT EXISTS idx_rda_management_alerts_workshop
  ON public.rda_management_alerts (workshop_id, created_at DESC)
  WHERE dismissed_at IS NULL;

ALTER TABLE public.rda_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rda_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rda_tool_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rda_usage_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rda_os_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rda_management_alerts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.rda_conversations IS 'RDA: conversas do assistente (service_role).';
COMMENT ON TABLE public.rda_os_insights IS 'RDA: insight técnico automático por OS (fatos vs hipóteses).';
COMMENT ON TABLE public.rda_management_alerts IS 'RDA: alertas de gestão (atrasos, filas, avaliações).';
