-- Verificações pós-bootstrap + migrations RDA + seed (projeto de TESTE).
-- Um único result set (compatível com o SQL Editor do Supabase).
-- Cada linha: check_id + ok (true/false). Não lança ERROR se algo faltar.
-- Esperado: todas as linhas com ok = true (incluindo ALL_OK).

WITH checks AS (
  SELECT 'bootstrap_workshops' AS check_id,
    (to_regclass('public.workshops') IS NOT NULL) AS ok
  UNION ALL
  SELECT 'bootstrap_customers',
    (to_regclass('public.customers') IS NOT NULL)
  UNION ALL
  SELECT 'bootstrap_service_orders',
    (to_regclass('public.service_orders') IS NOT NULL)
  UNION ALL
  SELECT 'bootstrap_budgets',
    (to_regclass('public.budgets') IS NOT NULL)
  UNION ALL
  SELECT 'bootstrap_system_users',
    (to_regclass('public.workshop_system_users') IS NOT NULL)
  UNION ALL
  SELECT 'tables_rda',
    to_regclass('public.rda_work_sessions') IS NOT NULL
    AND to_regclass('public.rda_work_session_events') IS NOT NULL
    AND to_regclass('public.rda_eval_requests') IS NOT NULL
    AND to_regclass('public.rda_evaluations') IS NOT NULL
    AND to_regclass('public.rda_eval_audit_events') IS NOT NULL
  UNION ALL
  SELECT 'rls',
    (
      SELECT COUNT(*) = 5 AND COALESCE(bool_and(c.relrowsecurity), false)
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relname IN (
          'rda_work_sessions',
          'rda_work_session_events',
          'rda_eval_requests',
          'rda_evaluations',
          'rda_eval_audit_events'
        )
    )
  UNION ALL
  SELECT 'rpcs',
    to_regprocedure('public.rda_work_session_start(uuid,uuid,uuid,uuid,text,text)') IS NOT NULL
    AND to_regprocedure('public.rda_work_session_finish(uuid,uuid,uuid,text)') IS NOT NULL
    AND to_regprocedure('public.rda_eval_request_ensure_for_session(uuid,uuid,text)') IS NOT NULL
    AND to_regprocedure('public.get_next_os_number(uuid)') IS NOT NULL
  UNION ALL
  SELECT 'revoke_anon',
    CASE
      WHEN to_regprocedure('public.rda_work_session_finish(uuid,uuid,uuid,text)') IS NULL
        THEN false
      WHEN to_regrole('anon') IS NULL OR to_regrole('authenticated') IS NULL
        THEN false
      ELSE
        NOT has_function_privilege(
          'anon',
          'public.rda_work_session_finish(uuid,uuid,uuid,text)',
          'EXECUTE'
        )
        AND NOT has_function_privilege(
          'authenticated',
          'public.rda_work_session_finish(uuid,uuid,uuid,text)',
          'EXECUTE'
        )
    END
  UNION ALL
  SELECT 'seed_workshop',
    CASE
      WHEN to_regclass('public.workshops') IS NULL THEN false
      ELSE EXISTS (
        SELECT 1 FROM public.workshops
        WHERE id = '11111111-1111-4111-8111-111111111111'
      )
    END
  UNION ALL
  SELECT 'seed_users',
    CASE
      WHEN to_regclass('public.workshop_system_users') IS NULL THEN false
      ELSE (
        SELECT count(*) FROM public.workshop_system_users
        WHERE workshop_id = '11111111-1111-4111-8111-111111111111'
      ) >= 4
    END
  UNION ALL
  SELECT 'seed_os',
    CASE
      WHEN to_regclass('public.service_orders') IS NULL THEN false
      ELSE
        EXISTS (SELECT 1 FROM public.service_orders WHERE id = '33333333-3333-4333-8333-333333333301')
        AND EXISTS (SELECT 1 FROM public.service_orders WHERE id = '33333333-3333-4333-8333-333333333302')
    END
  UNION ALL
  SELECT 'uq_eval_session',
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'rda_eval_requests_one_per_session'
    )
  UNION ALL
  SELECT 'so_workshop_id',
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'service_orders'
        AND column_name = 'workshop_id'
    )
  UNION ALL
  SELECT 'users_is_technician',
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'workshop_system_users'
        AND column_name = 'is_technician'
    )
)
SELECT check_id, ok FROM checks
UNION ALL
SELECT 'ALL_OK', (SELECT bool_and(ok) FROM checks)
ORDER BY
  CASE WHEN check_id = 'ALL_OK' THEN 1 ELSE 0 END,
  check_id;
