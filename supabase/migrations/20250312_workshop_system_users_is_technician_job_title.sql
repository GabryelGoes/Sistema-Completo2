-- Técnico da oficina (aparece como mecânico nos cards) e cargo para identificação.
ALTER TABLE workshop_system_users
  ADD COLUMN IF NOT EXISTS is_technician BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS job_title TEXT;

COMMENT ON COLUMN workshop_system_users.is_technician IS 'Se true, o usuário aparece na lista de mecânicos para atribuição nos cards do Pátio/Laboratório.';
COMMENT ON COLUMN workshop_system_users.job_title IS 'Cargo/função do usuário (ex.: Mecânico, Recepcionista) para identificação.';
