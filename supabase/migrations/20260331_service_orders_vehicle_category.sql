-- Categoria do veículo na recepção (Compacto, Médio/SUV, etc.) — separada da queixa do cliente.

ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS vehicle_category TEXT;

COMMENT ON COLUMN service_orders.vehicle_category IS 'Categoria escolhida na recepção (veículo): Compacto, Médio/SUV, Pick-Up, Premium.';
