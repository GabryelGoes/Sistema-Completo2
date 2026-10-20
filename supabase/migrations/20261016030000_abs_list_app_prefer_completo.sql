-- Lista ABS: a aplicação exibida (montadora/modelo) deve ser a do cadastro
-- ORIGINAL do módulo completo, mesmo nos modelos eletrônico/hidráulico gerados
-- no desmembramento. Guardamos essa app com component_scope = 'completo' no
-- modelo do componente; apps do escopo da peça ficam só como secundárias.

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

  -- Aplicação original = 1ª do escopo completo no modelo de origem.
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

  -- Empurra apps `completo` já existentes no alvo.
  UPDATE public.workshop_abs_module_applications x
  SET sort_order = COALESCE(x.sort_order, 0) + 100
  WHERE x.model_id = p_target_model_id
    AND x.component_scope = 'completo';

  -- Garante a original como sort_order 0 no escopo `completo` do componente.
  IF NOT EXISTS (
    SELECT 1
    FROM public.workshop_abs_module_applications x
    WHERE x.model_id = p_target_model_id
      AND x.component_scope = 'completo'
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
      p_workshop_id, p_target_model_id, 'completo',
      v_original.vehicle_brand, v_original.vehicle_model,
      v_original.generation, v_original.year_from, v_original.year_to,
      v_original.engine, v_original.version, v_original.notes, 0
    );
  ELSE
    UPDATE public.workshop_abs_module_applications x
    SET sort_order = 0
    WHERE x.model_id = p_target_model_id
      AND x.component_scope = 'completo'
      AND lower(trim(COALESCE(x.vehicle_brand, ''))) = lower(trim(COALESCE(v_original.vehicle_brand, '')))
      AND lower(trim(COALESCE(x.vehicle_model, ''))) = lower(trim(COALESCE(v_original.vehicle_model, '')))
      AND COALESCE(x.year_from, -1) = COALESCE(v_original.year_from, -1)
      AND COALESCE(x.year_to, -1) = COALESCE(v_original.year_to, -1);
  END IF;

  -- Remove cópia da original no escopo da peça (evita aparecer como principal).
  DELETE FROM public.workshop_abs_module_applications x
  WHERE x.model_id = p_target_model_id
    AND x.component_scope = p_target_scope
    AND lower(trim(COALESCE(x.vehicle_brand, ''))) = lower(trim(COALESCE(v_original.vehicle_brand, '')))
    AND lower(trim(COALESCE(x.vehicle_model, ''))) = lower(trim(COALESCE(v_original.vehicle_model, '')))
    AND COALESCE(x.year_from, -1) = COALESCE(v_original.year_from, -1)
    AND COALESCE(x.year_to, -1) = COALESCE(v_original.year_to, -1);

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

  -- Renumerar completo: original=0, demais 1..n
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
      AND component_scope = 'completo'
  )
  UPDATE public.workshop_abs_module_applications a
  SET sort_order = ordered.new_sort
  FROM ordered
  WHERE a.id = ordered.id;

  -- Renumerar apps do escopo da peça
  WITH ordered_part AS (
    SELECT
      id,
      ROW_NUMBER() OVER (ORDER BY sort_order ASC, created_at ASC) - 1 AS new_sort
    FROM public.workshop_abs_module_applications
    WHERE model_id = p_target_model_id
      AND component_scope = p_target_scope
  )
  UPDATE public.workshop_abs_module_applications a
  SET sort_order = ordered_part.new_sort
  FROM ordered_part
  WHERE a.id = ordered_part.id;
END;
$$;

COMMENT ON FUNCTION public.seed_abs_component_applications_from_complete IS
  'Copia a aplicação original do completo como escopo completo no componente; apps da peça ficam secundárias.';

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
