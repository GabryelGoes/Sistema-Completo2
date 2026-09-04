-- Campos extras do produto no estoque + barracão (oficina / depósito).

ALTER TABLE public.workshop_parts
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS model TEXT,
  ADD COLUMN IF NOT EXISTS content_qty NUMERIC(12, 3),
  ADD COLUMN IF NOT EXISTS content_unit TEXT,
  ADD COLUMN IF NOT EXISTS characteristics TEXT,
  ADD COLUMN IF NOT EXISTS storage_site TEXT NOT NULL DEFAULT 'oficina';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'workshop_parts_storage_site_check'
  ) THEN
    ALTER TABLE public.workshop_parts
      ADD CONSTRAINT workshop_parts_storage_site_check
      CHECK (storage_site IN ('oficina', 'deposito'));
  END IF;
END $$;

COMMENT ON COLUMN public.workshop_parts.description IS 'Descrição comercial/técnica do produto.';
COMMENT ON COLUMN public.workshop_parts.model IS 'Modelo do produto.';
COMMENT ON COLUMN public.workshop_parts.content_qty IS 'Quantidade de conteúdo da embalagem (ex.: 500).';
COMMENT ON COLUMN public.workshop_parts.content_unit IS 'Unidade do conteúdo (ML, L, KG, G, …).';
COMMENT ON COLUMN public.workshop_parts.characteristics IS 'Características do produto.';
COMMENT ON COLUMN public.workshop_parts.storage_site IS 'Barracão: oficina (principal) ou deposito.';

CREATE INDEX IF NOT EXISTS idx_workshop_parts_storage_site
  ON public.workshop_parts (workshop_id, storage_site);
