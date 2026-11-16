-- SEC-05.1.2-A: histórico de segurança da oficina.
-- NÃO aplicar em produção sem revisão. A API grava pelo service_role.
-- O navegador não lê, não insere, não altera e não apaga.
-- Não há IP bruto. A limpeza abaixo não roda sozinha.

CREATE TABLE IF NOT EXISTS public.workshop_security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id uuid NOT NULL REFERENCES public.workshops(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  event_type text NOT NULL CHECK (event_type IN (
    'login_succeeded',
    'login_denied',
    'login_unavailable',
    'rate_limited',
    'logout',
    'session_invalid',
    'session_revoked',
    'device_blocked',
    'password_changed',
    'permissions_changed',
    'employee_created',
    'employee_removed',
    'device_blocked_admin',
    'device_unblocked',
    'session_revoked_admin',
    'security_settings_changed',
    'session_check_unavailable',
    'rate_limit_unavailable',
    'admin_access_denied'
  )),
  outcome text NOT NULL CHECK (outcome IN ('success', 'denied', 'error')),
  actor_user_id uuid REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  session_id uuid,
  device_id text CHECK (device_id IS NULL OR char_length(device_id) BETWEEN 1 AND 128),
  origin text CHECK (origin IS NULL OR origin IN ('vercel', 'local', 'unknown')),
  client_ref text CHECK (client_ref IS NULL OR client_ref ~ '^[A-Za-z0-9_-]{8,32}$'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_catalog.octet_length(metadata::text) <= 2048)
);

COMMENT ON TABLE public.workshop_security_events IS
  'Eventos de segurança da oficina. Sem senha, token ou IP bruto. Sem acesso pelo navegador.';

CREATE INDEX IF NOT EXISTS workshop_security_events_workshop_occurred_idx
  ON public.workshop_security_events (workshop_id, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS workshop_security_events_type_idx
  ON public.workshop_security_events (workshop_id, event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS workshop_security_events_actor_idx
  ON public.workshop_security_events (workshop_id, actor_user_id, occurred_at DESC)
  WHERE actor_user_id IS NOT NULL;

ALTER TABLE public.workshop_security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_security_events FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.workshop_security_events FROM PUBLIC;
REVOKE ALL ON TABLE public.workshop_security_events FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.workshop_security_events TO service_role;

-- Retenção proposta: 90 dias para o restante e 365 para eventos críticos.
-- Só apaga quando chamada de propósito. A API não chama esta função.
CREATE OR REPLACE FUNCTION public.purge_security_events(p_confirm text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted integer;
BEGIN
  IF p_confirm IS DISTINCT FROM 'purge-security-events' THEN
    RAISE EXCEPTION 'confirmation required';
  END IF;
  DELETE FROM public.workshop_security_events AS event
  WHERE (
    event.event_type IN (
      'login_succeeded',
      'password_changed',
      'permissions_changed',
      'employee_created',
      'employee_removed',
      'device_blocked_admin',
      'device_unblocked',
      'session_revoked_admin',
      'security_settings_changed',
      'login_unavailable',
      'session_check_unavailable',
      'rate_limit_unavailable'
    )
    AND event.occurred_at < pg_catalog.now() - interval '365 days'
  ) OR (
    event.event_type NOT IN (
      'login_succeeded',
      'password_changed',
      'permissions_changed',
      'employee_created',
      'employee_removed',
      'device_blocked_admin',
      'device_unblocked',
      'session_revoked_admin',
      'security_settings_changed',
      'login_unavailable',
      'session_check_unavailable',
      'rate_limit_unavailable'
    )
    AND event.occurred_at < pg_catalog.now() - interval '90 days'
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_security_events(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_security_events(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_security_events(text) TO service_role;
