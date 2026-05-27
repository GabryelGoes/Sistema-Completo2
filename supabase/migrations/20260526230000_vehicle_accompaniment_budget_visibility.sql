-- Visibilidade de orçamentos no link público e escolhas do cliente (aprovar/reprovar itens).

ALTER TABLE public.workshop_vehicle_accompaniment
  ADD COLUMN IF NOT EXISTS budget_public_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS client_budget_choices jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.workshop_vehicle_accompaniment.budget_public_settings IS
  'Por budget_id: { visible, allow_client_approval } no link público.';

COMMENT ON COLUMN public.workshop_vehicle_accompaniment.client_budget_choices IS
  'Escolhas do cliente no link público (aprovação por orçamento).';
