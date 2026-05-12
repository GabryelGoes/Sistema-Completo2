-- Autorização de diagnóstico (Recepção): data da assinatura + caminho da imagem no Storage (mesmo bucket dos anexos da OS).
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS diagnostic_authorization_signed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS diagnostic_authorization_signature_path TEXT;

COMMENT ON COLUMN public.service_orders.diagnostic_authorization_signed_at IS
  'Instante em que o cliente assinou a autorização de diagnóstico na recepção.';
COMMENT ON COLUMN public.service_orders.diagnostic_authorization_signature_path IS
  'Caminho no bucket de fotos da OS (vehicle-photos), no formato {workshop_id}/{service_order_id}/{arquivo}.';
