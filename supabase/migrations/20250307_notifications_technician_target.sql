-- Notificações por destinatário: admin (padrão) ou técnico (por slug).
-- Rode no SQL Editor do Supabase (uma vez).

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS target_type TEXT NOT NULL DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS target_slug TEXT;

CREATE INDEX IF NOT EXISTS idx_notifications_technician ON notifications(workshop_id, target_type, target_slug) WHERE target_type = 'technician';

COMMENT ON COLUMN notifications.target_type IS 'admin = central do admin; technician = notificação para o técnico em target_slug';
COMMENT ON COLUMN notifications.target_slug IS 'Slug do técnico quando target_type = technician';
