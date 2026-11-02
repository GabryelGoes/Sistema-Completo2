-- RDA work sessions: integridade, RLS e operações atômicas (sessão + evento).
-- NÃO aplicar em produção sem homologação. Rode só no ambiente de teste.

-- ---------------------------------------------------------------------------
-- 1) RLS: negar acesso direto a anon/authenticated (API usa service_role).
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.rda_work_pause_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.rda_work_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.rda_work_session_events ENABLE ROW LEVEL SECURITY;

-- Sem políticas = deny-by-default para roles sujeitos a RLS.
-- service_role continua bypassando RLS.

-- ---------------------------------------------------------------------------
-- 2) Eventos: histórico append-only (bloqueia UPDATE).
--    DELETE em cascata da sessão/OS permanece permitido.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rda_work_session_events_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'rda_work_session_events é imutável (UPDATE não permitido)';
END;
$$;

DROP TRIGGER IF EXISTS trg_rda_work_session_events_immutable ON public.rda_work_session_events;
CREATE TRIGGER trg_rda_work_session_events_immutable
  BEFORE UPDATE ON public.rda_work_session_events
  FOR EACH ROW
  EXECUTE FUNCTION public.rda_work_session_events_immutable();

-- ---------------------------------------------------------------------------
-- 3) Consistência de oficina entre sessão, OS, técnico e orçamento.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rda_work_sessions_enforce_refs()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_so_workshop UUID;
  v_tech_workshop UUID;
  v_tech_is_technician BOOLEAN;
  v_budget_workshop UUID;
  v_budget_so UUID;
BEGIN
  SELECT so.workshop_id INTO v_so_workshop
  FROM public.service_orders so
  WHERE so.id = NEW.service_order_id;

  IF v_so_workshop IS NULL THEN
    RAISE EXCEPTION 'OS % inexistente', NEW.service_order_id;
  END IF;
  IF v_so_workshop <> NEW.workshop_id THEN
    RAISE EXCEPTION 'OS % não pertence à oficina da sessão', NEW.service_order_id;
  END IF;

  SELECT u.workshop_id, COALESCE(u.is_technician, false)
    INTO v_tech_workshop, v_tech_is_technician
  FROM public.workshop_system_users u
  WHERE u.id = NEW.technician_user_id;

  IF v_tech_workshop IS NULL THEN
    RAISE EXCEPTION 'Técnico % inexistente', NEW.technician_user_id;
  END IF;
  IF v_tech_workshop <> NEW.workshop_id THEN
    RAISE EXCEPTION 'Técnico % não pertence à oficina da sessão', NEW.technician_user_id;
  END IF;
  IF NOT v_tech_is_technician THEN
    RAISE EXCEPTION 'Usuário % não está marcado como técnico', NEW.technician_user_id;
  END IF;

  IF NEW.budget_id IS NOT NULL THEN
    SELECT b.workshop_id, b.service_order_id
      INTO v_budget_workshop, v_budget_so
    FROM public.budgets b
    WHERE b.id = NEW.budget_id;

    IF v_budget_workshop IS NULL THEN
      RAISE EXCEPTION 'Orçamento % inexistente', NEW.budget_id;
    END IF;
    IF v_budget_workshop <> NEW.workshop_id THEN
      RAISE EXCEPTION 'Orçamento % de outra oficina', NEW.budget_id;
    END IF;
    IF v_budget_so <> NEW.service_order_id THEN
      RAISE EXCEPTION 'Orçamento % não pertence à OS da sessão', NEW.budget_id;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rda_work_sessions_enforce_refs ON public.rda_work_sessions;
CREATE TRIGGER trg_rda_work_sessions_enforce_refs
  BEFORE INSERT OR UPDATE OF workshop_id, service_order_id, technician_user_id, budget_id
  ON public.rda_work_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.rda_work_sessions_enforce_refs();

-- Eventos devem referenciar a mesma oficina da sessão
CREATE OR REPLACE FUNCTION public.rda_work_session_events_enforce_refs()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_session_workshop UUID;
BEGIN
  SELECT s.workshop_id INTO v_session_workshop
  FROM public.rda_work_sessions s
  WHERE s.id = NEW.session_id;

  IF v_session_workshop IS NULL THEN
    RAISE EXCEPTION 'Sessão % inexistente', NEW.session_id;
  END IF;
  IF v_session_workshop <> NEW.workshop_id THEN
    RAISE EXCEPTION 'Evento com workshop divergente da sessão';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rda_work_session_events_enforce_refs ON public.rda_work_session_events;
CREATE TRIGGER trg_rda_work_session_events_enforce_refs
  BEFORE INSERT ON public.rda_work_session_events
  FOR EACH ROW
  EXECUTE FUNCTION public.rda_work_session_events_enforce_refs();

-- ---------------------------------------------------------------------------
-- 4) RPCs atômicas: atualizam sessão e gravam evento na mesma transação.
--    Chamadas apenas via service_role após ACL no backend Express.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rda_work_session_start(
  p_workshop_id UUID,
  p_service_order_id UUID,
  p_technician_user_id UUID,
  p_budget_id UUID DEFAULT NULL,
  p_budget_service_description TEXT DEFAULT NULL,
  p_client_mutation_id TEXT DEFAULT NULL
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
BEGIN
  IF p_client_mutation_id IS NOT NULL AND length(trim(p_client_mutation_id)) > 0 THEN
    SELECT * INTO v_existing
    FROM public.rda_work_sessions s
    WHERE s.workshop_id = p_workshop_id
      AND s.client_mutation_id = p_client_mutation_id
    LIMIT 1;

    IF FOUND THEN
      -- Repara evento start ausente (falha parcial anterior)
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
    IF v_active.service_order_id = p_service_order_id THEN
      RETURN jsonb_build_object(
        'ok', true,
        'alreadyActive', true,
        'session', to_jsonb(v_active)
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
    p_technician_user_id, v_event_mut, '{}'::jsonb
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

CREATE OR REPLACE FUNCTION public.rda_work_session_pause(
  p_workshop_id UUID,
  p_session_id UUID,
  p_technician_user_id UUID,
  p_reason_id TEXT,
  p_note TEXT DEFAULT NULL,
  p_client_mutation_id TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_session public.rda_work_sessions%ROWTYPE;
  v_updated public.rda_work_sessions%ROWTYPE;
  v_reason RECORD;
  v_now TIMESTAMPTZ := now();
  v_productive BIGINT;
  v_event_session UUID;
BEGIN
  IF p_client_mutation_id IS NOT NULL AND length(trim(p_client_mutation_id)) > 0 THEN
    SELECT e.session_id INTO v_event_session
    FROM public.rda_work_session_events e
    WHERE e.workshop_id = p_workshop_id
      AND e.client_mutation_id = p_client_mutation_id
    LIMIT 1;
    IF v_event_session IS NOT NULL THEN
      SELECT * INTO v_session FROM public.rda_work_sessions WHERE id = v_event_session;
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
  IF v_session.status = 'paused' THEN
    RETURN jsonb_build_object('ok', true, 'alreadyPaused', true, 'session', to_jsonb(v_session));
  END IF;
  IF v_session.status <> 'running' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Só é possível pausar sessão em execução.', 'httpStatus', 409);
  END IF;

  SELECT r.id, r.requires_note, r.active INTO v_reason
  FROM public.rda_work_pause_reasons r
  WHERE r.id = p_reason_id;
  IF NOT FOUND OR v_reason.active IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Motivo de pausa inválido.', 'httpStatus', 400);
  END IF;
  IF v_reason.requires_note IS TRUE AND (p_note IS NULL OR length(trim(p_note)) = 0) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Este motivo exige observação.', 'httpStatus', 400);
  END IF;

  v_productive := COALESCE(v_session.productive_ms, 0);
  IF v_session.segment_started_at IS NOT NULL THEN
    v_productive := v_productive + GREATEST(
      0,
      (EXTRACT(EPOCH FROM (v_now - v_session.segment_started_at)) * 1000)::BIGINT
    );
  END IF;

  UPDATE public.rda_work_sessions
  SET
    status = 'paused',
    productive_ms = v_productive,
    segment_started_at = NULL,
    current_pause_reason_id = p_reason_id,
    current_pause_note = NULLIF(trim(COALESCE(p_note, '')), ''),
    current_pause_started_at = v_now,
    updated_at = v_now
  WHERE id = p_session_id
    AND workshop_id = p_workshop_id
    AND status = 'running'
    AND technician_user_id = p_technician_user_id
  RETURNING * INTO v_updated;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Não foi possível pausar (estado alterado).', 'httpStatus', 409);
  END IF;

  INSERT INTO public.rda_work_session_events (
    workshop_id, session_id, event_type, occurred_at,
    pause_reason_id, pause_note, actor_user_id, client_mutation_id, meta
  ) VALUES (
    p_workshop_id, p_session_id, 'pause', v_now,
    p_reason_id, NULLIF(trim(COALESCE(p_note, '')), ''),
    p_technician_user_id, NULLIF(trim(COALESCE(p_client_mutation_id, '')), ''),
    '{}'::jsonb
  );

  RETURN jsonb_build_object('ok', true, 'session', to_jsonb(v_updated));
END;
$$;

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
BEGIN
  IF p_client_mutation_id IS NOT NULL AND length(trim(p_client_mutation_id)) > 0 THEN
    SELECT e.session_id INTO v_event_session
    FROM public.rda_work_session_events e
    WHERE e.workshop_id = p_workshop_id
      AND e.client_mutation_id = p_client_mutation_id
    LIMIT 1;
    IF v_event_session IS NOT NULL THEN
      SELECT * INTO v_session FROM public.rda_work_sessions WHERE id = v_event_session;
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

  v_paused := COALESCE(v_session.paused_ms, 0);
  IF v_session.current_pause_started_at IS NOT NULL THEN
    v_paused := v_paused + GREATEST(
      0,
      (EXTRACT(EPOCH FROM (v_now - v_session.current_pause_started_at)) * 1000)::BIGINT
    );
  END IF;

  UPDATE public.rda_work_sessions
  SET
    status = 'running',
    paused_ms = v_paused,
    segment_started_at = v_now,
    current_pause_reason_id = NULL,
    current_pause_note = NULL,
    current_pause_started_at = NULL,
    updated_at = v_now
  WHERE id = p_session_id
    AND workshop_id = p_workshop_id
    AND status = 'paused'
    AND technician_user_id = p_technician_user_id
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
    '{}'::jsonb
  );

  RETURN jsonb_build_object('ok', true, 'session', to_jsonb(v_updated));
END;
$$;

CREATE OR REPLACE FUNCTION public.rda_work_session_finish(
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
  v_productive BIGINT;
  v_paused BIGINT;
  v_event_session UUID;
BEGIN
  IF p_client_mutation_id IS NOT NULL AND length(trim(p_client_mutation_id)) > 0 THEN
    SELECT e.session_id INTO v_event_session
    FROM public.rda_work_session_events e
    WHERE e.workshop_id = p_workshop_id
      AND e.client_mutation_id = p_client_mutation_id
    LIMIT 1;
    IF v_event_session IS NOT NULL THEN
      SELECT * INTO v_session FROM public.rda_work_sessions WHERE id = v_event_session;
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
  IF v_session.status = 'finished' THEN
    RETURN jsonb_build_object('ok', true, 'alreadyFinished', true, 'session', to_jsonb(v_session));
  END IF;
  IF v_session.status NOT IN ('running', 'paused') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sessão não pode ser finalizada.', 'httpStatus', 409);
  END IF;

  v_productive := COALESCE(v_session.productive_ms, 0);
  v_paused := COALESCE(v_session.paused_ms, 0);
  IF v_session.status = 'running' AND v_session.segment_started_at IS NOT NULL THEN
    v_productive := v_productive + GREATEST(
      0,
      (EXTRACT(EPOCH FROM (v_now - v_session.segment_started_at)) * 1000)::BIGINT
    );
  END IF;
  IF v_session.status = 'paused' AND v_session.current_pause_started_at IS NOT NULL THEN
    v_paused := v_paused + GREATEST(
      0,
      (EXTRACT(EPOCH FROM (v_now - v_session.current_pause_started_at)) * 1000)::BIGINT
    );
  END IF;

  UPDATE public.rda_work_sessions
  SET
    status = 'finished',
    productive_ms = v_productive,
    paused_ms = v_paused,
    ended_at = v_now,
    segment_started_at = NULL,
    current_pause_reason_id = NULL,
    current_pause_note = NULL,
    current_pause_started_at = NULL,
    updated_at = v_now
  WHERE id = p_session_id
    AND workshop_id = p_workshop_id
    AND technician_user_id = p_technician_user_id
    AND status IN ('running', 'paused')
  RETURNING * INTO v_updated;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Não foi possível finalizar (estado alterado).', 'httpStatus', 409);
  END IF;

  INSERT INTO public.rda_work_session_events (
    workshop_id, session_id, event_type, occurred_at,
    actor_user_id, client_mutation_id, meta
  ) VALUES (
    p_workshop_id, p_session_id, 'finish', v_now,
    p_technician_user_id, NULLIF(trim(COALESCE(p_client_mutation_id, '')), ''),
    '{}'::jsonb
  );

  -- Não altera etapa/status da OS — apenas o apontamento de tempo.
  RETURN jsonb_build_object('ok', true, 'session', to_jsonb(v_updated));
END;
$$;

COMMENT ON FUNCTION public.rda_work_session_start IS
  'Inicia sessão RDA + evento start de forma atômica. Não altera etapa da OS.';
COMMENT ON FUNCTION public.rda_work_session_pause IS
  'Pausa sessão RDA + evento pause de forma atômica.';
COMMENT ON FUNCTION public.rda_work_session_resume IS
  'Retoma sessão RDA + evento resume de forma atômica.';
COMMENT ON FUNCTION public.rda_work_session_finish IS
  'Finaliza sessão RDA + evento finish de forma atômica. Não altera etapa da OS.';
