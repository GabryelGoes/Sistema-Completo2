-- SEC-05.1.2-C: alertas administrativos da Central de Segurança.
-- NÃO aplicar em produção sem revisão. A API grava pelo service_role.
-- O navegador não escolhe o texto do alerta. Não há IP, senha, token nem chave.
-- Os eventos originais em workshop_security_events não são alterados.

CREATE TABLE IF NOT EXISTS public.workshop_security_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id uuid NOT NULL REFERENCES public.workshops(id) ON DELETE RESTRICT,
  dedupe_key text NOT NULL CHECK (dedupe_key ~ '^[a-z0-9_]{1,80}$'),
  rule_id text NOT NULL CHECK (rule_id IN (
    'volume_login_ip',
    'volume_login_account',
    'volume_password_ip',
    'volume_password_account',
    'recorded_rate_limit',
    'recorded_session_check',
    'recorded_rate_limit_down',
    'admin_password',
    'admin_permissions',
    'admin_employee',
    'admin_settings',
    'admin_device_session',
    'recorded_device_block'
  )),
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'important')),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'seen', 'resolved')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  explanation text NOT NULL CHECK (char_length(explanation) BETWEEN 1 AND 800),
  occurrence_count integer NOT NULL DEFAULT 1 CHECK (occurrence_count BETWEEN 1 AND 1000000),
  condition_active boolean NOT NULL DEFAULT true,
  first_seen_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  last_seen_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  resolved_at timestamptz,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_catalog.octet_length(evidence::text) <= 2048)
);

COMMENT ON TABLE public.workshop_security_alerts IS
  'Alertas administrativos derivados de regras fixas. Sem IP, senha ou token. Sem bloqueio automático.';

CREATE UNIQUE INDEX IF NOT EXISTS workshop_security_alerts_open_key
  ON public.workshop_security_alerts (workshop_id, dedupe_key)
  WHERE status <> 'resolved';

CREATE INDEX IF NOT EXISTS workshop_security_alerts_recent_idx
  ON public.workshop_security_alerts (workshop_id, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.workshop_security_alert_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id uuid NOT NULL REFERENCES public.workshops(id) ON DELETE RESTRICT,
  alert_id uuid NOT NULL REFERENCES public.workshop_security_alerts(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  from_status text CHECK (from_status IS NULL OR from_status IN ('new', 'seen', 'resolved')),
  to_status text NOT NULL CHECK (to_status IN ('new', 'seen', 'resolved')),
  actor_user_id uuid REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  actor_role text NOT NULL CHECK (actor_role IN ('admin', 'user', 'system')),
  note text CHECK (note IS NULL OR char_length(note) <= 200)
);

COMMENT ON TABLE public.workshop_security_alert_updates IS
  'Histórico das mudanças de estado dos alertas. A linha não é alterada nem apagada pela API.';

CREATE INDEX IF NOT EXISTS workshop_security_alert_updates_alert_idx
  ON public.workshop_security_alert_updates (alert_id, occurred_at DESC);

ALTER TABLE public.workshop_security_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_security_alerts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_security_alert_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_security_alert_updates FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.workshop_security_alerts FROM PUBLIC;
REVOKE ALL ON TABLE public.workshop_security_alerts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.workshop_security_alerts TO service_role;

REVOKE ALL ON TABLE public.workshop_security_alert_updates FROM PUBLIC;
REVOKE ALL ON TABLE public.workshop_security_alert_updates FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.workshop_security_alert_updates TO service_role;
