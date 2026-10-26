-- Modelo e sistema operacional do aparelho nas sessões / bloqueios.

ALTER TABLE workshop_device_sessions
  ADD COLUMN IF NOT EXISTS os_name TEXT,
  ADD COLUMN IF NOT EXISTS device_model TEXT;

ALTER TABLE workshop_blocked_devices
  ADD COLUMN IF NOT EXISTS os_name TEXT,
  ADD COLUMN IF NOT EXISTS device_model TEXT;

COMMENT ON COLUMN workshop_device_sessions.os_name IS 'Sistema operacional detectado (ex.: iOS 17.4, Windows 11).';
COMMENT ON COLUMN workshop_device_sessions.device_model IS 'Modelo do aparelho (ex.: iPhone, Pixel 8, SM-S911B, Mac).';
