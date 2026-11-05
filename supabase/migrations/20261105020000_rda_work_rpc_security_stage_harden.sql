-- Endurecimento pós-instalação (produção/homologação):
-- 1) Remove overloads legados de rda_work_session_start (sem gate de etapa).
-- 2) Garante UMA assinatura canônica (8 params) com validação de etapa.
-- 3) REVOKE EXECUTE de PUBLIC/anon/authenticated em todas as RPCs sensíveis do cronômetro.
-- 4) Trigger AFTER UPDATE: pausa automática na MESMA transação da mudança de etapa.
-- NÃO altera apontamentos históricos (productive_ms / eventos já gravados).
-- NÃO aplicar automaticamente — rode no SQL Editor após revisão.

-- ---------------------------------------------------------------------------
-- 1) Eliminar bypass: dropar assinaturas antigas de start
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rda_work_session_start(UUID, UUID, UUID, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.rda_work_session_start(UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT);

-- ---------------------------------------------------------------------------
-- 2) Recriar start canônico (8 params) com gate de etapa — preserva time_kind
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rda_work_session_start(
  p_workshop_id UUID,
  p_service_order_id UUID,
  p_technician_user_id UUID,
  p_budget_id UUID DEFAULT NULL,
  p_budget_service_description TEXT DEFAULT NULL,
  p_client_mutation_id TEXT DEFAULT NULL,
  p_budget_service_line_id TEXT DEFAULT NULL,
  p_time_kind TEXT DEFAULT 'execution'
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing public.rda_work_sessions%ROWTYPE;
  v_active public.rda_work_sessions%ROWTYPE;
  v_created public.rda_work_sessions%ROWTYPE;
  v_now TIMESTAMPTZ := now();
  v_event_mut TEXT;
  v_line TEXT := NULLIF(trim(COALESCE(p_budget_service_line_id, '')), '');
  v_kind TEXT := lower(trim(COALESCE(p_time_kind, 'execution')));
  v_os_status TEXT;
BEGIN
  IF v_kind NOT IN ('execution', 'diagnostic') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'time_kind inválido (use execution ou diagnostic).',
      'httpStatus', 400,
      'code', 'RDA_INVALID_TIME_KIND'
    );
  END IF;

  SELECT upper(trim(COALESCE(so.status, ''))) INTO v_os_status
  FROM public.service_orders so
  WHERE so.id = p_service_order_id AND so.workshop_id = p_workshop_id;

  IF v_os_status IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Ordem de serviço não encontrada.',
      'httpStatus', 404,
      'code', 'RDA_OS_NOT_FOUND'
    );
  END IF;

  IF v_kind = 'execution' AND v_os_status <> 'EM_SERVICO' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Tempo de execução só pode iniciar na etapa Em serviço.',
      'httpStatus', 409,
      'code', 'RDA_STAGE_NOT_ALLOWED',
      'osStatus', v_os_status,
      'timeKind', v_kind
    );
  END IF;

  IF v_kind = 'diagnostic' AND v_os_status <> 'AVALIACAO_TECNICA' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Tempo de diagnóstico só pode iniciar na etapa Avaliação técnica.',
      'httpStatus', 409,
      'code', 'RDA_STAGE_NOT_ALLOWED',
      'osStatus', v_os_status,
      'timeKind', v_kind
    );
  END IF;

  IF p_client_mutation_id IS NOT NULL AND length(trim(p_client_mutation_id)) > 0 THEN
    SELECT * INTO v_existing
    FROM public.rda_work_sessions s
    WHERE s.workshop_id = p_workshop_id
      AND s.client_mutation_id = p_client_mutation_id
    LIMIT 1;

    IF FOUND THEN
      IF v_existing.technician_user_id <> p_technician_user_id THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'Mutação pertence a outro técnico.',
          'httpStatus', 403,
          'code', 'RDA_MUTATION_OWNER_MISMATCH'
        );
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.rda_work_session_events e
        WHERE e.session_id = v_existing.id AND e.event_type = 'start'
      ) THEN
        INSERT INTO public.rda_work_session_events (
          workshop_id, session_id, event_type, occurred_at,
          actor_user_id, client_mutation_id, meta
        ) VALUES (
          p_workshop_id, v_existing.id, 'start', v_existing.started_at,
          p_technician_user_id,
          CASE WHEN p_client_mutation_id IS NULL THEN NULL ELSE p_client_mutation_id || ':event' END,
          jsonb_build_object('repaired', true)
        );
      END IF;
      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'session', to_jsonb(v_existing)
      );
    END IF;
  END IF;

  SELECT * INTO v_active
  FROM public.rda_work_sessions s
  WHERE s.workshop_id = p_workshop_id
    AND s.technician_user_id = p_technician_user_id
    AND s.status IN ('running', 'paused')
  LIMIT 1;

  IF FOUND THEN
    IF v_active.service_order_id = p_service_order_id
       AND COALESCE(v_active.budget_service_line_id, '') = COALESCE(v_line, '')
       AND COALESCE(v_active.time_kind, 'execution') = v_kind THEN
      RETURN jsonb_build_object(
        'ok', true,
        'alreadyActive', true,
        'session', to_jsonb(v_active)
      );
    END IF;
    IF v_active.service_order_id = p_service_order_id THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'RDA_ACTIVE_OTHER_SERVICE',
        'error', 'Finalize ou pause o apontamento do serviço atual antes de iniciar outro.',
        'activeSession', to_jsonb(v_active)
      );
    END IF;
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'RDA_ACTIVE_SESSION_EXISTS',
      'error', 'Já existe uma sessão ativa em outra OS.',
      'activeSession', to_jsonb(v_active)
    );
  END IF;

  INSERT INTO public.rda_work_sessions (
    workshop_id,
    service_order_id,
    technician_user_id,
    budget_id,
    budget_service_description,
    budget_service_line_id,
    time_kind,
    status,
    started_at,
    segment_started_at,
    productive_ms,
    paused_ms,
    client_mutation_id,
    updated_at
  ) VALUES (
    p_workshop_id,
    p_service_order_id,
    p_technician_user_id,
    p_budget_id,
    NULLIF(trim(COALESCE(p_budget_service_description, '')), ''),
    v_line,
    v_kind,
    'running',
    v_now,
    v_now,
    0,
    0,
    NULLIF(trim(COALESCE(p_client_mutation_id, '')), ''),
    v_now
  )
  RETURNING * INTO v_created;

  v_event_mut := CASE
    WHEN p_client_mutation_id IS NULL OR length(trim(p_client_mutation_id)) = 0 THEN NULL
    ELSE trim(p_client_mutation_id) || ':event'
  END;

  INSERT INTO public.rda_work_session_events (
    workshop_id, session_id, event_type, occurred_at,
    actor_user_id, client_mutation_id, meta
  ) VALUES (
    p_workshop_id, v_created.id, 'start', v_now,
    p_technician_user_id, v_event_mut,
    jsonb_build_object(
      'budgetServiceLineId', to_jsonb(v_line),
      'budgetServiceDescription', to_jsonb(NULLIF(trim(COALESCE(p_budget_service_description, '')), '')),
      'timeKind', to_jsonb(v_kind),
      'osStatus', to_jsonb(v_os_status)
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'created', true,
    'session', to_jsonb(v_created)
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_active
    FROM public.rda_work_sessions s
    WHERE s.workshop_id = p_workshop_id
      AND s.technician_user_id = p_technician_user_id
      AND s.status IN ('running', 'paused')
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'RDA_ACTIVE_SESSION_EXISTS',
        'error', 'Sessão ativa conflitante.',
        'activeSession', to_jsonb(v_active)
      );
    END IF;
    IF p_client_mutation_id IS NOT NULL THEN
      SELECT * INTO v_existing
      FROM public.rda_work_sessions s
      WHERE s.workshop_id = p_workshop_id
        AND s.client_mutation_id = p_client_mutation_id
      LIMIT 1;
      IF FOUND THEN
        RETURN jsonb_build_object(
          'ok', true,
          'idempotent', true,
          'session', to_jsonb(v_existing)
        );
      END IF;
    END IF;
    RAISE;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) Privileges: só service_role (backend autorizado)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'rda_work_session_start',
        'rda_work_session_pause',
        'rda_work_session_resume',
        'rda_work_session_finish',
        'rda_work_session_correct',
        'rda_work_sessions_auto_pause_for_os_stage'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- Explicit (assinaturas conhecidas) — reforço se o loop acima falhar parcialmente
REVOKE ALL ON FUNCTION public.rda_work_session_start(UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rda_work_session_start(UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.rda_work_session_pause(UUID, UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rda_work_session_pause(UUID, UUID, UUID, TEXT, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.rda_work_session_resume(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rda_work_session_resume(UUID, UUID, UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.rda_work_session_finish(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rda_work_session_finish(UUID, UUID, UUID, TEXT) TO service_role;

DO $$
BEGIN
  REVOKE ALL ON FUNCTION public.rda_work_session_correct(UUID, UUID, UUID, BIGINT, BIGINT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.rda_work_session_correct(UUID, UUID, UUID, BIGINT, BIGINT, TEXT, TEXT) TO service_role;
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'rda_work_session_correct ausente: %', SQLERRM;
END $$;

DO $$
BEGIN
  REVOKE ALL ON FUNCTION public.rda_work_sessions_auto_pause_for_os_stage(UUID, UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.rda_work_sessions_auto_pause_for_os_stage(UUID, UUID, TEXT, TEXT, UUID) TO service_role;
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'auto_pause ausente: %', SQLERRM;
END $$;

-- ---------------------------------------------------------------------------
-- 4) Trigger: pausa automática na mesma transação do UPDATE de status
-- SECURITY DEFINER: funciona mesmo se o UPDATE vier de role sem EXECUTE na RPC
-- (anon/authenticated não podem chamar a RPC direto; o trigger roda como owner).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rda_trg_service_order_status_auto_pause_work()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.workshop_id IS NOT NULL
     AND NEW.id IS NOT NULL THEN
    -- Mesma transação do UPDATE: se a pausa falhar, o status também reverte.
    PERFORM public.rda_work_sessions_auto_pause_for_os_stage(
      NEW.workshop_id,
      NEW.id,
      COALESCE(OLD.status, ''),
      COALESCE(NEW.status, ''),
      NULL
    );
  END IF;
  RETURN NEW;
END;
$$;

-- auto_pause também DEFINER: escrita nas tabelas RLS-deny para anon/authenticated
DO $$
BEGIN
  ALTER FUNCTION public.rda_work_sessions_auto_pause_for_os_stage(UUID, UUID, TEXT, TEXT, UUID)
    SECURITY DEFINER;
  ALTER FUNCTION public.rda_work_sessions_auto_pause_for_os_stage(UUID, UUID, TEXT, TEXT, UUID)
    SET search_path = public;
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'auto_pause ALTER SECURITY DEFINER: %', SQLERRM;
END $$;

DROP TRIGGER IF EXISTS trg_rda_os_status_auto_pause_work ON public.service_orders;
CREATE TRIGGER trg_rda_os_status_auto_pause_work
  AFTER UPDATE OF status ON public.service_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.rda_trg_service_order_status_auto_pause_work();

REVOKE ALL ON FUNCTION public.rda_trg_service_order_status_auto_pause_work() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rda_trg_service_order_status_auto_pause_work() FROM anon, authenticated;

COMMENT ON FUNCTION public.rda_trg_service_order_status_auto_pause_work() IS
  'AFTER UPDATE status: auto-pausa sessões running incompatíveis na mesma transação. Sem DELETE de histórico.';

-- ---------------------------------------------------------------------------
-- 5) Verificação (só leitura) — falha se ainda houver overload legado (< 8 args)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_bad INT;
  v_ok INT;
BEGIN
  SELECT count(*) INTO v_bad
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'rda_work_session_start'
    AND p.pronargs < 8;

  SELECT count(*) INTO v_ok
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'rda_work_session_start'
    AND p.pronargs = 8;

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'Ainda existem % overload(s) legado(s) de rda_work_session_start (pronargs < 8)', v_bad;
  END IF;
  IF v_ok <> 1 THEN
    RAISE EXCEPTION 'Esperado exatamente 1 rda_work_session_start com 8 args; encontrado %', v_ok;
  END IF;

  -- anon/authenticated não devem executar start
  IF has_function_privilege('anon', 'public.rda_work_session_start(uuid,uuid,uuid,uuid,text,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon ainda tem EXECUTE em rda_work_session_start';
  END IF;
  IF has_function_privilege('authenticated', 'public.rda_work_session_start(uuid,uuid,uuid,uuid,text,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated ainda tem EXECUTE em rda_work_session_start';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.rda_work_session_start(uuid,uuid,uuid,uuid,text,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role sem EXECUTE em rda_work_session_start';
  END IF;

  RAISE NOTICE 'OK: assinatura canônica única de start (8 args); overloads legados removidos; EXECUTE só service_role';
END $$;
