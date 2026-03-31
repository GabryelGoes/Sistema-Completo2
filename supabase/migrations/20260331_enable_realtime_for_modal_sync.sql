-- Habilita Postgres Changes (Realtime) para as tabelas usadas pelo SSE
-- GET /api/service-orders/:id/live (sincronização dos modais de OS).
-- No Supabase: se alguma tabela já estiver em supabase_realtime, esse comando falha para ela — comente a linha ou ignore o erro.
ALTER PUBLICATION supabase_realtime ADD TABLE public.service_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.customers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.service_order_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.budgets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.service_order_checklist_checks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.workshop_reminders;
