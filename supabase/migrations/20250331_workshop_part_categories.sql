-- Categorias do estoque de peças e vínculo N:N com produtos

CREATE TABLE IF NOT EXISTS workshop_part_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workshop_part_categories_workshop_id
  ON workshop_part_categories(workshop_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workshop_part_categories_workshop_name
  ON workshop_part_categories(workshop_id, LOWER(TRIM(name)));

CREATE TABLE IF NOT EXISTS workshop_part_category_members (
  part_id UUID NOT NULL REFERENCES workshop_parts(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES workshop_part_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (part_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_wpcm_category_id ON workshop_part_category_members(category_id);
CREATE INDEX IF NOT EXISTS idx_wpcm_part_id ON workshop_part_category_members(part_id);

COMMENT ON TABLE workshop_part_categories IS 'Categorias para organizar itens do estoque de peças.';
COMMENT ON TABLE workshop_part_category_members IS 'Associação de produtos do estoque a categorias.';
