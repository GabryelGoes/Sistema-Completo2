ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS vehicle_brand text;

COMMENT ON COLUMN public.service_orders.vehicle_brand IS 'Marca/montadora (vehicle_model = só modelo no card)';
