-- Etiqueta "Agendado": veículos que entraram no pátio a partir da Agenda.
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS agenda_tag BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.service_orders.agenda_tag IS
  'True quando a OS foi criada pelo fluxo Chegou ao pátio (Agenda). Persistente para exibir etiqueta no modal.';
