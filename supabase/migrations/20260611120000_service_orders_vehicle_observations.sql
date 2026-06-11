-- Observações internas do veículo (modal do Pátio), distintas da queixa do cliente.
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS vehicle_observations text;

COMMENT ON COLUMN public.service_orders.vehicle_observations IS
  'Observações internas da oficina sobre o veículo (modal Pátio).';
