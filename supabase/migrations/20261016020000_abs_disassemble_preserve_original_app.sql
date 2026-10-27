-- No desmembramento, a aplicação ORIGINAL do módulo completo deve permanecer
-- a principal no modelo do componente (eletrônico/hidráulico). Apps do escopo
-- da peça ficam como secundárias (compatibilidade), nunca no lugar da original.

CREATE OR REPLACE FUNCTION public.seed_abs_component_applications_from_complete(
  p_workshop_id UUID,
  p_source_model_id UUID,
  p_target_model_id UUID,
  p_target_scope TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_original public.workshop_abs_module_applications%ROWTYPE;
BEGIN
  IF p_target_scope NOT IN ('eletronico', 'hidraulico', 'completo') THEN
    RAISE EXCEPTION 'Escopo de aplicação inválido: %', p_target_scope;
  END IF;

  -- Aplicação original = 1ª do escopo completo; senão a 1ª de qualquer escopo.
  SELECT a.* INTO v_original
  FROM public.workshop_abs_module_applications a
  WHERE a.model_id = p_source_model_id
    AND a.component_scope = 'completo'
  ORDER BY a.sort_order ASC, a.created_at ASC
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT a.* INTO v_original
    FROM public.workshop_abs_module_applications a
    WHERE a.model_id = p_source_model_id
    ORDER BY a.sort_order ASC, a.created_at ASC
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Empurra apps já existentes no escopo-alvo para depois da original.
  UPDATE public.workshop_abs_module_applications x
  SET sort_order = COALESCE(x.sort_order, 0) + 100
  WHERE x.model_id = p_target_model_id
    AND x.component_scope = p_target_scope;

  -- Garante a original como sort_order 0 no escopo nativo do componente.
  IF NOT EXISTS (
    SELECT 1
    FROM public.workshop_abs_module_applications x
    WHERE x.model_id = p_target_model_id
      AND x.component_scope = p_target_scope
      AND lower(trim(COALESCE(x.vehicle_brand, ''))) = lower(trim(COALESCE(v_original.vehicle_brand, '')))
      AND lower(trim(COALESCE(x.vehicle_model, ''))) = lower(trim(COALESCE(v_original.vehicle_model, '')))
      AND COALESCE(x.year_from, -1) = COALESCE(v_original.year_from, -1)
      AND COALESCE(x.year_to, -1) = COALESCE(v_original.year_to, -1)
  ) THEN
    INSERT INTO public.workshop_abs_module_applications (
      workshop_id, model_id, component_scope, vehicle_brand, vehicle_model,
      generation, year_from, year_to, engine, version, notes, sort_order
    )
    VALUES (
      p_workshop_id, p_target_model_id, p_target_scope,
      v_original.vehicle_brand, v_original.vehicle_model,
      v_original.generation, v_original.year_from, v_original.year_to,
      v_original.engine, v_original.version, v_original.notes, 0
    );
  ELSE
    UPDATE public.workshop_abs_module_applications x
    SET sort_order = 0
    WHERE x.model_id = p_target_model_id
      AND x.component_scope = p_target_scope
      AND lower(trim(COALESCE(x.vehicle_brand, ''))) = lower(trim(COALESCE(v_original.vehicle_brand, '')))
      AND lower(trim(COALESCE(x.vehicle_model, ''))) = lower(trim(COALESCE(v_original.vehicle_model, '')))
      AND COALESCE(x.year_from, -1) = COALESCE(v_original.year_from, -1)
      AND COALESCE(x.year_to, -1) = COALESCE(v_original.year_to, -1);
  END IF;

  -- Secundárias do escopo da peça (compatibilidade), sem duplicar a original.
  INSERT INTO public.workshop_abs_module_applications (
    workshop_id, model_id, component_scope, vehicle_brand, vehicle_model,
    generation, year_from, year_to, engine, version, notes, sort_order
  )
  SELECT
    a.workshop_id,
    p_target_model_id,
    p_target_scope,
    a.vehicle_brand,
    a.vehicle_model,
    a.generation,
    a.year_from,
    a.year_to,
    a.engine,
    a.version,
    a.notes,
    100 + ROW_NUMBER() OVER (ORDER BY a.sort_order ASC, a.created_at ASC)
  FROM public.workshop_abs_module_applications a
  WHERE a.model_id = p_source_model_id
    AND a.component_scope = p_target_scope
    AND NOT (
      lower(trim(COALESCE(a.vehicle_brand, ''))) = lower(trim(COALESCE(v_original.vehicle_brand, '')))
      AND lower(trim(COALESCE(a.vehicle_model, ''))) = lower(trim(COALESCE(v_original.vehicle_model, '')))
      AND COALESCE(a.year_from, -1) = COALESCE(v_original.year_from, -1)
      AND COALESCE(a.year_to, -1) = COALESCE(v_original.year_to, -1)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.workshop_abs_module_applications x
      WHERE x.model_id = p_target_model_id
        AND x.component_scope = p_target_scope
        AND lower(trim(COALESCE(x.vehicle_brand, ''))) = lower(trim(COALESCE(a.vehicle_brand, '')))
        AND lower(trim(COALESCE(x.vehicle_model, ''))) = lower(trim(COALESCE(a.vehicle_model, '')))
        AND COALESCE(x.year_from, -1) = COALESCE(a.year_from, -1)
        AND COALESCE(x.year_to, -1) = COALESCE(a.year_to, -1)
    );

  -- Renumerar de forma estável: original=0, demais 1..n
  WITH ordered AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        ORDER BY
          CASE
            WHEN lower(trim(COALESCE(vehicle_brand, ''))) = lower(trim(COALESCE(v_original.vehicle_brand, '')))
             AND lower(trim(COALESCE(vehicle_model, ''))) = lower(trim(COALESCE(v_original.vehicle_model, '')))
             AND COALESCE(year_from, -1) = COALESCE(v_original.year_from, -1)
             AND COALESCE(year_to, -1) = COALESCE(v_original.year_to, -1)
            THEN 0
            ELSE 1
          END,
          sort_order ASC,
          created_at ASC
      ) - 1 AS new_sort
    FROM public.workshop_abs_module_applications
    WHERE model_id = p_target_model_id
      AND component_scope = p_target_scope
  )
  UPDATE public.workshop_abs_module_applications a
  SET sort_order = ordered.new_sort
  FROM ordered
  WHERE a.id = ordered.id;
END;
$$;

COMMENT ON FUNCTION public.seed_abs_component_applications_from_complete IS
  'Copia a aplicação original do módulo completo como principal do componente; demais apps do escopo da peça ficam secundárias.';

-- Atualiza a RPC de desmembramento para usar o seed (preserva original).
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
  v_remaining_kind TEXT;
  v_remaining_model_id UUID;
  v_withdrawn_model_id UUID;
  v_remaining_code TEXT;
  v_withdrawn_code TEXT;
  v_remaining_seq INT;
  v_withdrawn_seq INT;
  v_remaining_public_id TEXT;
  v_withdrawn_public_id TEXT;
  v_remaining public.workshop_abs_modules%ROWTYPE;
  v_withdrawn public.workshop_abs_modules%ROWTYPE;
  v_cost_original NUMERIC(12, 2);
  v_cost_remaining NUMERIC(12, 2);
  v_cost_withdrawn NUMERIC(12, 2);
  v_dis public.workshop_abs_module_disassemblies%ROWTYPE;
  v_withdrawn_status TEXT;
  v_scope_remaining TEXT;
  v_scope_withdrawn TEXT;
BEGIN
  IF p_withdrawn_kind NOT IN ('eletronico', 'hidraulico') THEN
    RAISE EXCEPTION 'Informe se a peça retirada é eletrônica ou hidráulica.';
  END IF;
  IF p_destination NOT IN ('ordem_servico', 'venda_direta', 'laboratorio', 'estoque') THEN
    RAISE EXCEPTION 'Destino de desmembramento inválido.';
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
    SELECT 1 FROM public.workshop_abs_module_disassemblies d
    WHERE d.source_module_id = v_src.id
  ) THEN
    RAISE EXCEPTION 'Este módulo já foi desmembrado.';
  END IF;

  SELECT * INTO v_src_model
  FROM public.workshop_abs_module_models
  WHERE id = v_src.model_id;

  v_remaining_kind := CASE
    WHEN p_withdrawn_kind = 'eletronico' THEN 'hidraulico'
    ELSE 'eletronico'
  END;
  v_scope_withdrawn := p_withdrawn_kind;
  v_scope_remaining := v_remaining_kind;

  SELECT c.code_value INTO v_withdrawn_code
  FROM public.workshop_abs_module_codes c
  WHERE c.model_id = v_src.model_id AND c.component_scope = v_scope_withdrawn
  ORDER BY c.sort_order ASC, c.created_at ASC
  LIMIT 1;

  SELECT c.code_value INTO v_remaining_code
  FROM public.workshop_abs_module_codes c
  WHERE c.model_id = v_src.model_id AND c.component_scope = v_scope_remaining
  ORDER BY c.sort_order ASC, c.created_at ASC
  LIMIT 1;

  v_withdrawn_code := COALESCE(
    NULLIF(trim(COALESCE(p_withdrawn_primary_code, '')), ''),
    v_withdrawn_code,
    v_src.original_code
  );
  v_remaining_code := COALESCE(
    NULLIF(trim(COALESCE(p_remaining_primary_code, '')), ''),
    v_remaining_code,
    v_src.original_code
  );

  v_remaining_model_id := public.resolve_or_create_abs_module_model(
    p_workshop_id,
    v_src.manufacturer,
    COALESCE(v_src_model.family, v_src.model),
    v_remaining_kind,
    v_remaining_code,
    NULL
  );
  v_withdrawn_model_id := public.resolve_or_create_abs_module_model(
    p_workshop_id,
    v_src.manufacturer,
    COALESCE(v_src_model.family, v_src.model),
    p_withdrawn_kind,
    v_withdrawn_code,
    NULL
  );

  -- Aplicações: original do completo = principal; apps do escopo da peça = secundárias
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
  v_withdrawn_seq := public.next_workshop_abs_module_sequence(v_withdrawn_model_id);
  v_remaining_public_id := public.next_workshop_abs_module_public_id(p_workshop_id);

  v_withdrawn_status := CASE
    WHEN p_destination = 'estoque' THEN 'disponivel'
    ELSE 'fora_estoque'
  END;

  UPDATE public.workshop_abs_modules
  SET status = 'desmembrado', updated_at = now()
  WHERE id = v_src.id;

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
    p_workshop_id, v_remaining_public_id, v_src.manufacturer, v_remaining_code,
    v_src.application, v_src.model, v_src.year_label,
    v_remaining_kind, v_src.condition, v_cost_remaining, v_src.unit_price, v_src.supplier,
    COALESCE(NULLIF(trim(COALESCE(p_remaining_location, '')), ''), v_src.location),
    'Componente restante do desmembramento de ' || v_src.public_id,
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
    'desmembramento', v_src.public_id,
    'Unidade criada no desmembramento (restante)',
    NULLIF(trim(COALESCE(p_recorded_by_name, '')), ''),
    NULL
  );

  v_withdrawn_public_id := public.next_workshop_abs_module_public_id(p_workshop_id);

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
    CASE
      WHEN p_destination = 'estoque'
        THEN COALESCE(NULLIF(trim(COALESCE(p_withdrawn_location, '')), ''), v_src.location)
      ELSE NULLIF(trim(COALESCE(p_withdrawn_location, '')), '')
    END,
    'Componente retirado do desmembramento de ' || v_src.public_id,
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
    p_workshop_id, v_withdrawn.id,
    CASE WHEN p_destination = 'estoque' THEN 'entry' ELSE 'exit' END,
    NULL, v_withdrawn_status, NULL, v_withdrawn.location,
    CASE
      WHEN p_destination = 'ordem_servico' THEN 'ordem_servico'
      WHEN p_destination = 'venda_direta' THEN 'venda_avulsa'
      WHEN p_destination = 'laboratorio' THEN 'laboratorio'
      ELSE 'desmembramento'
    END,
    NULLIF(trim(COALESCE(p_destination_ref, '')), ''),
    'Unidade criada no desmembramento (retirada → ' || p_destination || ')',
    NULLIF(trim(COALESCE(p_recorded_by_name, '')), ''),
    p_service_order_id
  );

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

  SELECT * INTO v_src FROM public.workshop_abs_modules WHERE id = v_src.id;

  RETURN jsonb_build_object(
    'source', to_jsonb(v_src),
    'remaining', to_jsonb(v_remaining),
    'withdrawn', to_jsonb(v_withdrawn),
    'disassembly', to_jsonb(v_dis)
  );
END;
$$;

COMMENT ON FUNCTION public.disassemble_workshop_abs_module IS
  'Desmembra módulo ABS completo; preserva a aplicação original do completo como principal nos componentes.';

-- Repara modelos de componentes já criados por desmembramentos anteriores.
DO $$
DECLARE
  r RECORD;
  v_src_model UUID;
  v_rem_model UUID;
  v_wd_model UUID;
  v_rem_kind TEXT;
BEGIN
  FOR r IN
    SELECT d.*
    FROM public.workshop_abs_module_disassemblies d
  LOOP
    SELECT model_id INTO v_src_model
    FROM public.workshop_abs_modules WHERE id = r.source_module_id;

    SELECT model_id, module_kind INTO v_rem_model, v_rem_kind
    FROM public.workshop_abs_modules WHERE id = r.remaining_module_id;

    SELECT model_id INTO v_wd_model
    FROM public.workshop_abs_modules WHERE id = r.withdrawn_module_id;

    IF v_src_model IS NOT NULL AND v_rem_model IS NOT NULL AND v_rem_kind IN ('eletronico', 'hidraulico') THEN
      PERFORM public.seed_abs_component_applications_from_complete(
        r.workshop_id, v_src_model, v_rem_model, v_rem_kind
      );
    END IF;

    IF v_src_model IS NOT NULL AND v_wd_model IS NOT NULL AND r.withdrawn_kind IN ('eletronico', 'hidraulico') THEN
      PERFORM public.seed_abs_component_applications_from_complete(
        r.workshop_id, v_src_model, v_wd_model, r.withdrawn_kind
      );
    END IF;
  END LOOP;
END $$;
