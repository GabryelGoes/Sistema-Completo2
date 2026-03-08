-- Permite usar as 10 etapas + CANCELLED no status da OS.
-- Rode no SQL Editor do Supabase (uma vez).

-- 1) Remover default da coluna (se existir)
ALTER TABLE service_orders ALTER COLUMN status DROP DEFAULT;

-- 2) Converter coluna status de enum para TEXT
ALTER TABLE service_orders
  ALTER COLUMN status TYPE TEXT USING status::TEXT;

-- 3) Migrar dados antigos para os novos valores
UPDATE service_orders SET status = 'AGUARDANDO_AVALIACAO' WHERE status = 'RECEPTION';
UPDATE service_orders SET status = 'AVALIACAO_TECNICA' WHERE status = 'YARD';
UPDATE service_orders SET status = 'FINALIZADO' WHERE status = 'FINISHED';

-- 4) Valor padrão para novas OS
ALTER TABLE service_orders
  ALTER COLUMN status SET DEFAULT 'AGUARDANDO_AVALIACAO';
