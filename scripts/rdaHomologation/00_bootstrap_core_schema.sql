-- =============================================================================
-- Bootstrap de schema CORE — exclusivo para homologação RDA (projeto vazio)
-- Projeto alvo: rei-do-abs-homologacao (NÃO usar em produção)
-- =============================================================================
-- CONTEXTO
-- No repositório Sistema-Completo2 NÃO existem migrations CREATE TABLE para:
--   • public.workshops
--   • public.customers
--   • public.service_orders
-- Essas tabelas são pressup-existentes na produção e só aparecem via REFERENCES /
-- ALTER / selects da API. Este arquivo RECONSTRÓI o mínimo comprovado para
-- rodar cronômetros e avaliações, alinhado ao backend.
--
-- ORDEM DE EXECUÇÃO (SQL Editor do projeto de TESTE):
--   1) ESTE arquivo (00_bootstrap_core_schema.sql)
--   2) 20261101220000_rda_work_sessions.sql
--   3) 20261101230000_rda_work_sessions_integrity.sql
--   4) 20261101240000_rda_work_rpc_privileges.sql
--   5) 20261101250000_rda_managerial_evaluations.sql
--   6) 20261101260000_rda_rpc_idempotent_owner_guard.sql
--   7) 01_seed_fictional.sql
--   8) 02_verify.sql
--
-- GAPS (não inventados — ausentes no git):
--   • Colunas extras de workshops além de (id, name), se existirem em produção
--   • Constraints/enums originais pré-TEXT de service_orders.status
--   • Índices/triggers de produção não versionados
--   • RLS/policies históricas de customers/service_orders (Realtime etc.) —
--     não necessárias para APIs RDA via service_role
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) workshops  [RECONSTRUÍDO — sem CREATE no repo; evidência: FKs + healthcheck]
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workshops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL
);

COMMENT ON TABLE public.workshops IS
  'Homologação: reconstruído. Repo não contém CREATE TABLE workshops; colunas comprovadas: id, name.';

-- ---------------------------------------------------------------------------
-- 2) customers  [RECONSTRUÍDO — evidência: POST/GET /api/customers + city migration]
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  cpf TEXT,
  email TEXT,
  cep TEXT,
  address TEXT,
  address_number TEXT,
  city TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_workshop_id
  ON public.customers (workshop_id);

COMMENT ON TABLE public.customers IS
  'Homologação: reconstruído a partir de apiApp POST/GET customers + migration city.';
COMMENT ON COLUMN public.customers.city IS 'Cidade do cliente (recepção).';

-- ---------------------------------------------------------------------------
-- 3) service_orders  [RECONSTRUÍDO base + colunas das migrations ALTER]
--    Base comprovada: plate/vehicle_model (eram NOT NULL), status, customer_id,
--    workshop_id, issue_description, ai_analysis, created_at, updated_at.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  -- base histórica (DROP NOT NULL em 20250310_order_type)
  vehicle_model TEXT,
  plate TEXT,
  issue_description TEXT,
  ai_analysis TEXT,
  status TEXT NOT NULL DEFAULT 'AGUARDANDO_AVALIACAO',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- migrations ADD COLUMN (nomes/tipos do repo)
  assigned_technician TEXT,
  garantia_tag BOOLEAN NOT NULL DEFAULT false,
  mileage_km TEXT,
  delivery_date DATE,
  order_type TEXT NOT NULL DEFAULT 'vehicle',
  module_identification TEXT,
  os_number INTEGER,
  reference_links JSONB NOT NULL DEFAULT '[]'::jsonb,
  vehicle_color TEXT,
  vehicle_year TEXT,
  vehicle_engine_info TEXT,
  vehicle_brand TEXT,
  vehicle_category TEXT,
  vehicle_chassis TEXT,
  diagnostic_authorization_signed_at TIMESTAMPTZ,
  diagnostic_authorization_signature_path TEXT,
  module_kind TEXT,
  module_vehicle_kind TEXT,
  module_product_other TEXT,
  lab_service_links JSONB NOT NULL DEFAULT '[]'::jsonb,
  vehicle_observations TEXT,
  bench_slot SMALLINT,
  bench_slot_at TIMESTAMPTZ,
  bench_queued_at TIMESTAMPTZ,
  external_repair JSONB,
  lab_evaluated_service TEXT,
  lab_evaluated_at TIMESTAMPTZ,
  lab_evaluated_by_name TEXT,
  agenda_tag BOOLEAN NOT NULL DEFAULT false,
  oficina_shelf TEXT
  -- lab_evaluation_budget_id adicionado após budgets (abaixo)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_service_orders_workshop_os_number
  ON public.service_orders (workshop_id, os_number);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_service_orders_bench_slot
  ON public.service_orders (workshop_id, bench_slot)
  WHERE bench_slot IS NOT NULL AND status <> 'CANCELLED';

CREATE INDEX IF NOT EXISTS idx_service_orders_workshop_status
  ON public.service_orders (workshop_id, status);

COMMENT ON TABLE public.service_orders IS
  'Homologação: CREATE ausente no repo; colunas alinhadas a ALTER migrations + insert da API.';
COMMENT ON COLUMN public.service_orders.order_type IS 'vehicle = Pátio, module = Laboratório.';
COMMENT ON COLUMN public.service_orders.os_number IS 'Número sequencial da OS na oficina.';
COMMENT ON COLUMN public.service_orders.garantia_tag IS 'Etiqueta de garantia.';
COMMENT ON COLUMN public.service_orders.assigned_technician IS 'Id/nome do técnico atribuído.';
COMMENT ON COLUMN public.service_orders.oficina_shelf IS 'Flag de localização Oficina.';

-- ---------------------------------------------------------------------------
-- 4) workshop_system_users  [CREATE + ALTERs versionados no repo]
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workshop_system_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  photo_url TEXT,
  is_technician BOOLEAN NOT NULL DEFAULT false,
  job_title TEXT,
  profile_token TEXT,
  profile_token_expires_at TIMESTAMPTZ,
  accent_color TEXT,
  UNIQUE (workshop_id, username)
);

CREATE INDEX IF NOT EXISTS idx_workshop_system_users_workshop_username
  ON public.workshop_system_users (workshop_id, lower(trim(username)));

COMMENT ON TABLE public.workshop_system_users IS
  'Logins do sistema; permissions JSONB (full_access, access_radar_qualidade, …).';

-- ---------------------------------------------------------------------------
-- 5) budgets  [CREATE 20250303 + ALTER updated_at + verified_*]
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  service_order_id UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  card_name TEXT,
  diagnosis TEXT,
  services JSONB NOT NULL DEFAULT '[]'::jsonb,
  parts JSONB NOT NULL DEFAULT '[]'::jsonb,
  observations TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at TIMESTAMPTZ,
  verified_by_name TEXT
);

CREATE INDEX IF NOT EXISTS idx_budgets_service_order_id ON public.budgets (service_order_id);
CREATE INDEX IF NOT EXISTS idx_budgets_workshop_id ON public.budgets (workshop_id);
CREATE INDEX IF NOT EXISTS idx_budgets_verified_at ON public.budgets (verified_at)
  WHERE verified_at IS NOT NULL;

COMMENT ON TABLE public.budgets IS 'Orçamentos técnicos por ordem de serviço.';

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

-- FK adiada: lab_evaluation_budget_id (migration 20260629120000)
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS lab_evaluation_budget_id UUID
    REFERENCES public.budgets(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 6) Contador de OS + RPC usada pela API de criação
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workshop_os_counters (
  workshop_id UUID PRIMARY KEY,
  next_os_number INTEGER NOT NULL DEFAULT 1
);

COMMENT ON TABLE public.workshop_os_counters IS
  'Próximo número de OS por oficina (migration 20250315; sem FK no original).';

CREATE OR REPLACE FUNCTION public.get_next_os_number(p_workshop_id UUID)
RETURNS INTEGER
LANGUAGE sql
AS $$
  WITH ins AS (
    INSERT INTO public.workshop_os_counters (workshop_id, next_os_number)
    VALUES (p_workshop_id, 1)
    ON CONFLICT (workshop_id) DO UPDATE
    SET next_os_number = public.workshop_os_counters.next_os_number + 1
    RETURNING next_os_number
  )
  SELECT next_os_number FROM ins;
$$;

COMMENT ON FUNCTION public.get_next_os_number(UUID) IS
  'Retorna e reserva o próximo número de OS da oficina.';
