-- Exibir imediatamente: fixa o slide na TV até desligar (um por oficina).

ALTER TABLE public.workshop_tv_slides
ADD COLUMN IF NOT EXISTS pin_immediate boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.workshop_tv_slides.pin_immediate IS 'Se true, a TV fixa neste slide (sem rotação) até voltar a false; só um slide por workshop deve estar true.';
