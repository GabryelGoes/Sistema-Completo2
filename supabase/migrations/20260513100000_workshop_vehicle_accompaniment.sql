-- Central do atendimento: checklist de entrada (fotos + marcadores), link público e avaliação do cliente.
-- Leitura/escrita via API (service role).

CREATE TABLE IF NOT EXISTS public.workshop_vehicle_accompaniment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id uuid NOT NULL,
  service_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  share_token text NOT NULL,
  intake_observations text,
  intake_photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  client_rating_attendance smallint,
  client_rating_service smallint,
  client_rating_recommend smallint,
  client_rating_comment text,
  client_rating_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workshop_vehicle_accompaniment_share_token_key UNIQUE (share_token),
  CONSTRAINT workshop_vehicle_accompaniment_service_order_key UNIQUE (service_order_id),
  CONSTRAINT workshop_vehicle_accompaniment_rating_att_ck
    CHECK (client_rating_attendance IS NULL OR (client_rating_attendance BETWEEN 1 AND 5)),
  CONSTRAINT workshop_vehicle_accompaniment_rating_svc_ck
    CHECK (client_rating_service IS NULL OR (client_rating_service BETWEEN 1 AND 5)),
  CONSTRAINT workshop_vehicle_accompaniment_rating_rec_ck
    CHECK (client_rating_recommend IS NULL OR (client_rating_recommend BETWEEN 1 AND 5))
);

CREATE INDEX IF NOT EXISTS workshop_vehicle_accompaniment_share_token_idx
  ON public.workshop_vehicle_accompaniment (share_token);

CREATE INDEX IF NOT EXISTS workshop_vehicle_accompaniment_workshop_idx
  ON public.workshop_vehicle_accompaniment (workshop_id);

COMMENT ON TABLE public.workshop_vehicle_accompaniment IS
  'Central do atendimento: fotos de entrada (JSON com paths e marcadores), observações, token de link público e avaliação.';

COMMENT ON COLUMN public.workshop_vehicle_accompaniment.intake_photos IS
  'JSON: [{ "id", "path", "markers": [{ "id", "xPct", "yPct", "note" }] }] — path no bucket vehicle-photos.';
