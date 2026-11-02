-- =============================================================================
-- Patch UI + senhas de PREVIEW (homologação)
-- Rodar no SQL Editor do projeto rei-do-abs-homologacao DEPOIS do seed.
-- =============================================================================
-- 1) Libera abas necessárias na interface:
--    técnicos → home + pátio (cronômetro na OS)
--    gerente  → home + radar (avaliações)
-- 2) ANTES de publicar URL de preview: troque as senhas.
--    NÃO use homolog123 em URL compartilhada.
--
-- Gerar hash (local, nunca commitar a senha):
--   node scripts/rdaHomologation/printPasswordHash.mjs 'SUA_SENHA_FORTE'
-- Cole o resultado no lugar de :HASH_ABAIXO (formato salt:hex).
-- =============================================================================

-- Permissões de UI (idempotente)
UPDATE public.workshop_system_users
SET permissions = '{"access_home": true, "access_patio": true}'::jsonb,
    updated_at = now()
WHERE workshop_id = '11111111-1111-4111-8111-111111111111'
  AND username IN ('homolog_tech1', 'homolog_tech2');

UPDATE public.workshop_system_users
SET permissions = '{"access_home": true, "access_radar_qualidade": true}'::jsonb,
    updated_at = now()
WHERE workshop_id = '11111111-1111-4111-8111-111111111111'
  AND username = 'homolog_gerente';

UPDATE public.workshop_system_users
SET permissions = '{"access_home": true, "access_patio": true}'::jsonb,
    updated_at = now()
WHERE workshop_id = '11111111-1111-4111-8111-111111111111'
  AND username = 'homolog_patio';

-- ---------------------------------------------------------------------------
-- Senhas de preview (OBRIGATÓRIO antes de abrir URL pública/protegida)
-- Descomente e substitua :HASH_ABAIXO pelo output do printPasswordHash.mjs
-- ---------------------------------------------------------------------------
/*
UPDATE public.workshop_system_users
SET password_hash = ':HASH_ABAIXO',
    updated_at = now()
WHERE workshop_id = '11111111-1111-4111-8111-111111111111'
  AND username IN (
    'homolog_tech1', 'homolog_tech2', 'homolog_gerente', 'homolog_patio'
  );
*/

-- Conferência
SELECT username, permissions, left(password_hash, 40) AS hash_prefix
FROM public.workshop_system_users
WHERE workshop_id = '11111111-1111-4111-8111-111111111111'
ORDER BY username;
