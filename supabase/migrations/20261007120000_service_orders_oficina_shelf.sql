-- Prateleira / endereço na oficina (letra A–Z), independente do compartimento do depósito (bench_slot 1–24).
-- Ambos aparecem na etiqueta da OS do laboratório.

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS oficina_shelf text;

COMMENT ON COLUMN public.service_orders.oficina_shelf IS
  'Endereço na oficina (letra A–Z). Distinto de bench_slot (depósito/bancada 1–24).';

-- Uma letra não pode ser usada por duas OS ativas na mesma oficina.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_service_orders_oficina_shelf
  ON public.service_orders (workshop_id, oficina_shelf)
  WHERE oficina_shelf IS NOT NULL
    AND oficina_shelf <> ''
    AND status <> 'CANCELLED'
    AND order_type = 'module';
