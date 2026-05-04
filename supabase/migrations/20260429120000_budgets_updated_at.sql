-- Última atividade do orçamento (criação ou edição) para ordenação no hub e no Pátio.

ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE public.budgets
SET updated_at = created_at
WHERE updated_at IS NULL;

ALTER TABLE public.budgets
  ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.budgets
  ALTER COLUMN updated_at SET NOT NULL;

CREATE OR REPLACE FUNCTION public.budgets_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_budgets_set_updated_at ON public.budgets;
CREATE TRIGGER trg_budgets_set_updated_at
  BEFORE UPDATE ON public.budgets
  FOR EACH ROW
  EXECUTE FUNCTION public.budgets_set_updated_at();

COMMENT ON COLUMN public.budgets.updated_at IS 'Atualizado automaticamente a cada UPDATE; na criação coincide com created_at.';
