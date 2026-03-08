-- Etiqueta de garantia: persiste em qualquer etapa até ser removida pelo modal
ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS garantia_tag BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN service_orders.garantia_tag IS 'Etiqueta de garantia: true quando veículo entrou na etapa Garantia; só volta a false ao remover pelo modal.';
