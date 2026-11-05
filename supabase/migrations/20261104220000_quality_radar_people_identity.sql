-- Identidade profissional — funções, setor, ativo e multi-função.
-- INCREMENTAL. NÃO aplicar em produção sem autorização.
-- NÃO exclui usuários. NÃO altera senhas. NÃO concede acesso por cargo.

-- ---------------------------------------------------------------------------
-- 1) Campos em workshop_system_users (reuso; job_title continua livre)
-- ---------------------------------------------------------------------------
ALTER TABLE public.workshop_system_users
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS professional_role TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS sector TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_managerial BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.workshop_system_users.full_name IS
  'Nome completo do funcionário (quando distinto do display_name).';
COMMENT ON COLUMN public.workshop_system_users.professional_role IS
  'Código da função profissional (catálogo); NÃO concede permissões automaticamente.';
COMMENT ON COLUMN public.workshop_system_users.sector IS
  'Setor: patio | laboratorio | administrativo | outro.';
COMMENT ON COLUMN public.workshop_system_users.is_managerial IS
  'Marca responsabilidade gerencial; acesso ainda exige permissões explícitas.';
COMMENT ON COLUMN public.workshop_system_users.is_active IS
  'Cadastro ativo/inativo. Inativo permanece no histórico; pode ocultar de listas operacionais.';

DO $$
BEGIN
  ALTER TABLE public.workshop_system_users
    DROP CONSTRAINT IF EXISTS workshop_system_users_sector_check;
  ALTER TABLE public.workshop_system_users
    ADD CONSTRAINT workshop_system_users_sector_check
    CHECK (sector = '' OR sector IN ('patio', 'laboratorio', 'administrativo', 'outro'));
EXCEPTION WHEN others THEN
  RAISE NOTICE 'sector check: %', SQLERRM;
END $$;

CREATE INDEX IF NOT EXISTS idx_system_users_active_role
  ON public.workshop_system_users (workshop_id, is_active, professional_role);

-- ---------------------------------------------------------------------------
-- 2) Multi-função (uma pessoa pode ter várias funções)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workshop_quality_user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  system_user_id UUID NOT NULL REFERENCES public.workshop_system_users(id) ON DELETE CASCADE,
  role_code TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workshop_id, system_user_id, role_code)
);

CREATE INDEX IF NOT EXISTS idx_quality_user_roles_user
  ON public.workshop_quality_user_roles (workshop_id, system_user_id);

ALTER TABLE public.workshop_quality_user_roles ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.workshop_quality_user_roles IS
  'Funções profissionais adicionais do usuário. Permissões continuam em permissions JSONB.';

-- ---------------------------------------------------------------------------
-- 3) Flag opcional no cadastro técnico do pátio (sem login)
-- ---------------------------------------------------------------------------
ALTER TABLE public.workshop_technicians
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sector TEXT NOT NULL DEFAULT 'patio',
  ADD COLUMN IF NOT EXISTS professional_role TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN public.workshop_technicians.is_active IS
  'Técnico ativo no pátio/lab; inativo preserva histórico.';
COMMENT ON COLUMN public.workshop_technicians.sector IS
  'Setor operacional preferencial do cadastro técnico.';
COMMENT ON COLUMN public.workshop_technicians.professional_role IS
  'Função profissional do cadastro técnico (sem login).';
