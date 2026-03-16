-- Templates de checklist do Pátio: criados pelo admin e exibidos no modal de cada veículo.
-- Rode no SQL Editor do Supabase (uma vez).

-- Templates (ex.: "Entrada", "Finalização")
CREATE TABLE IF NOT EXISTS workshop_checklist_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workshop_checklist_templates_workshop_id
  ON workshop_checklist_templates(workshop_id);

COMMENT ON TABLE workshop_checklist_templates IS 'Checklists do Pátio definidos pelo admin (ex: Entrada, Finalização).';

-- Itens de cada template (texto do item)
CREATE TABLE IF NOT EXISTS workshop_checklist_template_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES workshop_checklist_templates(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_workshop_checklist_template_items_template_id
  ON workshop_checklist_template_items(template_id);

COMMENT ON TABLE workshop_checklist_template_items IS 'Itens (linhas) de cada checklist template.';

-- Estado marcado/desmarcado por OS e por item (qual item está completo para qual veículo)
CREATE TABLE IF NOT EXISTS service_order_checklist_checks (
  service_order_id UUID NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  template_item_id UUID NOT NULL REFERENCES workshop_checklist_template_items(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'incomplete' CHECK (state IN ('complete', 'incomplete')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (service_order_id, template_item_id)
);

CREATE INDEX IF NOT EXISTS idx_service_order_checklist_checks_service_order_id
  ON service_order_checklist_checks(service_order_id);

COMMENT ON TABLE service_order_checklist_checks IS 'Estado de cada item de checklist por OS (veículo).';
