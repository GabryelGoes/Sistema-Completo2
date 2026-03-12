-- Número sequencial de OS por oficina. Cada novo cadastro (veículo ou módulo) gera uma nova OS com o próximo número.
-- Se o mesmo carro/módulo voltar, será criada outra OS com novo número.

ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS os_number INTEGER;

COMMENT ON COLUMN service_orders.os_number IS 'Número sequencial da OS na oficina (ex: 1, 2, 3). Único por workshop_id.';

-- Preencher os_number para registros existentes (ordem por created_at por workshop)
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY workshop_id ORDER BY created_at ASC, id) AS rn
  FROM service_orders
  WHERE os_number IS NULL
)
UPDATE service_orders so
SET os_number = ranked.rn
FROM ranked
WHERE so.id = ranked.id;

-- Novas inserções devem enviar os_number pela API; permitir NULL apenas para compatibilidade de migração.
-- A API sempre envia o próximo número por workshop.

-- Índice para buscar o próximo número e listagens
CREATE UNIQUE INDEX IF NOT EXISTS idx_service_orders_workshop_os_number
  ON service_orders (workshop_id, os_number);
