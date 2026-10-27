-- Fornecedores + campos de NF-e no recebimento + movimentação tipo purchase (entrada).

-- ----------------- FORNECEDORES -----------------
CREATE TABLE IF NOT EXISTS public.workshop_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trade_name TEXT,
  document TEXT,
  email TEXT,
  phone TEXT,
  whatsapp TEXT,
  contact_name TEXT,
  address_street TEXT,
  address_number TEXT,
  address_complement TEXT,
  address_neighborhood TEXT,
  address_city TEXT,
  address_state TEXT,
  address_zip TEXT,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workshop_suppliers_workshop_name
  ON public.workshop_suppliers (workshop_id, lower(name));

CREATE INDEX IF NOT EXISTS idx_workshop_suppliers_workshop_active
  ON public.workshop_suppliers (workshop_id, active, name);

COMMENT ON TABLE public.workshop_suppliers IS
  'Cadastro de fornecedores do estoque (NF-e / recebimento).';

-- ----------------- COMPRAS: campos de NF-e -----------------
ALTER TABLE public.workshop_part_purchases
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.workshop_suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS nfe_number TEXT,
  ADD COLUMN IF NOT EXISTS product_total NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS invoice_total NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS recorded_by_name TEXT;

CREATE INDEX IF NOT EXISTS idx_workshop_part_purchases_supplier
  ON public.workshop_part_purchases (supplier_id)
  WHERE supplier_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workshop_part_purchases_nfe
  ON public.workshop_part_purchases (workshop_id, nfe_number)
  WHERE nfe_number IS NOT NULL AND length(trim(nfe_number)) > 0;

COMMENT ON COLUMN public.workshop_part_purchases.nfe_number IS 'Número da NF-e da compra.';
COMMENT ON COLUMN public.workshop_part_purchases.product_total IS 'Valor total deste produto na nota (qtd × custo).';
COMMENT ON COLUMN public.workshop_part_purchases.invoice_total IS 'Valor total da NF-e (pode incluir outros itens).';

-- ----------------- MOVIMENTAÇÕES: entrada (purchase) + metadados de compra -----------------
ALTER TABLE public.workshop_part_stock_movements
  DROP CONSTRAINT IF EXISTS workshop_part_stock_movements_movement_type_check;

ALTER TABLE public.workshop_part_stock_movements
  ADD CONSTRAINT workshop_part_stock_movements_movement_type_check
  CHECK (movement_type IN ('sale', 'consumable', 'purchase'));

ALTER TABLE public.workshop_part_stock_movements
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.workshop_suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_name TEXT,
  ADD COLUMN IF NOT EXISTS nfe_number TEXT,
  ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS product_total NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS invoice_total NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS purchase_id UUID REFERENCES public.workshop_part_purchases(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wpsm_purchase_created
  ON public.workshop_part_stock_movements (workshop_id, movement_type, created_at DESC);

COMMENT ON COLUMN public.workshop_part_stock_movements.movement_type IS
  'sale = venda avulsa; consumable = consumo/insumo; purchase = entrada/recebimento com NF.';

-- Entrada atômica de estoque (recebimento com NF-e).
CREATE OR REPLACE FUNCTION public.apply_workshop_part_stock_inbound(
  p_workshop_id UUID,
  p_part_id UUID,
  p_quantity NUMERIC,
  p_unit_cost NUMERIC DEFAULT NULL,
  p_product_total NUMERIC DEFAULT NULL,
  p_invoice_total NUMERIC DEFAULT NULL,
  p_nfe_number TEXT DEFAULT NULL,
  p_supplier_id UUID DEFAULT NULL,
  p_supplier_name TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_recorded_by_name TEXT DEFAULT NULL,
  p_update_part_cost BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_part public.workshop_parts%ROWTYPE;
  v_qty NUMERIC(12, 3);
  v_before NUMERIC(12, 3);
  v_after NUMERIC(12, 3);
  v_unit_cost NUMERIC(12, 2);
  v_product_total NUMERIC(12, 2);
  v_invoice_total NUMERIC(12, 2);
  v_supplier_name TEXT;
  v_purchase public.workshop_part_purchases%ROWTYPE;
  v_movement public.workshop_part_stock_movements%ROWTYPE;
BEGIN
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
  v_after := ROUND((v_before + v_qty)::numeric, 3);

  v_unit_cost := ROUND(COALESCE(p_unit_cost, 0)::numeric, 2);
  IF v_unit_cost < 0 THEN
    RAISE EXCEPTION 'Custo unitário inválido.';
  END IF;

  v_product_total := ROUND(
    COALESCE(p_product_total, v_unit_cost * v_qty)::numeric,
    2
  );
  IF v_product_total < 0 THEN
    RAISE EXCEPTION 'Valor do produto inválido.';
  END IF;

  v_invoice_total := CASE
    WHEN p_invoice_total IS NULL THEN NULL
    ELSE ROUND(p_invoice_total::numeric, 2)
  END;
  IF v_invoice_total IS NOT NULL AND v_invoice_total < 0 THEN
    RAISE EXCEPTION 'Valor total da nota inválido.';
  END IF;

  v_supplier_name := NULLIF(trim(COALESCE(p_supplier_name, '')), '');
  IF v_supplier_name IS NULL AND p_supplier_id IS NOT NULL THEN
    SELECT NULLIF(trim(s.name), '') INTO v_supplier_name
    FROM public.workshop_suppliers s
    WHERE s.id = p_supplier_id
      AND s.workshop_id = p_workshop_id;
  END IF;

  UPDATE public.workshop_parts
  SET
    stock_qty = v_after,
    unit_price = CASE
      WHEN p_update_part_cost AND v_unit_cost > 0 THEN v_unit_cost
      ELSE unit_price
    END
  WHERE id = v_part.id
    AND workshop_id = p_workshop_id;

  INSERT INTO public.workshop_part_purchases (
    workshop_id,
    part_id,
    supplier_id,
    supplier_name,
    quantity,
    unit_cost,
    product_total,
    invoice_total,
    nfe_number,
    notes,
    status,
    recorded_by_name
  )
  VALUES (
    p_workshop_id,
    p_part_id,
    p_supplier_id,
    v_supplier_name,
    v_qty,
    v_unit_cost,
    v_product_total,
    v_invoice_total,
    NULLIF(trim(COALESCE(p_nfe_number, '')), ''),
    NULLIF(trim(COALESCE(p_notes, '')), ''),
    'received',
    NULLIF(trim(COALESCE(p_recorded_by_name, '')), '')
  )
  RETURNING * INTO v_purchase;

  INSERT INTO public.workshop_part_stock_movements (
    workshop_id,
    part_id,
    movement_type,
    quantity,
    unit_price,
    total_amount,
    unit_cost,
    product_total,
    invoice_total,
    nfe_number,
    supplier_id,
    supplier_name,
    purchase_id,
    notes,
    recorded_by_name,
    stock_before,
    stock_after
  )
  VALUES (
    p_workshop_id,
    p_part_id,
    'purchase',
    v_qty,
    NULL,
    v_product_total,
    v_unit_cost,
    v_product_total,
    v_invoice_total,
    NULLIF(trim(COALESCE(p_nfe_number, '')), ''),
    p_supplier_id,
    v_supplier_name,
    v_purchase.id,
    NULLIF(trim(COALESCE(p_notes, '')), ''),
    NULLIF(trim(COALESCE(p_recorded_by_name, '')), ''),
    v_before,
    v_after
  )
  RETURNING * INTO v_movement;

  RETURN jsonb_build_object(
    'movement', to_jsonb(v_movement),
    'purchase', to_jsonb(v_purchase),
    'part', jsonb_build_object(
      'id', v_part.id,
      'name', v_part.name,
      'stock_qty', v_after,
      'unit_price', CASE
        WHEN p_update_part_cost AND v_unit_cost > 0 THEN v_unit_cost
        ELSE v_part.unit_price
      END,
      'unit_of_measure', COALESCE(v_part.unit_of_measure, 'UN'),
      'photo_url', v_part.photo_url,
      'barcode', v_part.barcode
    )
  );
END;
$$;

COMMENT ON FUNCTION public.apply_workshop_part_stock_inbound IS
  'Registra recebimento (NF-e), cria compra recebida e aumenta o estoque atomicamente.';
