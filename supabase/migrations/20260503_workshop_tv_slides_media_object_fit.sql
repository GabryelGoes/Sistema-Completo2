-- Como encaixar imagem/vídeo na área da TV (CSS object-fit): cover | contain | fill

ALTER TABLE public.workshop_tv_slides
ADD COLUMN IF NOT EXISTS media_object_fit text NOT NULL DEFAULT 'cover'
  CHECK (media_object_fit IN ('cover', 'contain', 'fill'));

COMMENT ON COLUMN public.workshop_tv_slides.media_object_fit IS
  'Encaixe da mídia na TV: cover (preenche cortando), contain (inteira com faixas), fill (esticar).';
