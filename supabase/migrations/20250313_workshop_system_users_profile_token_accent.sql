-- Token para alterar foto/nome sem digitar senha; cor de destaque para técnicos no sistema.
ALTER TABLE workshop_system_users
  ADD COLUMN IF NOT EXISTS profile_token TEXT,
  ADD COLUMN IF NOT EXISTS profile_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accent_color TEXT;

COMMENT ON COLUMN workshop_system_users.profile_token IS 'Token de sessão para endpoints meu-perfil (foto) sem enviar senha. Rotacionado a cada login.';
COMMENT ON COLUMN workshop_system_users.profile_token_expires_at IS 'Expiração do profile_token (ex.: 24h após login).';
COMMENT ON COLUMN workshop_system_users.accent_color IS 'Cor de destaque do usuário no sistema (ex.: blue, green). Usado em avatares e badges quando is_technician.';
