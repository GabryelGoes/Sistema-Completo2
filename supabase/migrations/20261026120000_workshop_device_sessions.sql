-- Sessões por dispositivo (online / último acesso) + bloqueio de aparelhos.
-- Usado pelo hub Ajustes → Dispositivos e impressão → Dispositivos conectados.

CREATE TABLE IF NOT EXISTS workshop_device_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  user_id UUID REFERENCES workshop_system_users(id) ON DELETE SET NULL,
  username TEXT,
  display_name TEXT,
  user_agent TEXT,
  platform TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_workshop_device_sessions_workshop_last_seen
  ON workshop_device_sessions (workshop_id, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_workshop_device_sessions_workshop_device
  ON workshop_device_sessions (workshop_id, device_id);

CREATE INDEX IF NOT EXISTS idx_workshop_device_sessions_active
  ON workshop_device_sessions (workshop_id)
  WHERE revoked_at IS NULL;

COMMENT ON TABLE workshop_device_sessions IS
  'Sessões de login por aparelho. last_seen_at atualizado por heartbeat; revoked_at força logout.';

CREATE TABLE IF NOT EXISTS workshop_blocked_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  label TEXT,
  user_agent TEXT,
  platform TEXT,
  blocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  blocked_by_role TEXT,
  blocked_by_user_id UUID REFERENCES workshop_system_users(id) ON DELETE SET NULL,
  reason TEXT,
  UNIQUE (workshop_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_workshop_blocked_devices_workshop
  ON workshop_blocked_devices (workshop_id);

COMMENT ON TABLE workshop_blocked_devices IS
  'Aparelhos impedidos de fazer login e de usar a API até desbloqueio (acesso total / gerência).';
