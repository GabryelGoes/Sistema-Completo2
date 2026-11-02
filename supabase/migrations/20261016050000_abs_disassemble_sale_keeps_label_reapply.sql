-- Reaplica a regra de etiqueta no desmembramento (idempotente via CREATE OR REPLACE).
-- Se a função no projeto ainda gera public_id novo para venda/OS/lab, rode este
-- arquivo no SQL Editor do Supabase.
--
-- Regra: saída (venda / OS / lab) MANTÉM a etiqueta do completo; só o que fica
-- no estoque recebe novo public_id. Destino "estoque" gera duas unidades novas.

CREATE OR REPLACE FUNCTION public.disassemble_workshop_abs_module(
  p_workshop_id UUID,
  p_source_module_id UUID,
  p_withdrawn_kind TEXT,
  p_destination TEXT,
  p_destination_ref TEXT DEFAULT NULL,
  p_service_order_id UUID DEFAULT NULL,
  p_cost_remaining NUMERIC DEFAULT NULL,
  p_cost_withdrawn NUMERIC DEFAULT NULL,
  p_cost_adjustment_authorized BOOLEAN DEFAULT false,
  p_cost_adjustment_note TEXT DEFAULT NULL,
  p_remaining_location TEXT DEFAULT NULL,
  p_withdrawn_location TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_recorded_by_name TEXT DEFAULT NULL,
  p_remaining_primary_code TEXT DEFAULT NULL,
  p_withdrawn_primary_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_src public.workshop_abs_modules%ROWTYPE;
  v_src_model public.workshop_abs_module_models%ROWTYPE;
  v_remaining public.workshop_abs_modules%ROWTYPE;
  v_withdrawn public.workshop_abs_modules%ROWTYPE;
  v_dis public.workshop_abs_module_disassemblies%ROWTYPE;
  v_remaining_kind TEXT;
  v_scope_remaining TEXT;
  v_scope_withdrawn TEXT;
  v_remaining_model_id UUID;
  v_withdrawn_model_id UUID;
  v_remaining_code TEXT;
  v_withdrawn_code TEXT;
  v_remaining_seq INT;
  v_withdrawn_seq INT;
  v_remaining_public_id TEXT;
  v_withdrawn_public_id TEXT;
  v_cost_original NUMERIC;
  v_cost_remaining NUMERIC;
  v_cost_withdrawn NUMERIC;
  v_withdrawn_status TEXT;
  v_exit_reason TEXT;
  v_keep_label BOOLEAN;
  v_prev_location TEXT;
  v_original_public_id TEXT;
BEGIN
  IF p_withdrawn_kind NOT IN ('eletronico', 'hidraulico') THEN
    RAISE EXCEPTION 'Informe se a peça retirada é eletrônica ou hidráulica.';
  END IF;
  IF p_destination NOT IN ('ordem_servico', 'venda_direta', 'laboratorio', 'estoque') THEN
    RAISE EXCEPTION 'Destino de desmembramento inválido: %', p_destination;
  END IF;

  SELECT * INTO v_src
  FROM public.workshop_abs_modules
  WHERE id = p_source_module_id AND workshop_id = p_workshop_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Módulo ABS de origem não encontrado.';
  END IF;
  IF v_src.module_kind <> 'completo' THEN
    RAISE EXCEPTION 'Somente módulos completos podem ser desmembrados.';
  END IF;
  IF v_src.status <> 'disponivel' THEN
    RAISE EXCEPTION 'Módulo % não está disponível para desmembramento.', v_src.public_id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.workshop_abs_module_disassemblies d WHERE d.source_module_id = v_src.id
  ) THEN
    RAISE EXCEPTION 'Este módulo já foi desmembrado.';
  END IF;

  SELECT * INTO v_src_model
  FROM public.workshop_abs_module_models
  WHERE id = v_src.model_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Modelo do módulo de origem não encontrado.';
  END IF;

  v_remaining_kind := CASE WHEN p_withdrawn_kind = 'eletronico' THEN 'hidraulico' ELSE 'eletronico' END;
  v_scope_remaining := v_remaining_kind;
  v_scope_withdrawn := p_withdrawn_kind;
  v_original_public_id := v_src.public_id;
  v_keep_label := p_destination <> 'estoque';

  v_withdrawn_code := COALESCE(
    NULLIF(trim(COALESCE(p_withdrawn_primary_code, '')), ''),
    (
      SELECT c.code_value FROM public.workshop_abs_module_codes c
      WHERE c.model_id = v_src.model_id AND c.component_scope = v_scope_withdrawn
      ORDER BY c.sort_order ASC LIMIT 1
    ),
    v_src.original_code
  );
  v_remaining_code := COALESCE(
    NULLIF(trim(COALESCE(p_remaining_primary_code, '')), ''),
    (
      SELECT c.code_value FROM public.workshop_abs_module_codes c
      WHERE c.model_id = v_src.model_id AND c.component_scope = v_scope_remaining
      ORDER BY c.sort_order ASC LIMIT 1
    ),
    v_src.original_code
  );

  v_remaining_model_id := public.resolve_or_create_abs_module_model(
    p_workshop_id, v_src.manufacturer, COALESCE(v_src_model.family, v_src.model),
    v_remaining_kind, v_remaining_code, NULL
  );
  v_withdrawn_model_id := public.resolve_or_create_abs_module_model(
    p_workshop_id, v_src.manufacturer, COALESCE(v_src_model.family, v_src.model),
    p_withdrawn_kind, v_withdrawn_code, NULL
  );

  PERFORM public.seed_abs_component_applications_from_complete(
    p_workshop_id, v_src.model_id, v_remaining_model_id, v_scope_remaining
  );
  PERFORM public.seed_abs_component_applications_from_complete(
    p_workshop_id, v_src.model_id, v_withdrawn_model_id, v_scope_withdrawn
  );

  v_cost_original := COALESCE(v_src.unit_cost, 0);
  v_cost_remaining := COALESCE(p_cost_remaining, round(v_cost_original / 2.0, 2));
  v_cost_withdrawn := COALESCE(p_cost_withdrawn, v_cost_original - v_cost_remaining);

  IF abs((v_cost_remaining + v_cost_withdrawn) - v_cost_original) > 0.01
     AND NOT COALESCE(p_cost_adjustment_authorized, false) THEN
    RAISE EXCEPTION
      'A soma dos custos dos componentes (%.2f) deve igualar o custo do completo (%.2f). Autorize o ajuste se necessário.',
      v_cost_remaining + v_cost_withdrawn, v_cost_original;
  END IF;

  v_remaining_seq := public.next_workshop_abs_module_sequence(v_remaining_model_id);
  v_remaining_public_id := public.next_workshop_abs_module_public_id(p_workshop_id);

  v_exit_reason := CASE
    WHEN p_destination = 'ordem_servico' THEN 'ordem_servico'
    WHEN p_destination = 'venda_direta' THEN 'venda_avulsa'
    WHEN p_destination = 'laboratorio' THEN 'laboratorio'
    ELSE 'desmembramento'
  END;

  -- Parte que fica: sempre nova etiqueta
  INSERT INTO public.workshop_abs_modules (
    workshop_id, public_id, manufacturer, original_code, application, model, year_label,
    module_kind, condition, unit_cost, unit_price, supplier, location, notes, status,
    received_at, model_id, sequence_number, item_state, item_condition, damage_description,
    parent_complete_id
  )
  VALUES (
    p_workshop_id, v_remaining_public_id, v_src.manufacturer, v_remaining_code,
    v_src.application, v_src.model, v_src.year_label,
    v_remaining_kind, v_src.condition, v_cost_remaining, v_src.unit_price, v_src.supplier,
    COALESCE(NULLIF(trim(COALESCE(p_remaining_location, '')), ''), v_src.location),
    'Componente restante do desmembramento de ' || v_original_public_id,
    'disponivel', now(), v_remaining_model_id, v_remaining_seq,
    v_src.item_state, v_src.item_condition, v_src.damage_description, v_src.id
  )
  RETURNING * INTO v_remaining;

  INSERT INTO public.workshop_abs_module_movements (
    workshop_id, module_id, movement_type,
    from_status, to_status, from_location, to_location,
    reason_type, reason_ref, notes, recorded_by_name, service_order_id
  )
  VALUES (
    p_workshop_id, v_remaining.id, 'entry',
    NULL, 'disponivel', NULL, v_remaining.location,
    'desmembramento', v_original_public_id,
    'Unidade criada no desmembramento (permanece em estoque · nova etiqueta)',
    NULLIF(trim(COALESCE(p_recorded_by_name, '')), ''),
    NULL
  );

  IF v_keep_label THEN
    -- Saída: transforma o completo na peça retirada, mantendo public_id (mesma etiqueta).
    v_withdrawn_seq := public.next_workshop_abs_module_sequence(v_withdrawn_model_id);
    v_prev_location := v_src.location;

    UPDATE public.workshop_abs_modules
    SET
      module_kind = p_withdrawn_kind,
      model_id = v_withdrawn_model_id,
      sequence_number = v_withdrawn_seq,
      original_code = v_withdrawn_code,
      unit_cost = v_cost_withdrawn,
      status = 'fora_estoque',
      location = NULLIF(trim(COALESCE(p_withdrawn_location, '')), ''),
      notes = COALESCE(
        NULLIF(trim(COALESCE(p_notes, '')), ''),
        'Desmembramento: saída ' || p_withdrawn_kind || ' (etiqueta original ' || v_original_public_id || ')'
      ),
      parent_complete_id = NULL,
      updated_at = now()
    WHERE id = v_src.id
    RETURNING * INTO v_withdrawn;

    INSERT INTO public.workshop_abs_module_movements (
      workshop_id, module_id, movement_type,
      from_status, to_status, from_location, to_location,
      reason_type, reason_ref, notes, recorded_by_name, service_order_id
    )
    VALUES (
      p_workshop_id, v_withdrawn.id, 'exit',
      'disponivel', 'fora_estoque', v_prev_location, v_withdrawn.location,
      v_exit_reason,
      NULLIF(trim(COALESCE(p_destination_ref, '')), ''),
      COALESCE(
        NULLIF(trim(COALESCE(p_notes, '')), ''),
        'Desmembramento → ' || p_destination || ' (mantém etiqueta ' || v_original_public_id || ')'
      ),
      NULLIF(trim(COALESCE(p_recorded_by_name, '')), ''),
      p_service_order_id
    );

    -- Na saída com mesma etiqueta, origem e retirada são a mesma unidade.
    v_src := v_withdrawn;
  ELSE
    v_withdrawn_status := 'disponivel';
    v_withdrawn_seq := public.next_workshop_abs_module_sequence(v_withdrawn_model_id);
    v_withdrawn_public_id := public.next_workshop_abs_module_public_id(p_workshop_id);

    UPDATE public.workshop_abs_modules
    SET status = 'desmembrado', updated_at = now()
    WHERE id = v_src.id
    RETURNING * INTO v_src;

    INSERT INTO public.workshop_abs_module_movements (
      workshop_id, module_id, movement_type,
      from_status, to_status, from_location, to_location,
      reason_type, reason_ref, notes, recorded_by_name, service_order_id
    )
    VALUES (
      p_workshop_id, v_src.id, 'exit',
      'disponivel', 'desmembrado', v_src.location, v_src.location,
      'desmembramento',
      NULLIF(trim(COALESCE(p_destination_ref, '')), ''),
      COALESCE(NULLIF(trim(COALESCE(p_notes, '')), ''), 'Desmembramento de módulo completo'),
      NULLIF(trim(COALESCE(p_recorded_by_name, '')), ''),
      p_service_order_id
    );

    INSERT INTO public.workshop_abs_modules (
      workshop_id, public_id, manufacturer, original_code, application, model, year_label,
      module_kind, condition, unit_cost, unit_price, supplier, location, notes, status,
      received_at, model_id, sequence_number, item_state, item_condition, damage_description,
      parent_complete_id
    )
    VALUES (
      p_workshop_id, v_withdrawn_public_id, v_src.manufacturer, v_withdrawn_code,
      v_src.application, v_src.model, v_src.year_label,
      p_withdrawn_kind, v_src.condition, v_cost_withdrawn, v_src.unit_price, v_src.supplier,
      COALESCE(NULLIF(trim(COALESCE(p_withdrawn_location, '')), ''), v_src.location),
      'Componente retirado do desmembramento de ' || v_original_public_id,
      v_withdrawn_status, now(), v_withdrawn_model_id, v_withdrawn_seq,
      v_src.item_state, v_src.item_condition, v_src.damage_description, v_src.id
    )
    RETURNING * INTO v_withdrawn;

    INSERT INTO public.workshop_abs_module_movements (
      workshop_id, module_id, movement_type,
      from_status, to_status, from_location, to_location,
      reason_type, reason_ref, notes, recorded_by_name, service_order_id
    )
    VALUES (
      p_workshop_id, v_withdrawn.id, 'entry',
      NULL, 'disponivel', NULL, v_withdrawn.location,
      'desmembramento', v_original_public_id,
      'Unidade criada no desmembramento (retirada → estoque)',
      NULLIF(trim(COALESCE(p_recorded_by_name, '')), ''),
      p_service_order_id
    );
  END IF;

  INSERT INTO public.workshop_abs_module_disassemblies (
    workshop_id, source_module_id, withdrawn_kind,
    remaining_module_id, withdrawn_module_id,
    destination, destination_ref, service_order_id,
    cost_original, cost_remaining, cost_withdrawn,
    cost_adjustment_authorized, cost_adjustment_note,
    notes, recorded_by_name
  )
  VALUES (
    p_workshop_id, v_src.id, p_withdrawn_kind,
    v_remaining.id, v_withdrawn.id,
    p_destination, NULLIF(trim(COALESCE(p_destination_ref, '')), ''), p_service_order_id,
    v_cost_original, v_cost_remaining, v_cost_withdrawn,
    COALESCE(p_cost_adjustment_authorized, false),
    NULLIF(trim(COALESCE(p_cost_adjustment_note, '')), ''),
    NULLIF(trim(COALESCE(p_notes, '')), ''),
    NULLIF(trim(COALESCE(p_recorded_by_name, '')), '')
  )
  RETURNING * INTO v_dis;

  RETURN jsonb_build_object(
    'source', to_jsonb(v_src),
    'remaining', to_jsonb(v_remaining),
    'withdrawn', to_jsonb(v_withdrawn),
    'disassembly', to_jsonb(v_dis)
  );
END;
$$;

COMMENT ON FUNCTION public.disassemble_workshop_abs_module IS
  'Desmembra completo: estoque gera 2 unidades novas; venda/OS/lab mantém etiqueta na saída e só cria nova unidade para o que fica.';
