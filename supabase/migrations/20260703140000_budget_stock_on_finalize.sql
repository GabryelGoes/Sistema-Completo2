-- Estoque: não abater na criação/edição do orçamento; abater ao finalizar veículo (modal de fechamento).
-- Rascunho editável de peças fica em service_order_finalize_stock_lines até o PUT do fechamento.

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS finalize_stock_applied_at timestamptz;

COMMENT ON COLUMN public.service_orders.finalize_stock_applied_at IS
  'Quando o estoque foi abatido no fechamento (etapa Finalizado). NULL = ainda não abatido neste fluxo.';

CREATE TABLE IF NOT EXISTS public.service_order_finalize_stock_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  service_order_id UUID NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  description TEXT NOT NULL DEFAULT '',
  quantity NUMERIC(12, 3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  workshop_part_id UUID REFERENCES workshop_parts(id) ON DELETE SET NULL,
  budget_id UUID REFERENCES budgets(id) ON DELETE SET NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sofsl_service_order
  ON public.service_order_finalize_stock_lines(service_order_id);

CREATE INDEX IF NOT EXISTS idx_sofsl_workshop
  ON public.service_order_finalize_stock_lines(workshop_id, created_at DESC);

COMMENT ON TABLE public.service_order_finalize_stock_lines IS
  'Peças a abater do estoque ao finalizar veículo (editáveis no modal de técnicos por serviço).';

-- OS em andamento com orçamento já criado antes desta migration: estoque já foi abatido na criação/edição.
UPDATE public.service_orders so
SET finalize_stock_applied_at = COALESCE(so.updated_at, now())
WHERE so.order_type = 'vehicle'
  AND so.status <> 'FINALIZADO'
  AND so.finalize_stock_applied_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.budgets b WHERE b.service_order_id = so.id
  );

-- create_budget_with_stock: apenas insere orçamento (sem mexer em workshop_parts).
CREATE OR REPLACE FUNCTION create_budget_with_stock(
  p_workshop_id UUID,
  p_service_order_id UUID,
  p_card_name TEXT,
  p_diagnosis TEXT,
  p_services JSONB,
  p_parts JSONB,
  p_observations TEXT
)
RETURNS budgets
LANGUAGE plpgsql
AS $$
DECLARE
  v_budget budgets%ROWTYPE;
  v_services JSONB := COALESCE(p_services, '[]'::jsonb);
  v_parts JSONB := COALESCE(p_parts, '[]'::jsonb);
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM service_orders so
    WHERE so.id = p_service_order_id
      AND so.workshop_id = p_workshop_id
  ) THEN
    RAISE EXCEPTION 'Ordem de serviço não encontrada.';
  END IF;

  INSERT INTO budgets (
    workshop_id,
    service_order_id,
    card_name,
    diagnosis,
    services,
    parts,
    observations
  )
  VALUES (
    p_workshop_id,
    p_service_order_id,
    p_card_name,
    COALESCE(p_diagnosis, ''),
    v_services,
    v_parts,
    COALESCE(p_observations, '')
  )
  RETURNING * INTO v_budget;

  RETURN v_budget;
END;
$$;

COMMENT ON FUNCTION create_budget_with_stock(UUID, UUID, TEXT, TEXT, JSONB, JSONB, TEXT)
IS 'Cria orçamento (estoque abatido apenas na finalização do veículo).';

-- update_budget_with_stock: apenas atualiza orçamento (sem mexer em workshop_parts).
CREATE OR REPLACE FUNCTION update_budget_with_stock(
  p_workshop_id UUID,
  p_service_order_id UUID,
  p_budget_id UUID,
  p_card_name TEXT,
  p_diagnosis TEXT,
  p_services JSONB,
  p_parts JSONB,
  p_observations TEXT
)
RETURNS budgets
LANGUAGE plpgsql
AS $$
DECLARE
  v_budget budgets%ROWTYPE;
  v_services JSONB := COALESCE(p_services, '[]'::jsonb);
  v_parts JSONB := COALESCE(p_parts, '[]'::jsonb);
BEGIN
  UPDATE budgets
  SET
    card_name = p_card_name,
    diagnosis = COALESCE(p_diagnosis, ''),
    services = v_services,
    parts = v_parts,
    observations = COALESCE(p_observations, '')
  WHERE id = p_budget_id
    AND service_order_id = p_service_order_id
    AND workshop_id = p_workshop_id
  RETURNING * INTO v_budget;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Orçamento não encontrado.';
  END IF;

  RETURN v_budget;
END;
$$;

COMMENT ON FUNCTION update_budget_with_stock(UUID, UUID, UUID, TEXT, TEXT, JSONB, JSONB, TEXT)
IS 'Atualiza orçamento (estoque abatido apenas na finalização do veículo).';
