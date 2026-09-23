-- Vincula baixas de estoque (caixa do modal da OS) à ordem de serviço.

ALTER TABLE public.workshop_part_stock_movements
  ADD COLUMN IF NOT EXISTS service_order_id UUID REFERENCES public.service_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wpsm_service_order_created
  ON public.workshop_part_stock_movements (service_order_id, created_at DESC)
  WHERE service_order_id IS NOT NULL;

COMMENT ON COLUMN public.workshop_part_stock_movements.service_order_id IS
  'OS (pátio/lab) para a qual a peça foi retirada — caixa do modal do veículo.';

CREATE OR REPLACE FUNCTION public.apply_workshop_part_stock_outbound(
  p_workshop_id UUID,
  p_part_id UUID,
  p_movement_type TEXT,
  p_quantity NUMERIC,
  p_unit_price NUMERIC DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_barcode_scanned TEXT DEFAULT NULL,
  p_recorded_by_name TEXT DEFAULT NULL,
  p_service_order_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_part public.workshop_parts%ROWTYPE;
  v_qty NUMERIC(12, 3);
  v_before NUMERIC(12, 3);
  v_after NUMERIC(12, 3);
  v_unit_price NUMERIC(12, 2);
  v_total NUMERIC(12, 2);
  v_movement public.workshop_part_stock_movements%ROWTYPE;
BEGIN
  IF p_movement_type NOT IN ('sale', 'consumable') THEN
    RAISE EXCEPTION 'Tipo de movimentação inválido.';
  END IF;

  v_qty := ROUND(COALESCE(p_quantity, 0)::numeric, 3);
  IF v_qty <= 0 THEN
    RAISE EXCEPTION 'Quantidade inválida.';
  END IF;

  SELECT *
  INTO v_part
  FROM public.workshop_parts
  WHERE id = p_part_id
    AND workshop_id = p_workshop_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não encontrado.';
  END IF;

  v_before := ROUND(COALESCE(v_part.stock_qty, 0)::numeric, 3);
  IF v_before < v_qty THEN
    RAISE EXCEPTION 'Estoque insuficiente para "%". Disponível: %.', v_part.name, v_before;
  END IF;

  v_after := ROUND((v_before - v_qty)::numeric, 3);

  IF p_movement_type = 'sale' THEN
    v_unit_price := ROUND(COALESCE(p_unit_price, v_part.unit_price, 0)::numeric, 2);
    IF v_unit_price < 0 THEN
      RAISE EXCEPTION 'Preço unitário inválido.';
    END IF;
    v_total := ROUND((v_unit_price * v_qty)::numeric, 2);
  ELSE
    v_unit_price := NULL;
    v_total := NULL;
  END IF;

  UPDATE public.workshop_parts
  SET stock_qty = v_after
  WHERE id = v_part.id
    AND workshop_id = p_workshop_id;

  INSERT INTO public.workshop_part_stock_movements (
    workshop_id,
    part_id,
    movement_type,
    quantity,
    unit_price,
    total_amount,
    notes,
    barcode_scanned,
    recorded_by_name,
    stock_before,
    stock_after,
    service_order_id
  )
  VALUES (
    p_workshop_id,
    p_part_id,
    p_movement_type,
    v_qty,
    v_unit_price,
    v_total,
    NULLIF(trim(COALESCE(p_notes, '')), ''),
    NULLIF(trim(COALESCE(p_barcode_scanned, '')), ''),
    NULLIF(trim(COALESCE(p_recorded_by_name, '')), ''),
    v_before,
    v_after,
    p_service_order_id
  )
  RETURNING * INTO v_movement;

  RETURN jsonb_build_object(
    'movement', to_jsonb(v_movement),
    'part', jsonb_build_object(
      'id', v_part.id,
      'name', v_part.name,
      'stock_qty', v_after,
      'unit_price', v_part.unit_price,
      'unit_of_measure', COALESCE(v_part.unit_of_measure, 'UN'),
      'photo_url', v_part.photo_url,
      'barcode', v_part.barcode
    )
  );
END;
$$;

COMMENT ON FUNCTION public.apply_workshop_part_stock_outbound IS
  'Registra venda avulsa ou consumo de insumo e abate o estoque atomicamente (opcionalmente vinculado a uma OS).';
