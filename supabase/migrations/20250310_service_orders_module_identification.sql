-- Identificação do módulo (usado junto com vehicle_model no modo Laboratório).
ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS module_identification TEXT;

COMMENT ON COLUMN service_orders.module_identification IS 'Identificação do módulo (Laboratório). vehicle_model = Veículo.';
