-- Badges de comentários não lidos nos cards do Pátio / Laboratório.
-- last_read_at por (oficina, OS, leitor). Acesso total marca como lida explicitamente.

CREATE TABLE IF NOT EXISTS service_order_comment_reads (
  workshop_id UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  service_order_id UUID NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  reader_key TEXT NOT NULL,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workshop_id, service_order_id, reader_key)
);

CREATE INDEX IF NOT EXISTS idx_service_order_comment_reads_reader
  ON service_order_comment_reads (workshop_id, reader_key);

CREATE INDEX IF NOT EXISTS idx_service_order_comment_reads_order
  ON service_order_comment_reads (service_order_id);

COMMENT ON TABLE service_order_comment_reads IS
  'Última leitura dos comentários de uma OS por usuário (admin = ''admin'', demais = id do system user).';

ALTER TABLE service_order_comment_reads ENABLE ROW LEVEL SECURITY;

-- Realtime / SELECT anon (padrão do projeto para tabelas sincronizadas)
GRANT SELECT ON public.service_order_comment_reads TO anon;
