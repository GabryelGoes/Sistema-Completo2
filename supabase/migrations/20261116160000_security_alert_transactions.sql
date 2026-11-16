-- SEC-05.1.2-C.1: estado e histórico do alerta na mesma transação.
-- NÃO aplicar em produção sem revisão. A migration 20261116150000 permanece como está.
-- O navegador não chama estas funções. Só o service_role, depois da autorização da API.
-- Uma transição que não altera o estado não grava histórico. Falha no histórico desfaz o estado.

CREATE OR REPLACE FUNCTION public.transition_security_alert(
  p_workshop_id uuid,
  p_alert_id uuid,
  p_expected_status text,
  p_next_status text,
  p_actor_user_id uuid,
  p_actor_role text
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_status text;
  v_count integer;
BEGIN
  IF p_workshop_id IS NULL OR p_alert_id IS NULL THEN
    RETURN 'missing';
  END IF;
  IF p_actor_role IS DISTINCT FROM 'admin' AND p_actor_role IS DISTINCT FROM 'user' THEN
    RAISE EXCEPTION 'invalid actor';
  END IF;
  IF p_actor_role = 'admin' AND p_actor_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'invalid actor';
  END IF;
  IF p_actor_role = 'user' AND p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid actor';
  END IF;
  IF p_actor_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.workshop_system_users AS staff
    WHERE staff.id = p_actor_user_id
      AND staff.workshop_id = p_workshop_id
  ) THEN
    RAISE EXCEPTION 'invalid actor';
  END IF;
  IF NOT (
    (p_expected_status = 'new' AND p_next_status IN ('seen', 'resolved'))
    OR (p_expected_status = 'seen' AND p_next_status = 'resolved')
  ) THEN
    RETURN 'conflict';
  END IF;

  SELECT alert.status
  INTO v_status
  FROM public.workshop_security_alerts AS alert
  WHERE alert.id = p_alert_id
    AND alert.workshop_id = p_workshop_id
  FOR UPDATE;

  IF NOT FOUND OR v_status IS DISTINCT FROM p_expected_status THEN
    IF NOT FOUND THEN
      RETURN 'missing';
    END IF;
    RETURN 'conflict';
  END IF;

  UPDATE public.workshop_security_alerts AS alert
  SET
    status = p_next_status,
    resolved_at = CASE
      WHEN p_next_status = 'resolved' THEN pg_catalog.now()
      ELSE alert.resolved_at
    END
  WHERE alert.id = p_alert_id
    AND alert.workshop_id = p_workshop_id
    AND alert.status = p_expected_status;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RETURN 'conflict';
  END IF;

  INSERT INTO public.workshop_security_alert_updates (
    workshop_id,
    alert_id,
    from_status,
    to_status,
    actor_user_id,
    actor_role,
    note
  ) VALUES (
    p_workshop_id,
    p_alert_id,
    p_expected_status,
    p_next_status,
    p_actor_user_id,
    p_actor_role,
    'Estado alterado'
  );

  RETURN 'changed';
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_security_alert(
  p_workshop_id uuid,
  p_alert_id uuid,
  p_dedupe_key text,
  p_rule_id text,
  p_severity text,
  p_title text,
  p_explanation text,
  p_occurrence_count integer,
  p_condition_active boolean,
  p_evidence jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_status text;
  v_key text;
  v_type text;
  v_try integer;
BEGIN
  IF p_workshop_id IS NULL OR p_dedupe_key IS NULL OR p_dedupe_key !~ '^[a-z0-9_]{1,80}$' THEN
    RAISE EXCEPTION 'invalid alert';
  END IF;
  IF p_rule_id IS DISTINCT FROM p_dedupe_key OR p_rule_id NOT IN (
    'volume_login_ip',
    'volume_login_account',
    'volume_password_ip',
    'volume_password_account',
    'recorded_rate_limit',
    'recorded_session_check',
    'recorded_rate_limit_down',
    'admin_password',
    'admin_permissions',
    'admin_employee',
    'admin_settings',
    'admin_device_session',
    'recorded_device_block'
  ) THEN
    RAISE EXCEPTION 'invalid alert';
  END IF;
  IF p_severity NOT IN ('info', 'warning', 'important') THEN
    RAISE EXCEPTION 'invalid alert';
  END IF;
  IF p_title IS NULL OR char_length(p_title) < 1 OR char_length(p_title) > 160 THEN
    RAISE EXCEPTION 'invalid alert';
  END IF;
  IF p_explanation IS NULL OR char_length(p_explanation) < 1 OR char_length(p_explanation) > 800 THEN
    RAISE EXCEPTION 'invalid alert';
  END IF;
  IF p_occurrence_count IS NULL OR p_occurrence_count < 1 OR p_occurrence_count > 1000000 THEN
    RAISE EXCEPTION 'invalid alert';
  END IF;
  IF p_evidence IS NULL OR pg_catalog.jsonb_typeof(p_evidence) <> 'object' THEN
    RAISE EXCEPTION 'invalid evidence';
  END IF;
  IF pg_catalog.octet_length(p_evidence::text) > 2048 THEN
    RAISE EXCEPTION 'invalid evidence';
  END IF;
  IF (p_evidence ->> 'source') IS DISTINCT FROM 'recorded' AND (p_evidence ->> 'source') IS DISTINCT FROM 'counter' THEN
    RAISE EXCEPTION 'invalid evidence';
  END IF;
  FOR v_key IN SELECT pg_catalog.jsonb_object_keys(p_evidence) LOOP
    IF v_key NOT IN (
      'source',
      'recordedCount',
      'removedCount',
      'maxHits',
      'threshold',
      'hardLimit',
      'windowMinutes',
      'bucketCount',
      'omittedRepeats',
      'truncated',
      'conditionActive',
      'countedUntil',
      'countedId',
      'resetAt',
      'severity'
    ) THEN
      RAISE EXCEPTION 'invalid evidence';
    END IF;
    v_type := pg_catalog.jsonb_typeof(p_evidence -> v_key);
    IF v_key IN ('recordedCount', 'removedCount', 'maxHits', 'threshold', 'hardLimit', 'windowMinutes', 'bucketCount') THEN
      IF v_type <> 'number'
        OR (p_evidence ->> v_key)::pg_catalog.numeric < 0
        OR (p_evidence ->> v_key)::pg_catalog.numeric > 1000000
        OR (p_evidence ->> v_key)::pg_catalog.numeric <> trunc((p_evidence ->> v_key)::pg_catalog.numeric) THEN
        RAISE EXCEPTION 'invalid evidence';
      END IF;
    ELSIF v_key IN ('omittedRepeats', 'truncated', 'conditionActive') THEN
      IF v_type <> 'boolean' THEN
        RAISE EXCEPTION 'invalid evidence';
      END IF;
    ELSIF v_key = 'source' THEN
      NULL;
    ELSIF v_key = 'severity' THEN
      IF (p_evidence ->> v_key) NOT IN ('info', 'warning', 'important') THEN
        RAISE EXCEPTION 'invalid evidence';
      END IF;
    ELSIF v_key = 'countedId' THEN
      IF (p_evidence ->> v_key) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'invalid evidence';
      END IF;
    ELSIF char_length(p_evidence ->> v_key) < 1 OR char_length(p_evidence ->> v_key) > 80 THEN
      RAISE EXCEPTION 'invalid evidence';
    END IF;
  END LOOP;

  IF p_alert_id IS NOT NULL THEN
    SELECT alert.id, alert.status
    INTO v_id, v_status
    FROM public.workshop_security_alerts AS alert
    WHERE alert.id = p_alert_id
      AND alert.workshop_id = p_workshop_id
      AND alert.dedupe_key = p_dedupe_key
    FOR UPDATE;
    IF NOT FOUND THEN
      RETURN NULL;
    END IF;
    IF v_status = 'resolved' THEN
      RETURN v_id;
    END IF;
    UPDATE public.workshop_security_alerts AS alert
    SET
      severity = p_severity,
      title = p_title,
      explanation = p_explanation,
      occurrence_count = p_occurrence_count,
      condition_active = coalesce(p_condition_active, true),
      last_seen_at = pg_catalog.now(),
      evidence = p_evidence
    WHERE alert.id = v_id
      AND alert.workshop_id = p_workshop_id
      AND alert.status <> 'resolved';
    RETURN v_id;
  END IF;

  FOR v_try IN 1..2 LOOP
    SELECT alert.id
    INTO v_id
    FROM public.workshop_security_alerts AS alert
    WHERE alert.workshop_id = p_workshop_id
      AND alert.dedupe_key = p_dedupe_key
      AND alert.status <> 'resolved'
    ORDER BY alert.last_seen_at DESC
    LIMIT 1
    FOR UPDATE;
    IF FOUND THEN
      UPDATE public.workshop_security_alerts AS alert
      SET
        severity = p_severity,
        title = p_title,
        explanation = p_explanation,
        occurrence_count = p_occurrence_count,
        condition_active = coalesce(p_condition_active, true),
        last_seen_at = pg_catalog.now(),
        evidence = p_evidence
      WHERE alert.id = v_id
        AND alert.workshop_id = p_workshop_id
        AND alert.status <> 'resolved';
      RETURN v_id;
    END IF;

    BEGIN
      INSERT INTO public.workshop_security_alerts (
        workshop_id,
        dedupe_key,
        rule_id,
        severity,
        status,
        title,
        explanation,
        occurrence_count,
        condition_active,
        evidence
      ) VALUES (
        p_workshop_id,
        p_dedupe_key,
        p_rule_id,
        p_severity,
        'new',
        p_title,
        p_explanation,
        p_occurrence_count,
        coalesce(p_condition_active, true),
        p_evidence
      )
      RETURNING id INTO v_id;
      INSERT INTO public.workshop_security_alert_updates (
        workshop_id,
        alert_id,
        from_status,
        to_status,
        actor_user_id,
        actor_role,
        note
      ) VALUES (
        p_workshop_id,
        v_id,
        NULL,
        'new',
        NULL,
        'system',
        'Regra registrada'
      );
      RETURN v_id;
    EXCEPTION
      WHEN unique_violation THEN
        IF v_try = 2 THEN
          RAISE;
        END IF;
    END;
  END LOOP;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_security_alert(uuid, uuid, text, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transition_security_alert(uuid, uuid, text, text, uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_security_alert(uuid, uuid, text, text, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.apply_security_alert(uuid, uuid, text, text, text, text, text, integer, boolean, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_security_alert(uuid, uuid, text, text, text, text, text, integer, boolean, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_security_alert(uuid, uuid, text, text, text, text, text, integer, boolean, jsonb) TO service_role;
