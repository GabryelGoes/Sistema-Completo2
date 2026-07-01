-- Vínculo entre avaliação técnica do laboratório e orçamento gerado.

ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS lab_evaluation_budget_id UUID REFERENCES budgets(id) ON DELETE SET NULL;

COMMENT ON COLUMN service_orders.lab_evaluation_budget_id IS
  'Orçamento criado automaticamente ao concluir a avaliação técnica do laboratório.';
