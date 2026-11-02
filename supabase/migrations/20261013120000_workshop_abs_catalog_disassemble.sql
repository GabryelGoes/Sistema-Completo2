-- Catálogo técnico + unidades físicas ABS, sequências por modelo, desmembramento atômico.
-- Aditivo: preserva workshop_abs_modules / movements existentes.

-- ---------------------------------------------------------------------------
-- 1. Catálogo técnico (modelo)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workshop_abs_module_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  manufacturer TEXT,
  family TEXT,
  module_kind TEXT NOT NULL DEFAULT 'completo'
    CHECK (module_kind IN ('completo', 'eletronico', 'hidraulico', 'outro')),
  notes TEXT,
  fingerprint TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_wamm_fingerprint UNIQUE (workshop_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_wamm_workshop_kind
  ON public.workshop_abs_module_models (workshop_id, module_kind, manufacturer);

COMMENT ON TABLE public.workshop_abs_module_models IS
  'Cadastro técnico de modelo ABS (fabricante/família/tipo). Unidades físicas referenciam este registro.';

-- ---------------------------------------------------------------------------
-- 2. Códigos técnicos (eletrônico / hidráulico / alternativos)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workshop_abs_module_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  model_id UUID NOT NULL REFERENCES public.workshop_abs_module_models(id) ON DELETE CASCADE,
  component_scope TEXT NOT NULL
    CHECK (component_scope IN ('completo', 'eletronico', 'hidraulico')),
  code_role TEXT NOT NULL DEFAULT 'fabricante'
    CHECK (code_role IN ('fabricante', 'montadora', 'alternativo')),
  code_value TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wamc_model
  ON public.workshop_abs_module_codes (model_id, component_scope, sort_order);

CREATE INDEX IF NOT EXISTS idx_wamc_code_value
  ON public.workshop_abs_module_codes (workshop_id, code_value);

COMMENT ON TABLE public.workshop_abs_module_codes IS
  'Referências técnicas do modelo (TEXT para preservar zeros à esquerda).';

-- ---------------------------------------------------------------------------
-- 3. Aplicações em veículos (3 escopos independentes)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workshop_abs_module_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  model_id UUID NOT NULL REFERENCES public.workshop_abs_module_models(id) ON DELETE CASCADE,
  component_scope TEXT NOT NULL
    CHECK (component_scope IN ('completo', 'eletronico', 'hidraulico')),
  vehicle_brand TEXT,
  vehicle_model TEXT,
  generation TEXT,
  year_from INT,
  year_to INT,
  engine TEXT,
  version TEXT,
  notes TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wama_model_scope
  ON public.workshop_abs_module_applications (model_id, component_scope, sort_order);

CREATE INDEX IF NOT EXISTS idx_wama_vehicle
  ON public.workshop_abs_module_applications (workshop_id, vehicle_brand, vehicle_model);

COMMENT ON TABLE public.workshop_abs_module_applications IS
  'Aplicações veiculares por escopo (completo / eletrônico / hidráulico).';

-- ---------------------------------------------------------------------------
-- 4. Fotos (modelo e unidade)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workshop_abs_module_model_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  model_id UUID NOT NULL REFERENCES public.workshop_abs_module_models(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wammp_model
  ON public.workshop_abs_module_model_photos (model_id, sort_order);

CREATE TABLE IF NOT EXISTS public.workshop_abs_module_unit_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES public.workshop_abs_modules(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wamup_module
  ON public.workshop_abs_module_unit_photos (module_id, sort_order);

-- ---------------------------------------------------------------------------
-- 5. Colunas novas na unidade física
-- ---------------------------------------------------------------------------
ALTER TABLE public.workshop_abs_modules
  ADD COLUMN IF NOT EXISTS model_id UUID REFERENCES public.workshop_abs_module_models(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sequence_number INT,
  ADD COLUMN IF NOT EXISTS item_state TEXT,
  ADD COLUMN IF NOT EXISTS item_condition TEXT,
  ADD COLUMN IF NOT EXISTS damage_description TEXT,
  ADD COLUMN IF NOT EXISTS parent_complete_id UUID REFERENCES public.workshop_abs_modules(id) ON DELETE SET NULL;

-- Ampliar status (drop CHECK antigo se existir)
DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT con.conname INTO cname
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'workshop_abs_modules'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%status%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.workshop_abs_modules DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.workshop_abs_modules
  ADD CONSTRAINT workshop_abs_modules_status_check
  CHECK (status IN ('disponivel', 'fora_estoque', 'desmembrado', 'reservado'));

DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT con.conname INTO cname
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'workshop_abs_modules'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%condition%'
    AND pg_get_constraintdef(con.oid) NOT ILIKE '%item_condition%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.workshop_abs_modules DROP CONSTRAINT %I', cname);
  END IF;
END $$;

-- condition legado continua aceito; novos campos têm CHECKs próprios
ALTER TABLE public.workshop_abs_modules
  DROP CONSTRAINT IF EXISTS workshop_abs_modules_item_state_check;
ALTER TABLE public.workshop_abs_modules
  ADD CONSTRAINT workshop_abs_modules_item_state_check
  CHECK (item_state IS NULL OR item_state IN ('novo', 'usado', 'recondicionado'));

ALTER TABLE public.workshop_abs_modules
  DROP CONSTRAINT IF EXISTS workshop_abs_modules_item_condition_check;
ALTER TABLE public.workshop_abs_modules
  ADD CONSTRAINT workshop_abs_modules_item_condition_check
  CHECK (
    item_condition IS NULL
    OR item_condition IN ('perfeito', 'com_avarias', 'defeituoso', 'nao_testado')
  );

-- Backfill item_state / item_condition a partir de condition legado
UPDATE public.workshop_abs_modules
SET
  item_state = CASE
    WHEN condition IN ('revisado', 'recuperado') THEN 'recondicionado'
    WHEN condition = 'novo' THEN 'novo'
    ELSE 'usado'
  END,
  item_condition = CASE
    WHEN condition IN ('revisado', 'recuperado') THEN 'nao_testado'
    WHEN condition = 'novo' THEN 'perfeito'
    ELSE 'nao_testado'
  END
WHERE item_state IS NULL OR item_condition IS NULL;

ALTER TABLE public.workshop_abs_modules
  ALTER COLUMN item_state SET DEFAULT 'usado',
  ALTER COLUMN item_condition SET DEFAULT 'nao_testado';

UPDATE public.workshop_abs_modules
SET item_state = COALESCE(item_state, 'usado'),
    item_condition = COALESCE(item_condition, 'nao_testado');

ALTER TABLE public.workshop_abs_modules
  ALTER COLUMN item_state SET NOT NULL,
  ALTER COLUMN item_condition SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 6. Backfill: criar modelos técnicos e sequências para unidades legadas
-- ---------------------------------------------------------------------------
INSERT INTO public.workshop_abs_module_models (
  workshop_id, manufacturer, family, module_kind, notes, fingerprint, created_at, updated_at
)
SELECT
  m.workshop_id,
  NULLIF(trim(COALESCE(m.manufacturer, '')), ''),
  NULLIF(trim(COALESCE(m.model, '')), ''),
  m.module_kind,
  NULL,
  lower(
    coalesce(nullif(trim(m.manufacturer), ''), '_') || '|' ||
    coalesce(nullif(trim(m.original_code), ''), '_') || '|' ||
    m.module_kind
  ),
  MIN(m.created_at),
  now()
FROM public.workshop_abs_modules m
WHERE m.model_id IS NULL
GROUP BY
  m.workshop_id,
  NULLIF(trim(COALESCE(m.manufacturer, '')), ''),
  NULLIF(trim(COALESCE(m.model, '')), ''),
  m.module_kind,
  lower(
    coalesce(nullif(trim(m.manufacturer), ''), '_') || '|' ||
    coalesce(nullif(trim(m.original_code), ''), '_') || '|' ||
    m.module_kind
  )
ON CONFLICT (workshop_id, fingerprint) DO NOTHING;

-- Vincular unidades ao modelo
UPDATE public.workshop_abs_modules u
SET model_id = md.id
FROM public.workshop_abs_module_models md
WHERE u.model_id IS NULL
  AND u.workshop_id = md.workshop_id
  AND md.fingerprint = lower(
    coalesce(nullif(trim(u.manufacturer), ''), '_') || '|' ||
    coalesce(nullif(trim(u.original_code), ''), '_') || '|' ||
    u.module_kind
  );

-- Códigos legados (original_code → code do escopo do tipo)
INSERT INTO public.workshop_abs_module_codes (
  workshop_id, model_id, component_scope, code_role, code_value, sort_order
)
SELECT DISTINCT ON (u.model_id, u.original_code)
  u.workshop_id,
  u.model_id,
  CASE
    WHEN u.module_kind = 'hidraulico' THEN 'hidraulico'
    WHEN u.module_kind = 'eletronico' THEN 'eletronico'
    ELSE 'completo'
  END,
  'fabricante',
  trim(u.original_code),
  0
FROM public.workshop_abs_modules u
WHERE u.model_id IS NOT NULL
  AND NULLIF(trim(COALESCE(u.original_code, '')), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.workshop_abs_module_codes c
    WHERE c.model_id = u.model_id AND c.code_value = trim(u.original_code)
  );

-- Aplicação legada (texto livre → uma linha no escopo do tipo)
INSERT INTO public.workshop_abs_module_applications (
  workshop_id, model_id, component_scope, vehicle_model, notes, sort_order
)
SELECT DISTINCT ON (u.model_id)
  u.workshop_id,
  u.model_id,
  CASE
    WHEN u.module_kind = 'hidraulico' THEN 'hidraulico'
    WHEN u.module_kind = 'eletronico' THEN 'eletronico'
    ELSE 'completo'
  END,
  NULLIF(trim(COALESCE(u.application, '')), ''),
  NULLIF(trim(COALESCE(u.year_label, '')), ''),
  0
FROM public.workshop_abs_modules u
WHERE u.model_id IS NOT NULL
  AND NULLIF(trim(COALESCE(u.application, '')), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.workshop_abs_module_applications a
    WHERE a.model_id = u.model_id AND a.component_scope = CASE
      WHEN u.module_kind = 'hidraulico' THEN 'hidraulico'
      WHEN u.module_kind = 'eletronico' THEN 'eletronico'
      ELSE 'completo'
    END
  );

-- Sequência #N por modelo (ordem de criação; sem renumerar public_id)
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY model_id ORDER BY created_at ASC, public_id ASC) AS rn
  FROM public.workshop_abs_modules
  WHERE model_id IS NOT NULL AND sequence_number IS NULL
)
UPDATE public.workshop_abs_modules u
SET sequence_number = ranked.rn
FROM ranked
WHERE u.id = ranked.id;

-- Unidades sem model (edge): sequência 1 isolada — cria modelo placeholder se ainda faltou
INSERT INTO public.workshop_abs_module_models (
  workshop_id, manufacturer, family, module_kind, fingerprint
)
SELECT
  u.workshop_id,
  NULLIF(trim(COALESCE(u.manufacturer, '')), ''),
  NULL,
  u.module_kind,
  'orphan|' || u.id::text
FROM public.workshop_abs_modules u
WHERE u.model_id IS NULL;

UPDATE public.workshop_abs_modules u
SET model_id = md.id,
    sequence_number = COALESCE(u.sequence_number, 1)
FROM public.workshop_abs_module_models md
WHERE u.model_id IS NULL
  AND md.fingerprint = 'orphan|' || u.id::text;

ALTER TABLE public.workshop_abs_modules
  ALTER COLUMN model_id SET NOT NULL,
  ALTER COLUMN sequence_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_wam_model_sequence
  ON public.workshop_abs_modules (model_id, sequence_number);

CREATE INDEX IF NOT EXISTS idx_wam_model_status
  ON public.workshop_abs_modules (model_id, status);

CREATE INDEX IF NOT EXISTS idx_wam_parent_complete
  ON public.workshop_abs_modules (parent_complete_id)
  WHERE parent_complete_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 7. Desmembramentos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workshop_abs_module_disassemblies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  source_module_id UUID NOT NULL REFERENCES public.workshop_abs_modules(id) ON DELETE RESTRICT,
  withdrawn_kind TEXT NOT NULL CHECK (withdrawn_kind IN ('eletronico', 'hidraulico')),
  remaining_module_id UUID NOT NULL REFERENCES public.workshop_abs_modules(id) ON DELETE RESTRICT,
  withdrawn_module_id UUID NOT NULL REFERENCES public.workshop_abs_modules(id) ON DELETE RESTRICT,
  destination TEXT NOT NULL
    CHECK (destination IN ('ordem_servico', 'venda_direta', 'laboratorio', 'estoque')),
  destination_ref TEXT,
  service_order_id UUID REFERENCES public.service_orders(id) ON DELETE SET NULL,
  cost_original NUMERIC(12, 2) NOT NULL DEFAULT 0,
  cost_remaining NUMERIC(12, 2) NOT NULL DEFAULT 0,
  cost_withdrawn NUMERIC(12, 2) NOT NULL DEFAULT 0,
  cost_adjustment_authorized BOOLEAN NOT NULL DEFAULT false,
  cost_adjustment_note TEXT,
  notes TEXT,
  recorded_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_wamd_source UNIQUE (source_module_id)
);

CREATE INDEX IF NOT EXISTS idx_wamd_workshop_created
  ON public.workshop_abs_module_disassemblies (workshop_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 8. Movimentações: service_order_id + motivo laboratorio
-- ---------------------------------------------------------------------------
ALTER TABLE public.workshop_abs_module_movements
  ADD COLUMN IF NOT EXISTS service_order_id UUID REFERENCES public.service_orders(id) ON DELETE SET NULL;

DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT con.conname INTO cname
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'workshop_abs_module_movements'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%reason_type%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.workshop_abs_module_movements DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.workshop_abs_module_movements
  ADD CONSTRAINT workshop_abs_module_movements_reason_type_check
  CHECK (
    reason_type IS NULL
    OR reason_type IN (
      'venda_avulsa',
      'ordem_servico',
      'cliente',
      'veiculo',
      'retorno',
      'ajuste',
      'laboratorio',
      'desmembramento',
      'outro'
    )
  );

-- ---------------------------------------------------------------------------
-- 9. RPC: próxima sequência por modelo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.next_workshop_abs_module_sequence(p_model_id UUID)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_max INT := 0;
  v_lock_key INT;
BEGIN
  v_lock_key := hashtext('abs-seq:' || p_model_id::text);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT COALESCE(MAX(sequence_number), 0)
  INTO v_max
  FROM public.workshop_abs_modules
  WHERE model_id = p_model_id;

  RETURN v_max + 1;
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. RPC: movimentação (service_order_id + bloqueio desmembrado/reservado)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_workshop_abs_module_movement(
  p_workshop_id UUID,
  p_module_id UUID,
  p_movement_type TEXT,
  p_to_location TEXT DEFAULT NULL,
  p_reason_type TEXT DEFAULT NULL,
  p_reason_ref TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_recorded_by_name TEXT DEFAULT NULL,
  p_service_order_id UUID DEFAULT NULL
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

  IF v_mod.status = 'desmembrado' THEN
    RAISE EXCEPTION 'Módulo % foi desmembrado e não pode ser movimentado.', v_mod.public_id;
  END IF;

  v_from_status := v_mod.status;
  v_from_location := v_mod.location;
  v_to_location := v_mod.location;
  v_to_status := v_mod.status;

  IF p_movement_type = 'exit' THEN
    IF v_mod.status NOT IN ('disponivel', 'reservado') THEN
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
    IF v_mod.status NOT IN ('disponivel', 'reservado') THEN
      RAISE EXCEPTION 'Módulo % não pode ser transferido no status atual.', v_mod.public_id;
    END IF;
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
    reason_type, reason_ref, notes, recorded_by_name, service_order_id
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
    NULLIF(trim(COALESCE(p_recorded_by_name, '')), ''),
    p_service_order_id
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

-- ---------------------------------------------------------------------------
-- 11. Helpers internos para desmembramento
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._abs_model_fingerprint(
  p_manufacturer TEXT,
  p_primary_code TEXT,
  p_module_kind TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(
    coalesce(nullif(trim(COALESCE(p_manufacturer, '')), ''), '_') || '|' ||
    coalesce(nullif(trim(COALESCE(p_primary_code, '')), ''), '_') || '|' ||
    coalesce(nullif(trim(COALESCE(p_module_kind, '')), ''), 'outro')
  );
$$;

CREATE OR REPLACE FUNCTION public.resolve_or_create_abs_module_model(
  p_workshop_id UUID,
  p_manufacturer TEXT,
  p_family TEXT,
  p_module_kind TEXT,
  p_primary_code TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_fp TEXT;
  v_id UUID;
BEGIN
  v_fp := public._abs_model_fingerprint(p_manufacturer, p_primary_code, p_module_kind);

  SELECT id INTO v_id
  FROM public.workshop_abs_module_models
  WHERE workshop_id = p_workshop_id AND fingerprint = v_fp;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.workshop_abs_module_models (
    workshop_id, manufacturer, family, module_kind, notes, fingerprint
  )
  VALUES (
    p_workshop_id,
    NULLIF(trim(COALESCE(p_manufacturer, '')), ''),
    NULLIF(trim(COALESCE(p_family, '')), ''),
    COALESCE(NULLIF(trim(p_module_kind), ''), 'eletronico'),
    NULLIF(trim(COALESCE(p_notes, '')), ''),
    v_fp
  )
  RETURNING id INTO v_id;

  IF NULLIF(trim(COALESCE(p_primary_code, '')), '') IS NOT NULL THEN
    INSERT INTO public.workshop_abs_module_codes (
      workshop_id, model_id, component_scope, code_role, code_value, sort_order
    )
    VALUES (
      p_workshop_id,
      v_id,
      CASE
        WHEN p_module_kind = 'hidraulico' THEN 'hidraulico'
        WHEN p_module_kind = 'completo' THEN 'completo'
        ELSE 'eletronico'
      END,
      'fabricante',
      trim(p_primary_code),
      0
    );
  END IF;

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 12. RPC: desmembrar módulo completo (atômico)
-- ---------------------------------------------------------------------------
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

  -- Códigos principais: parâmetro > primeiro código do escopo no modelo origem > original_code
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

  -- Copiar aplicações do escopo correspondente do modelo completo → modelo do componente (se vazio)
  INSERT INTO public.workshop_abs_module_applications (
    workshop_id, model_id, component_scope, vehicle_brand, vehicle_model,
    generation, year_from, year_to, engine, version, notes, sort_order
  )
  SELECT
    a.workshop_id, v_remaining_model_id, v_scope_remaining,
    a.vehicle_brand, a.vehicle_model, a.generation, a.year_from, a.year_to,
    a.engine, a.version, a.notes, a.sort_order
  FROM public.workshop_abs_module_applications a
  WHERE a.model_id = v_src.model_id AND a.component_scope = v_scope_remaining
    AND NOT EXISTS (
      SELECT 1 FROM public.workshop_abs_module_applications x
      WHERE x.model_id = v_remaining_model_id AND x.component_scope = v_scope_remaining
    );

  INSERT INTO public.workshop_abs_module_applications (
    workshop_id, model_id, component_scope, vehicle_brand, vehicle_model,
    generation, year_from, year_to, engine, version, notes, sort_order
  )
  SELECT
    a.workshop_id, v_withdrawn_model_id, v_scope_withdrawn,
    a.vehicle_brand, a.vehicle_model, a.generation, a.year_from, a.year_to,
    a.engine, a.version, a.notes, a.sort_order
  FROM public.workshop_abs_module_applications a
  WHERE a.model_id = v_src.model_id AND a.component_scope = v_scope_withdrawn
    AND NOT EXISTS (
      SELECT 1 FROM public.workshop_abs_module_applications x
      WHERE x.model_id = v_withdrawn_model_id AND x.component_scope = v_scope_withdrawn
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
  v_withdrawn_public_id := public.next_workshop_abs_module_public_id(p_workshop_id);

  v_withdrawn_status := CASE
    WHEN p_destination = 'estoque' THEN 'disponivel'
    ELSE 'fora_estoque'
  END;

  -- Marca origem como desmembrado (public_id original permanece; nunca reutilizado)
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
  'Desmembra módulo ABS completo em restante + retirado (atômico; public_id original nunca reutilizado).';
