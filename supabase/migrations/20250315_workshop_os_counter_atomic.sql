-- Contador atômico de os_number por workshop para evitar duplicate key em criação simultânea.

CREATE TABLE IF NOT EXISTS workshop_os_counters (
  workshop_id UUID PRIMARY KEY,
  next_os_number INTEGER NOT NULL DEFAULT 1
);

COMMENT ON TABLE workshop_os_counters IS 'Próximo número de OS por oficina; incremento atômico evita duplicate key.';

-- Inicializar com o próximo número correto para cada workshop que já tem OS
INSERT INTO workshop_os_counters (workshop_id, next_os_number)
SELECT workshop_id, COALESCE(MAX(os_number), 0) + 1
FROM service_orders
GROUP BY workshop_id
ON CONFLICT (workshop_id) DO UPDATE
SET next_os_number = GREATEST(workshop_os_counters.next_os_number, EXCLUDED.next_os_number);

-- Função que retorna o próximo os_number e incrementa (atômico)
CREATE OR REPLACE FUNCTION get_next_os_number(p_workshop_id UUID)
RETURNS INTEGER
LANGUAGE sql
AS $$
  WITH ins AS (
    INSERT INTO workshop_os_counters (workshop_id, next_os_number)
    VALUES (p_workshop_id, 1)
    ON CONFLICT (workshop_id) DO UPDATE
    SET next_os_number = workshop_os_counters.next_os_number + 1
    RETURNING next_os_number
  )
  SELECT next_os_number FROM ins;
$$;

COMMENT ON FUNCTION get_next_os_number(UUID) IS 'Retorna e reserva o próximo número de OS da oficina (uso na API ao criar service_order).';
