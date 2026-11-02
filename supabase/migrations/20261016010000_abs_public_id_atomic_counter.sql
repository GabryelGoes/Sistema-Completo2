-- Contador atômico de public_id ABS (ABS-000001…).
-- Corrige desmembramento que chamava next_* duas vezes antes do INSERT
-- e gerava o mesmo ID (uq_workshop_abs_modules_public_id).

CREATE TABLE IF NOT EXISTS public.workshop_abs_module_id_counters (
  workshop_id UUID PRIMARY KEY REFERENCES public.workshops(id) ON DELETE CASCADE,
  last_n INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.workshop_abs_module_id_counters IS
  'Último número usado em public_id ABS-###### por oficina (alocação atômica).';

-- Inicializa contadores a partir do MAX atual (idempotente).
INSERT INTO public.workshop_abs_module_id_counters (workshop_id, last_n)
SELECT
  workshop_id,
  COALESCE(MAX(
    CASE
      WHEN public_id ~ '^ABS-[0-9]{6}$'
        THEN substring(public_id from 5)::int
      ELSE 0
    END
  ), 0)
FROM public.workshop_abs_modules
GROUP BY workshop_id
ON CONFLICT (workshop_id) DO UPDATE
SET last_n = GREATEST(
  public.workshop_abs_module_id_counters.last_n,
  EXCLUDED.last_n
);

CREATE OR REPLACE FUNCTION public.next_workshop_abs_module_public_id(p_workshop_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_max_existing INT := 0;
  v_next INT;
BEGIN
  IF p_workshop_id IS NULL THEN
    RAISE EXCEPTION 'workshop_id é obrigatório para gerar public_id ABS.';
  END IF;

  -- Garante linha do contador
  INSERT INTO public.workshop_abs_module_id_counters (workshop_id, last_n)
  VALUES (p_workshop_id, 0)
  ON CONFLICT (workshop_id) DO NOTHING;

  -- MAX atual nas unidades (caso algo tenha avançado fora do contador)
  SELECT COALESCE(MAX(
    CASE
      WHEN public_id ~ '^ABS-[0-9]{6}$'
        THEN substring(public_id from 5)::int
      ELSE 0
    END
  ), 0)
  INTO v_max_existing
  FROM public.workshop_abs_modules
  WHERE workshop_id = p_workshop_id;

  -- Incremento atômico (lock da linha do contador)
  UPDATE public.workshop_abs_module_id_counters
  SET
    last_n = GREATEST(last_n, v_max_existing) + 1,
    updated_at = now()
  WHERE workshop_id = p_workshop_id
  RETURNING last_n INTO v_next;

  IF v_next IS NULL THEN
    RAISE EXCEPTION 'Falha ao alocar public_id ABS para workshop %.', p_workshop_id;
  END IF;

  RETURN 'ABS-' || lpad(v_next::text, 6, '0');
END;
$$;

COMMENT ON FUNCTION public.next_workshop_abs_module_public_id(UUID) IS
  'Gera o próximo ABS-###### de forma atômica (contador por oficina). Cada chamada avança o contador, mesmo antes de INSERT.';
