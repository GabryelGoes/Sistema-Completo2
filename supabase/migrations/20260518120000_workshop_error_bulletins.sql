-- Boletim de Erros: registro de DTC, sintomas, soluções e anexos por oficina

CREATE TABLE IF NOT EXISTS workshop_error_bulletins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id uuid NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  vehicle_brand text,
  vehicle_model text,
  vehicle_year text,
  plate text,
  engine_info text,
  dtc_codes text NOT NULL DEFAULT '',
  symptoms text NOT NULL DEFAULT '',
  solution text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  tags text[] NOT NULL DEFAULT '{}',
  reference_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  service_order_id uuid REFERENCES service_orders(id) ON DELETE SET NULL,
  created_by_user_id uuid,
  created_by_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workshop_error_bulletin_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id uuid NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  bulletin_id uuid NOT NULL REFERENCES workshop_error_bulletins(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'file' CHECK (kind IN ('photo', 'document', 'link')),
  name text NOT NULL DEFAULT '',
  url text NOT NULL DEFAULT '',
  storage_path text,
  mime_type text,
  file_size_bytes bigint,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workshop_error_bulletins_workshop_id
  ON workshop_error_bulletins(workshop_id);
CREATE INDEX IF NOT EXISTS idx_workshop_error_bulletins_workshop_status
  ON workshop_error_bulletins(workshop_id, status);
CREATE INDEX IF NOT EXISTS idx_workshop_error_bulletins_updated
  ON workshop_error_bulletins(workshop_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_workshop_error_bulletin_attachments_bulletin
  ON workshop_error_bulletin_attachments(bulletin_id);

COMMENT ON TABLE workshop_error_bulletins IS 'Boletim de erros: DTC, sintomas e soluções por veículo/sistema.';
COMMENT ON TABLE workshop_error_bulletin_attachments IS 'Anexos do boletim (fotos, documentos, links).';

INSERT INTO storage.buckets (id, name, public)
VALUES ('error-bulletins', 'error-bulletins', true)
ON CONFLICT (id) DO NOTHING;
