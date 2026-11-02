-- Seed FICTÍCIO para homologação RDA (sem PII real).
-- Pré-requisitos neste projeto de TESTE:
--   • Schema base (workshops, workshop_system_users)
--   • Migrations RDA 20261101220000 … 20261101260000 aplicadas
--
-- Senha de todos os usuários fictícios: homolog123
-- Hash PBKDF2-SHA256 100k / 64 bytes (mesmo algoritmo do apiApp).

INSERT INTO public.workshops (id, name)
VALUES ('11111111-1111-4111-8111-111111111111', 'Oficina Homologação RDA')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.workshop_system_users (
  id, workshop_id, username, password_hash, display_name, is_technician, permissions
) VALUES
  (
    '22222222-2222-4222-8222-222222222201',
    '11111111-1111-4111-8111-111111111111',
    'homolog_tech1',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:289c77170cc53c343fc936833158f56c2494d2342e4f146349800e43e371591d363593dfecc80c9cff580fae40fcbc73bb7da62598b25a3610abe58000c438ed',
    'Homolog Tech Um',
    true,
    '{}'::jsonb
  ),
  (
    '22222222-2222-4222-8222-222222222202',
    '11111111-1111-4111-8111-111111111111',
    'homolog_tech2',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:289c77170cc53c343fc936833158f56c2494d2342e4f146349800e43e371591d363593dfecc80c9cff580fae40fcbc73bb7da62598b25a3610abe58000c438ed',
    'Homolog Tech Dois',
    true,
    '{}'::jsonb
  ),
  (
    '22222222-2222-4222-8222-222222222203',
    '11111111-1111-4111-8111-111111111111',
    'homolog_gerente',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:289c77170cc53c343fc936833158f56c2494d2342e4f146349800e43e371591d363593dfecc80c9cff580fae40fcbc73bb7da62598b25a3610abe58000c438ed',
    'Homolog Gerente Radar',
    false,
    '{"access_radar_qualidade": true}'::jsonb
  ),
  (
    '22222222-2222-4222-8222-222222222204',
    '11111111-1111-4111-8111-111111111111',
    'homolog_patio',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:289c77170cc53c343fc936833158f56c2494d2342e4f146349800e43e371591d363593dfecc80c9cff580fae40fcbc73bb7da62598b25a3610abe58000c438ed',
    'Homolog Usuario Patio',
    false,
    '{"access_patio": true}'::jsonb
  )
ON CONFLICT (id) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  display_name = EXCLUDED.display_name,
  is_technician = EXCLUDED.is_technician,
  permissions = EXCLUDED.permissions;

-- Criar OS-A e OS-B pela API/UI do app apontando para este WORKSHOP_ID
-- (schema de service_orders é amplo; não forçamos INSERT aqui).
