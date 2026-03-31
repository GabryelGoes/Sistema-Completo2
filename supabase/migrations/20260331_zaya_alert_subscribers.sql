-- Destinatários dos avisos da Zaya (além da config em workshop_settings para gerência)
CREATE TABLE IF NOT EXISTS zaya_alert_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  system_user_id UUID NOT NULL REFERENCES workshop_system_users(id) ON DELETE CASCADE,
  alert_types TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workshop_id, system_user_id)
);

CREATE INDEX IF NOT EXISTS idx_zaya_alert_subscribers_workshop ON zaya_alert_subscribers(workshop_id);

COMMENT ON TABLE zaya_alert_subscribers IS 'Usuários do sistema que recebem avisos configuráveis da Zaya (central de notificações).';
