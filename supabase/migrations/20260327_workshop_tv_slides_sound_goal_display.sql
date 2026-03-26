-- Som e exibição %/R$ por slide (não mais globais).

ALTER TABLE public.workshop_tv_slides
ADD COLUMN IF NOT EXISTS play_sound boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS goal_show_values boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.workshop_tv_slides.play_sound IS 'Tocar bip ao exibir este slide na TV.';
COMMENT ON COLUMN public.workshop_tv_slides.goal_show_values IS 'Só para slide_type goal: true = valores em R$, false = porcentagem.';
