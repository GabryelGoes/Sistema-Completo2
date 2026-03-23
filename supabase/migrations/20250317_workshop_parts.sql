-- Estoque de peças da oficina (para auxiliar criação de orçamentos)

CREATE TABLE IF NOT EXISTS workshop_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  stock_qty NUMERIC(12,3) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workshop_parts_workshop_id ON workshop_parts(workshop_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_workshop_parts_workshop_name ON workshop_parts(workshop_id, LOWER(TRIM(name)));

COMMENT ON TABLE workshop_parts IS 'Estoque de peças da oficina para seleção em orçamentos.';
COMMENT ON COLUMN workshop_parts.unit_price IS 'Preço unitário de referência da peça.';
COMMENT ON COLUMN workshop_parts.stock_qty IS 'Quantidade disponível em estoque.';
