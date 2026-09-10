-- Inventário individual de módulos ABS (QR Code interno ABS-000001).
-- Separado de workshop_parts (produtos comuns / quantidade).

CREATE TABLE IF NOT EXISTS public.workshop_abs_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  public_id TEXT NOT NULL,
  manufacturer TEXT,
  original_code TEXT,
  application TEXT,
  model TEXT,
  year_label TEXT,
  module_kind TEXT NOT NULL DEFAULT 'completo'
    CHECK (module_kind IN ('completo', 'eletronico', 'hidraulico', 'outro')),
  condition TEXT NOT NULL DEFAULT 'usado'
    CHECK (condition IN ('novo', 'usado', 'revisado', 'recuperado')),
  unit_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
  unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  supplier TEXT,
  location TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'disponivel'
    CHECK (status IN ('disponivel', 'fora_estoque')),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_workshop_abs_modules_public_id UNIQUE (workshop_id, public_id)
);

CREATE INDEX IF NOT EXISTS idx_wam_workshop_status
  ON public.workshop_abs_modules (workshop_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wam_workshop_public_id
  ON public.workshop_abs_modules (workshop_id, public_id);

COMMENT ON TABLE public.workshop_abs_modules IS
  'Módulos ABS físicos rastreados individualmente (QR = public_id, ex.: ABS-000001).';

CREATE TABLE IF NOT EXISTS public.workshop_abs_module_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES public.workshop_abs_modules(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL
    CHECK (movement_type IN ('entry', 'exit', 'transfer')),
  from_status TEXT,
  to_status TEXT,
  from_location TEXT,
  to_location TEXT,
  reason_type TEXT
    CHECK (
      reason_type IS NULL
      OR reason_type IN (
        'venda_avulsa',
        'ordem_servico',
        'cliente',
        'veiculo',
        'retorno',
        'ajuste',
        'outro'
      )
    ),
  reason_ref TEXT,
  notes TEXT,
  recorded_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wamm_module_created
  ON public.workshop_abs_module_movements (module_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wamm_workshop_created
  ON public.workshop_abs_module_movements (workshop_id, created_at DESC);

COMMENT ON TABLE public.workshop_abs_module_movements IS
  'Histórico individual: entrada, saída e transferência de local do módulo ABS.';

-- Gera próximo ABS-###### por oficina (lock por workshop).
CREATE OR REPLACE FUNCTION public.next_workshop_abs_module_public_id(p_workshop_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_max INT := 0;
  v_lock_key INT;
BEGIN
  v_lock_key := hashtext(p_workshop_id::text);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT COALESCE(MAX(
    CASE
      WHEN public_id ~ '^ABS-[0-9]{6}$'
        THEN substring(public_id from 5)::int
      ELSE 0
    END
  ), 0)
  INTO v_max
  FROM public.workshop_abs_modules
  WHERE workshop_id = p_workshop_id;

  RETURN 'ABS-' || lpad((v_max + 1)::text, 6, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_workshop_abs_module_movement(
  p_workshop_id UUID,
  p_module_id UUID,
  p_movement_type TEXT,
  p_to_location TEXT DEFAULT NULL,
  p_reason_type TEXT DEFAULT NULL,
  p_reason_ref TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_recorded_by_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_mod public.workshop_abs_modules%ROWTYPE;
  v_from_status TEXT;
  v_to_status TEXT;
  v_from_location TEXT;
  v_to_location TEXT;
  v_mov public.workshop_abs_module_movements%ROWTYPE;
BEGIN
  IF p_movement_type NOT IN ('entry', 'exit', 'transfer') THEN
    RAISE EXCEPTION 'Tipo de movimentação inválido.';
  END IF;

  SELECT * INTO v_mod
  FROM public.workshop_abs_modules
  WHERE id = p_module_id AND workshop_id = p_workshop_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Módulo ABS não encontrado.';
  END IF;

  v_from_status := v_mod.status;
  v_from_location := v_mod.location;
  v_to_location := v_mod.location;
  v_to_status := v_mod.status;

  IF p_movement_type = 'exit' THEN
    IF v_mod.status <> 'disponivel' THEN
      RAISE EXCEPTION 'Módulo % não está disponível para saída.', v_mod.public_id;
    END IF;
    v_to_status := 'fora_estoque';
  ELSIF p_movement_type = 'entry' THEN
    IF v_mod.status <> 'fora_estoque' THEN
      RAISE EXCEPTION 'Módulo % já está disponível no estoque.', v_mod.public_id;
    END IF;
    v_to_status := 'disponivel';
    IF NULLIF(trim(COALESCE(p_to_location, '')), '') IS NOT NULL THEN
      v_to_location := NULLIF(trim(p_to_location), '');
    END IF;
  ELSIF p_movement_type = 'transfer' THEN
    v_to_location := NULLIF(trim(COALESCE(p_to_location, '')), '');
    IF v_to_location IS NULL THEN
      RAISE EXCEPTION 'Informe o novo local.';
    END IF;
  END IF;

  UPDATE public.workshop_abs_modules
  SET
    status = v_to_status,
    location = CASE
      WHEN p_movement_type = 'transfer' THEN v_to_location
      WHEN p_movement_type = 'entry' AND v_to_location IS DISTINCT FROM v_from_location THEN v_to_location
      ELSE location
    END,
    updated_at = now()
  WHERE id = v_mod.id;

  INSERT INTO public.workshop_abs_module_movements (
    workshop_id, module_id, movement_type,
    from_status, to_status, from_location, to_location,
    reason_type, reason_ref, notes, recorded_by_name
  )
  VALUES (
    p_workshop_id, v_mod.id, p_movement_type,
    v_from_status, v_to_status, v_from_location,
    CASE
      WHEN p_movement_type = 'transfer' THEN v_to_location
      WHEN p_movement_type = 'entry' THEN COALESCE(v_to_location, v_from_location)
      ELSE v_from_location
    END,
    NULLIF(trim(COALESCE(p_reason_type, '')), ''),
    NULLIF(trim(COALESCE(p_reason_ref, '')), ''),
    NULLIF(trim(COALESCE(p_notes, '')), ''),
    NULLIF(trim(COALESCE(p_recorded_by_name, '')), '')
  )
  RETURNING * INTO v_mov;

  SELECT * INTO v_mod
  FROM public.workshop_abs_modules
  WHERE id = v_mod.id;

  RETURN jsonb_build_object(
    'module', to_jsonb(v_mod),
    'movement', to_jsonb(v_mov)
  );
END;
$$;
