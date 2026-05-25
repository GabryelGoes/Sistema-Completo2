-- Boletim de Erros: possíveis causas do defeito

ALTER TABLE workshop_error_bulletins
  ADD COLUMN IF NOT EXISTS possible_causes text NOT NULL DEFAULT '';

COMMENT ON COLUMN workshop_error_bulletins.possible_causes IS 'Hipóteses ou causas prováveis do erro (antes da solução).';
