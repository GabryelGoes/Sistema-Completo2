-- Playlist da TV do pátio (slides + meta semanal). Acesso apenas via service role / API.

CREATE TABLE IF NOT EXISTS public.workshop_tv_slides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id uuid NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  slide_type text NOT NULL CHECK (slide_type IN ('notice', 'image', 'video', 'goal', 'alert')),
  title text,
  body text,
  media_url text,
  duration_seconds int NOT NULL DEFAULT 10
    CHECK (duration_seconds >= 3 AND duration_seconds <= 300),
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  goal_current numeric,
  goal_target numeric,
  goal_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workshop_tv_slides_workshop_sort_idx
  ON public.workshop_tv_slides (workshop_id, sort_order);

CREATE TABLE IF NOT EXISTS public.workshop_tv_weekly_goal (
  workshop_id uuid PRIMARY KEY REFERENCES public.workshops(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Meta semanal',
  current_amount numeric NOT NULL DEFAULT 0,
  target_amount numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workshop_tv_slides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_tv_weekly_goal ENABLE ROW LEVEL SECURITY;
