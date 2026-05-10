-- Realtime no browser (chave anon): Postgres só envia postgres_changes se o role pode SELECT nas linhas.
--
-- ANTES DE EXECUTAR: substituir TODAS as ocorrências de
--   00000000-0000-0000-0000-000000000001
-- pelo UUID da tua oficina (igual a WORKSHOP_ID no servidor).
-- No SQL Editor do Supabase: Localizar e substituir, depois Run.

ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_order_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_order_checklist_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS realtime_anon_select_service_orders ON public.service_orders;
CREATE POLICY realtime_anon_select_service_orders ON public.service_orders
  FOR SELECT TO anon
  USING (workshop_id = '624ccf66-a342-4769-9d09-053cd1d565b6'::uuid);

DROP POLICY IF EXISTS realtime_anon_select_budgets ON public.budgets;
CREATE POLICY realtime_anon_select_budgets ON public.budgets
  FOR SELECT TO anon
  USING (workshop_id = '624ccf66-a342-4769-9d09-053cd1d565b6'::uuid);

DROP POLICY IF EXISTS realtime_anon_select_workshop_reminders ON public.workshop_reminders;
CREATE POLICY realtime_anon_select_workshop_reminders ON public.workshop_reminders
  FOR SELECT TO anon
  USING (workshop_id = '624ccf66-a342-4769-9d09-053cd1d565b6'::uuid);

DROP POLICY IF EXISTS realtime_anon_select_comments ON public.service_order_comments;
CREATE POLICY realtime_anon_select_comments ON public.service_order_comments
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.service_orders so
      WHERE so.id = service_order_comments.service_order_id
        AND so.workshop_id = '624ccf66-a342-4769-9d09-053cd1d565b6'::uuid
    )
  );

DROP POLICY IF EXISTS realtime_anon_select_checklist_checks ON public.service_order_checklist_checks;
CREATE POLICY realtime_anon_select_checklist_checks ON public.service_order_checklist_checks
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.service_orders so
      WHERE so.id = service_order_checklist_checks.service_order_id
        AND so.workshop_id = '624ccf66-a342-4769-9d09-053cd1d565b6'::uuid
    )
  );

DROP POLICY IF EXISTS realtime_anon_select_customers ON public.customers;
CREATE POLICY realtime_anon_select_customers ON public.customers
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.service_orders so
      WHERE so.customer_id = customers.id
        AND so.workshop_id = '624ccf66-a342-4769-9d09-053cd1d565b6'::uuid
    )
  );
