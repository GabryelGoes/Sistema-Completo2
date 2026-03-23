-- Foto da peça no estoque

ALTER TABLE workshop_parts
ADD COLUMN IF NOT EXISTS photo_url TEXT;

COMMENT ON COLUMN workshop_parts.photo_url IS 'URL pública da foto da peça no estoque.';
