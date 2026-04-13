-- Campos extras do veículo (consulta PlacaFipe / recepção)
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS vehicle_color text,
  ADD COLUMN IF NOT EXISTS vehicle_year text,
  ADD COLUMN IF NOT EXISTS vehicle_engine_info text;

COMMENT ON COLUMN public.service_orders.vehicle_color IS 'Cor do veículo (Recepção / consulta placa)';
COMMENT ON COLUMN public.service_orders.vehicle_year IS 'Ano ou ano/modelo em texto';
COMMENT ON COLUMN public.service_orders.vehicle_engine_info IS 'Resumo motor: cilindradas, combustível, etc.';
