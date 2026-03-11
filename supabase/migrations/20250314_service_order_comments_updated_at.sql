-- Marcar comentários editados (exibir "editada" na UI).
ALTER TABLE service_order_comments
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

COMMENT ON COLUMN service_order_comments.updated_at IS 'Preenchido quando o comentário foi editado (PATCH).';
