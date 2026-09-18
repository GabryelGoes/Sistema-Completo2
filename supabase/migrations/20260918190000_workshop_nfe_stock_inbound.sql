-- Entrada de estoque por NF-e (chave de acesso 44 dígitos) + movimentação inbound_nfe.

CREATE TABLE IF NOT EXISTS public.workshop_nfe_stock_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  access_key TEXT NOT NULL,
  nfe_number TEXT,
  nfe_series TEXT,
  issued_at TIMESTAMPTZ,
  supplier_cnpj TEXT,
  supplier_name TEXT,
  total_amount NUMERIC(14, 2),
  xml_content TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'confirmed', 'cancelled')),
  confirmed_at TIMESTAMPTZ,
  confirmed_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_workshop_nfe_stock_entries_access_key
    UNIQUE (workshop_id, access_key),
  CONSTRAINT workshop_nfe_stock_entries_access_key_digits
    CHECK (access_key ~ '^[0-9]{44}$')
);

CREATE INDEX IF NOT EXISTS idx_workshop_nfe_stock_entries_workshop_status
  ON public.workshop_nfe_stock_entries (workshop_id, status, created_at DESC);

COMMENT ON TABLE public.workshop_nfe_stock_entries IS
  'Importações de NF-e para entrada de estoque (rascunho → confirmado).';

CREATE TABLE IF NOT EXISTS public.workshop_nfe_stock_entry_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.workshop_nfe_stock_entries(id) ON DELETE CASCADE,
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  line_number INT NOT NULL,
  product_code TEXT,
  ean TEXT,
  description TEXT NOT NULL DEFAULT '',
  ncm TEXT,
  unit TEXT,
  quantity NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(14, 4) NOT NULL DEFAULT 0,
  total_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
  part_id UUID REFERENCES public.workshop_parts(id) ON DELETE SET NULL,
  selected BOOLEAN NOT NULL DEFAULT true,
  stock_before NUMERIC(12, 3),
  stock_after NUMERIC(12, 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_workshop_nfe_entry_item_line UNIQUE (entry_id, line_number)
);

CREATE INDEX IF NOT EXISTS idx_workshop_nfe_stock_entry_items_entry
  ON public.workshop_nfe_stock_entry_items (entry_id);

CREATE INDEX IF NOT EXISTS idx_workshop_nfe_stock_entry_items_part
  ON public.workshop_nfe_stock_entry_items (part_id)
  WHERE part_id IS NOT NULL;

COMMENT ON TABLE public.workshop_nfe_stock_entry_items IS
  'Itens da NF-e para conferência/mapeamento e entrada no estoque.';

-- Amplia tipos de movimentação com entrada por NF-e.
ALTER TABLE public.workshop_part_stock_movements
  DROP CONSTRAINT IF EXISTS workshop_part_stock_movements_movement_type_check;

ALTER TABLE public.workshop_part_stock_movements
  ADD CONSTRAINT workshop_part_stock_movements_movement_type_check
  CHECK (movement_type IN ('sale', 'consumable', 'inbound_nfe'));

ALTER TABLE public.workshop_part_stock_movements
  ADD COLUMN IF NOT EXISTS nfe_entry_id UUID
    REFERENCES public.workshop_nfe_stock_entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wpsm_nfe_entry
  ON public.workshop_part_stock_movements (nfe_entry_id)
  WHERE nfe_entry_id IS NOT NULL;

COMMENT ON COLUMN public.workshop_part_stock_movements.nfe_entry_id IS
  'Referência à entrada de NF-e quando movement_type = inbound_nfe.';

-- Confirma entrada: atualiza estoque + movimentações + marca NF como confirmada (atômico).
CREATE OR REPLACE FUNCTION public.confirm_workshop_nfe_stock_inbound(
  p_workshop_id UUID,
  p_entry_id UUID,
  p_recorded_by_name TEXT DEFAULT NULL,
  p_items JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_entry public.workshop_nfe_stock_entries%ROWTYPE;
  v_item public.workshop_nfe_stock_entry_items%ROWTYPE;
  v_part public.workshop_parts%ROWTYPE;
  v_map JSONB;
  v_item_id UUID;
  v_part_id UUID;
  v_selected BOOLEAN;
  v_qty NUMERIC(12, 3);
  v_before NUMERIC(12, 3);
  v_after NUMERIC(12, 3);
  v_unit NUMERIC(14, 4);
  v_total NUMERIC(14, 2);
  v_movements JSONB := '[]'::jsonb;
  v_movement public.workshop_part_stock_movements%ROWTYPE;
  v_selected_count INT := 0;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Lista de itens inválida.';
  END IF;

  SELECT *
  INTO v_entry
  FROM public.workshop_nfe_stock_entries
  WHERE id = p_entry_id
    AND workshop_id = p_workshop_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NF-e não encontrada.';
  END IF;

  IF v_entry.status = 'confirmed' THEN
    RAISE EXCEPTION 'Esta NF-e já foi lançada no estoque.';
  END IF;

  IF v_entry.status <> 'draft' THEN
    RAISE EXCEPTION 'Esta NF-e não está disponível para confirmação.';
  END IF;

  -- Garante unicidade de confirmada (mesmo se houver rascunhos antigos).
  IF EXISTS (
    SELECT 1
    FROM public.workshop_nfe_stock_entries e
    WHERE e.workshop_id = p_workshop_id
      AND e.access_key = v_entry.access_key
      AND e.status = 'confirmed'
      AND e.id <> v_entry.id
  ) THEN
    RAISE EXCEPTION 'Esta NF-e já foi lançada no estoque.';
  END IF;

  FOR v_map IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_id := NULLIF(trim(COALESCE(v_map->>'item_id', '')), '')::uuid;
    v_part_id := NULLIF(trim(COALESCE(v_map->>'part_id', '')), '')::uuid;
    v_selected := COALESCE((v_map->>'selected')::boolean, true);

    IF v_item_id IS NULL THEN
      RAISE EXCEPTION 'item_id obrigatório em cada item.';
    END IF;

    SELECT *
    INTO v_item
    FROM public.workshop_nfe_stock_entry_items
    WHERE id = v_item_id
      AND entry_id = v_entry.id
      AND workshop_id = p_workshop_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item da NF-e não encontrado.';
    END IF;

    UPDATE public.workshop_nfe_stock_entry_items
    SET
      selected = v_selected,
      part_id = CASE WHEN v_selected THEN v_part_id ELSE part_id END
    WHERE id = v_item.id;

    IF NOT v_selected THEN
      CONTINUE;
    END IF;

    IF v_part_id IS NULL THEN
      RAISE EXCEPTION 'Produto sem vínculo no estoque: %', COALESCE(v_item.description, v_item.product_code, v_item_id::text);
    END IF;

    SELECT *
    INTO v_part
    FROM public.workshop_parts
    WHERE id = v_part_id
      AND workshop_id = p_workshop_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto do estoque não encontrado.';
    END IF;

    v_qty := ROUND(COALESCE(v_item.quantity, 0)::numeric, 3);
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantidade inválida no item %.', v_item.line_number;
    END IF;

    v_before := ROUND(COALESCE(v_part.stock_qty, 0)::numeric, 3);
    v_after := ROUND((v_before + v_qty)::numeric, 3);
    v_unit := ROUND(COALESCE(v_item.unit_price, 0)::numeric, 4);
    v_total := ROUND(COALESCE(v_item.total_price, v_unit * v_qty)::numeric, 2);

    UPDATE public.workshop_parts
    SET
      stock_qty = v_after,
      unit_cost = CASE
        WHEN v_unit > 0 THEN ROUND(v_unit::numeric, 2)
        ELSE unit_cost
      END
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
      nfe_entry_id
    )
    VALUES (
      p_workshop_id,
      v_part.id,
      'inbound_nfe',
      v_qty,
      ROUND(v_unit::numeric, 2),
      v_total,
      left(
        'NF-e ' || COALESCE(v_entry.nfe_number, '') ||
        ' s' || COALESCE(v_entry.nfe_series, '') ||
        ' · ' || COALESCE(v_entry.supplier_name, '') ||
        ' · chave ' || v_entry.access_key,
        500
      ),
      NULLIF(trim(COALESCE(v_item.ean, '')), ''),
      NULLIF(trim(COALESCE(p_recorded_by_name, '')), ''),
      v_before,
      v_after,
      v_entry.id
    )
    RETURNING * INTO v_movement;

    UPDATE public.workshop_nfe_stock_entry_items
    SET
      part_id = v_part.id,
      selected = true,
      stock_before = v_before,
      stock_after = v_after
    WHERE id = v_item.id;

    v_selected_count := v_selected_count + 1;
    v_movements := v_movements || jsonb_build_array(to_jsonb(v_movement));
  END LOOP;

  IF v_selected_count <= 0 THEN
    RAISE EXCEPTION 'Selecione ao menos um produto para dar entrada.';
  END IF;

  UPDATE public.workshop_nfe_stock_entries
  SET
    status = 'confirmed',
    confirmed_at = now(),
    confirmed_by_name = NULLIF(trim(COALESCE(p_recorded_by_name, '')), ''),
    updated_at = now()
  WHERE id = v_entry.id;

  RETURN jsonb_build_object(
    'entry_id', v_entry.id,
    'access_key', v_entry.access_key,
    'confirmed_at', now(),
    'items_count', v_selected_count,
    'movements', v_movements
  );
END;
$$;

COMMENT ON FUNCTION public.confirm_workshop_nfe_stock_inbound IS
  'Confirma entrada de estoque a partir de uma NF-e em rascunho (transacional).';
