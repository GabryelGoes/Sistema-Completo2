-- Tipo da ordem: veículo (pátio) ou módulo (laboratório).
ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS order_type TEXT NOT NULL DEFAULT 'vehicle';

COMMENT ON COLUMN service_orders.order_type IS 'vehicle = Pátio, module = Laboratório.';

-- Permitir placa e modelo nulos para módulos (idempotente).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'service_orders' AND column_name = 'plate'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE service_orders ALTER COLUMN plate DROP NOT NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'service_orders' AND column_name = 'vehicle_model'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE service_orders ALTER COLUMN vehicle_model DROP NOT NULL;
  END IF;
END $$;
