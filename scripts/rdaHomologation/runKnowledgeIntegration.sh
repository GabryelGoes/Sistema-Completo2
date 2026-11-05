#!/usr/bin/env bash
# Homologação local: schema EXATO de produção + migration ops + suíte SQL.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DB="${RDA_KNOWLEDGE_HOMOLOG_DB:-rda_knowledge_homolog}"
PSQL=(sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB")

echo "== reset db $DB =="
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$DB' AND pid <> pg_backend_pid();" >/dev/null || true
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $DB;"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE $DB OWNER postgres;"
# roles
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
SQL

echo "== baseline produção =="
"${PSQL[@]}" -f "$ROOT/scripts/rdaHomologation/knowledgeProdBaseline.sql"

echo "== migration ops =="
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20261106020000_rda_knowledge_memory_ops.sql"

echo "== integration suite =="
"${PSQL[@]}" -f "$ROOT/scripts/rdaHomologation/knowledgeIntegration.sql"

echo "RESULTADO: knowledge integration OK"
