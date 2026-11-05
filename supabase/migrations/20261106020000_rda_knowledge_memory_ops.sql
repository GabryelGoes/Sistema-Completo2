-- RDA Memória Permanente — operações (complementar ao schema de produção).
-- NÃO recria tabelas. NÃO aplica automaticamente.
-- Compatível com auditoria de produção:
--   event_type ∈ (created, version_proposed, approved, rejected, retired, restored, purge_requested, purged)
--   versions.change_reason NOT NULL
--   audit.knowledge_item_id NOT NULL
-- Purge = tombstone supervisionado (sem session_replication_role / sem DISABLE TRIGGER).

-- ---------------------------------------------------------------------------
-- 1) Colunas approved_version / pending_version
-- ---------------------------------------------------------------------------
ALTER TABLE public.rda_knowledge_items
  ADD COLUMN IF NOT EXISTS approved_version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.rda_knowledge_items
  ADD COLUMN IF NOT EXISTS pending_version INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'rda_knowledge_items'
      AND c.conname = 'rda_knowledge_items_approved_version_check'
  ) THEN
    ALTER TABLE public.rda_knowledge_items
      ADD CONSTRAINT rda_knowledge_items_approved_version_check
      CHECK (approved_version >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'rda_knowledge_items'
      AND c.conname = 'rda_knowledge_items_pending_version_check'
  ) THEN
    ALTER TABLE public.rda_knowledge_items
      ADD CONSTRAINT rda_knowledge_items_pending_version_check
      CHECK (pending_version IS NULL OR pending_version > 0);
  END IF;
END $$;

-- lifecycle: incluir pending_approval e purged (substitui CHECK antigo de forma controlada)
DO $$
DECLARE
  r RECORD;
  v_found BOOLEAN := false;
BEGIN
  FOR r IN
    SELECT c.conname, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'rda_knowledge_items'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%lifecycle%'
  LOOP
    v_found := true;
    EXECUTE format('ALTER TABLE public.rda_knowledge_items DROP CONSTRAINT %I', r.conname);
  END LOOP;

  ALTER TABLE public.rda_knowledge_items
    ADD CONSTRAINT rda_knowledge_items_lifecycle_check
    CHECK (lifecycle IN ('draft', 'pending_approval', 'approved', 'retired', 'purged'));

  IF NOT v_found THEN
    RAISE NOTICE 'Nenhum CHECK lifecycle prévio encontrado; constraint nova aplicada.';
  END IF;
END $$;

UPDATE public.rda_knowledge_items
SET approved_version = CASE
      WHEN lifecycle = 'approved' AND current_version > 0 THEN current_version
      ELSE COALESCE(approved_version, 0)
    END,
    pending_version = CASE
      WHEN lifecycle = 'draft' AND current_version > 0 AND COALESCE(approved_version, 0) = 0
        THEN NULL
      ELSE pending_version
    END
WHERE TRUE;

COMMENT ON COLUMN public.rda_knowledge_items.approved_version IS
  'Versão oficial em uso (0 = nenhuma). Propostas não alteram este valor até approve.';
COMMENT ON COLUMN public.rda_knowledge_items.pending_version IS
  'Versão aguardando aprovação (NULL se não houver).';

-- ---------------------------------------------------------------------------
-- 2) Isolamento workshop_id (versões e auditoria)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rda_knowledge_versions_enforce_workshop()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_item_workshop UUID;
BEGIN
  SELECT workshop_id INTO v_item_workshop
  FROM public.rda_knowledge_items
  WHERE id = NEW.knowledge_item_id;
  IF v_item_workshop IS NULL THEN
    RAISE EXCEPTION 'RDA_KNOWLEDGE_ITEM_NOT_FOUND';
  END IF;
  IF NEW.workshop_id IS DISTINCT FROM v_item_workshop THEN
    RAISE EXCEPTION 'RDA_KNOWLEDGE_WORKSHOP_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rda_knowledge_versions_workshop ON public.rda_knowledge_versions;
CREATE TRIGGER trg_rda_knowledge_versions_workshop
  BEFORE INSERT ON public.rda_knowledge_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.rda_knowledge_versions_enforce_workshop();

CREATE OR REPLACE FUNCTION public.rda_knowledge_audit_enforce_workshop()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_item_workshop UUID;
BEGIN
  SELECT workshop_id INTO v_item_workshop
  FROM public.rda_knowledge_items
  WHERE id = NEW.knowledge_item_id;
  IF v_item_workshop IS NULL THEN
    RAISE EXCEPTION 'RDA_KNOWLEDGE_ITEM_NOT_FOUND';
  END IF;
  IF NEW.workshop_id IS DISTINCT FROM v_item_workshop THEN
    RAISE EXCEPTION 'RDA_KNOWLEDGE_WORKSHOP_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rda_knowledge_audit_workshop ON public.rda_knowledge_audit;
CREATE TRIGGER trg_rda_knowledge_audit_workshop
  BEFORE INSERT ON public.rda_knowledge_audit
  FOR EACH ROW
  EXECUTE FUNCTION public.rda_knowledge_audit_enforce_workshop();

-- ---------------------------------------------------------------------------
-- 3) Propose (event_type: created | version_proposed; change_reason obrigatório)
--    Metadados de item com approved_version>0 NÃO mudam até approve.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rda_knowledge_propose(
  p_workshop_id UUID,
  p_knowledge_key TEXT,
  p_title TEXT,
  p_category TEXT,
  p_visibility TEXT,
  p_content TEXT,
  p_change_reason TEXT DEFAULT NULL,
  p_structured_data JSONB DEFAULT '{}'::jsonb,
  p_provenance JSONB DEFAULT '{}'::jsonb,
  p_actor_user_id UUID DEFAULT NULL,
  p_actor_label TEXT DEFAULT NULL,
  p_submit_for_approval BOOLEAN DEFAULT TRUE,
  p_expected_updated_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key TEXT := lower(trim(COALESCE(p_knowledge_key, '')));
  v_title TEXT := trim(COALESCE(p_title, ''));
  v_content TEXT := trim(COALESCE(p_content, ''));
  v_cat TEXT := COALESCE(NULLIF(trim(COALESCE(p_category, '')), ''), 'operational_rule');
  v_vis TEXT := lower(trim(COALESCE(p_visibility, 'workshop')));
  v_reason TEXT := NULLIF(trim(COALESCE(p_change_reason, '')), '');
  v_item public.rda_knowledge_items%ROWTYPE;
  v_next INT;
  v_now TIMESTAMPTZ := now();
  v_struct JSONB;
  v_event TEXT;
BEGIN
  IF v_key = '' OR length(v_key) > 120 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RDA_KNOWLEDGE_INVALID_KEY', 'error', 'knowledge_key inválido.');
  END IF;
  IF v_title = '' OR v_content = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RDA_KNOWLEDGE_INVALID_CONTENT', 'error', 'Título e conteúdo são obrigatórios.');
  END IF;
  IF v_vis NOT IN ('workshop', 'management', 'restricted') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RDA_KNOWLEDGE_INVALID_VISIBILITY', 'error', 'visibility inválida.');
  END IF;
  IF v_reason IS NULL THEN
    v_reason := CASE
      WHEN p_submit_for_approval THEN 'Proposta para aprovação gerencial'
      ELSE 'Rascunho de conhecimento'
    END;
  END IF;

  v_struct := COALESCE(p_structured_data, '{}'::jsonb) || jsonb_build_object(
    '_proposedMeta', jsonb_build_object(
      'title', v_title,
      'category', v_cat,
      'visibility', v_vis
    )
  );

  SELECT * INTO v_item
  FROM public.rda_knowledge_items
  WHERE workshop_id = p_workshop_id AND knowledge_key = v_key
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.rda_knowledge_items (
      workshop_id, knowledge_key, title, category, visibility, lifecycle,
      current_version, approved_version, pending_version,
      created_by_user_id, created_at, updated_at
    ) VALUES (
      p_workshop_id, v_key, v_title, v_cat, v_vis,
      CASE WHEN p_submit_for_approval THEN 'pending_approval' ELSE 'draft' END,
      1, 0,
      CASE WHEN p_submit_for_approval THEN 1 ELSE NULL END,
      p_actor_user_id, v_now, v_now
    )
    RETURNING * INTO v_item;

    INSERT INTO public.rda_knowledge_versions (
      workshop_id, knowledge_item_id, version_number, content, structured_data,
      provenance, change_reason, proposed_by_user_id, proposed_by_label, created_at
    ) VALUES (
      p_workshop_id, v_item.id, 1, v_content, v_struct,
      COALESCE(p_provenance, '{}'::jsonb), v_reason, p_actor_user_id, p_actor_label, v_now
    );

    v_event := CASE WHEN p_submit_for_approval THEN 'version_proposed' ELSE 'created' END;
    INSERT INTO public.rda_knowledge_audit (
      workshop_id, knowledge_item_id, event_type, prior_version, new_version,
      actor_user_id, actor_label, reason, metadata, created_at
    ) VALUES (
      p_workshop_id, v_item.id, v_event, NULL, 1,
      p_actor_user_id, p_actor_label, v_reason,
      jsonb_build_object('knowledgeKey', v_key, 'category', v_cat),
      v_now
    );

    RETURN jsonb_build_object('ok', true, 'created', true, 'item', to_jsonb(v_item));
  END IF;

  IF v_item.lifecycle = 'purged' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RDA_KNOWLEDGE_PURGED', 'error', 'Conhecimento excluído definitivamente.');
  END IF;

  IF p_expected_updated_at IS NOT NULL AND v_item.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'RDA_KNOWLEDGE_CONFLICT',
      'error', 'Item alterado por outra operação. Recarregue e tente de novo.',
      'item', to_jsonb(v_item)
    );
  END IF;

  IF v_item.pending_version IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'RDA_KNOWLEDGE_PENDING_EXISTS',
      'error', 'Já existe uma versão aguardando aprovação.',
      'item', to_jsonb(v_item)
    );
  END IF;

  IF v_item.lifecycle = 'retired' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'RDA_KNOWLEDGE_RETIRED',
      'error', 'Conhecimento retirado. Restaure antes de propor nova versão.',
      'item', to_jsonb(v_item)
    );
  END IF;

  v_next := GREATEST(COALESCE(v_item.current_version, 0), 0) + 1;

  INSERT INTO public.rda_knowledge_versions (
    workshop_id, knowledge_item_id, version_number, content, structured_data,
    provenance, change_reason, proposed_by_user_id, proposed_by_label, created_at
  ) VALUES (
    p_workshop_id, v_item.id, v_next, v_content, v_struct,
    COALESCE(p_provenance, '{}'::jsonb), v_reason, p_actor_user_id, p_actor_label, v_now
  );

  -- Se já há regra aprovada, metadados do item (título/categoria/visibilidade) ficam intactos
  -- até approve aplicar _proposedMeta da versão.
  IF COALESCE(v_item.approved_version, 0) > 0 THEN
    UPDATE public.rda_knowledge_items
    SET current_version = v_next,
        pending_version = CASE WHEN p_submit_for_approval THEN v_next ELSE pending_version END,
        lifecycle = CASE WHEN p_submit_for_approval THEN 'pending_approval' ELSE lifecycle END,
        updated_at = v_now
    WHERE id = v_item.id AND workshop_id = p_workshop_id
    RETURNING * INTO v_item;
  ELSE
    UPDATE public.rda_knowledge_items
    SET title = v_title,
        category = v_cat,
        visibility = v_vis,
        current_version = v_next,
        pending_version = CASE WHEN p_submit_for_approval THEN v_next ELSE pending_version END,
        lifecycle = CASE
          WHEN p_submit_for_approval THEN 'pending_approval'
          ELSE 'draft'
        END,
        updated_at = v_now
    WHERE id = v_item.id AND workshop_id = p_workshop_id
    RETURNING * INTO v_item;
  END IF;

  INSERT INTO public.rda_knowledge_audit (
    workshop_id, knowledge_item_id, event_type, prior_version, new_version,
    actor_user_id, actor_label, reason, metadata, created_at
  ) VALUES (
    p_workshop_id, v_item.id, 'version_proposed', v_item.approved_version, v_next,
    p_actor_user_id, p_actor_label, v_reason,
    jsonb_build_object('knowledgeKey', v_key),
    v_now
  );

  RETURN jsonb_build_object('ok', true, 'created', false, 'revised', true, 'item', to_jsonb(v_item));
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) Approve
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rda_knowledge_approve(
  p_workshop_id UUID,
  p_knowledge_item_id UUID,
  p_actor_user_id UUID DEFAULT NULL,
  p_actor_label TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_expected_updated_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.rda_knowledge_items%ROWTYPE;
  v_ver public.rda_knowledge_versions%ROWTYPE;
  v_now TIMESTAMPTZ := now();
  v_prior INT;
  v_new INT;
  v_meta JSONB;
  v_reason TEXT := COALESCE(NULLIF(trim(COALESCE(p_reason, '')), ''), 'Aprovação gerencial');
BEGIN
  SELECT * INTO v_item
  FROM public.rda_knowledge_items
  WHERE id = p_knowledge_item_id AND workshop_id = p_workshop_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RDA_KNOWLEDGE_NOT_FOUND', 'error', 'Conhecimento não encontrado.');
  END IF;
  IF v_item.lifecycle = 'purged' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RDA_KNOWLEDGE_PURGED', 'error', 'Conhecimento excluído.');
  END IF;
  IF p_expected_updated_at IS NOT NULL AND v_item.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RDA_KNOWLEDGE_CONFLICT', 'error', 'Conflito de concorrência.', 'item', to_jsonb(v_item));
  END IF;
  IF v_item.pending_version IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RDA_KNOWLEDGE_NO_PENDING', 'error', 'Não há versão aguardando aprovação.');
  END IF;

  SELECT * INTO v_ver
  FROM public.rda_knowledge_versions v
  WHERE v.knowledge_item_id = v_item.id
    AND v.workshop_id = p_workshop_id
    AND v.version_number = v_item.pending_version;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RDA_KNOWLEDGE_VERSION_MISSING', 'error', 'Versão pendente não encontrada.');
  END IF;

  v_prior := v_item.approved_version;
  v_new := v_item.pending_version;
  v_meta := COALESCE(v_ver.structured_data -> '_proposedMeta', '{}'::jsonb);

  UPDATE public.rda_knowledge_items
  SET approved_version = v_new,
      pending_version = NULL,
      lifecycle = 'approved',
      title = COALESCE(NULLIF(v_meta->>'title', ''), title),
      category = COALESCE(NULLIF(v_meta->>'category', ''), category),
      visibility = COALESCE(NULLIF(v_meta->>'visibility', ''), visibility),
      approved_by_user_id = p_actor_user_id,
      approved_at = v_now,
      retired_at = NULL,
      updated_at = v_now
  WHERE id = v_item.id AND workshop_id = p_workshop_id
  RETURNING * INTO v_item;

  INSERT INTO public.rda_knowledge_audit (
    workshop_id, knowledge_item_id, event_type, prior_version, new_version,
    actor_user_id, actor_label, reason, metadata, created_at
  ) VALUES (
    p_workshop_id, v_item.id, 'approved', v_prior, v_new,
    p_actor_user_id, p_actor_label, v_reason,
    jsonb_build_object('knowledgeKey', v_item.knowledge_key),
    v_now
  );

  RETURN jsonb_build_object('ok', true, 'item', to_jsonb(v_item));
END;
$$;

-- ---------------------------------------------------------------------------
-- 5) Retire
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rda_knowledge_retire(
  p_workshop_id UUID,
  p_knowledge_item_id UUID,
  p_actor_user_id UUID DEFAULT NULL,
  p_actor_label TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_expected_updated_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.rda_knowledge_items%ROWTYPE;
  v_now TIMESTAMPTZ := now();
  v_reason TEXT := COALESCE(NULLIF(trim(COALESCE(p_reason, '')), ''), 'Retirada de uso');
  v_approved INT;
BEGIN
  SELECT * INTO v_item
  FROM public.rda_knowledge_items
  WHERE id = p_knowledge_item_id AND workshop_id = p_workshop_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RDA_KNOWLEDGE_NOT_FOUND', 'error', 'Conhecimento não encontrado.');
  END IF;
  IF v_item.lifecycle = 'purged' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RDA_KNOWLEDGE_PURGED', 'error', 'Já excluído.');
  END IF;
  IF p_expected_updated_at IS NOT NULL AND v_item.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RDA_KNOWLEDGE_CONFLICT', 'error', 'Conflito de concorrência.', 'item', to_jsonb(v_item));
  END IF;
  IF v_item.lifecycle = 'retired' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'item', to_jsonb(v_item));
  END IF;

  v_approved := v_item.approved_version;
  UPDATE public.rda_knowledge_items
  SET lifecycle = 'retired',
      retired_at = v_now,
      pending_version = NULL,
      updated_at = v_now
  WHERE id = v_item.id AND workshop_id = p_workshop_id
  RETURNING * INTO v_item;

  INSERT INTO public.rda_knowledge_audit (
    workshop_id, knowledge_item_id, event_type, prior_version, new_version,
    actor_user_id, actor_label, reason, metadata, created_at
  ) VALUES (
    p_workshop_id, v_item.id, 'retired', v_approved, v_approved,
    p_actor_user_id, p_actor_label, v_reason,
    jsonb_build_object('knowledgeKey', v_item.knowledge_key),
    v_now
  );

  RETURN jsonb_build_object('ok', true, 'item', to_jsonb(v_item));
END;
$$;

-- ---------------------------------------------------------------------------
-- 6) Restore
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rda_knowledge_restore(
  p_workshop_id UUID,
  p_knowledge_item_id UUID,
  p_from_version INTEGER DEFAULT NULL,
  p_actor_user_id UUID DEFAULT NULL,
  p_actor_label TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_expected_updated_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.rda_knowledge_items%ROWTYPE;
  v_ver public.rda_knowledge_versions%ROWTYPE;
  v_now TIMESTAMPTZ := now();
  v_target INT;
  v_next INT;
  v_reason TEXT := COALESCE(NULLIF(trim(COALESCE(p_reason, '')), ''), 'Restauração controlada');
BEGIN
  SELECT * INTO v_item
  FROM public.rda_knowledge_items
  WHERE id = p_knowledge_item_id AND workshop_id = p_workshop_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RDA_KNOWLEDGE_NOT_FOUND', 'error', 'Conhecimento não encontrado.');
  END IF;
  IF v_item.lifecycle = 'purged' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RDA_KNOWLEDGE_PURGED', 'error', 'Excluído definitivamente — não restaura.');
  END IF;
  IF p_expected_updated_at IS NOT NULL AND v_item.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RDA_KNOWLEDGE_CONFLICT', 'error', 'Conflito de concorrência.', 'item', to_jsonb(v_item));
  END IF;

  IF p_from_version IS NULL THEN
    IF v_item.lifecycle <> 'retired' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'RDA_KNOWLEDGE_NOT_RETIRED', 'error', 'Só reabre lifecycle a partir de retired.');
    END IF;
    IF v_item.approved_version <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'RDA_KNOWLEDGE_NO_APPROVED', 'error', 'Não há versão aprovada.');
    END IF;
    UPDATE public.rda_knowledge_items
    SET lifecycle = 'approved', retired_at = NULL, updated_at = v_now
    WHERE id = v_item.id AND workshop_id = p_workshop_id
    RETURNING * INTO v_item;

    INSERT INTO public.rda_knowledge_audit (
      workshop_id, knowledge_item_id, event_type, prior_version, new_version,
      actor_user_id, actor_label, reason, metadata, created_at
    ) VALUES (
      p_workshop_id, v_item.id, 'restored', v_item.approved_version, v_item.approved_version,
      p_actor_user_id, p_actor_label, v_reason,
      jsonb_build_object('knowledgeKey', v_item.knowledge_key, 'mode', 'unretire'),
      v_now
    );
    RETURN jsonb_build_object('ok', true, 'item', to_jsonb(v_item), 'mode', 'unretire');
  END IF;

  v_target := p_from_version;
  SELECT * INTO v_ver
  FROM public.rda_knowledge_versions
  WHERE knowledge_item_id = v_item.id AND workshop_id = p_workshop_id AND version_number = v_target;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RDA_KNOWLEDGE_VERSION_MISSING', 'error', 'Versão histórica não encontrada.');
  END IF;
  IF v_item.pending_version IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RDA_KNOWLEDGE_PENDING_EXISTS', 'error', 'Já existe proposta pendente.');
  END IF;

  v_next := GREATEST(COALESCE(v_item.current_version, 0), 0) + 1;
  INSERT INTO public.rda_knowledge_versions (
    workshop_id, knowledge_item_id, version_number, content, structured_data,
    provenance, change_reason, proposed_by_user_id, proposed_by_label, created_at
  ) VALUES (
    p_workshop_id, v_item.id, v_next, v_ver.content,
    COALESCE(v_ver.structured_data, '{}'::jsonb),
    COALESCE(v_ver.provenance, '{}'::jsonb) || jsonb_build_object('restoredFromVersion', v_target),
    v_reason || ' (a partir da v' || v_target::text || ')',
    p_actor_user_id, p_actor_label, v_now
  );

  -- Não altera metadados da regra aprovada; só abre pending
  UPDATE public.rda_knowledge_items
  SET current_version = v_next,
      pending_version = v_next,
      lifecycle = 'pending_approval',
      retired_at = NULL,
      updated_at = v_now
  WHERE id = v_item.id AND workshop_id = p_workshop_id
  RETURNING * INTO v_item;

  INSERT INTO public.rda_knowledge_audit (
    workshop_id, knowledge_item_id, event_type, prior_version, new_version,
    actor_user_id, actor_label, reason, metadata, created_at
  ) VALUES (
    p_workshop_id, v_item.id, 'version_proposed', v_target, v_next,
    p_actor_user_id, p_actor_label, v_reason,
    jsonb_build_object('knowledgeKey', v_item.knowledge_key, 'mode', 'from_version', 'restoredFrom', v_target),
    v_now
  );

  RETURN jsonb_build_object('ok', true, 'item', to_jsonb(v_item), 'mode', 'from_version', 'newVersion', v_next);
END;
$$;

-- ---------------------------------------------------------------------------
-- 7) Reject pending
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rda_knowledge_reject_pending(
  p_workshop_id UUID,
  p_knowledge_item_id UUID,
  p_actor_user_id UUID DEFAULT NULL,
  p_actor_label TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_expected_updated_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.rda_knowledge_items%ROWTYPE;
  v_now TIMESTAMPTZ := now();
  v_pending INT;
  v_reason TEXT := COALESCE(NULLIF(trim(COALESCE(p_reason, '')), ''), 'Proposta rejeitada');
BEGIN
  SELECT * INTO v_item
  FROM public.rda_knowledge_items
  WHERE id = p_knowledge_item_id AND workshop_id = p_workshop_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RDA_KNOWLEDGE_NOT_FOUND', 'error', 'Conhecimento não encontrado.');
  END IF;
  IF p_expected_updated_at IS NOT NULL AND v_item.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RDA_KNOWLEDGE_CONFLICT', 'error', 'Conflito de concorrência.', 'item', to_jsonb(v_item));
  END IF;
  IF v_item.pending_version IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RDA_KNOWLEDGE_NO_PENDING', 'error', 'Não há proposta pendente.');
  END IF;

  v_pending := v_item.pending_version;
  UPDATE public.rda_knowledge_items
  SET pending_version = NULL,
      lifecycle = CASE WHEN approved_version > 0 THEN 'approved' ELSE 'draft' END,
      updated_at = v_now
  WHERE id = v_item.id AND workshop_id = p_workshop_id
  RETURNING * INTO v_item;

  INSERT INTO public.rda_knowledge_audit (
    workshop_id, knowledge_item_id, event_type, prior_version, new_version,
    actor_user_id, actor_label, reason, metadata, created_at
  ) VALUES (
    p_workshop_id, v_item.id, 'rejected', v_pending, v_item.approved_version,
    p_actor_user_id, p_actor_label, v_reason,
    jsonb_build_object('knowledgeKey', v_item.knowledge_key, 'rejectedVersion', v_pending),
    v_now
  );

  RETURN jsonb_build_object('ok', true, 'item', to_jsonb(v_item));
END;
$$;

-- ---------------------------------------------------------------------------
-- 8) Purge supervisionado (tombstone)
--    Sem session_replication_role. Sem DELETE em versions/audit (imutáveis).
--    knowledge_item_id permanece NOT NULL. Recibo sem título/conteúdo.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rda_knowledge_purge(
  p_workshop_id UUID,
  p_knowledge_item_id UUID,
  p_actor_user_id UUID DEFAULT NULL,
  p_actor_label TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_confirm_key TEXT DEFAULT NULL,
  p_expected_updated_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.rda_knowledge_items%ROWTYPE;
  v_now TIMESTAMPTZ := now();
  v_key TEXT;
  v_reason TEXT := NULLIF(trim(COALESCE(p_reason, '')), '');
  v_tombstone_key TEXT;
BEGIN
  SELECT * INTO v_item
  FROM public.rda_knowledge_items
  WHERE id = p_knowledge_item_id AND workshop_id = p_workshop_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RDA_KNOWLEDGE_NOT_FOUND', 'error', 'Conhecimento não encontrado.');
  END IF;
  IF p_expected_updated_at IS NOT NULL AND v_item.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RDA_KNOWLEDGE_CONFLICT', 'error', 'Conflito de concorrência.');
  END IF;
  IF v_item.lifecycle = 'purged' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'purged', true, 'itemId', v_item.id);
  END IF;
  IF v_item.lifecycle <> 'retired' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RDA_KNOWLEDGE_PURGE_REQUIRES_RETIRE', 'error', 'Retire o conhecimento antes da exclusão definitiva.');
  END IF;
  IF trim(COALESCE(p_confirm_key, '')) IS DISTINCT FROM v_item.knowledge_key THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RDA_KNOWLEDGE_PURGE_CONFIRM', 'error', 'Confirme informando o knowledge_key exato.');
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 5 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RDA_KNOWLEDGE_PURGE_REASON', 'error', 'Motivo da exclusão é obrigatório.');
  END IF;

  v_key := v_item.knowledge_key;
  v_tombstone_key := 'purged_' || replace(v_item.id::text, '-', '');

  INSERT INTO public.rda_knowledge_audit (
    workshop_id, knowledge_item_id, event_type, prior_version, new_version,
    actor_user_id, actor_label, reason, metadata, created_at
  ) VALUES (
    p_workshop_id, v_item.id, 'purge_requested', v_item.approved_version, NULL,
    p_actor_user_id, p_actor_label, v_reason,
    jsonb_build_object('itemId', v_item.id),
    v_now
  );

  -- Tombstone: libera knowledge_key, redige título, zera versões oficiais.
  -- Conteúdo histórico permanece nas versões imutáveis, mas nunca é servido (lifecycle=purged).
  UPDATE public.rda_knowledge_items
  SET knowledge_key = v_tombstone_key,
      title = '[excluído]',
      category = 'purged',
      visibility = 'restricted',
      lifecycle = 'purged',
      approved_version = 0,
      pending_version = NULL,
      current_version = current_version,
      approved_by_user_id = NULL,
      approved_at = NULL,
      retired_at = v_now,
      updated_at = v_now
  WHERE id = v_item.id AND workshop_id = p_workshop_id
  RETURNING * INTO v_item;

  -- Recibo final: SEM título, SEM conteúdo, SEM knowledge_key original
  INSERT INTO public.rda_knowledge_audit (
    workshop_id, knowledge_item_id, event_type, prior_version, new_version,
    actor_user_id, actor_label, reason, metadata, created_at
  ) VALUES (
    p_workshop_id, v_item.id, 'purged', NULL, NULL,
    p_actor_user_id, p_actor_label, left(v_reason, 500),
    jsonb_build_object('itemId', p_knowledge_item_id, 'tombstone', true),
    v_now
  );

  RETURN jsonb_build_object(
    'ok', true,
    'purged', true,
    'itemId', p_knowledge_item_id,
    'tombstone', true
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 9) Privileges — só service_role
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'rda_knowledge_propose(uuid,text,text,text,text,text,text,jsonb,jsonb,uuid,text,boolean,timestamptz)',
    'rda_knowledge_approve(uuid,uuid,uuid,text,text,timestamptz)',
    'rda_knowledge_retire(uuid,uuid,uuid,text,text,timestamptz)',
    'rda_knowledge_restore(uuid,uuid,integer,uuid,text,text,timestamptz)',
    'rda_knowledge_reject_pending(uuid,uuid,uuid,text,text,timestamptz)',
    'rda_knowledge_purge(uuid,uuid,uuid,text,text,text,timestamptz)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM anon', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
  END LOOP;
END $$;
