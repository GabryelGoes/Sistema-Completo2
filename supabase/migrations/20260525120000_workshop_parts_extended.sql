-- Cadastro completo de peças (estilo OnMotor) + lista de compras

ALTER TABLE workshop_parts
  ADD COLUMN IF NOT EXISTS original_code TEXT,
  ADD COLUMN IF NOT EXISTS numeric_code TEXT,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS application_similar TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS ncm_code TEXT,
  ADD COLUMN IF NOT EXISTS unit_of_measure TEXT NOT NULL DEFAULT 'UN',
  ADD COLUMN IF NOT EXISTS min_stock_qty NUMERIC(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_stock_qty NUMERIC(12,3),
  ADD COLUMN IF NOT EXISTS fiscal_origin TEXT NOT NULL DEFAULT '0',
  ADD COLUMN IF NOT EXISTS premium_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_pct NUMERIC(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS default_profit_pct NUMERIC(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS km_limit NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS validity_months INT,
  ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fiscal_extra JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS primary_category_id UUID REFERENCES workshop_part_categories(id) ON DELETE SET NULL;

COMMENT ON COLUMN workshop_parts.unit_price IS 'Preço de venda (referência para orçamentos).';
COMMENT ON COLUMN workshop_parts.unit_cost IS 'Custo unitário de compra/referência.';
COMMENT ON COLUMN workshop_parts.min_stock_qty IS 'Quantidade mínima em estoque (alerta).';
COMMENT ON COLUMN workshop_parts.max_stock_qty IS 'Quantidade máxima desejada em estoque.';
COMMENT ON COLUMN workshop_parts.fiscal_origin IS 'Origem da peça (código 0–8, SPED/NFe).';
COMMENT ON COLUMN workshop_parts.fiscal_extra IS 'Campos fiscais adicionais (CEST, CFOP, CST, etc.).';
COMMENT ON COLUMN workshop_parts.primary_category_id IS 'Família principal do produto no estoque.';

CREATE INDEX IF NOT EXISTS idx_workshop_parts_primary_category
  ON workshop_parts(primary_category_id);

CREATE TABLE IF NOT EXISTS workshop_part_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  part_id UUID NOT NULL REFERENCES workshop_parts(id) ON DELETE CASCADE,
  supplier_name TEXT,
  quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  expected_date DATE,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'ordered', 'received', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workshop_part_purchases_part_id
  ON workshop_part_purchases(part_id);

CREATE INDEX IF NOT EXISTS idx_workshop_part_purchases_workshop_id
  ON workshop_part_purchases(workshop_id);

COMMENT ON TABLE workshop_part_purchases IS 'Lista de compras vinculada a cada peça do estoque.';
