-- Pacote de correção para vídeos na TV (rode se os vídeos sumiram após atualização).

-- 1) Playlist de vídeos no slide
ALTER TABLE public.workshop_tv_slides
  ADD COLUMN IF NOT EXISTS media_playlist jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.workshop_tv_slides
SET media_playlist = jsonb_build_array(media_url)
WHERE slide_type = 'video'
  AND media_url IS NOT NULL
  AND trim(media_url) <> ''
  AND (media_playlist IS NULL OR media_playlist = '[]'::jsonb);

-- 2) Configuração um slide vs vários slides
CREATE TABLE IF NOT EXISTS public.workshop_tv_video_settings (
  workshop_id uuid NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  tv_scope text NOT NULL CHECK (tv_scope IN ('patio', 'laboratorio')),
  layout_mode text NOT NULL DEFAULT 'single_rotate'
    CHECK (layout_mode IN ('single_rotate', 'multiple_slides')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workshop_id, tv_scope)
);

ALTER TABLE public.workshop_tv_video_settings ENABLE ROW LEVEL SECURITY;
