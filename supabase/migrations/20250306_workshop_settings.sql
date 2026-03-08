-- Configurações por oficina (login pátio, etc.).
-- Rode no SQL Editor do Supabase (uma vez).

CREATE TABLE IF NOT EXISTS workshop_settings (
  workshop_id UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workshop_id, key)
);

CREATE INDEX IF NOT EXISTS idx_workshop_settings_workshop_id ON workshop_settings(workshop_id);

COMMENT ON TABLE workshop_settings IS 'Configurações da oficina: patio_login_enabled, patio_pin, etc.';

-- Valores iniciais: inserir manualmente por workshop ou via API (patio_login_enabled=true, patio_pin=1234).
-- INSERT INTO workshop_settings (workshop_id, key, value) VALUES
--   ('SEU_WORKSHOP_ID', 'patio_login_enabled', 'true'),
--   ('SEU_WORKSHOP_ID', 'patio_pin', '1234')
-- ON CONFLICT (workshop_id, key) DO NOTHING;
