-- =============================================================================
-- Bootstrap UI — suporte às telas (login/Pátio/Radar) em homologação vazia
-- Rodar DEPOIS de 00_bootstrap_core_schema.sql e ANTES das migrations RDA
--   (ou a qualquer momento se o core já existir; IF NOT EXISTS).
-- Projeto: rei-do-abs-homologacao (NÃO usar em produção)
-- =============================================================================
-- Tabelas versionadas no repo e necessárias para a UI real:
--   workshop_settings, workshop_device_sessions, workshop_blocked_devices,
--   workshop_technicians, workshop_technician_incidents(+attachments)
-- Storage bucket quality-incidents: opcional (anexos de ocorrência); omitido
-- se o schema storage não estiver disponível no projeto novo.
-- =============================================================================

-- 1) workshop_settings
CREATE TABLE IF NOT EXISTS public.workshop_settings (
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workshop_id, key)
);

CREATE INDEX IF NOT EXISTS idx_workshop_settings_workshop_id
  ON public.workshop_settings (workshop_id);

COMMENT ON TABLE public.workshop_settings IS
  'Configurações da oficina (admin_password, patio_*, etc.).';

-- 2) Dispositivos / sessões (login não quebra se faltar; com a tabela o hub funciona)
CREATE TABLE IF NOT EXISTS public.workshop_device_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  username TEXT,
  display_name TEXT,
  user_agent TEXT,
  platform TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  os_name TEXT,
  device_model TEXT
);

CREATE INDEX IF NOT EXISTS idx_workshop_device_sessions_workshop_last_seen
  ON public.workshop_device_sessions (workshop_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_workshop_device_sessions_workshop_device
  ON public.workshop_device_sessions (workshop_id, device_id);
CREATE INDEX IF NOT EXISTS idx_workshop_device_sessions_active
  ON public.workshop_device_sessions (workshop_id)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.workshop_blocked_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  label TEXT,
  user_agent TEXT,
  platform TEXT,
  blocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  blocked_by_role TEXT,
  blocked_by_user_id UUID REFERENCES public.workshop_system_users(id) ON DELETE SET NULL,
  reason TEXT,
  os_name TEXT,
  device_model TEXT,
  UNIQUE (workshop_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_workshop_blocked_devices_workshop
  ON public.workshop_blocked_devices (workshop_id);

-- 3) Técnicos do pátio (lista / badges) — Radar também consulta
CREATE TABLE IF NOT EXISTS public.workshop_technicians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  color_style TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  photo_url TEXT
);

CREATE INDEX IF NOT EXISTS idx_workshop_technicians_workshop_id
  ON public.workshop_technicians (workshop_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_workshop_technicians_workshop_slug
  ON public.workshop_technicians (workshop_id, LOWER(TRIM(slug)));

-- 4) Ocorrências do Radar (UI carrega ao abrir o módulo)
CREATE TABLE IF NOT EXISTS public.workshop_technician_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  technician_id UUID REFERENCES public.workshop_technicians(id) ON DELETE SET NULL,
  technician_name TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'outro' CHECK (category IN (
    'montagem', 'diagnostico', 'retrabalho', 'prazo', 'comunicacao',
    'seguranca', 'peca_material', 'cliente', 'outro'
  )),
  severity TEXT NOT NULL DEFAULT 'media' CHECK (severity IN ('baixa', 'media', 'alta', 'critica')),
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN (
    'aberta', 'em_analise', 'plano_acao', 'resolvida', 'arquivada'
  )),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  description TEXT NOT NULL DEFAULT '',
  impact TEXT NOT NULL DEFAULT '',
  root_cause TEXT NOT NULL DEFAULT '',
  corrective_action TEXT NOT NULL DEFAULT '',
  preventive_action TEXT NOT NULL DEFAULT '',
  lesson_learned TEXT NOT NULL DEFAULT '',
  plate TEXT,
  vehicle_summary TEXT,
  service_order_id UUID REFERENCES public.service_orders(id) ON DELETE SET NULL,
  service_order_label TEXT,
  registered_by_user_id UUID,
  registered_by_name TEXT NOT NULL DEFAULT '',
  resolved_at TIMESTAMPTZ,
  resolved_by_name TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workshop_technician_incident_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  incident_id UUID NOT NULL REFERENCES public.workshop_technician_incidents(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'photo' CHECK (kind IN ('photo', 'document', 'link')),
  name TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  storage_path TEXT,
  mime_type TEXT,
  file_size_bytes BIGINT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workshop_technician_incidents_workshop
  ON public.workshop_technician_incidents (workshop_id);
CREATE INDEX IF NOT EXISTS idx_workshop_technician_incidents_occurred
  ON public.workshop_technician_incidents (workshop_id, occurred_at DESC);

-- Técnicos fictícios espelhando os system users (só para badges/listas)
INSERT INTO public.workshop_technicians (id, workshop_id, slug, name, color_style, sort_order)
VALUES
  (
    '66666666-6666-4666-8666-666666666601',
    '11111111-1111-4111-8111-111111111111',
    'homolog_tech1',
    'Homolog Tech Um',
    'blue',
    1
  ),
  (
    '66666666-6666-4666-8666-666666666602',
    '11111111-1111-4111-8111-111111111111',
    'homolog_tech2',
    'Homolog Tech Dois',
    'green',
    2
  )
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name, slug = EXCLUDED.slug;
