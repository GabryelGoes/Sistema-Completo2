-- Foto do técnico (exibida nos comentários e no modal de seleção).
-- Rode no SQL Editor do Supabase (uma vez).

ALTER TABLE workshop_technicians
  ADD COLUMN IF NOT EXISTS photo_url TEXT;

COMMENT ON COLUMN workshop_technicians.photo_url IS 'URL pública da foto do técnico (Storage).';
