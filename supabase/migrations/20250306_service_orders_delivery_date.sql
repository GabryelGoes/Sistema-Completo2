-- Data de entrega prevista do veículo (editável no modal do veículo).
-- Rode no SQL Editor do Supabase (uma vez).

ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS delivery_date DATE;

COMMENT ON COLUMN service_orders.delivery_date IS 'Data de entrega prevista do veículo (editável no modal).';
