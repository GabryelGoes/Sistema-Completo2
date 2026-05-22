-- Separa configuração da TV do pátio e do laboratório (mesma oficina, escopos distintos).

ALTER TABLE public.workshop_tv_slides
  ADD COLUMN IF NOT EXISTS tv_scope text NOT NULL DEFAULT 'patio'
  CHECK (tv_scope IN ('patio', 'laboratorio'));

CREATE INDEX IF NOT EXISTS workshop_tv_slides_workshop_scope_sort_idx
  ON public.workshop_tv_slides (workshop_id, tv_scope, sort_order);

COMMENT ON COLUMN public.workshop_tv_slides.tv_scope IS 'patio = TV veículos; laboratorio = TV módulos.';

ALTER TABLE public.workshop_tv_weekly_goal
  ADD COLUMN IF NOT EXISTS tv_scope text NOT NULL DEFAULT 'patio'
  CHECK (tv_scope IN ('patio', 'laboratorio'));

ALTER TABLE public.workshop_tv_weekly_goal
  DROP CONSTRAINT IF EXISTS workshop_tv_weekly_goal_pkey;

ALTER TABLE public.workshop_tv_weekly_goal
  ADD PRIMARY KEY (workshop_id, tv_scope);

COMMENT ON COLUMN public.workshop_tv_weekly_goal.tv_scope IS 'Meta semanal por painel TV (patio ou laboratorio).';

ALTER TABLE public.workshop_tv_chime_schedule
  ADD COLUMN IF NOT EXISTS tv_scope text NOT NULL DEFAULT 'patio'
  CHECK (tv_scope IN ('patio', 'laboratorio'));

ALTER TABLE public.workshop_tv_chime_schedule
  DROP CONSTRAINT IF EXISTS workshop_tv_chime_schedule_pkey;

ALTER TABLE public.workshop_tv_chime_schedule
  ADD PRIMARY KEY (workshop_id, tv_scope);

COMMENT ON COLUMN public.workshop_tv_chime_schedule.tv_scope IS 'Avisos por horário por painel TV.';
