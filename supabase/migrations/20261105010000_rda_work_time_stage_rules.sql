-- Regras de etapa × tempo RDA: diagnóstico (AVALIACAO_TECNICA) vs execução (EM_SERVICO).
-- INCREMENTAL. NÃO aplica automaticamente em produção.
-- Preserva sessões existentes (time_kind default = execution).
-- NÃO exclui apontamentos.

-- ---------------------------------------------------------------------------
-- 1) Coluna time_kind + motivo de pausa por mudança de etapa
-- ---------------------------------------------------------------------------
ALTER TABLE public.rda_work_sessions
  ADD COLUMN IF NOT EXISTS time_kind TEXT NOT NULL DEFAULT 'execution';

DO $$
BEGIN
  ALTER TABLE public.rda_work_sessions
    DROP CONSTRAINT IF EXISTS rda_work_sessions_time_kind_check;
  ALTER TABLE public.rda_work_sessions
    ADD CONSTRAINT rda_work_sessions_time_kind_check
    CHECK (time_kind IN ('execution', 'diagnostic'));
EXCEPTION WHEN others THEN
  RAISE NOTICE 'time_kind check: %', SQLERRM;
END $$;

COMMENT ON COLUMN public.rda_work_sessions.time_kind IS
  'execution = só em EM_SERVICO; diagnostic = só em AVALIACAO_TECNICA. Default execution preserva legado.';

CREATE INDEX IF NOT EXISTS idx_rda_work_sessions_os_kind_status
  ON public.rda_work_sessions (workshop_id, service_order_id, time_kind, status);

INSERT INTO public.rda_work_pause_reasons (id, label, requires_note, sort_order, active)
VALUES ('stage_change', 'Mudança de etapa da OS', false, 90, true)
ON CONFLICT (id) DO UPDATE
SET label = EXCLUDED.label,
    requires_note = EXCLUDED.requires_note,
    sort_order = EXCLUDED.sort_order,
    active = true;

-- ---------------------------------------------------------------------------
-- 2) start: exige etapa compatível com time_kind
-- Remove TODAS as assinaturas anteriores (6 e 7 params) para não deixar bypass.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rda_work_session_start(UUID, UUID, UUID, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.rda_work_session_start(UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT);

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

REVOKE ALL ON FUNCTION public.rda_work_session_start(UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rda_work_session_start(UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rda_work_session_start(UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- 3) resume: só na etapa compatível (histórico preservado)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rda_work_session_resume(
  p_workshop_id UUID,
  p_session_id UUID,
  p_technician_user_id UUID,
  p_client_mutation_id TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_session public.rda_work_sessions%ROWTYPE;
  v_updated public.rda_work_sessions%ROWTYPE;
  v_now TIMESTAMPTZ := now();
  v_paused BIGINT;
  v_event_session UUID;
  v_kind TEXT;
  v_os_status TEXT;
BEGIN
  IF p_client_mutation_id IS NOT NULL AND length(trim(p_client_mutation_id)) > 0 THEN
    SELECT e.session_id INTO v_event_session
    FROM public.rda_work_session_events e
    WHERE e.workshop_id = p_workshop_id
      AND e.client_mutation_id = p_client_mutation_id
    LIMIT 1;
    IF v_event_session IS NOT NULL THEN
      SELECT * INTO v_session FROM public.rda_work_sessions WHERE id = v_event_session;
      IF v_session.technician_user_id <> p_technician_user_id THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'Mutação pertence a outro técnico.',
          'httpStatus', 403,
          'code', 'RDA_MUTATION_OWNER_MISMATCH'
        );
      END IF;
      RETURN jsonb_build_object('ok', true, 'idempotent', true, 'session', to_jsonb(v_session));
    END IF;
  END IF;

  SELECT * INTO v_session
  FROM public.rda_work_sessions s
  WHERE s.id = p_session_id AND s.workshop_id = p_workshop_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sessão não encontrada.', 'httpStatus', 404);
  END IF;
  IF v_session.technician_user_id <> p_technician_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sessão de outro técnico.', 'httpStatus', 403);
  END IF;
  IF v_session.status = 'running' THEN
    RETURN jsonb_build_object('ok', true, 'alreadyRunning', true, 'session', to_jsonb(v_session));
  END IF;
  IF v_session.status <> 'paused' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Só é possível retomar sessão pausada.', 'httpStatus', 409);
  END IF;

  v_kind := lower(trim(COALESCE(v_session.time_kind, 'execution')));

  SELECT upper(trim(COALESCE(so.status, ''))) INTO v_os_status
  FROM public.service_orders so
  WHERE so.id = v_session.service_order_id AND so.workshop_id = p_workshop_id;

  IF v_kind = 'execution' AND v_os_status IS DISTINCT FROM 'EM_SERVICO' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Retome o tempo de execução apenas na etapa Em serviço.',
      'httpStatus', 409,
      'code', 'RDA_STAGE_NOT_ALLOWED',
      'osStatus', v_os_status,
      'timeKind', v_kind
    );
  END IF;
  IF v_kind = 'diagnostic' AND v_os_status IS DISTINCT FROM 'AVALIACAO_TECNICA' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Retome o tempo de diagnóstico apenas na etapa Avaliação técnica.',
      'httpStatus', 409,
      'code', 'RDA_STAGE_NOT_ALLOWED',
      'osStatus', v_os_status,
      'timeKind', v_kind
    );
  END IF;

  v_paused := COALESCE(v_session.paused_ms, 0);
  IF v_session.current_pause_started_at IS NOT NULL THEN
    v_paused := v_paused + GREATEST(
      0, (EXTRACT(EPOCH FROM (v_now - v_session.current_pause_started_at)) * 1000)::BIGINT
    );
  END IF;

  UPDATE public.rda_work_sessions
  SET status = 'running', paused_ms = v_paused, segment_started_at = v_now,
      current_pause_reason_id = NULL, current_pause_note = NULL,
      current_pause_started_at = NULL, updated_at = v_now
  WHERE id = p_session_id AND workshop_id = p_workshop_id
    AND status = 'paused' AND technician_user_id = p_technician_user_id
  RETURNING * INTO v_updated;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Não foi possível retomar (estado alterado).', 'httpStatus', 409);
  END IF;

  INSERT INTO public.rda_work_session_events (
    workshop_id, session_id, event_type, occurred_at,
    actor_user_id, client_mutation_id, meta
  ) VALUES (
    p_workshop_id, p_session_id, 'resume', v_now,
    p_technician_user_id, NULLIF(trim(COALESCE(p_client_mutation_id, '')), ''),
    jsonb_build_object('osStatus', to_jsonb(v_os_status), 'timeKind', to_jsonb(v_kind))
  );

  RETURN jsonb_build_object('ok', true, 'session', to_jsonb(v_updated));
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) Auto-pause ao sair de EM_SERVICO / AVALIACAO_TECNICA
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rda_work_sessions_auto_pause_for_os_stage(
  p_workshop_id UUID,
  p_service_order_id UUID,
  p_previous_status TEXT,
  p_next_status TEXT,
  p_actor_user_id UUID DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_prev TEXT := upper(trim(COALESCE(p_previous_status, '')));
  v_next TEXT := upper(trim(COALESCE(p_next_status, '')));
  v_now TIMESTAMPTZ := now();
  v_kinds TEXT[] := ARRAY[]::TEXT[];
  r public.rda_work_sessions%ROWTYPE;
  v_prod BIGINT;
  v_paused_ids UUID[] := ARRAY[]::UUID[];
  v_count INT := 0;
BEGIN
  IF v_prev = v_next THEN
    RETURN jsonb_build_object('ok', true, 'pausedCount', 0, 'sessionIds', '[]'::jsonb);
  END IF;

  IF v_prev = 'EM_SERVICO' AND v_next <> 'EM_SERVICO' THEN
    v_kinds := array_append(v_kinds, 'execution');
  END IF;
  IF v_prev = 'AVALIACAO_TECNICA' AND v_next <> 'AVALIACAO_TECNICA' THEN
    v_kinds := array_append(v_kinds, 'diagnostic');
  END IF;

  IF array_length(v_kinds, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'pausedCount', 0, 'sessionIds', '[]'::jsonb);
  END IF;

  FOR r IN
    SELECT *
    FROM public.rda_work_sessions s
    WHERE s.workshop_id = p_workshop_id
      AND s.service_order_id = p_service_order_id
      AND s.status = 'running'
      AND COALESCE(s.time_kind, 'execution') = ANY (v_kinds)
    FOR UPDATE
  LOOP
    v_prod := COALESCE(r.productive_ms, 0);
    IF r.segment_started_at IS NOT NULL THEN
      v_prod := v_prod + GREATEST(
        0, (EXTRACT(EPOCH FROM (v_now - r.segment_started_at)) * 1000)::BIGINT
      );
    END IF;

    UPDATE public.rda_work_sessions
    SET status = 'paused',
        productive_ms = v_prod,
        segment_started_at = NULL,
        current_pause_reason_id = 'stage_change',
        current_pause_note = 'Pausa automática: OS saiu da etapa produtiva.',
        current_pause_started_at = v_now,
        updated_at = v_now
    WHERE id = r.id AND workshop_id = p_workshop_id AND status = 'running';

    IF FOUND THEN
      INSERT INTO public.rda_work_session_events (
        workshop_id, session_id, event_type, occurred_at,
        pause_reason_id, pause_note, actor_user_id, client_mutation_id, meta
      ) VALUES (
        p_workshop_id, r.id, 'pause', v_now,
        'stage_change',
        'Pausa automática: OS saiu da etapa produtiva.',
        p_actor_user_id,
        NULL,
        jsonb_build_object(
          'auto', true,
          'previousStatus', to_jsonb(v_prev),
          'nextStatus', to_jsonb(v_next),
          'timeKind', to_jsonb(COALESCE(r.time_kind, 'execution'))
        )
      );
      v_paused_ids := array_append(v_paused_ids, r.id);
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'pausedCount', v_count,
    'sessionIds', to_jsonb(v_paused_ids),
    'kinds', to_jsonb(v_kinds)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rda_work_sessions_auto_pause_for_os_stage(UUID, UUID, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rda_work_sessions_auto_pause_for_os_stage(UUID, UUID, TEXT, TEXT, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rda_work_sessions_auto_pause_for_os_stage(UUID, UUID, TEXT, TEXT, UUID) TO service_role;

COMMENT ON FUNCTION public.rda_work_sessions_auto_pause_for_os_stage IS
  'Pausa sessões running de execução/diagnóstico ao sair de EM_SERVICO / AVALIACAO_TECNICA. Preserva totais.';

-- resume: só backend
REVOKE ALL ON FUNCTION public.rda_work_session_resume(UUID, UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rda_work_session_resume(UUID, UUID, UUID, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rda_work_session_resume(UUID, UUID, UUID, TEXT) TO service_role;
