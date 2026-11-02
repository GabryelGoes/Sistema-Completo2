-- RDA Intelligence: controle de tempo produtivo dos mecânicos.
-- NÃO aplicar em produção sem teste. Rode no SQL Editor / CLI do ambiente de homologação.

-- Motivos padronizados de pausa
CREATE TABLE IF NOT EXISTS rda_work_pause_reasons (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  requires_note BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO rda_work_pause_reasons (id, label, requires_note, sort_order, active) VALUES
  ('awaiting_parts', 'Aguardando peças', false, 10, true),
  ('awaiting_tools', 'Aguardando ferramentas', false, 20, true),
  ('awaiting_tech_support', 'Aguardando apoio técnico', false, 30, true),
  ('awaiting_authorization', 'Aguardando autorização', false, 40, true),
  ('break', 'Intervalo', false, 50, true),
  ('other', 'Outro motivo', true, 90, true)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  requires_note = EXCLUDED.requires_note,
  sort_order = EXCLUDED.sort_order,
  active = EXCLUDED.active;

-- Sessões de execução (cronômetro)
CREATE TABLE IF NOT EXISTS rda_work_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  service_order_id UUID NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  technician_user_id UUID NOT NULL REFERENCES workshop_system_users(id) ON DELETE RESTRICT,
  budget_id UUID REFERENCES budgets(id) ON DELETE SET NULL,
  budget_service_description TEXT,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'paused', 'finished', 'cancelled')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  segment_started_at TIMESTAMPTZ,
  productive_ms BIGINT NOT NULL DEFAULT 0 CHECK (productive_ms >= 0),
  paused_ms BIGINT NOT NULL DEFAULT 0 CHECK (paused_ms >= 0),
  current_pause_reason_id TEXT REFERENCES rda_work_pause_reasons(id),
  current_pause_note TEXT,
  current_pause_started_at TIMESTAMPTZ,
  client_mutation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT rda_work_sessions_pause_fields_ck CHECK (
    (status <> 'paused' AND current_pause_reason_id IS NULL AND current_pause_started_at IS NULL)
    OR (status = 'paused' AND current_pause_reason_id IS NOT NULL AND current_pause_started_at IS NOT NULL)
  ),
  CONSTRAINT rda_work_sessions_ended_ck CHECK (
    (status IN ('finished', 'cancelled') AND ended_at IS NOT NULL)
    OR (status IN ('running', 'paused') AND ended_at IS NULL)
  )
);

COMMENT ON TABLE rda_work_sessions IS
  'Sessões de tempo produtivo do mecânico por OS (RDA). Não altera etapa da OS.';

-- Uma sessão ativa (running/paused) por técnico na oficina
CREATE UNIQUE INDEX IF NOT EXISTS uq_rda_work_sessions_one_active_per_tech
  ON rda_work_sessions (workshop_id, technician_user_id)
  WHERE status IN ('running', 'paused');

CREATE UNIQUE INDEX IF NOT EXISTS uq_rda_work_sessions_client_mutation
  ON rda_work_sessions (workshop_id, client_mutation_id)
  WHERE client_mutation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rda_work_sessions_os
  ON rda_work_sessions (workshop_id, service_order_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_rda_work_sessions_tech_started
  ON rda_work_sessions (workshop_id, technician_user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_rda_work_sessions_status
  ON rda_work_sessions (workshop_id, status);

-- Eventos auditáveis
CREATE TABLE IF NOT EXISTS rda_work_session_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES rda_work_sessions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('start', 'pause', 'resume', 'finish', 'cancel', 'correct')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  pause_reason_id TEXT REFERENCES rda_work_pause_reasons(id),
  pause_note TEXT,
  actor_user_id UUID REFERENCES workshop_system_users(id) ON DELETE SET NULL,
  client_mutation_id TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rda_work_session_events_client_mutation
  ON rda_work_session_events (workshop_id, client_mutation_id)
  WHERE client_mutation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rda_work_session_events_session
  ON rda_work_session_events (session_id, occurred_at);

COMMENT ON TABLE rda_work_session_events IS
  'Histórico imutável de start/pause/resume/finish das sessões RDA.';
