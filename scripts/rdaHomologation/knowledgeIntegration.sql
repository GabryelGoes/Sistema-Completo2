-- Integração memória RDA sobre schema EXATO de produção + ops.
-- Esperado: rodar após knowledgeProdBaseline.sql + 20261106020000_...ops.sql
-- Exit via RAISE EXCEPTION se falhar.

DO $$
DECLARE
  v_ws UUID;
  v_ws2 UUID;
  v_res jsonb;
  v_item UUID;
  v_updated TIMESTAMPTZ;
  v_approved INT;
  v_pending INT;
  v_title TEXT;
  v_cnt INT;
  v_ev TEXT;
BEGIN
  INSERT INTO public.workshops (name) VALUES ('Oficina A') RETURNING id INTO v_ws;
  INSERT INTO public.workshops (name) VALUES ('Oficina B') RETURNING id INTO v_ws2;

  -- propose
  v_res := public.rda_knowledge_propose(
    v_ws, 'espera_pecas_2d', 'Sinalizar espera de peças',
    'managerial_guidance', 'workshop',
    'Sempre sinalizar veículo aguardando peças por mais de 2 dias.',
    'Orientação inicial', '{}'::jsonb, '{"source":"test"}'::jsonb,
    NULL, 'tester', true, NULL
  );
  IF v_res->>'ok' <> 'true' THEN RAISE EXCEPTION 'propose failed: %', v_res; END IF;
  v_item := (v_res->'item'->>'id')::uuid;
  IF (v_res->'item'->>'lifecycle') <> 'pending_approval' THEN
    RAISE EXCEPTION 'expected pending_approval';
  END IF;

  -- change_reason NOT NULL
  SELECT count(*) INTO v_cnt FROM rda_knowledge_versions
  WHERE knowledge_item_id = v_item AND change_reason IS NULL;
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'change_reason null'; END IF;

  -- event_type allowed
  SELECT event_type INTO v_ev FROM rda_knowledge_audit
  WHERE knowledge_item_id = v_item ORDER BY created_at DESC LIMIT 1;
  IF v_ev <> 'version_proposed' THEN RAISE EXCEPTION 'bad event %', v_ev; END IF;

  -- approve
  SELECT updated_at INTO v_updated FROM rda_knowledge_items WHERE id = v_item;
  v_res := public.rda_knowledge_approve(v_ws, v_item, NULL, 'manager', 'ok', v_updated);
  IF v_res->>'ok' <> 'true' THEN RAISE EXCEPTION 'approve failed: %', v_res; END IF;
  IF (v_res->'item'->>'approved_version')::int <> 1 THEN RAISE EXCEPTION 'approved_version'; END IF;

  -- revise: metadata of approved title must stay until approve
  SELECT updated_at, title INTO v_updated, v_title FROM rda_knowledge_items WHERE id = v_item;
  v_res := public.rda_knowledge_propose(
    v_ws, 'espera_pecas_2d', 'TÍTULO NOVO NÃO APLICAR AINDA',
    'managerial_guidance', 'management',
    'Sempre sinalizar após 1 dia.',
    'Revisão', '{}'::jsonb, '{}'::jsonb,
    NULL, 'tester', true, v_updated
  );
  IF v_res->>'ok' <> 'true' THEN RAISE EXCEPTION 'revise failed: %', v_res; END IF;
  IF (v_res->'item'->>'title') <> v_title THEN
    RAISE EXCEPTION 'propose altered approved title silently';
  END IF;
  IF (v_res->'item'->>'visibility') <> 'workshop' THEN
    RAISE EXCEPTION 'propose altered approved visibility silently';
  END IF;
  IF (v_res->'item'->>'approved_version')::int <> 1 THEN
    RAISE EXCEPTION 'approved_version changed on propose';
  END IF;
  IF (v_res->'item'->>'pending_version')::int <> 2 THEN
    RAISE EXCEPTION 'pending_version expected 2';
  END IF;

  -- concurrency
  v_res := public.rda_knowledge_approve(v_ws, v_item, NULL, 'm', 'x', '2000-01-01T00:00:00Z'::timestamptz);
  IF v_res->>'code' <> 'RDA_KNOWLEDGE_CONFLICT' THEN
    RAISE EXCEPTION 'expected conflict, got %', v_res;
  END IF;

  SELECT updated_at INTO v_updated FROM rda_knowledge_items WHERE id = v_item;
  v_res := public.rda_knowledge_reject_pending(v_ws, v_item, NULL, 'm', 'não', v_updated);
  IF v_res->>'ok' <> 'true' THEN RAISE EXCEPTION 'reject failed %', v_res; END IF;
  IF (v_res->'item'->>'lifecycle') <> 'approved' THEN RAISE EXCEPTION 'reject lifecycle'; END IF;
  IF (v_res->'item'->>'pending_version') IS NOT NULL THEN RAISE EXCEPTION 'pending not cleared'; END IF;

  -- second revise + approve with meta apply
  SELECT updated_at INTO v_updated FROM rda_knowledge_items WHERE id = v_item;
  v_res := public.rda_knowledge_propose(
    v_ws, 'espera_pecas_2d', 'Regra atualizada',
    'managerial_guidance', 'management',
    'Sempre sinalizar após 1 dia.',
    'Revisão 2', '{}'::jsonb, '{}'::jsonb,
    NULL, 'tester', true, v_updated
  );
  SELECT updated_at INTO v_updated FROM rda_knowledge_items WHERE id = v_item;
  v_res := public.rda_knowledge_approve(v_ws, v_item, NULL, 'm', 'aprovado', v_updated);
  IF (v_res->'item'->>'title') <> 'Regra atualizada' THEN
    RAISE EXCEPTION 'approve did not apply proposed title';
  END IF;
  IF (v_res->'item'->>'visibility') <> 'management' THEN
    RAISE EXCEPTION 'approve did not apply visibility';
  END IF;
  IF (v_res->'item'->>'approved_version')::int <> 3 THEN
    RAISE EXCEPTION 'approved_version expected 3 got %', v_res->'item'->>'approved_version';
  END IF;

  -- workshop isolation
  v_res := public.rda_knowledge_propose(
    v_ws2, 'espera_pecas_2d', 'Outra oficina',
    'operational_rule', 'workshop',
    'Conteúdo B',
    'oficina B', '{}'::jsonb, '{}'::jsonb,
    NULL, 'b', true, NULL
  );
  IF v_res->>'ok' <> 'true' THEN RAISE EXCEPTION 'ws2 propose %', v_res; END IF;
  SELECT count(*) INTO v_cnt FROM rda_knowledge_items WHERE workshop_id = v_ws AND knowledge_key = 'espera_pecas_2d';
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'cross workshop collision'; END IF;

  -- retire / restore / purge
  SELECT id, updated_at INTO v_item, v_updated FROM rda_knowledge_items
  WHERE workshop_id = v_ws AND knowledge_key = 'espera_pecas_2d';
  v_res := public.rda_knowledge_retire(v_ws, v_item, NULL, 'm', 'retirar', v_updated);
  IF v_res->>'ok' <> 'true' THEN RAISE EXCEPTION 'retire %', v_res; END IF;

  SELECT updated_at INTO v_updated FROM rda_knowledge_items WHERE id = v_item;
  v_res := public.rda_knowledge_restore(v_ws, v_item, NULL, NULL, 'm', 'reativar', v_updated);
  IF v_res->>'ok' <> 'true' THEN RAISE EXCEPTION 'restore %', v_res; END IF;

  SELECT updated_at INTO v_updated FROM rda_knowledge_items WHERE id = v_item;
  v_res := public.rda_knowledge_retire(v_ws, v_item, NULL, 'm', 'retirar2', v_updated);
  SELECT updated_at, knowledge_key INTO v_updated, v_title FROM rda_knowledge_items WHERE id = v_item;
  v_res := public.rda_knowledge_purge(
    v_ws, v_item, NULL, 'm', 'exclusão homologada ok', v_title, v_updated
  );
  IF v_res->>'ok' <> 'true' THEN RAISE EXCEPTION 'purge %', v_res; END IF;
  IF (SELECT lifecycle FROM rda_knowledge_items WHERE id = v_item) <> 'purged' THEN
    RAISE EXCEPTION 'purge lifecycle';
  END IF;
  -- recibo sem título/conteúdo
  IF EXISTS (
    SELECT 1 FROM rda_knowledge_audit
    WHERE knowledge_item_id = v_item AND event_type = 'purged'
      AND (metadata ? 'purgedTitle' OR metadata ? 'content' OR metadata ? 'purgedKnowledgeKey')
  ) THEN
    RAISE EXCEPTION 'purge receipt has sensitive fields';
  END IF;
  -- knowledge_item_id NOT NULL
  IF EXISTS (
    SELECT 1 FROM rda_knowledge_audit WHERE knowledge_item_id IS NULL
  ) THEN
    RAISE EXCEPTION 'audit knowledge_item_id null';
  END IF;
  -- versions still immutable (no delete)
  SELECT count(*) INTO v_cnt FROM rda_knowledge_versions WHERE knowledge_item_id = v_item;
  IF v_cnt < 1 THEN RAISE EXCEPTION 'versions should remain (tombstone purge)'; END IF;

  -- propose after purge blocked
  v_res := public.rda_knowledge_propose(
    v_ws, (SELECT knowledge_key FROM rda_knowledge_items WHERE id = v_item),
    'x', 'operational_rule', 'workshop', 'y', 'z', '{}'::jsonb, '{}'::jsonb,
    NULL, 't', true, NULL
  );
  IF v_res->>'code' <> 'RDA_KNOWLEDGE_PURGED' THEN
    RAISE EXCEPTION 'expected purged block %', v_res;
  END IF;

  RAISE NOTICE 'OK knowledge integration suite passed';
END $$;
