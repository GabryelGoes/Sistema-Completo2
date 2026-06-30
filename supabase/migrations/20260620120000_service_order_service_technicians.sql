-- Técnicos executores por serviço (fechamento ao finalizar veículo no Pátio).

CREATE TABLE IF NOT EXISTS service_order_service_technicians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  service_order_id UUID NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  description TEXT NOT NULL DEFAULT '',
  technician_id UUID NOT NULL REFERENCES workshop_system_users(id) ON DELETE RESTRICT,
  budget_id UUID REFERENCES budgets(id) ON DELETE SET NULL,
  sort_order INT NOT NULL DEFAULT 0,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sost_service_order
  ON service_order_service_technicians(service_order_id);

CREATE INDEX IF NOT EXISTS idx_sost_workshop_recorded
  ON service_order_service_technicians(workshop_id, recorded_at DESC);

COMMENT ON TABLE service_order_service_technicians IS
  'Quem executou cada serviço da OS (obrigatório antes de etapa FINALIZADO no Pátio).';
