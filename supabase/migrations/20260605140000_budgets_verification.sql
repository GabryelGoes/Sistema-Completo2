-- Selo de verificação em orçamentos (conferência por usuário de acesso total).
ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by_name TEXT;

COMMENT ON COLUMN public.budgets.verified_at IS 'Momento em que um usuário de acesso total conferiu o orçamento.';
COMMENT ON COLUMN public.budgets.verified_by_name IS 'Nome exibido de quem verificou o orçamento.';

CREATE INDEX IF NOT EXISTS idx_budgets_verified_at ON public.budgets (verified_at)
  WHERE verified_at IS NOT NULL;
