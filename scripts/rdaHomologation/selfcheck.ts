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
  "00_bootstrap_core_schema.sql",
  "00b_bootstrap_ui_support.sql",
  "GAPS_SCHEMA.txt",
  "env.homologation.example",
  "env.preview.vercel.example",
  "01_seed_fictional.sql",
  "01b_ui_access_and_preview_passwords.sql",
  "02_verify.sql",
  "03_roteiro_api.txt",
  "04_criterios_liberacao.txt",
  "05_roteiro_sql_editor.txt",
  "06_preview_browser.txt",
  "runRoteiroApi.ts",
]) {
  assert(existsSync(join(root, f)), f);
}

console.log("\n2) Migrations RDA");
for (const m of migrations) {
  assert(existsSync(join(process.cwd(), "supabase/migrations", m)), m);
}

console.log("\n3) Bootstrap cria core antes das RDA");
{
  const boot = readFileSync(join(root, "00_bootstrap_core_schema.sql"), "utf8");
  assert(boot.includes("CREATE TABLE IF NOT EXISTS public.workshops"), "workshops");
  assert(boot.includes("CREATE TABLE IF NOT EXISTS public.customers"), "customers");
  assert(boot.includes("CREATE TABLE IF NOT EXISTS public.service_orders"), "service_orders");
  assert(boot.includes("CREATE TABLE IF NOT EXISTS public.workshop_system_users"), "users");
  assert(boot.includes("CREATE TABLE IF NOT EXISTS public.budgets"), "budgets");
  assert(boot.includes("get_next_os_number"), "os counter rpc");
  assert(boot.includes("RECONSTRUÍDO") || boot.includes("reconstruído"), "marca reconstrução");
  assert(
    !/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:public\.)?rda_/i.test(boot),
    "bootstrap sem CREATE TABLE RDA"
  );
}

console.log("\n4) Seed compatível");
{
  const seed = readFileSync(join(root, "01_seed_fictional.sql"), "utf8");
  assert(seed.includes("33333333-3333-4333-8333-333333333301"), "OS-A");
  assert(seed.includes("33333333-3333-4333-8333-333333333302"), "OS-B");
  assert(seed.includes("homolog_tech1"), "tech1");
  assert(seed.includes("access_radar_qualidade"), "gerente");
  assert(seed.includes("55555555-5555-4555-8555-555555555501"), "budget fictício");
}

console.log("\n5) Verify cobre bootstrap + RDA");
{
  const v = readFileSync(join(root, "02_verify.sql"), "utf8");
  assert(v.includes("bootstrap_workshops"), "check workshops");
  assert(v.includes("tables_rda"), "check RDA");
  assert(v.includes("seed_os"), "check OS seed");
  assert(v.includes("ALL_OK"), "check ALL_OK");
  assert(v.includes("to_regrole"), "verify seguro p/ privilege");
}

console.log("\n6) Gaps documentados");
{
  const g = readFileSync(join(root, "GAPS_SCHEMA.txt"), "utf8");
  assert(g.includes("workshops"), "gap workshops");
  assert(g.includes("service_orders"), "gap service_orders");
  assert(g.includes("AUSENTES"), "seção ausentes");
}

console.log("\n7) Preview browser + permissões UI");
{
  const bootUi = readFileSync(join(root, "00b_bootstrap_ui_support.sql"), "utf8");
  assert(bootUi.includes("workshop_technicians"), "ui technicians");
  assert(bootUi.includes("workshop_technician_incidents"), "ui incidents");
  assert(bootUi.includes("workshop_settings"), "ui settings");
  const seed = readFileSync(join(root, "01_seed_fictional.sql"), "utf8");
  assert(seed.includes("access_patio"), "seed patio perm");
  assert(seed.includes("access_home"), "seed home perm");
  const prev = readFileSync(join(root, "06_preview_browser.txt"), "utf8");
  assert(prev.includes("Deployment Protection"), "preview protection");
  assert(/n[aã]o mexa nas env|NÃO alterar/i.test(prev), "nao alterar prod env");
  const guard = readFileSync(
    join(process.cwd(), "utils/homologationGuard.ts"),
    "utf8"
  );
  assert(guard.includes("hvxzloicztmwxmtnwfii"), "guard blocklist prod");
}

console.log(`\nResultado: ${passed} ok, ${failed} falhas`);
process.exit(failed > 0 ? 1 : 0);
