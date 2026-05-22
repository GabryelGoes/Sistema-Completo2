-- Classificação do módulo na recepção: tipo (completo/eletrônico/hidráulico) e origem (carro/moto).

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS module_kind text
  CHECK (module_kind IS NULL OR module_kind IN ('completo', 'eletronico', 'hidraulico'));

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS module_vehicle_kind text
  CHECK (module_vehicle_kind IS NULL OR module_vehicle_kind IN ('carro', 'moto'));

COMMENT ON COLUMN public.service_orders.module_kind IS 'Só order_type=module: completo, eletronico ou hidraulico.';
COMMENT ON COLUMN public.service_orders.module_vehicle_kind IS 'Só order_type=module: módulo de carro ou moto.';
