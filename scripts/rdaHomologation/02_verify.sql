-- Verificações pós-bootstrap + migrations RDA + seed (projeto de TESTE).

-- 0) Bootstrap core
SELECT 'bootstrap_workshops' AS check_id,
  to_regclass('public.workshops') IS NOT NULL AS ok;
SELECT 'bootstrap_customers' AS check_id,
  to_regclass('public.customers') IS NOT NULL AS ok;
SELECT 'bootstrap_service_orders' AS check_id,
  to_regclass('public.service_orders') IS NOT NULL AS ok;
SELECT 'bootstrap_budgets' AS check_id,
  to_regclass('public.budgets') IS NOT NULL AS ok;
SELECT 'bootstrap_system_users' AS check_id,
  to_regclass('public.workshop_system_users') IS NOT NULL AS ok;

-- 1) Tabelas RDA
SELECT 'tables_rda' AS check_id,
  to_regclass('public.rda_work_sessions') IS NOT NULL
  AND to_regclass('public.rda_work_session_events') IS NOT NULL
  AND to_regclass('public.rda_eval_requests') IS NOT NULL
  AND to_regclass('public.rda_evaluations') IS NOT NULL AS ok;

-- 2) RLS ligado (RDA)
SELECT 'rls' AS check_id,
  bool_and(c.relrowsecurity) AS ok
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'rda_work_sessions',
    'rda_work_session_events',
    'rda_eval_requests',
    'rda_evaluations',
    'rda_eval_audit_events'
  );

-- 3) RPCs
SELECT 'rpcs' AS check_id,
  to_regprocedure('public.rda_work_session_start(uuid,uuid,uuid,uuid,text,text)') IS NOT NULL
  AND to_regprocedure('public.rda_work_session_finish(uuid,uuid,uuid,text)') IS NOT NULL
  AND to_regprocedure('public.rda_eval_request_ensure_for_session(uuid,uuid,text)') IS NOT NULL
  AND to_regprocedure('public.get_next_os_number(uuid)') IS NOT NULL AS ok;

-- 4) EXECUTE não em anon/authenticated
SELECT 'revoke_anon' AS check_id,
  NOT has_function_privilege('anon', 'public.rda_work_session_finish(uuid,uuid,uuid,text)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.rda_work_session_finish(uuid,uuid,uuid,text)', 'EXECUTE')
  AS ok;

-- 5) Seed
SELECT 'seed_workshop' AS check_id,
  EXISTS (
    SELECT 1 FROM public.workshops
    WHERE id = '11111111-1111-4111-8111-111111111111'
  ) AS ok;

SELECT 'seed_users' AS check_id,
  (SELECT count(*) FROM public.workshop_system_users
   WHERE workshop_id = '11111111-1111-4111-8111-111111111111') >= 4 AS ok;

SELECT 'seed_os' AS check_id,
  EXISTS (SELECT 1 FROM public.service_orders WHERE id = '33333333-3333-4333-8333-333333333301')
  AND EXISTS (SELECT 1 FROM public.service_orders WHERE id = '33333333-3333-4333-8333-333333333302')
  AS ok;

-- 6) Constraint 1 request / sessão
SELECT 'uq_eval_session' AS check_id,
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rda_eval_requests_one_per_session'
  ) AS ok;

-- 7) Colunas críticas das APIs RDA
SELECT 'so_workshop_id' AS check_id,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'service_orders'
      AND column_name = 'workshop_id'
  ) AS ok;

SELECT 'users_is_technician' AS check_id,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workshop_system_users'
      AND column_name = 'is_technician'
  ) AS ok;
