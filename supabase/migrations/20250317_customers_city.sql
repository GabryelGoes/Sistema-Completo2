-- Adiciona coluna cidade à tabela customers (recepção).
-- Rode no SQL Editor do Supabase se a coluna ainda não existir.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS city TEXT;

COMMENT ON COLUMN customers.city IS 'Cidade do cliente (recepção).';
