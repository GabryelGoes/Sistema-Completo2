-- Modo de exibição de vídeos na TV: um slide com rotação ou vários slides separados.

CREATE TABLE IF NOT EXISTS public.workshop_tv_video_settings (
  workshop_id uuid NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  tv_scope text NOT NULL CHECK (tv_scope IN ('patio', 'laboratorio')),
  layout_mode text NOT NULL DEFAULT 'single_rotate'
    CHECK (layout_mode IN ('single_rotate', 'multiple_slides')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workshop_id, tv_scope)
);

COMMENT ON TABLE public.workshop_tv_video_settings IS
  'single_rotate = 1 slide de vídeo na paginação, vídeos alternam na playlist; multiple_slides = cada slide de vídeo é uma página.';

ALTER TABLE public.workshop_tv_video_settings ENABLE ROW LEVEL SECURITY;
