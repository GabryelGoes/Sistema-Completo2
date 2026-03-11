-- Agenda: agendamentos por oficina (independente do Trello)
CREATE TABLE IF NOT EXISTS workshop_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id uuid NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  customer_name text NOT NULL DEFAULT '',
  phone text,
  email text,
  vehicle_model text NOT NULL DEFAULT '',
  plate text NOT NULL DEFAULT '',
  notes text,
  scheduled_date date NOT NULL,
  scheduled_time text NOT NULL DEFAULT '09:00',
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  trello_card_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workshop_appointments_workshop_id ON workshop_appointments(workshop_id);
CREATE INDEX IF NOT EXISTS idx_workshop_appointments_scheduled_date ON workshop_appointments(workshop_id, scheduled_date);

COMMENT ON TABLE workshop_appointments IS 'Agendamentos da oficina; fonte principal da Agenda (Trello opcional).';
