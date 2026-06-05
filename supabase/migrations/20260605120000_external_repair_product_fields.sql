-- Conserto externo: novos campos no JSON external_repair (jsonb — sem ALTER necessário).
-- Estrutura: vehicleRef, productIdentification, productType, productTypeOther,
-- service, vendor, sentAt, expectedAt, returnedAt, cost, notes.
COMMENT ON COLUMN service_orders.external_repair IS
  'Conserto externo (terceiros): vehicleRef, productIdentification, productType, productTypeOther, service, vendor, sentAt, expectedAt, returnedAt, cost, notes';
