-- Conclusão da avaliação técnica no laboratório (serviço decidido pelo técnico).

ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS lab_evaluated_service TEXT,
  ADD COLUMN IF NOT EXISTS lab_evaluated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lab_evaluated_by_name TEXT;

COMMENT ON COLUMN service_orders.lab_evaluated_service IS
  'Serviço definido na avaliação técnica do laboratório (ex.: limpeza de válvulas).';
COMMENT ON COLUMN service_orders.lab_evaluated_at IS 'Quando o técnico registrou a conclusão da avaliação.';
COMMENT ON COLUMN service_orders.lab_evaluated_by_name IS 'Nome de quem registrou a avaliação no laboratório.';
