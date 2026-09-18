-- Pastas de fotos por OS (Pátio): álbuns no Storage + metadados no banco.
-- Pasta de sistema "Entrada do veículo" recebe as fotos do cadastro na recepção.

CREATE TABLE IF NOT EXISTS public.service_order_photo_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  service_order_id UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT,
  is_system BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT service_order_photo_folders_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sop_folders_order_name
  ON public.service_order_photo_folders (service_order_id, lower(trim(name)));

CREATE UNIQUE INDEX IF NOT EXISTS uq_sop_folders_order_slug
  ON public.service_order_photo_folders (service_order_id, slug)
  WHERE slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sop_folders_order_sort
  ON public.service_order_photo_folders (service_order_id, sort_order ASC, created_at ASC);

COMMENT ON TABLE public.service_order_photo_folders IS
  'Álbuns/pastas de fotos por ordem de serviço (ex.: Entrada do veículo).';

CREATE TABLE IF NOT EXISTS public.service_order_photo_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  service_order_id UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  folder_id UUID NOT NULL REFERENCES public.service_order_photo_folders(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'photo'
    CHECK (kind IN ('photo', 'document')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_sop_items_order_path UNIQUE (service_order_id, storage_path)
);

CREATE INDEX IF NOT EXISTS idx_sop_items_folder_created
  ON public.service_order_photo_items (folder_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sop_items_order_kind
  ON public.service_order_photo_items (service_order_id, kind, created_at DESC);

COMMENT ON TABLE public.service_order_photo_items IS
  'Fotos (e opcionalmente documentos) organizados em pastas por OS; storage_path aponta para vehicle-photos.';
