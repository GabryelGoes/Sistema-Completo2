-- Chassi do veículo (consulta PlacaFipe / recepção)
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS vehicle_chassis text;

COMMENT ON COLUMN public.service_orders.vehicle_chassis IS
  'Chassi do veículo (pode vir mascarado da PlacaFipe, ex.: ******6889)';
