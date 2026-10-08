-- Tipos de produto do laboratório são configuráveis (slugs livres em lab_product_kinds).
-- A CHECK antiga só aceitava completo/eletronico/hidraulico/pinca_freio/outro e
-- bloqueava INSERT ao enviar serviço do pátio com tipo customizado.

ALTER TABLE public.service_orders
  DROP CONSTRAINT IF EXISTS service_orders_module_kind_check;

ALTER TABLE public.service_orders
  ADD CONSTRAINT service_orders_module_kind_check
  CHECK (
    module_kind IS NULL
    OR module_kind ~ '^[a-z0-9_]+$'
  );

COMMENT ON COLUMN public.service_orders.module_kind IS
  'order_type=module: slug do tipo de produto (configurável em lab_product_kinds).';
