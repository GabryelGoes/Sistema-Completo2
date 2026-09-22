-- Chat de Bugs e Erros (botão Suporte no modo PC).
-- Qualquer usuário autenticado registra; gerência / acesso total responde e apaga.

CREATE TABLE IF NOT EXISTS workshop_support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  author_kind TEXT NOT NULL CHECK (author_kind IN ('admin', 'user')),
  author_user_id UUID REFERENCES workshop_system_users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL DEFAULT '',
  author_color TEXT NOT NULL DEFAULT '#64748b',
  author_photo_url TEXT,
  is_staff_reply BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workshop_support_messages_workshop_created
  ON workshop_support_messages(workshop_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_workshop_support_messages_workshop_created_desc
  ON workshop_support_messages(workshop_id, created_at DESC);

COMMENT ON TABLE workshop_support_messages IS
  'Mensagens do chat de bugs/erros do sistema (Suporte).';
COMMENT ON COLUMN workshop_support_messages.is_staff_reply IS
  'true quando a mensagem é resposta da gerência / usuário com acesso total.';

CREATE TABLE IF NOT EXISTS workshop_support_reads (
  workshop_id UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  reader_key TEXT NOT NULL,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workshop_id, reader_key)
);

COMMENT ON TABLE workshop_support_reads IS
  'Última leitura do chat de suporte por usuário (admin = ''admin'', demais = id do system user).';

ALTER TABLE workshop_support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE workshop_support_reads ENABLE ROW LEVEL SECURITY;
