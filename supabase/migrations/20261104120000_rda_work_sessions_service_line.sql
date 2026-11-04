-- RDA work sessions: vínculo estável com linha de serviço do orçamento + correção gerencial.
-- INCREMENTAL — não recria tabelas. NÃO aplicar em produção sem autorização.

-- ---------------------------------------------------------------------------
-- 1) Coluna de linha de serviço (nullable = apontamento geral / legado)
-- ---------------------------------------------------------------------------
ALTER TABLE public.rda_work_sessions
  ADD COLUMN IF NOT EXISTS budget_service_line_id TEXT;

COMMENT ON COLUMN public.rda_work_sessions.budget_service_line_id IS
  'Identificador estável da linha em budgets.services[].line_id. NULL = apontamento geral da OS ou legado.';

CREATE INDEX IF NOT EXISTS idx_rda_work_sessions_service_line
  ON public.rda_work_sessions (workshop_id, budget_service_line_id)
  WHERE budget_service_line_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) Tabela de auditoria de correções gerenciais (além do evento `correct`)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rda_work_session_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.rda_work_sessions(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  previous_productive_ms BIGINT NOT NULL CHECK (previous_productive_ms >= 0),
  previous_paused_ms BIGINT NOT NULL CHECK (previous_paused_ms >= 0),
  new_productive_ms BIGINT NOT NULL CHECK (new_productive_ms >= 0),
  new_paused_ms BIGINT NOT NULL CHECK (new_paused_ms >= 0),
  client_mutation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rda_work_session_corrections_mutation
  ON public.rda_work_session_corrections (workshop_id, client_mutation_id)
  WHERE client_mutation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rda_work_session_corrections_session
  ON public.rda_work_session_corrections (session_id, created_at DESC);

ALTER TABLE public.rda_work_session_corrections ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.rda_work_session_corrections IS
  'Correções gerenciais auditadas de tempos de sessão RDA (append-only).';

-- ---------------------------------------------------------------------------
-- 3) RPC start: aceita line_id; impede trocar de serviço sem finalizar/pausar
-- DROP da assinatura antiga (6 args) para não criar overload paralelo.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rda_work_session_start(UUID, UUID, UUID, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.rda_work_session_start(
  p_workshop_id UUID,
  p_service_order_id UUID,
  p_technician_user_id UUID,
  p_budget_id UUID DEFAULT NULL,
  p_budget_service_description TEXT DEFAULT NULL,
  p_client_mutation_id TEXT DEFAULT NULL,
  p_budget_service_line_id TEXT DEFAULT NULL
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
BEGIN
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
       AND COALESCE(v_active.budget_service_line_id, '') = COALESCE(v_line, '') THEN
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
      'budgetServiceDescription', to_jsonb(NULLIF(trim(COALESCE(p_budget_service_description, '')), ''))
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
-- 4) RPC de correção gerencial (apenas finalizada; append-only audit)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rda_work_session_correct(
  p_workshop_id UUID,
  p_session_id UUID,
  p_actor_user_id UUID,
  p_new_productive_ms BIGINT,
  p_new_paused_ms BIGINT,
  p_reason TEXT,
  p_client_mutation_id TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_session public.rda_work_sessions%ROWTYPE;
  v_prev_prod BIGINT;
  v_prev_paused BIGINT;
  v_reason TEXT := NULLIF(trim(COALESCE(p_reason, '')), '');
  v_now TIMESTAMPTZ := now();
  v_corr_id UUID;
BEGIN
  IF v_reason IS NULL OR length(v_reason) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RDA_CORRECT_REASON_REQUIRED', 'error', 'Justificativa obrigatória.');
  END IF;
  IF p_new_productive_ms IS NULL OR p_new_productive_ms < 0 OR p_new_paused_ms IS NULL OR p_new_paused_ms < 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RDA_CORRECT_INVALID_MS', 'error', 'Tempos inválidos.');
  END IF;

  IF p_client_mutation_id IS NOT NULL AND length(trim(p_client_mutation_id)) > 0 THEN
    SELECT id INTO v_corr_id
    FROM public.rda_work_session_corrections c
    WHERE c.workshop_id = p_workshop_id AND c.client_mutation_id = p_client_mutation_id
    LIMIT 1;
    IF FOUND THEN
      SELECT * INTO v_session FROM public.rda_work_sessions WHERE id = p_session_id AND workshop_id = p_workshop_id;
      RETURN jsonb_build_object('ok', true, 'idempotent', true, 'session', to_jsonb(v_session));
    END IF;
  END IF;

  SELECT * INTO v_session
  FROM public.rda_work_sessions s
  WHERE s.id = p_session_id AND s.workshop_id = p_workshop_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RDA_SESSION_NOT_FOUND', 'error', 'Sessão não encontrada.');
  END IF;
  IF v_session.status <> 'finished' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RDA_CORRECT_ONLY_FINISHED', 'error', 'Só é possível corrigir sessões finalizadas.');
  END IF;

  v_prev_prod := v_session.productive_ms;
  v_prev_paused := v_session.paused_ms;

  UPDATE public.rda_work_sessions
  SET productive_ms = p_new_productive_ms,
      paused_ms = p_new_paused_ms,
      updated_at = v_now
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  INSERT INTO public.rda_work_session_corrections (
    workshop_id, session_id, actor_user_id, reason,
    previous_productive_ms, previous_paused_ms,
    new_productive_ms, new_paused_ms, client_mutation_id
  ) VALUES (
    p_workshop_id, p_session_id, p_actor_user_id, v_reason,
    v_prev_prod, v_prev_paused,
    p_new_productive_ms, p_new_paused_ms,
    NULLIF(trim(COALESCE(p_client_mutation_id, '')), '')
  );

  INSERT INTO public.rda_work_session_events (
    workshop_id, session_id, event_type, occurred_at,
    actor_user_id, client_mutation_id, meta
  ) VALUES (
    p_workshop_id, p_session_id, 'correct', v_now,
    p_actor_user_id,
    CASE WHEN p_client_mutation_id IS NULL OR length(trim(p_client_mutation_id)) = 0 THEN NULL
         ELSE trim(p_client_mutation_id) || ':event' END,
    jsonb_build_object(
      'reason', v_reason,
      'previous', jsonb_build_object('productiveMs', v_prev_prod, 'pausedMs', v_prev_paused),
      'next', jsonb_build_object('productiveMs', p_new_productive_ms, 'pausedMs', p_new_paused_ms)
    )
  );

  RETURN jsonb_build_object('ok', true, 'session', to_jsonb(v_session));
END;
$$;

REVOKE ALL ON FUNCTION public.rda_work_session_start(UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rda_work_session_correct(UUID, UUID, UUID, BIGINT, BIGINT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rda_work_session_start(UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.rda_work_session_correct(UUID, UUID, UUID, BIGINT, BIGINT, TEXT, TEXT) TO service_role;
