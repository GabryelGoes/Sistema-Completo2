-- Oficina deixa de usar letras únicas A–X: passa a ser só flag de localização.
-- Identificação numérica fica na vaga do laboratório (bench_slot 1–24).

DROP INDEX IF EXISTS public.uniq_service_orders_oficina_shelf;

COMMENT ON COLUMN public.service_orders.oficina_shelf IS
  'Flag de localização Oficina (ex.: *). Distinto de bench_slot (vaga 1–24 no laboratório).';

-- Letras legadas A–X → flag genérica (várias OS podem estar na oficina ao mesmo tempo).
UPDATE public.service_orders
SET oficina_shelf = '*'
WHERE order_type = 'module'
  AND oficina_shelf IS NOT NULL
  AND oficina_shelf <> ''
  AND oficina_shelf <> '*'
  AND status <> 'CANCELLED';
