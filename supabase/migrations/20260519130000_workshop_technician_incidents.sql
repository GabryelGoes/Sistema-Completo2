-- Radar de Qualidade: ocorrências e desvios registrados por mecânico

CREATE TABLE IF NOT EXISTS workshop_technician_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id uuid NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  technician_id uuid REFERENCES workshop_technicians(id) ON DELETE SET NULL,
  technician_name text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'outro' CHECK (category IN (
    'montagem', 'diagnostico', 'retrabalho', 'prazo', 'comunicacao',
    'seguranca', 'peca_material', 'cliente', 'outro'
  )),
  severity text NOT NULL DEFAULT 'media' CHECK (severity IN ('baixa', 'media', 'alta', 'critica')),
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN (
    'aberta', 'em_analise', 'plano_acao', 'resolvida', 'arquivada'
  )),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  description text NOT NULL DEFAULT '',
  impact text NOT NULL DEFAULT '',
  root_cause text NOT NULL DEFAULT '',
  corrective_action text NOT NULL DEFAULT '',
  preventive_action text NOT NULL DEFAULT '',
  lesson_learned text NOT NULL DEFAULT '',
  plate text,
  vehicle_summary text,
  service_order_id uuid REFERENCES service_orders(id) ON DELETE SET NULL,
  service_order_label text,
  registered_by_user_id uuid,
  registered_by_name text NOT NULL DEFAULT '',
  resolved_at timestamptz,
  resolved_by_name text,
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workshop_technician_incident_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id uuid NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  incident_id uuid NOT NULL REFERENCES workshop_technician_incidents(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'photo' CHECK (kind IN ('photo', 'document', 'link')),
  name text NOT NULL DEFAULT '',
  url text NOT NULL DEFAULT '',
  storage_path text,
  mime_type text,
  file_size_bytes bigint,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workshop_technician_incidents_workshop
  ON workshop_technician_incidents(workshop_id);
CREATE INDEX IF NOT EXISTS idx_workshop_technician_incidents_technician
  ON workshop_technician_incidents(workshop_id, technician_id);
CREATE INDEX IF NOT EXISTS idx_workshop_technician_incidents_occurred
  ON workshop_technician_incidents(workshop_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_workshop_technician_incidents_status
  ON workshop_technician_incidents(workshop_id, status);
CREATE INDEX IF NOT EXISTS idx_workshop_technician_incident_attachments_incident
  ON workshop_technician_incident_attachments(incident_id);

COMMENT ON TABLE workshop_technician_incidents IS 'Radar de Qualidade: ocorrências e desvios por mecânico.';
COMMENT ON TABLE workshop_technician_incident_attachments IS 'Anexos das ocorrências (fotos, documentos, links).';

INSERT INTO storage.buckets (id, name, public)
VALUES ('quality-incidents', 'quality-incidents', true)
ON CONFLICT (id) DO NOTHING;
