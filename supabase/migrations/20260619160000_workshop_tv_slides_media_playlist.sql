-- Vários vídeos no mesmo slide: rotação a cada vez que a página da TV exibe este slide.

ALTER TABLE public.workshop_tv_slides
  ADD COLUMN IF NOT EXISTS media_playlist jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.workshop_tv_slides.media_playlist IS
  'Lista ordenada de URLs/referências de vídeo para rotação no mesmo slot da paginação da TV.';

-- Slides de vídeo existentes: primeiro item = media_url atual.
UPDATE public.workshop_tv_slides
SET media_playlist = jsonb_build_array(media_url)
WHERE slide_type = 'video'
  AND media_url IS NOT NULL
  AND trim(media_url) <> ''
  AND (media_playlist IS NULL OR media_playlist = '[]'::jsonb);
