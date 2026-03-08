-- Técnicos da oficina: lista configurável para atribuição nos cards (slug = valor em service_orders.assigned_technician).
-- Rode no SQL Editor do Supabase (uma vez).

CREATE TABLE IF NOT EXISTS workshop_technicians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  color_style TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workshop_technicians_workshop_id ON workshop_technicians(workshop_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_workshop_technicians_workshop_slug ON workshop_technicians(workshop_id, LOWER(TRIM(slug)));

COMMENT ON TABLE workshop_technicians IS 'Técnicos cadastrados por oficina para atribuição nos cards do pátio.';
COMMENT ON COLUMN workshop_technicians.slug IS 'Identificador usado em service_orders.assigned_technician (ex: gabryel, jhow).';
COMMENT ON COLUMN workshop_technicians.color_style IS 'Cor do badge: red, blue, green, amber, zinc (opcional).';
