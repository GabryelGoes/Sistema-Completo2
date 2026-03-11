-- Usuários do sistema (logins criados pelo admin, com permissões por usuário).
-- Substitui o login por "técnico" no pátio: cada login tem seu próprio conjunto de permissões.
CREATE TABLE IF NOT EXISTS workshop_system_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  permissions JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workshop_id, username)
);

CREATE INDEX IF NOT EXISTS idx_workshop_system_users_workshop_username
  ON workshop_system_users(workshop_id, lower(trim(username)));

COMMENT ON TABLE workshop_system_users IS 'Logins criados pelo admin. permissions: access_home, access_reception, access_agenda, access_patio, access_laboratorio, access_settings, access_change_passwords, access_technicians; patio_*: patio_delete_cards, patio_assign_technician, patio_edit_ficha, patio_edit_queixa, patio_edit_delivery_date, patio_edit_mileage, patio_edit_budgets, patio_add_comments, patio_archive_card.';
