-- Foto de perfil para usuários do sistema (logins criados pelo admin).
ALTER TABLE workshop_system_users
  ADD COLUMN IF NOT EXISTS photo_url TEXT;

COMMENT ON COLUMN workshop_system_users.photo_url IS 'URL da foto de perfil do usuário (storage ou externa).';
