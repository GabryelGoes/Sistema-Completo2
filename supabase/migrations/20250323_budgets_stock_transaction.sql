-- Criação/edição de orçamento com abatimento de estoque em transação atômica.
-- Evita inconsistências em concorrência alta (lock das linhas de peças envolvidas).

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

  WITH parsed_parts AS (
    SELECT
      LOWER(TRIM(COALESCE(elem->>'description', ''))) AS part_key,
      CASE
        WHEN REPLACE(COALESCE(elem->>'quantity', ''), ',', '.') ~ '^[0-9]+(\.[0-9]+)?$'
          THEN GREATEST(REPLACE(elem->>'quantity', ',', '.')::numeric, 0)
        ELSE 1::numeric
      END AS qty
    FROM jsonb_array_elements(v_parts) elem
  ),
  part_deltas AS (
    SELECT part_key, SUM(qty) AS delta_qty
    FROM parsed_parts
    WHERE part_key <> ''
    GROUP BY part_key
  ),
  lock_rows AS (
    SELECT wp.id
    FROM workshop_parts wp
    JOIN part_deltas d
      ON LOWER(TRIM(wp.name)) = d.part_key
    WHERE wp.workshop_id = p_workshop_id
    FOR UPDATE
  )
  SELECT 1;

  IF EXISTS (
    WITH parsed_parts AS (
      SELECT
        LOWER(TRIM(COALESCE(elem->>'description', ''))) AS part_key,
        CASE
          WHEN REPLACE(COALESCE(elem->>'quantity', ''), ',', '.') ~ '^[0-9]+(\.[0-9]+)?$'
            THEN GREATEST(REPLACE(elem->>'quantity', ',', '.')::numeric, 0)
          ELSE 1::numeric
        END AS qty
      FROM jsonb_array_elements(v_parts) elem
    ),
    part_deltas AS (
      SELECT part_key, SUM(qty) AS delta_qty
      FROM parsed_parts
      WHERE part_key <> ''
      GROUP BY part_key
    )
    SELECT 1
    FROM workshop_parts wp
    JOIN part_deltas d
      ON LOWER(TRIM(wp.name)) = d.part_key
    WHERE wp.workshop_id = p_workshop_id
      AND d.delta_qty > 0
      AND wp.stock_qty < d.delta_qty
  ) THEN
    RAISE EXCEPTION 'Estoque insuficiente para uma ou mais peças.';
  END IF;

  WITH parsed_parts AS (
    SELECT
      LOWER(TRIM(COALESCE(elem->>'description', ''))) AS part_key,
      CASE
        WHEN REPLACE(COALESCE(elem->>'quantity', ''), ',', '.') ~ '^[0-9]+(\.[0-9]+)?$'
          THEN GREATEST(REPLACE(elem->>'quantity', ',', '.')::numeric, 0)
        ELSE 1::numeric
      END AS qty
    FROM jsonb_array_elements(v_parts) elem
  ),
  part_deltas AS (
    SELECT part_key, SUM(qty) AS delta_qty
    FROM parsed_parts
    WHERE part_key <> ''
    GROUP BY part_key
  )
  UPDATE workshop_parts wp
  SET stock_qty = ROUND((wp.stock_qty - d.delta_qty)::numeric, 3)
  FROM part_deltas d
  WHERE wp.workshop_id = p_workshop_id
    AND LOWER(TRIM(wp.name)) = d.part_key;

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
IS 'Cria orçamento e abate estoque de peças em transação atômica com lock de linhas.';

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
  v_old_parts JSONB := '[]'::jsonb;
  v_services JSONB := COALESCE(p_services, '[]'::jsonb);
  v_parts JSONB := COALESCE(p_parts, '[]'::jsonb);
BEGIN
  SELECT b.*
  INTO v_budget
  FROM budgets b
  WHERE b.id = p_budget_id
    AND b.service_order_id = p_service_order_id
    AND b.workshop_id = p_workshop_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Orçamento não encontrado.';
  END IF;

  v_old_parts := COALESCE(v_budget.parts, '[]'::jsonb);

  WITH old_parts AS (
    SELECT
      LOWER(TRIM(COALESCE(elem->>'description', ''))) AS part_key,
      CASE
        WHEN REPLACE(COALESCE(elem->>'quantity', ''), ',', '.') ~ '^[0-9]+(\.[0-9]+)?$'
          THEN GREATEST(REPLACE(elem->>'quantity', ',', '.')::numeric, 0)
        ELSE 1::numeric
      END AS qty
    FROM jsonb_array_elements(v_old_parts) elem
  ),
  old_deltas AS (
    SELECT part_key, SUM(qty) AS qty
    FROM old_parts
    WHERE part_key <> ''
    GROUP BY part_key
  ),
  new_parts AS (
    SELECT
      LOWER(TRIM(COALESCE(elem->>'description', ''))) AS part_key,
      CASE
        WHEN REPLACE(COALESCE(elem->>'quantity', ''), ',', '.') ~ '^[0-9]+(\.[0-9]+)?$'
          THEN GREATEST(REPLACE(elem->>'quantity', ',', '.')::numeric, 0)
        ELSE 1::numeric
      END AS qty
    FROM jsonb_array_elements(v_parts) elem
  ),
  new_deltas AS (
    SELECT part_key, SUM(qty) AS qty
    FROM new_parts
    WHERE part_key <> ''
    GROUP BY part_key
  ),
  net_delta AS (
    SELECT
      COALESCE(n.part_key, o.part_key) AS part_key,
      COALESCE(n.qty, 0) - COALESCE(o.qty, 0) AS delta_qty
    FROM old_deltas o
    FULL OUTER JOIN new_deltas n
      ON n.part_key = o.part_key
  ),
  lock_rows AS (
    SELECT wp.id
    FROM workshop_parts wp
    JOIN net_delta d
      ON LOWER(TRIM(wp.name)) = d.part_key
    WHERE wp.workshop_id = p_workshop_id
      AND d.delta_qty <> 0
    FOR UPDATE
  )
  SELECT 1;

  IF EXISTS (
    WITH old_parts AS (
      SELECT
        LOWER(TRIM(COALESCE(elem->>'description', ''))) AS part_key,
        CASE
          WHEN REPLACE(COALESCE(elem->>'quantity', ''), ',', '.') ~ '^[0-9]+(\.[0-9]+)?$'
            THEN GREATEST(REPLACE(elem->>'quantity', ',', '.')::numeric, 0)
          ELSE 1::numeric
        END AS qty
      FROM jsonb_array_elements(v_old_parts) elem
    ),
    old_deltas AS (
      SELECT part_key, SUM(qty) AS qty
      FROM old_parts
      WHERE part_key <> ''
      GROUP BY part_key
    ),
    new_parts AS (
      SELECT
        LOWER(TRIM(COALESCE(elem->>'description', ''))) AS part_key,
        CASE
          WHEN REPLACE(COALESCE(elem->>'quantity', ''), ',', '.') ~ '^[0-9]+(\.[0-9]+)?$'
            THEN GREATEST(REPLACE(elem->>'quantity', ',', '.')::numeric, 0)
          ELSE 1::numeric
        END AS qty
      FROM jsonb_array_elements(v_parts) elem
    ),
    new_deltas AS (
      SELECT part_key, SUM(qty) AS qty
      FROM new_parts
      WHERE part_key <> ''
      GROUP BY part_key
    ),
    net_delta AS (
      SELECT
        COALESCE(n.part_key, o.part_key) AS part_key,
        COALESCE(n.qty, 0) - COALESCE(o.qty, 0) AS delta_qty
      FROM old_deltas o
      FULL OUTER JOIN new_deltas n
        ON n.part_key = o.part_key
    )
    SELECT 1
    FROM workshop_parts wp
    JOIN net_delta d
      ON LOWER(TRIM(wp.name)) = d.part_key
    WHERE wp.workshop_id = p_workshop_id
      AND d.delta_qty > 0
      AND wp.stock_qty < d.delta_qty
  ) THEN
    RAISE EXCEPTION 'Estoque insuficiente para uma ou mais peças.';
  END IF;

  WITH old_parts AS (
    SELECT
      LOWER(TRIM(COALESCE(elem->>'description', ''))) AS part_key,
      CASE
        WHEN REPLACE(COALESCE(elem->>'quantity', ''), ',', '.') ~ '^[0-9]+(\.[0-9]+)?$'
          THEN GREATEST(REPLACE(elem->>'quantity', ',', '.')::numeric, 0)
        ELSE 1::numeric
      END AS qty
    FROM jsonb_array_elements(v_old_parts) elem
  ),
  old_deltas AS (
    SELECT part_key, SUM(qty) AS qty
    FROM old_parts
    WHERE part_key <> ''
    GROUP BY part_key
  ),
  new_parts AS (
    SELECT
      LOWER(TRIM(COALESCE(elem->>'description', ''))) AS part_key,
      CASE
        WHEN REPLACE(COALESCE(elem->>'quantity', ''), ',', '.') ~ '^[0-9]+(\.[0-9]+)?$'
          THEN GREATEST(REPLACE(elem->>'quantity', ',', '.')::numeric, 0)
        ELSE 1::numeric
      END AS qty
    FROM jsonb_array_elements(v_parts) elem
  ),
  new_deltas AS (
    SELECT part_key, SUM(qty) AS qty
    FROM new_parts
    WHERE part_key <> ''
    GROUP BY part_key
  ),
  net_delta AS (
    SELECT
      COALESCE(n.part_key, o.part_key) AS part_key,
      COALESCE(n.qty, 0) - COALESCE(o.qty, 0) AS delta_qty
    FROM old_deltas o
    FULL OUTER JOIN new_deltas n
      ON n.part_key = o.part_key
  )
  UPDATE workshop_parts wp
  SET stock_qty = ROUND((wp.stock_qty - d.delta_qty)::numeric, 3)
  FROM net_delta d
  WHERE wp.workshop_id = p_workshop_id
    AND LOWER(TRIM(wp.name)) = d.part_key
    AND d.delta_qty <> 0;

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

  RETURN v_budget;
END;
$$;

COMMENT ON FUNCTION update_budget_with_stock(UUID, UUID, UUID, TEXT, TEXT, JSONB, JSONB, TEXT)
IS 'Atualiza orçamento e ajusta estoque por delta em transação atômica com lock de linhas.';
