-- Evolução: serviços da oficina por categoria + horas de mão de obra.
-- Mantém compatibilidade com dados legados no formato "[Categoria | Xh] Nome".

ALTER TABLE workshop_services
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS labor_hours NUMERIC(6,2);

-- Preenche categoria/horas a partir do padrão antigo no campo name.
-- Ex.: "[Compacto | 1.5h] Troca de óleo"
UPDATE workshop_services
SET
  category = COALESCE(
    NULLIF(TRIM((regexp_match(name, '^\[(.+?)\s*\|\s*([0-9]+(?:[.,][0-9]+)?)h\]\s*(.+)$'))[1]), ''),
    category
  ),
  labor_hours = COALESCE(
    NULLIF(REPLACE((regexp_match(name, '^\[(.+?)\s*\|\s*([0-9]+(?:[.,][0-9]+)?)h\]\s*(.+)$'))[2], ',', '.'), '')::numeric,
    labor_hours
  ),
  name = COALESCE(
    NULLIF(TRIM((regexp_match(name, '^\[(.+?)\s*\|\s*([0-9]+(?:[.,][0-9]+)?)h\]\s*(.+)$'))[3]), ''),
    name
  )
WHERE name ~ '^\[(.+?)\s*\|\s*([0-9]+(?:[.,][0-9]+)?)h\]\s*(.+)$';

-- Defaults para linhas antigas que não tinham padrão.
UPDATE workshop_services
SET category = COALESCE(NULLIF(TRIM(category), ''), 'Compacto')
WHERE category IS NULL OR TRIM(category) = '';

UPDATE workshop_services
SET labor_hours = COALESCE(labor_hours, 1.00)
WHERE labor_hours IS NULL OR labor_hours <= 0;

ALTER TABLE workshop_services
  ALTER COLUMN category SET NOT NULL,
  ALTER COLUMN labor_hours SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workshop_services_workshop_category
  ON workshop_services(workshop_id, category);

-- Ajusta unicidade para permitir mesmo nome em categorias diferentes.
DROP INDEX IF EXISTS idx_workshop_services_workshop_name;
CREATE UNIQUE INDEX IF NOT EXISTS idx_workshop_services_workshop_category_name
  ON workshop_services(workshop_id, LOWER(TRIM(category)), LOWER(TRIM(name)));
