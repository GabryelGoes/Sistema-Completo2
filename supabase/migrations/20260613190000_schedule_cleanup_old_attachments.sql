-- Agendamento diário da limpeza de fotos de OS arquivadas/concluídas há +1 ano.
--
-- A exclusão em si é feita pela Edge Function `cleanup-old-attachments`
-- (supabase/functions/cleanup-old-attachments). Aqui apenas agendamos a
-- chamada HTTP diária via pg_cron + pg_net, lendo os segredos do Vault.
--
-- PRÉ-REQUISITOS (rodar UMA vez, com seus valores reais — NÃO versionar as chaves):
--
--   select vault.create_secret('https://SEU_REF.supabase.co', 'cleanup_project_url');
--   select vault.create_secret('SUA_SERVICE_ROLE_KEY',        'cleanup_service_role_key');
--   select vault.create_secret('UM_SEGREDO_FORTE_ALEATORIO',  'cleanup_secret');
--
-- E definir o secret da função (no dashboard ou CLI):
--   supabase secrets set CLEANUP_SECRET=UM_SEGREDO_FORTE_ALEATORIO
--   (deve ser IGUAL ao 'cleanup_secret' do Vault)

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove agendamento anterior (idempotente).
select cron.unschedule('cleanup-old-attachments-daily')
where exists (
  select 1 from cron.job where jobname = 'cleanup-old-attachments-daily'
);

-- Agenda para todo dia às 06:00 UTC (03:00 no horário de Brasília).
select cron.schedule(
  'cleanup-old-attachments-daily',
  '0 6 * * *',
  $$
  select net.http_post(
    url := (
      select decrypted_secret from vault.decrypted_secrets
      where name = 'cleanup_project_url'
    ) || '/functions/v1/cleanup-old-attachments',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'cleanup_service_role_key'
      ),
      'x-cleanup-secret', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'cleanup_secret'
      )
    ),
    body := jsonb_build_object('dryRun', false),
    timeout_milliseconds := 120000
  );
  $$
);
