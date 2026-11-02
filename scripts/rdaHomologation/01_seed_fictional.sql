-- Seed FICTÍCIO para homologação RDA (sem PII real).
-- Pré-requisitos:
--   1) 00_bootstrap_core_schema.sql
--   2) Migrations RDA 20261101220000 … 20261101260000
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

-- Cliente fictício
INSERT INTO public.customers (id, workshop_id, name, phone, city)
VALUES (
  '44444444-4444-4444-8444-444444444401',
  '11111111-1111-4111-8111-111111111111',
  'Cliente Homologação',
  '11999990000',
  'São Paulo'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  phone = EXCLUDED.phone;

-- OS-A e OS-B (IDs fixos do roteiro 03)
INSERT INTO public.service_orders (
  id, workshop_id, customer_id, os_number, vehicle_model, plate,
  issue_description, status, order_type
) VALUES
  (
    '33333333-3333-4333-8333-333333333301',
    '11111111-1111-4111-8111-111111111111',
    '44444444-4444-4444-8444-444444444401',
    1,
    'Veículo Homolog A',
    'RDA1H01',
    'Queixa fictícia A — teste de cronômetro',
    'EM_SERVICO',
    'vehicle'
  ),
  (
    '33333333-3333-4333-8333-333333333302',
    '11111111-1111-4111-8111-111111111111',
    '44444444-4444-4444-8444-444444444401',
    2,
    'Veículo Homolog B',
    'RDA1H02',
    'Queixa fictícia B — teste de sessão ativa',
    'EM_SERVICO',
    'vehicle'
  )
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  issue_description = EXCLUDED.issue_description;

INSERT INTO public.workshop_os_counters (workshop_id, next_os_number)
VALUES ('11111111-1111-4111-8111-111111111111', 3)
ON CONFLICT (workshop_id) DO UPDATE
SET next_os_number = GREATEST(public.workshop_os_counters.next_os_number, EXCLUDED.next_os_number);

-- Orçamento fictício opcional (vínculo budget ↔ OS para testes de start com budgetId)
INSERT INTO public.budgets (
  id, workshop_id, service_order_id, card_name, diagnosis, observations
) VALUES (
  '55555555-5555-4555-8555-555555555501',
  '11111111-1111-4111-8111-111111111111',
  '33333333-3333-4333-8333-333333333301',
  'OS Homolog A',
  'Diagnóstico fictício',
  'Orçamento só para teste de FK/workshop'
)
ON CONFLICT (id) DO NOTHING;
