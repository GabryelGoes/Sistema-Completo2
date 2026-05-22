-- Laboratório: pinça de freio, outro produto (texto livre) além dos tipos de módulo.

ALTER TABLE public.service_orders
  DROP CONSTRAINT IF EXISTS service_orders_module_kind_check;

ALTER TABLE public.service_orders
  ADD CONSTRAINT service_orders_module_kind_check
  CHECK (
    module_kind IS NULL
    OR module_kind IN ('completo', 'eletronico', 'hidraulico', 'pinca_freio', 'outro')
  );

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS module_product_other text;

COMMENT ON COLUMN public.service_orders.module_kind IS
  'order_type=module: tipo de produto (módulos, pinça de freio, outro).';
COMMENT ON COLUMN public.service_orders.module_product_other IS
  'Descrição livre quando module_kind=outro.';
