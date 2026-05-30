-- Boletim de Erros: campo "Possíveis causas" (separado de Diagnóstico / possible_causes)

ALTER TABLE workshop_error_bulletins
  ADD COLUMN IF NOT EXISTS probable_causes text NOT NULL DEFAULT '';

COMMENT ON COLUMN workshop_error_bulletins.probable_causes IS 'Possíveis causas do defeito (hipóteses antes da solução).';
COMMENT ON COLUMN workshop_error_bulletins.possible_causes IS 'Diagnóstico do defeito.';
