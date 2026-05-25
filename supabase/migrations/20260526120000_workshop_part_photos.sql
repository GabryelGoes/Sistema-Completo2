-- Até 3 fotos por peça do estoque

CREATE TABLE IF NOT EXISTS workshop_part_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  part_id UUID NOT NULL REFERENCES workshop_parts(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workshop_part_photos_part_id
  ON workshop_part_photos(part_id);

CREATE INDEX IF NOT EXISTS idx_workshop_part_photos_workshop_id
  ON workshop_part_photos(workshop_id);

COMMENT ON TABLE workshop_part_photos IS 'Fotos do produto no estoque (máx. 3 por peça).';

-- Migra foto única legada para a nova tabela
INSERT INTO workshop_part_photos (workshop_id, part_id, photo_url, sort_order)
SELECT wp.workshop_id, wp.id, wp.photo_url, 0
FROM workshop_parts wp
WHERE wp.photo_url IS NOT NULL AND TRIM(wp.photo_url) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM workshop_part_photos wpp WHERE wpp.part_id = wp.id
  );
