-- Quilometragem do veículo na ordem de serviço.
-- Rode no SQL Editor do Supabase (uma vez).

ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS mileage_km TEXT;

COMMENT ON COLUMN service_orders.mileage_km IS 'Quilometragem do veículo (ex.: 45000 ou 45.000 km).';
