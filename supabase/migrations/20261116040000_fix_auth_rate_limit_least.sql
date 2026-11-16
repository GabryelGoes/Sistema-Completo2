-- SEC-05.1.1-A: least, greatest e coalesce são expressões do SQL.
-- O prefixo de catálogo faz o PostgreSQL procurar uma função inexistente (SQLSTATE 42883).
-- A migration 20261116020000 já foi aplicada. Este arquivo só substitui as funções.
-- Tabela, RLS e quem pode executar permanecem como estão.

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
      ELSE least(bucket.hit_count, 999999) + 1
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
  v_limit := least(greatest(coalesce(p_limit, 1), 1), 100);
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

REVOKE ALL ON FUNCTION public.purge_expired_auth_rate_limits(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_expired_auth_rate_limits(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_auth_rate_limits(integer) TO service_role;
