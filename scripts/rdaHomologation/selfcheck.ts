/**
 * Checagem local do pacote de homologação (sem banco).
 * npm run test:rda-homologation-prep
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd(), "scripts/rdaHomologation");
const migrations = [
  "20261101220000_rda_work_sessions.sql",
  "20261101230000_rda_work_sessions_integrity.sql",
  "20261101240000_rda_work_rpc_privileges.sql",
  "20261101250000_rda_managerial_evaluations.sql",
  "20261101260000_rda_rpc_idempotent_owner_guard.sql",
];

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    passed += 1;
    console.log(`  OK  ${msg}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${msg}`);
  }
}

console.log("RDA homologation pack selfcheck\n");

console.log("1) Arquivos do pacote");
for (const f of [
  "00_GUIA.txt",
  "env.homologation.example",
  "01_seed_fictional.sql",
  "02_verify.sql",
  "03_roteiro_api.txt",
  "04_criterios_liberacao.txt",
]) {
  assert(existsSync(join(root, f)), f);
}

console.log("\n2) Migrations RDA na ordem");
for (const m of migrations) {
  assert(existsSync(join(process.cwd(), "supabase/migrations", m)), m);
}

console.log("\n3) Guarda de ownership na migration 260000");
{
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/20261101260000_rda_rpc_idempotent_owner_guard.sql"),
    "utf8"
  );
  assert(sql.includes("RDA_MUTATION_OWNER_MISMATCH"), "código de mismatch");
  assert(
    (sql.match(/technician_user_id <> p_technician_user_id/g) || []).length >= 4,
    "checks de técnico nos caminhos idempotentes"
  );
  assert(sql.includes("GRANT EXECUTE") && sql.includes("service_role"), "grant service_role");
  assert(sql.includes("REVOKE ALL") && sql.includes("anon"), "revoke anon");
}

console.log("\n4) Env exemplo sem produção");
{
  const env = readFileSync(join(root, "env.homologation.example"), "utf8");
  assert(!/hvxzloicztmwxmtnwfii/i.test(env), "sem project_ref de produção conhecido");
  assert(env.includes("RDA_INTELLIGENCE_ENABLED=false"), "IA/flag off");
  assert(env.includes("SEU_PROJECT_REF_TESTE"), "placeholder de teste");
}

console.log("\n5) Seed fictício");
{
  const seed = readFileSync(join(root, "01_seed_fictional.sql"), "utf8");
  assert(seed.includes("homolog_tech1"), "tech1");
  assert(seed.includes("access_radar_qualidade"), "gerente radar");
  assert(!/@gmail\.com|CPF|RG/i.test(seed), "sem PII óbvia");
}

console.log(`\nResultado: ${passed} ok, ${failed} falhas`);
process.exit(failed > 0 ? 1 : 0);
