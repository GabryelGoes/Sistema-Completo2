-- Bancada do laboratório: posição física (compartimento 1..24) + controle de conserto externo.
-- bench_slot:    número do compartimento na bancada (1..24). NULL = fora da bancada (ex.: EM_SERVICO com o técnico).
-- bench_slot_at: quando o produto foi colocado/realocado no compartimento.
-- external_repair: dados do conserto em terceiros { vendor, sentAt, expectedAt, returnedAt, cost, notes }.
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS bench_slot smallint,
  ADD COLUMN IF NOT EXISTS bench_slot_at timestamptz,
  ADD COLUMN IF NOT EXISTS external_repair jsonb;

-- Um compartimento não pode ser ocupado por duas OS ativas na mesma oficina.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_service_orders_bench_slot
  ON public.service_orders (workshop_id, bench_slot)
  WHERE bench_slot IS NOT NULL AND status <> 'CANCELLED';
