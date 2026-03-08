-- Comentários nos veículos (modal do pátio). Autor = "Rei do ABS" (admin) ou nome do técnico.
-- Rode no SQL Editor do Supabase (uma vez).

CREATE TABLE IF NOT EXISTS service_order_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id UUID NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  author_display_name TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_order_comments_service_order_id ON service_order_comments(service_order_id);

COMMENT ON TABLE service_order_comments IS 'Comentários no modal do veículo; author_display_name = "Rei do ABS" (admin) ou nome do técnico.';
