-- Complementar / opcional — NÃO executar em produção sem revisão explícita.
-- A Fase 2 (Aprendizado Operacional) NÃO depende desta coluna: as consultas usam
-- apenas o schema de produção (descrição do serviço, sem budget_service_line_id).
--
-- Esta migration existe para oficinas que queiram alinhar o banco à migration
-- 20261104120000 (ainda não aplicada) e obter identificação estável por line_id.
-- Idempotente: ADD COLUMN IF NOT EXISTS.

ALTER TABLE public.rda_work_sessions
  ADD COLUMN IF NOT EXISTS budget_service_line_id TEXT;

COMMENT ON COLUMN public.rda_work_sessions.budget_service_line_id IS
  'Opcional. Identificador estável da linha em budgets.services[].line_id. NULL = apontamento geral / legado. Fase 2 opera sem esta coluna.';

CREATE INDEX IF NOT EXISTS idx_rda_work_sessions_service_line
  ON public.rda_work_sessions (workshop_id, budget_service_line_id)
  WHERE budget_service_line_id IS NOT NULL;
