-- Garante que o role `anon` pode executar SELECT nas tabelas usadas pelo Realtime
-- (além das políticas RLS). Sem GRANT, o join pode falhar mesmo com políticas corretas.

GRANT USAGE ON SCHEMA public TO anon;

GRANT SELECT ON public.service_orders TO anon;
GRANT SELECT ON public.budgets TO anon;
GRANT SELECT ON public.service_order_comments TO anon;
GRANT SELECT ON public.service_order_checklist_checks TO anon;
GRANT SELECT ON public.customers TO anon;
GRANT SELECT ON public.workshop_reminders TO anon;
