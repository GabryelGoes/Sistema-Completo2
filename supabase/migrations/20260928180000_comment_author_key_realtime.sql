-- Autor estável nos comentários + Realtime para views/reações

ALTER TABLE service_order_comments
  ADD COLUMN IF NOT EXISTS author_key TEXT;

CREATE INDEX IF NOT EXISTS idx_service_order_comments_author_key
  ON service_order_comments (author_key);

COMMENT ON COLUMN service_order_comments.author_key IS
  'Identidade do autor: ''admin'' ou id do workshop_system_users (mesma chave de reader_key).';

-- Backfill: admin clássico
UPDATE service_order_comments c
SET author_key = 'admin'
WHERE c.author_key IS NULL
  AND (
    lower(trim(c.author_display_name)) IN ('rei do abs', 'gerência', 'gerencia', 'admin')
    OR c.author_display_name ILIKE '%rei do abs%'
  );

-- Backfill: system users por display_name / username (mesma oficina da OS)
UPDATE service_order_comments c
SET author_key = u.id::text
FROM service_orders so
JOIN workshop_system_users u ON u.workshop_id = so.workshop_id
WHERE c.author_key IS NULL
  AND c.service_order_id = so.id
  AND (
    lower(trim(c.author_display_name)) = lower(trim(coalesce(u.display_name, '')))
    OR lower(trim(c.author_display_name)) = lower(trim(coalesce(u.username, '')))
  );

-- Publicar tabelas novas no Realtime (ignora se já estiverem na publication)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE service_order_comment_views;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE service_order_comment_reactions;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;
END $$;

GRANT SELECT ON public.service_order_comment_views TO anon;
GRANT SELECT ON public.service_order_comment_reactions TO anon;

-- Realtime no browser (anon) exige policy SELECT com RLS ativo.
DROP POLICY IF EXISTS realtime_anon_select_comment_views ON public.service_order_comment_views;
CREATE POLICY realtime_anon_select_comment_views ON public.service_order_comment_views
  FOR SELECT TO anon
  USING (workshop_id = '624ccf66-a342-4769-9d09-053cd1d565b6'::uuid);

DROP POLICY IF EXISTS realtime_anon_select_comment_reactions ON public.service_order_comment_reactions;
CREATE POLICY realtime_anon_select_comment_reactions ON public.service_order_comment_reactions
  FOR SELECT TO anon
  USING (workshop_id = '624ccf66-a342-4769-9d09-053cd1d565b6'::uuid);
