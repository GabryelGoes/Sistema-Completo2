-- Biblioteca de mídias da TV (vídeos curtos e imagens enviados pela nuvem).

CREATE TABLE IF NOT EXISTS public.workshop_tv_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id uuid NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  tv_scope text NOT NULL DEFAULT 'patio' CHECK (tv_scope IN ('patio', 'laboratorio')),
  media_type text NOT NULL CHECK (media_type IN ('video', 'image')),
  title text,
  file_name text NOT NULL,
  media_url text NOT NULL,
  storage_path text NOT NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workshop_tv_media_workshop_scope_idx
  ON public.workshop_tv_media (workshop_id, tv_scope, created_at DESC);

ALTER TABLE public.workshop_tv_media ENABLE ROW LEVEL SECURITY;
