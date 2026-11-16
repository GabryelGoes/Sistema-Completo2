-- SEC-05.1.1-A: contadores de login e troca de senha compartilhados entre instâncias.
-- NÃO aplicar em produção sem revisão. A API só usa estes contadores com
-- AUTH_RATE_LIMIT_STORE=postgres. Sem a flag, o processo continua em memória.
--
-- O navegador não lê nem altera a tabela. As funções são SECURITY INVOKER:
-- o service_role já ignora RLS; anon e authenticated não têm GRANT nem policy.
-- search_path vazio e nomes qualificados. EXECUTE só para service_role.

CREATE TABLE IF NOT EXISTS public.workshop_auth_rate_limits (
  bucket_key text PRIMARY KEY CHECK (char_length(bucket_key) BETWEEN 1 AND 200),
  hit_count integer NOT NULL CHECK (hit_count BETWEEN 1 AND 1000000),
  reset_at timestamptz NOT NULL
);

COMMENT ON TABLE public.workshop_auth_rate_limits IS
  'Contadores de tentativas de autenticação. A janela vence em reset_at, pelo relógio do banco. Sem acesso pelo navegador.';

CREATE INDEX IF NOT EXISTS workshop_auth_rate_limits_reset_at_idx
  ON public.workshop_auth_rate_limits (reset_at);

ALTER TABLE public.workshop_auth_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_auth_rate_limits FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.workshop_auth_rate_limits FROM PUBLIC;
REVOKE ALL ON TABLE public.workshop_auth_rate_limits FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workshop_auth_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.hit_auth_rate_limit(
  p_key text,
  p_window_ms integer,
  p_max integer
)
RETURNS TABLE (hit_count integer, reset_at timestamptz, limited boolean)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
  v_reset timestamptz;
BEGIN
  IF p_key IS NULL OR char_length(p_key) < 1 OR char_length(p_key) > 200 THEN
    RAISE EXCEPTION 'invalid rate limit key';
  END IF;
  IF p_window_ms IS NULL OR p_window_ms < 1 OR p_window_ms > 86400000 THEN
    RAISE EXCEPTION 'invalid rate limit window';
  END IF;
  IF p_max IS NULL OR p_max < 1 OR p_max > 100000 THEN
    RAISE EXCEPTION 'invalid rate limit max';
  END IF;

  INSERT INTO public.workshop_auth_rate_limits AS bucket (bucket_key, hit_count, reset_at)
  VALUES (p_key, 1, pg_catalog.now() + (p_window_ms * interval '1 millisecond'))
  ON CONFLICT (bucket_key) DO UPDATE
  SET
    hit_count = CASE
      WHEN bucket.reset_at <= pg_catalog.now() THEN 1
      ELSE pg_catalog.least(bucket.hit_count, 999999) + 1
    END,
    reset_at = CASE
      WHEN bucket.reset_at <= pg_catalog.now()
        THEN pg_catalog.now() + (p_window_ms * interval '1 millisecond')
      ELSE bucket.reset_at
    END
  RETURNING bucket.hit_count, bucket.reset_at
  INTO v_count, v_reset;

  hit_count := v_count;
  reset_at := v_reset;
  limited := v_count > p_max;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.hit_auth_rate_limit(text, integer, integer) IS
  'Incremento atômico da janela. now() do banco decide a expiração. Não varre a tabela.';

CREATE OR REPLACE FUNCTION public.peek_auth_rate_limit(p_key text, p_max integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_key IS NULL OR char_length(p_key) < 1 OR char_length(p_key) > 200 THEN
    RAISE EXCEPTION 'invalid rate limit key';
  END IF;
  IF p_max IS NULL OR p_max < 1 OR p_max > 100000 THEN
    RAISE EXCEPTION 'invalid rate limit max';
  END IF;

  SELECT bucket.hit_count
    INTO v_count
  FROM public.workshop_auth_rate_limits AS bucket
  WHERE bucket.bucket_key = p_key
    AND bucket.reset_at > pg_catalog.now();

  IF NOT FOUND THEN
    RETURN false;
  END IF;
  RETURN v_count >= p_max;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_auth_rate_limit(p_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF p_key IS NULL OR char_length(p_key) < 1 OR char_length(p_key) > 200 THEN
    RAISE EXCEPTION 'invalid rate limit key';
  END IF;
  DELETE FROM public.workshop_auth_rate_limits AS bucket
  WHERE bucket.bucket_key = p_key;
END;
$$;

-- Limpeza física limitada. Não é chamada a cada login.
-- O índice em reset_at restringe a leitura aos vencidos, com teto de 100 linhas.
CREATE OR REPLACE FUNCTION public.purge_expired_auth_rate_limits(p_limit integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_limit integer;
  v_deleted integer;
BEGIN
  v_limit := pg_catalog.least(pg_catalog.greatest(pg_catalog.coalesce(p_limit, 1), 1), 100);
  WITH doomed AS (
    SELECT bucket.bucket_key
    FROM public.workshop_auth_rate_limits AS bucket
    WHERE bucket.reset_at <= pg_catalog.now()
    ORDER BY bucket.reset_at
    LIMIT v_limit
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.workshop_auth_rate_limits AS bucket
  USING doomed
  WHERE bucket.bucket_key = doomed.bucket_key;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.hit_auth_rate_limit(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hit_auth_rate_limit(text, integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hit_auth_rate_limit(text, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.peek_auth_rate_limit(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.peek_auth_rate_limit(text, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.peek_auth_rate_limit(text, integer) TO service_role;

REVOKE ALL ON FUNCTION public.reset_auth_rate_limit(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_auth_rate_limit(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_auth_rate_limit(text) TO service_role;

REVOKE ALL ON FUNCTION public.purge_expired_auth_rate_limits(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_expired_auth_rate_limits(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_auth_rate_limits(integer) TO service_role;
