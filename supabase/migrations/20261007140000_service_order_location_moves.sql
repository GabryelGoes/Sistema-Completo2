-- Histórico de movimentação Oficina ↔ Depósito (scan Saída / Retorno).

CREATE TABLE IF NOT EXISTS public.service_order_location_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id uuid NOT NULL,
  service_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('saida', 'retorno')),
  from_kind text NOT NULL CHECK (from_kind IN ('oficina', 'deposito', 'fila', 'none')),
  from_value text,
  to_kind text NOT NULL CHECK (to_kind IN ('oficina', 'deposito', 'fila', 'none')),
  to_value text,
  actor_name text,
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_so_location_moves_order_created
  ON public.service_order_location_moves (service_order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_so_location_moves_workshop_created
  ON public.service_order_location_moves (workshop_id, created_at DESC);

COMMENT ON TABLE public.service_order_location_moves IS
  'Auditoria: Saída (oficina→depósito) e Retorno (depósito→oficina) via pistola.';
