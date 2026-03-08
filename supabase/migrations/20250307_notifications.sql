-- Central de notificações para o admin (comentários, mudanças de etapa, orçamentos, etc.).
-- Rode no SQL Editor do Supabase (uma vez).

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_workshop_created ON notifications(workshop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_workshop_read ON notifications(workshop_id, read_at) WHERE read_at IS NULL;

COMMENT ON TABLE notifications IS 'Notificações para o admin: comentários, mudança de etapa, orçamento, etc.';
COMMENT ON COLUMN notifications.type IS 'comment | stage_change | budget_created | budget_edited | vehicle_finalized | vehicle_scheduled | vehicle_registered | complaint_edited';
COMMENT ON COLUMN notifications.payload IS 'Dados do evento: service_order_id, vehicle_plate, author_display_name, text, etc.';
