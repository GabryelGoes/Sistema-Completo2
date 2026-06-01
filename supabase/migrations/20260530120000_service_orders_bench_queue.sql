-- Fila da bancada (grupo "Aguardando avaliação", compartimentos 1..4).
-- Quando lotado no cadastro, bench_queued_at é preenchido; ao liberar vaga, o backend atribui bench_slot.
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS bench_queued_at timestamptz;

COMMENT ON COLUMN public.service_orders.bench_queued_at IS
  'Laboratório: na fila para compartimento 1..4 (aguardando avaliação). NULL quando já tem bench_slot ou não está na fila.';

CREATE INDEX IF NOT EXISTS idx_service_orders_bench_queue
  ON public.service_orders (workshop_id, bench_queued_at)
  WHERE bench_queued_at IS NOT NULL
    AND bench_slot IS NULL
    AND status <> 'CANCELLED'
    AND order_type = 'module';
