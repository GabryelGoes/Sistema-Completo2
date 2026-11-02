-- RDA: solicitações e avaliações gerenciais por sessão de execução.
-- NÃO aplicar em produção sem homologação.

-- ---------------------------------------------------------------------------
-- Competências (catálogo)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rda_eval_competencies (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO public.rda_eval_competencies (id, label, description, sort_order, active) VALUES
  ('technical_quality', 'Qualidade técnica', 'Qualidade do trabalho técnico executado', 10, true),
  ('organization', 'Organização e limpeza', 'Organização da bancada/área e limpeza', 20, true),
  ('procedures', 'Cumprimento dos procedimentos', 'Segue processos e padrões da oficina', 30, true),
  ('autonomy', 'Autonomia', 'Capacidade de avançar com independência adequada', 40, true),
  ('communication', 'Comunicação e colaboração', 'Comunicação com a equipe e colaboração', 50, true)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  active = EXCLUDED.active;

-- ---------------------------------------------------------------------------
-- Solicitações de avaliação (1 por sessão finalizada)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rda_eval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  work_session_id UUID NOT NULL REFERENCES public.rda_work_sessions(id) ON DELETE CASCADE,
  service_order_id UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  technician_user_id UUID NOT NULL REFERENCES public.workshop_system_users(id) ON DELETE RESTRICT,
  budget_id UUID REFERENCES public.budgets(id) ON DELETE SET NULL,
  service_description TEXT,
  productive_ms BIGINT NOT NULL DEFAULT 0 CHECK (productive_ms >= 0),
  paused_ms BIGINT NOT NULL DEFAULT 0 CHECK (paused_ms >= 0),
  session_started_at TIMESTAMPTZ NOT NULL,
  session_ended_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'deferred', 'evaluated', 'dismissed')),
  deferred_until TIMESTAMPTZ,
  deferred_note TEXT,
  deferred_by_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  deferred_at TIMESTAMPTZ,
  dismissed_reason TEXT,
  dismissed_by_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  dismissed_at TIMESTAMPTZ,
  evaluated_at TIMESTAMPTZ,
  client_mutation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT rda_eval_requests_one_per_session UNIQUE (work_session_id),
  CONSTRAINT rda_eval_requests_deferred_ck CHECK (
    (status <> 'deferred')
    OR (deferred_at IS NOT NULL)
  ),
  CONSTRAINT rda_eval_requests_dismissed_ck CHECK (
    (status <> 'dismissed')
    OR (dismissed_at IS NOT NULL)
  ),
  CONSTRAINT rda_eval_requests_evaluated_ck CHECK (
    (status <> 'evaluated')
    OR (evaluated_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rda_eval_requests_client_mutation
  ON public.rda_eval_requests (workshop_id, client_mutation_id)
  WHERE client_mutation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rda_eval_requests_workshop_status
  ON public.rda_eval_requests (workshop_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rda_eval_requests_tech
  ON public.rda_eval_requests (workshop_id, technician_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rda_eval_requests_ended
  ON public.rda_eval_requests (workshop_id, session_ended_at DESC);

COMMENT ON TABLE public.rda_eval_requests IS
  'Fila de avaliações gerenciais gerada ao finalizar sessão RDA. Dispensa não é nota negativa.';

-- ---------------------------------------------------------------------------
-- Avaliações (1 por solicitação / sessão)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rda_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  request_id UUID NOT NULL REFERENCES public.rda_eval_requests(id) ON DELETE CASCADE,
  work_session_id UUID NOT NULL REFERENCES public.rda_work_sessions(id) ON DELETE CASCADE,
  technician_user_id UUID NOT NULL REFERENCES public.workshop_system_users(id) ON DELETE RESTRICT,
  evaluator_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  evaluator_is_admin BOOLEAN NOT NULL DEFAULT false,
  evaluator_display_name TEXT NOT NULL DEFAULT '',
  score_technical_quality SMALLINT NOT NULL CHECK (score_technical_quality BETWEEN 1 AND 5),
  score_organization SMALLINT NOT NULL CHECK (score_organization BETWEEN 1 AND 5),
  score_procedures SMALLINT NOT NULL CHECK (score_procedures BETWEEN 1 AND 5),
  score_autonomy SMALLINT NOT NULL CHECK (score_autonomy BETWEEN 1 AND 5),
  score_communication SMALLINT NOT NULL CHECK (score_communication BETWEEN 1 AND 5),
  positives TEXT NOT NULL DEFAULT '',
  improvements TEXT NOT NULL DEFAULT '',
  general_notes TEXT NOT NULL DEFAULT '',
  client_mutation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT rda_evaluations_one_per_request UNIQUE (request_id),
  CONSTRAINT rda_evaluations_one_per_session UNIQUE (work_session_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rda_evaluations_client_mutation
  ON public.rda_evaluations (workshop_id, client_mutation_id)
  WHERE client_mutation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rda_evaluations_tech
  ON public.rda_evaluations (workshop_id, technician_user_id, created_at DESC);

COMMENT ON TABLE public.rda_evaluations IS
  'Avaliação gerencial 1–5 por competência. Notas só por gerente autorizado (nunca IA).';

-- ---------------------------------------------------------------------------
-- Auditoria append-only
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rda_eval_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  request_id UUID REFERENCES public.rda_eval_requests(id) ON DELETE SET NULL,
  evaluation_id UUID REFERENCES public.rda_evaluations(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'request_created',
      'deferred',
      'dismissed',
      'evaluated',
      'evaluation_updated'
    )),
  actor_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  actor_is_admin BOOLEAN NOT NULL DEFAULT false,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rda_eval_audit_request
  ON public.rda_eval_audit_events (request_id, created_at);

CREATE OR REPLACE FUNCTION public.rda_eval_audit_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'rda_eval_audit_events é imutável (UPDATE não permitido)';
END;
$$;

DROP TRIGGER IF EXISTS trg_rda_eval_audit_immutable ON public.rda_eval_audit_events;
CREATE TRIGGER trg_rda_eval_audit_immutable
  BEFORE UPDATE ON public.rda_eval_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION public.rda_eval_audit_immutable();

-- ---------------------------------------------------------------------------
-- Integridade de oficina
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rda_eval_requests_enforce_refs()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_session RECORD;
BEGIN
  SELECT s.workshop_id, s.technician_user_id, s.service_order_id, s.status
    INTO v_session
  FROM public.rda_work_sessions s
  WHERE s.id = NEW.work_session_id;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Sessão % inexistente', NEW.work_session_id;
  END IF;
  IF v_session.workshop_id <> NEW.workshop_id THEN
    RAISE EXCEPTION 'Sessão de outra oficina';
  END IF;
  IF v_session.technician_user_id <> NEW.technician_user_id THEN
    RAISE EXCEPTION 'Técnico divergente da sessão';
  END IF;
  IF v_session.service_order_id <> NEW.service_order_id THEN
    RAISE EXCEPTION 'OS divergente da sessão';
  END IF;
  IF v_session.status <> 'finished' AND TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'Solicitação só para sessão finalizada';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rda_eval_requests_enforce_refs ON public.rda_eval_requests;
CREATE TRIGGER trg_rda_eval_requests_enforce_refs
  BEFORE INSERT OR UPDATE OF workshop_id, work_session_id, technician_user_id, service_order_id
  ON public.rda_eval_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.rda_eval_requests_enforce_refs();

CREATE OR REPLACE FUNCTION public.rda_evaluations_enforce_refs()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_req RECORD;
BEGIN
  SELECT r.workshop_id, r.work_session_id, r.technician_user_id, r.status
    INTO v_req
  FROM public.rda_eval_requests r
  WHERE r.id = NEW.request_id;

  IF v_req IS NULL THEN
    RAISE EXCEPTION 'Solicitação % inexistente', NEW.request_id;
  END IF;
  IF v_req.workshop_id <> NEW.workshop_id THEN
    RAISE EXCEPTION 'Avaliação de outra oficina';
  END IF;
  IF v_req.work_session_id <> NEW.work_session_id THEN
    RAISE EXCEPTION 'Sessão divergente da solicitação';
  END IF;
  IF v_req.technician_user_id <> NEW.technician_user_id THEN
    RAISE EXCEPTION 'Técnico divergente da solicitação';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rda_evaluations_enforce_refs ON public.rda_evaluations;
CREATE TRIGGER trg_rda_evaluations_enforce_refs
  BEFORE INSERT OR UPDATE OF workshop_id, request_id, work_session_id, technician_user_id
  ON public.rda_evaluations
  FOR EACH ROW
  EXECUTE FUNCTION public.rda_evaluations_enforce_refs();

-- ---------------------------------------------------------------------------
-- RPC: cria solicitação ao finalizar (idempotente)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rda_eval_request_ensure_for_session(
  p_workshop_id UUID,
  p_session_id UUID,
  p_client_mutation_id TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_session public.rda_work_sessions%ROWTYPE;
  v_existing public.rda_eval_requests%ROWTYPE;
  v_created public.rda_eval_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_session
  FROM public.rda_work_sessions s
  WHERE s.id = p_session_id AND s.workshop_id = p_workshop_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sessão não encontrada.', 'httpStatus', 404);
  END IF;
  IF v_session.status <> 'finished' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sessão ainda não finalizada.', 'httpStatus', 409);
  END IF;

  SELECT * INTO v_existing
  FROM public.rda_eval_requests r
  WHERE r.work_session_id = p_session_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'request', to_jsonb(v_existing)
    );
  END IF;

  INSERT INTO public.rda_eval_requests (
    workshop_id,
    work_session_id,
    service_order_id,
    technician_user_id,
    budget_id,
    service_description,
    productive_ms,
    paused_ms,
    session_started_at,
    session_ended_at,
    status,
    client_mutation_id
  ) VALUES (
    p_workshop_id,
    v_session.id,
    v_session.service_order_id,
    v_session.technician_user_id,
    v_session.budget_id,
    v_session.budget_service_description,
    COALESCE(v_session.productive_ms, 0),
    COALESCE(v_session.paused_ms, 0),
    v_session.started_at,
    COALESCE(v_session.ended_at, now()),
    'pending',
    NULLIF(trim(COALESCE(p_client_mutation_id, '')), '')
  )
  RETURNING * INTO v_created;

  INSERT INTO public.rda_eval_audit_events (
    workshop_id, request_id, event_type, actor_user_id, actor_is_admin, payload
  ) VALUES (
    p_workshop_id,
    v_created.id,
    'request_created',
    v_session.technician_user_id,
    false,
    jsonb_build_object('work_session_id', v_session.id, 'source', 'finish')
  );

  RETURN jsonb_build_object(
    'ok', true,
    'created', true,
    'request', to_jsonb(v_created)
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_existing
    FROM public.rda_eval_requests r
    WHERE r.work_session_id = p_session_id;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'request', to_jsonb(v_existing)
      );
    END IF;
    RAISE;
END;
$$;

-- Atualiza finish atômico para também gerar a solicitação na mesma TX.
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
  v_eval jsonb;
BEGIN
  IF p_client_mutation_id IS NOT NULL AND length(trim(p_client_mutation_id)) > 0 THEN
    SELECT e.session_id INTO v_event_session
    FROM public.rda_work_session_events e
    WHERE e.workshop_id = p_workshop_id
      AND e.client_mutation_id = p_client_mutation_id
    LIMIT 1;
    IF v_event_session IS NOT NULL THEN
      SELECT * INTO v_session FROM public.rda_work_sessions WHERE id = v_event_session;
      PERFORM public.rda_eval_request_ensure_for_session(
        p_workshop_id,
        v_session.id,
        CASE WHEN p_client_mutation_id IS NULL THEN NULL ELSE p_client_mutation_id || ':eval' END
      );
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
    v_eval := public.rda_eval_request_ensure_for_session(
      p_workshop_id,
      v_session.id,
      CASE WHEN p_client_mutation_id IS NULL THEN NULL ELSE p_client_mutation_id || ':eval' END
    );
    RETURN jsonb_build_object(
      'ok', true,
      'alreadyFinished', true,
      'session', to_jsonb(v_session),
      'evalRequest', v_eval
    );
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

  v_eval := public.rda_eval_request_ensure_for_session(
    p_workshop_id,
    v_updated.id,
    CASE WHEN p_client_mutation_id IS NULL THEN NULL ELSE p_client_mutation_id || ':eval' END
  );

  RETURN jsonb_build_object(
    'ok', true,
    'session', to_jsonb(v_updated),
    'evalRequest', v_eval
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS + privilégios
-- ---------------------------------------------------------------------------
ALTER TABLE public.rda_eval_competencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rda_eval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rda_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rda_eval_audit_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON FUNCTION public.rda_eval_request_ensure_for_session(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rda_eval_request_ensure_for_session(UUID, UUID, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rda_eval_request_ensure_for_session(UUID, UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.rda_work_session_finish(UUID, UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rda_work_session_finish(UUID, UUID, UUID, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rda_work_session_finish(UUID, UUID, UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.rda_eval_audit_immutable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rda_eval_requests_enforce_refs() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rda_evaluations_enforce_refs() FROM PUBLIC;
