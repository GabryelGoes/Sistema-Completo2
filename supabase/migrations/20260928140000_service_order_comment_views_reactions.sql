-- Recibos de leitura por mensagem + reações (estilo WhatsApp) nos comentários da OS.

CREATE TABLE IF NOT EXISTS service_order_comment_views (
  comment_id UUID NOT NULL REFERENCES service_order_comments(id) ON DELETE CASCADE,
  workshop_id UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  reader_key TEXT NOT NULL,
  reader_display_name TEXT NOT NULL DEFAULT '',
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, reader_key)
);

CREATE INDEX IF NOT EXISTS idx_service_order_comment_views_comment
  ON service_order_comment_views (comment_id);

CREATE INDEX IF NOT EXISTS idx_service_order_comment_views_workshop_reader
  ON service_order_comment_views (workshop_id, reader_key);

COMMENT ON TABLE service_order_comment_views IS
  'Quem visualizou cada comentário da OS e quando (reader_key = admin | id do system user).';

CREATE TABLE IF NOT EXISTS service_order_comment_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES service_order_comments(id) ON DELETE CASCADE,
  workshop_id UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  reactor_key TEXT NOT NULL,
  reactor_display_name TEXT NOT NULL DEFAULT '',
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (comment_id, reactor_key, emoji)
);

CREATE INDEX IF NOT EXISTS idx_service_order_comment_reactions_comment
  ON service_order_comment_reactions (comment_id);

COMMENT ON TABLE service_order_comment_reactions IS
  'Reações emoji por comentário da OS (um mesmo usuário pode ter vários emojis).';

ALTER TABLE service_order_comment_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_order_comment_reactions ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.service_order_comment_views TO anon;
GRANT SELECT ON public.service_order_comment_reactions TO anon;
