-- Serviços cadastrados por oficina para uso em orçamentos (seleção rápida).
-- Rode no SQL Editor do Supabase (uma vez).

CREATE TABLE IF NOT EXISTS workshop_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workshop_services_workshop_id ON workshop_services(workshop_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_workshop_services_workshop_name ON workshop_services(workshop_id, LOWER(TRIM(name)));

COMMENT ON TABLE workshop_services IS 'Serviços mais usados na oficina para seleção em orçamentos.';
