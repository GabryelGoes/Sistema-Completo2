-- Bancada da oficina: 24 vagas em letras (A–X), paralelas ao depósito (bench_slot 1–24).
-- Atribuição automática na entrada; liberada em Saída / Em serviço.

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS oficina_shelf text;

COMMENT ON COLUMN public.service_orders.oficina_shelf IS
  'Bancada da oficina — letra A–X (24 vagas). Distinto de bench_slot (depósito 1–24).';

-- Uma letra não pode ser usada por duas OS ativas na mesma oficina.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_service_orders_oficina_shelf
  ON public.service_orders (workshop_id, oficina_shelf)
  WHERE oficina_shelf IS NOT NULL
    AND oficina_shelf <> ''
    AND status <> 'CANCELLED'
    AND order_type = 'module';
