-- Horários programados + aviso sonoro na TV do pátio (config por oficina; leitura na playlist pública).

CREATE TABLE IF NOT EXISTS public.workshop_tv_chime_schedule (
  workshop_id uuid PRIMARY KEY REFERENCES public.workshops(id) ON DELETE CASCADE,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workshop_tv_chime_schedule_updated_idx
  ON public.workshop_tv_chime_schedule (updated_at DESC);

ALTER TABLE public.workshop_tv_chime_schedule ENABLE ROW LEVEL SECURITY;
