-- Verificações de sanidade pós-migration / pós-seed (projeto de TESTE).
-- Esperado: cada bloco retorna ok=true ou contagens coerentes.

-- 1) Tabelas RDA existem
SELECT 'tables' AS check_id,
  to_regclass('public.rda_work_sessions') IS NOT NULL
  AND to_regclass('public.rda_work_session_events') IS NOT NULL
  AND to_regclass('public.rda_eval_requests') IS NOT NULL
  AND to_regclass('public.rda_evaluations') IS NOT NULL AS ok;

-- 2) RLS ligado
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

-- 3) RPCs existem
SELECT 'rpcs' AS check_id,
  to_regprocedure('public.rda_work_session_start(uuid,uuid,uuid,uuid,text,text)') IS NOT NULL
  AND to_regprocedure('public.rda_work_session_finish(uuid,uuid,uuid,text)') IS NOT NULL
  AND to_regprocedure('public.rda_eval_request_ensure_for_session(uuid,uuid,text)') IS NOT NULL AS ok;

-- 4) EXECUTE não deve estar em anon/authenticated (amostra finish)
SELECT 'revoke_anon' AS check_id,
  NOT has_function_privilege('anon', 'public.rda_work_session_finish(uuid,uuid,uuid,text)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.rda_work_session_finish(uuid,uuid,uuid,text)', 'EXECUTE')
  AS ok;

-- 5) Seed oficina
SELECT 'seed_workshop' AS check_id,
  EXISTS (
    SELECT 1 FROM public.workshops
    WHERE id = '11111111-1111-4111-8111-111111111111'
  ) AS ok;

-- 6) Uma solicitação por sessão (constraint)
SELECT 'uq_eval_session' AS check_id,
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rda_eval_requests_one_per_session'
  ) AS ok;

-- 7) Após um finish de teste: count requests == 1 por session (rodar depois do roteiro)
-- SELECT work_session_id, count(*) FROM rda_eval_requests GROUP BY 1 HAVING count(*) > 1;
