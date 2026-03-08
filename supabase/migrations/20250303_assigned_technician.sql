-- Técnico responsável por ordem de serviço (gabryel, jhow, fabio).
-- Rode no SQL Editor do Supabase (uma vez).

ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS assigned_technician TEXT;

COMMENT ON COLUMN service_orders.assigned_technician IS 'Id do técnico: gabryel, jhow ou fabio';
