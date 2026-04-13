-- Links de referência anexados ao modal da OS (Pátio / Laboratório).
ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS reference_links jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN service_orders.reference_links IS 'Lista JSON: [{id, label, url}, ...] — links úteis no modal do veículo/módulo.';
