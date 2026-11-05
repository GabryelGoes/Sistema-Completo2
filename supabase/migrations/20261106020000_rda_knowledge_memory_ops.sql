-- RDA Memória Permanente — operações (complementar ao schema já em produção).
-- NÃO recria tabelas. NÃO aplica automaticamente.
-- - Separa versão aprovada vigente × última proposta (pending).
-- - lifecycle pending_approval.
-- - RPCs transacionais com controle de concorrência (updated_at).
-- - Purge supervisionado respeitando triggers imutáveis.
-- - Retrieval oficial só usa approved_version.

-- ---------------------------------------------------------------------------
-- 1) Colunas de versão aprovada / proposta
-- ---------------------------------------------------------------------------
ALTER TABLE public.rda_knowledge_items
  ADD COLUMN IF NOT EXISTS approved_version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.rda_knowledge_items
  ADD COLUMN IF NOT EXISTS pending_version INTEGER;

DO $$
BEGIN
  ALTER TABLE public.rda_knowledge_items
    DROP CONSTRAINT IF EXISTS rda_knowledge_items_approved_version_check;
  ALTER TABLE public.rda_knowledge_items
    ADD CONSTRAINT rda_knowledge_items_approved_version_check
    CHECK (approved_version >= 0);
EXCEPTION WHEN others THEN
  RAISE NOTICE 'approved_version check: %', SQLERRM;
END $$;

DO $$
BEGIN
  ALTER TABLE public.rda_knowledge_items
    DROP CONSTRAINT IF EXISTS rda_knowledge_items_pending_version_check;
  ALTER TABLE public.rda_knowledge_items
    ADD CONSTRAINT rda_knowledge_items_pending_version_check
    CHECK (pending_version IS NULL OR pending_version > 0);
EXCEPTION WHEN others THEN
  RAISE NOTICE 'pending_version check: %', SQLERRM;
END $$;

-- Expandir lifecycle (produção pode ter só draft/approved/retired)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'rda_knowledge_items'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%lifecycle%'
  LOOP
    EXECUTE format('ALTER TABLE public.rda_knowledge_items DROP CONSTRAINT %I', r.conname);
  END LOOP;
  ALTER TABLE public.rda_knowledge_items
    ADD CONSTRAINT rda_knowledge_items_lifecycle_check
    CHECK (lifecycle IN ('draft', 'pending_approval', 'approved', 'retired'));
EXCEPTION WHEN others THEN
  RAISE NOTICE 'lifecycle check: %', SQLERRM;
END $$;

-- Backfill seguro (tabelas vazias em prod; idempotente se houver dados)
UPDATE public.rda_knowledge_items
SET approved_version = CASE
      WHEN lifecycle = 'approved' AND current_version > 0 THEN current_version
      ELSE COALESCE(approved_version, 0)
    END,
    pending_version = CASE
      WHEN lifecycle IN ('draft', 'pending_approval') AND current_version > 0
           AND COALESCE(approved_version, 0) = 0
        THEN current_version
      ELSE pending_version
    END
WHERE TRUE;

COMMENT ON COLUMN public.rda_knowledge_items.approved_version IS
  'Número da versão oficial em uso (0 = nenhuma). Propostas não sobrescrevem este valor até aprovação.';
COMMENT ON COLUMN public.rda_knowledge_items.pending_version IS
  'Número da versão aguardando aprovação (NULL se não houver).';
COMMENT ON COLUMN public.rda_knowledge_items.current_version IS
  'Maior version_number existente (tip), aprovada ou não.';

-- FK audit: preferir SET NULL para purge receipt sem conteúdo
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'rda_knowledge_audit'
      AND c.contype = 'f'
      AND pg_get_constraintdef(c.oid) ILIKE '%knowledge_item_id%'
  LOOP
    EXECUTE format('ALTER TABLE public.rda_knowledge_audit DROP CONSTRAINT %I', r.conname);
  END LOOP;
  ALTER TABLE public.rda_knowledge_audit
    ADD CONSTRAINT rda_knowledge_audit_knowledge_item_id_fkey
    FOREIGN KEY (knowledge_item_id)
    REFERENCES public.rda_knowledge_items(id)
    ON DELETE SET NULL;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'audit FK SET NULL: %', SQLERRM;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rda_knowledge_assert_workshop_match(
  p_workshop_id UUID,
  p_item_workshop UUID
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_item_workshop IS NULL OR p_item_workshop IS DISTINCT FROM p_workshop_id THEN
    RAISE EXCEPTION 'RDA_KNOWLEDGE_WORKSHOP_MISMATCH'
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) Propose / create (nova chave ou nova versão pendente)
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
  v_cat TEXT := NULLIF(trim(COALESCE(p_category, '')), '');
  v_vis TEXT := lower(trim(COALESCE(p_visibility, 'workshop')));
  v_item public.rda_knowledge_items%ROWTYPE;
  v_next INT;
  v_now TIMESTAMPTZ := now();
  v_lifecycle TEXT;
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
  v_cat := COALESCE(v_cat, 'operational_rule');

  SELECT * INTO v_item
  FROM public.rda_knowledge_items
  WHERE workshop_id = p_workshop_id AND knowledge_key = v_key
  FOR UPDATE;

  IF NOT FOUND THEN
    v_lifecycle := CASE WHEN p_submit_for_approval THEN 'pending_approval' ELSE 'draft' END;
    INSERT INTO public.rda_knowledge_items (
      workshop_id, knowledge_key, title, category, visibility, lifecycle,
      current_version, approved_version, pending_version,
      created_by_user_id, created_at, updated_at
    ) VALUES (
      p_workshop_id, v_key, v_title, v_cat, v_vis, v_lifecycle,
      1, 0,
      CASE WHEN p_submit_for_approval THEN 1 ELSE NULL END,
      p_actor_user_id, v_now, v_now
    )
    RETURNING * INTO v_item;

    INSERT INTO public.rda_knowledge_versions (
      workshop_id, knowledge_item_id, version_number, content, structured_data,
      provenance, change_reason, proposed_by_user_id, proposed_by_label, created_at
    ) VALUES (
      p_workshop_id, v_item.id, 1, v_content, COALESCE(p_structured_data, '{}'::jsonb),
      COALESCE(p_provenance, '{}'::jsonb), p_change_reason, p_actor_user_id, p_actor_label, v_now
    );

    INSERT INTO public.rda_knowledge_audit (
      workshop_id, knowledge_item_id, event_type, prior_version, new_version,
      actor_user_id, actor_label, reason, metadata, created_at
    ) VALUES (
      p_workshop_id, v_item.id,
      CASE WHEN p_submit_for_approval THEN 'proposed' ELSE 'draft_created' END,
      NULL, 1, p_actor_user_id, p_actor_label, p_change_reason,
      jsonb_build_object('knowledgeKey', v_key, 'category', v_cat),
      v_now
    );

    RETURN jsonb_build_object('ok', true, 'created', true, 'item', to_jsonb(v_item));
  END IF;

  -- Item existente: concorrência
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
      'error', 'Já existe uma versão aguardando aprovação. Aprove ou descarte antes de propor outra.',
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
  v_lifecycle := CASE
    WHEN p_submit_for_approval THEN 'pending_approval'
    WHEN v_item.approved_version > 0 THEN v_item.lifecycle
    ELSE 'draft'
  END;

  INSERT INTO public.rda_knowledge_versions (
    workshop_id, knowledge_item_id, version_number, content, structured_data,
    provenance, change_reason, proposed_by_user_id, proposed_by_label, created_at
  ) VALUES (
    p_workshop_id, v_item.id, v_next, v_content, COALESCE(p_structured_data, '{}'::jsonb),
    COALESCE(p_provenance, '{}'::jsonb), p_change_reason, p_actor_user_id, p_actor_label, v_now
  );

  UPDATE public.rda_knowledge_items
  SET title = v_title,
      category = v_cat,
      visibility = v_vis,
      current_version = v_next,
      pending_version = CASE WHEN p_submit_for_approval THEN v_next ELSE pending_version END,
      lifecycle = CASE
        WHEN p_submit_for_approval THEN 'pending_approval'
        WHEN approved_version > 0 THEN lifecycle
        ELSE 'draft'
      END,
      updated_at = v_now
  WHERE id = v_item.id AND workshop_id = p_workshop_id
  RETURNING * INTO v_item;

  INSERT INTO public.rda_knowledge_audit (
    workshop_id, knowledge_item_id, event_type, prior_version, new_version,
    actor_user_id, actor_label, reason, metadata, created_at
  ) VALUES (
    p_workshop_id, v_item.id,
    CASE WHEN p_submit_for_approval THEN 'proposed' ELSE 'draft_revised' END,
    v_item.approved_version, v_next, p_actor_user_id, p_actor_label, p_change_reason,
    jsonb_build_object('knowledgeKey', v_key),
    v_now
  );

  RETURN jsonb_build_object('ok', true, 'created', false, 'revised', true, 'item', to_jsonb(v_item));
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) Approve pending → torna oficial (não mexe em versões anteriores)
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
  v_now TIMESTAMPTZ := now();
  v_prior INT;
  v_new INT;
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
    RETURN jsonb_build_object('ok', false, 'code', 'RDA_KNOWLEDGE_NO_PENDING', 'error', 'Não há versão aguardando aprovação.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.rda_knowledge_versions v
    WHERE v.knowledge_item_id = v_item.id
      AND v.workshop_id = p_workshop_id
      AND v.version_number = v_item.pending_version
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RDA_KNOWLEDGE_VERSION_MISSING', 'error', 'Versão pendente não encontrada.');
  END IF;

  v_prior := v_item.approved_version;
  v_new := v_item.pending_version;

  UPDATE public.rda_knowledge_items
  SET approved_version = v_new,
      pending_version = NULL,
      lifecycle = 'approved',
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
    p_actor_user_id, p_actor_label, p_reason,
    jsonb_build_object('knowledgeKey', v_item.knowledge_key),
    v_now
  );

  RETURN jsonb_build_object('ok', true, 'item', to_jsonb(v_item));
END;
$$;

-- ---------------------------------------------------------------------------
-- 5) Retire (retirada imediata de uso oficial)
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
  IF v_item.lifecycle = 'retired' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'item', to_jsonb(v_item));
  END IF;

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
    p_workshop_id, v_item.id, 'retired', v_item.approved_version, v_item.approved_version,
    p_actor_user_id, p_actor_label, p_reason,
    jsonb_build_object('knowledgeKey', v_item.knowledge_key),
    v_now
  );

  RETURN jsonb_build_object('ok', true, 'item', to_jsonb(v_item));
END;
$$;

-- ---------------------------------------------------------------------------
-- 6) Restore: reativa retired OU cria proposta a partir de versão histórica
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

  -- Sem from_version: só reabre retired mantendo approved_version
  IF p_from_version IS NULL THEN
    IF v_item.lifecycle <> 'retired' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'RDA_KNOWLEDGE_NOT_RETIRED', 'error', 'Só restaura lifecycle a partir de retired sem from_version.');
    END IF;
    IF v_item.approved_version <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'RDA_KNOWLEDGE_NO_APPROVED', 'error', 'Não há versão aprovada para restaurar.');
    END IF;
    UPDATE public.rda_knowledge_items
    SET lifecycle = 'approved',
        retired_at = NULL,
        updated_at = v_now
    WHERE id = v_item.id AND workshop_id = p_workshop_id
    RETURNING * INTO v_item;

    INSERT INTO public.rda_knowledge_audit (
      workshop_id, knowledge_item_id, event_type, prior_version, new_version,
      actor_user_id, actor_label, reason, metadata, created_at
    ) VALUES (
      p_workshop_id, v_item.id, 'restored', v_item.approved_version, v_item.approved_version,
      p_actor_user_id, p_actor_label, p_reason,
      jsonb_build_object('knowledgeKey', v_item.knowledge_key, 'mode', 'unretire'),
      v_now
    );
    RETURN jsonb_build_object('ok', true, 'item', to_jsonb(v_item), 'mode', 'unretire');
  END IF;

  -- Restaurar conteúdo histórico como NOVA proposta (não sobrescreve aprovada)
  v_target := p_from_version;
  SELECT * INTO v_ver
  FROM public.rda_knowledge_versions
  WHERE knowledge_item_id = v_item.id
    AND workshop_id = p_workshop_id
    AND version_number = v_target;
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
    p_workshop_id, v_item.id, v_next, v_ver.content, v_ver.structured_data,
    COALESCE(v_ver.provenance, '{}'::jsonb) || jsonb_build_object('restoredFromVersion', v_target),
    COALESCE(p_reason, 'Restauração da versão ' || v_target::text),
    p_actor_user_id, p_actor_label, v_now
  );

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
    p_workshop_id, v_item.id, 'restore_proposed', v_target, v_next,
    p_actor_user_id, p_actor_label, p_reason,
    jsonb_build_object('knowledgeKey', v_item.knowledge_key, 'mode', 'from_version'),
    v_now
  );

  RETURN jsonb_build_object('ok', true, 'item', to_jsonb(v_item), 'mode', 'from_version', 'newVersion', v_next);
END;
$$;

-- ---------------------------------------------------------------------------
-- 7) Reject pending (descarta proposta; mantém aprovada)
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
      lifecycle = CASE
        WHEN approved_version > 0 THEN 'approved'
        ELSE 'draft'
      END,
      updated_at = v_now
  WHERE id = v_item.id AND workshop_id = p_workshop_id
  RETURNING * INTO v_item;

  INSERT INTO public.rda_knowledge_audit (
    workshop_id, knowledge_item_id, event_type, prior_version, new_version,
    actor_user_id, actor_label, reason, metadata, created_at
  ) VALUES (
    p_workshop_id, v_item.id, 'rejected', v_pending, v_item.approved_version,
    p_actor_user_id, p_actor_label, p_reason,
    jsonb_build_object('knowledgeKey', v_item.knowledge_key, 'rejectedVersion', v_pending),
    v_now
  );

  RETURN jsonb_build_object('ok', true, 'item', to_jsonb(v_item));
END;
$$;

-- ---------------------------------------------------------------------------
-- 8) Purge supervisionado (REMOVE conteúdo; audit mínimo sem payload sensível)
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
  v_title TEXT;
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
  IF v_item.lifecycle <> 'retired' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RDA_KNOWLEDGE_PURGE_REQUIRES_RETIRE', 'error', 'Retire o conhecimento antes da exclusão definitiva.');
  END IF;
  IF trim(COALESCE(p_confirm_key, '')) IS DISTINCT FROM v_item.knowledge_key THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RDA_KNOWLEDGE_PURGE_CONFIRM', 'error', 'Confirme a exclusão informando o knowledge_key exato.');
  END IF;
  IF length(trim(COALESCE(p_reason, ''))) < 5 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RDA_KNOWLEDGE_PURGE_REASON', 'error', 'Motivo da exclusão é obrigatório.');
  END IF;

  v_key := v_item.knowledge_key;
  v_title := v_item.title;

  -- Desliga imutabilidade só nesta transação (session_replication_role)
  PERFORM set_config('session_replication_role', 'replica', true);

  DELETE FROM public.rda_knowledge_versions
  WHERE knowledge_item_id = v_item.id AND workshop_id = p_workshop_id;

  -- Remove audits detalhados do item (evita retenção de conteúdo em metadata antiga)
  DELETE FROM public.rda_knowledge_audit
  WHERE knowledge_item_id = v_item.id AND workshop_id = p_workshop_id;

  DELETE FROM public.rda_knowledge_items
  WHERE id = v_item.id AND workshop_id = p_workshop_id;

  PERFORM set_config('session_replication_role', 'origin', true);

  -- Receipt sem conteúdo do conhecimento
  INSERT INTO public.rda_knowledge_audit (
    workshop_id, knowledge_item_id, event_type, prior_version, new_version,
    actor_user_id, actor_label, reason, metadata, created_at
  ) VALUES (
    p_workshop_id, NULL, 'purged', NULL, NULL,
    p_actor_user_id, p_actor_label, left(p_reason, 500),
    jsonb_build_object(
      'purgedKnowledgeKey', v_key,
      'purgedTitle', left(v_title, 200),
      'purgedItemId', p_knowledge_item_id
    ),
    v_now
  );

  RETURN jsonb_build_object(
    'ok', true,
    'purged', true,
    'knowledgeKey', v_key,
    'itemId', p_knowledge_item_id
  );
EXCEPTION WHEN others THEN
  PERFORM set_config('session_replication_role', 'origin', true);
  RAISE;
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
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', fn);
      EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM anon', fn);
      EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM authenticated', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE 'RPC ausente no GRANT: %', fn;
    END;
  END LOOP;
END $$;
