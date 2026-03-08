-- Tabela de orçamentos vinculados à ordem de serviço.
-- Rode no SQL Editor do Supabase (uma vez).

CREATE TABLE IF NOT EXISTS budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  service_order_id UUID NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  card_name TEXT,
  diagnosis TEXT,
  services JSONB NOT NULL DEFAULT '[]',
  parts JSONB NOT NULL DEFAULT '[]',
  observations TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_budgets_service_order_id ON budgets(service_order_id);
CREATE INDEX IF NOT EXISTS idx_budgets_workshop_id ON budgets(workshop_id);

COMMENT ON TABLE budgets IS 'Orçamentos técnicos por ordem de serviço (diagnóstico, serviços, peças).';
