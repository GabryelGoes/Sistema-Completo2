-- Ao excluir um produto do estoque, remover também as movimentações
-- vinculadas (antes: ON DELETE RESTRICT bloqueava a exclusão).

ALTER TABLE public.workshop_part_stock_movements
  DROP CONSTRAINT IF EXISTS workshop_part_stock_movements_part_id_fkey;

ALTER TABLE public.workshop_part_stock_movements
  ADD CONSTRAINT workshop_part_stock_movements_part_id_fkey
  FOREIGN KEY (part_id)
  REFERENCES public.workshop_parts(id)
  ON DELETE CASCADE;

COMMENT ON CONSTRAINT workshop_part_stock_movements_part_id_fkey
  ON public.workshop_part_stock_movements IS
  'Excluir o produto remove automaticamente o histórico de saídas/consumo vinculado.';
