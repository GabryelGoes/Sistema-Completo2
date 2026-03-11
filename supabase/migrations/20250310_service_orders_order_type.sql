-- Tipo da ordem: veículo (pátio) ou módulo (laboratório).
ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS order_type TEXT NOT NULL DEFAULT 'vehicle';

COMMENT ON COLUMN service_orders.order_type IS 'vehicle = Pátio, module = Laboratório.';

-- Permitir placa e quilometragem nulos para módulos.
ALTER TABLE service_orders
  ALTER COLUMN plate DROP NOT NULL;

ALTER TABLE service_orders
  ALTER COLUMN vehicle_model DROP NOT NULL;
