-- Lembretes do Pátio / Laboratório: lista única por oficina e escopo (veículos vs módulos), visível para todos os usuários.

CREATE TABLE IF NOT EXISTS workshop_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('vehicle', 'module')),
  text TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT false,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workshop_reminders_workshop_scope_created
  ON workshop_reminders(workshop_id, scope, created_at DESC);

COMMENT ON TABLE workshop_reminders IS 'Lembretes compartilhados da oficina (Pátio = vehicle, Laboratório = module).';
