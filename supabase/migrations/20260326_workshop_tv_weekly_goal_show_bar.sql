-- Controle de exibição da barra de meta semanal na TV (páginas de veículos).

ALTER TABLE public.workshop_tv_weekly_goal
ADD COLUMN IF NOT EXISTS show_weekly_bar boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.workshop_tv_weekly_goal.show_weekly_bar IS 'Se true, a barra de meta aparece nas páginas de veículos (não nos slides da playlist).';
