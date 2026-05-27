-- Vínculo de serviços do pátio com OS do laboratório (controle cruzado no modal do veículo).

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS lab_service_links jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.service_orders.lab_service_links IS
  'Array JSON com vínculos de serviços enviados ao laboratório: [{id, serviceLabel, source, sourceBudgetId, sourceBudgetItemIndex, laboratoryOrderId, createdAt}]';
