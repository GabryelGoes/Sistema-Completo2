-- Marca do produto no estoque
ALTER TABLE workshop_parts
  ADD COLUMN IF NOT EXISTS brand TEXT;

COMMENT ON COLUMN workshop_parts.brand IS 'Marca/fabricante principal da peça.';
