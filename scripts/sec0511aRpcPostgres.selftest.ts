/**
 * SEC-05.1.1-A: funções de limite num PostgreSQL real, como service_role.
 * npm run test:sec0511a-rpc-postgres
 * Não imprime senha, IP nem chave.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";

const execFileAsync = promisify(execFile);
const DB = "sec0511a_rpc_fix";
const ORIGINAL = "supabase/migrations/20261116020000_workshop_auth_rate_limits.sql";
const FIX = "supabase/migrations/20261116040000_fix_auth_rate_limit_least.sql";

let passed = 0;
let failed = 0;

function record(name: string, ok: boolean, detail: string) {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? "OK  " : "FAIL"} ${name} — ${detail}`);
}

function sqlBody(source: string): string {
  return source
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
}

function lastLine(text: string): string {
  return text.split("\n").map((line) => line.trim()).filter(Boolean).at(-1) || "";
}

async function psql(database: string, sql: string): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync(
      "sudo",
      ["-u", "postgres", "psql", "-d", database, "-v", "ON_ERROR_STOP=1", "-At", "-c", sql],
      { maxBuffer: 2_000_000 }
    );
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (err) {
    const error = err as { code?: number; stdout?: string; stderr?: string };
    return {
      code: typeof error.code === "number" ? error.code : 1,
      stdout: error.stdout || "",
      stderr: error.stderr || "",
    };
  }
}

async function psqlFile(database: string, file: string): Promise<{ code: number; stderr: string }> {
  try {
    const result = await execFileAsync(
      "sudo",
      ["-u", "postgres", "psql", "-d", database, "-v", "ON_ERROR_STOP=1", "-f", file],
      { maxBuffer: 2_000_000 }
    );
    return { code: 0, stderr: result.stderr };
  } catch (err) {
    const error = err as { code?: number; stderr?: string };
    return { code: typeof error.code === "number" ? error.code : 1, stderr: error.stderr || "" };
  }
}

async function main() {
  const fixSql = sqlBody(fs.readFileSync(FIX, "utf8"));
  const originalSql = fs.readFileSync(ORIGINAL, "utf8");
  record(
    "migration corretiva não qualifica least, greatest nem coalesce",
    !fixSql.includes("pg_catalog.least") &&
      !fixSql.includes("pg_catalog.greatest") &&
      !fixSql.includes("pg_catalog.coalesce") &&
      fixSql.includes("least(bucket.hit_count, 999999)") &&
      fixSql.includes("least(greatest(coalesce(p_limit, 1), 1), 100)") &&
      fixSql.includes("SECURITY INVOKER") &&
      fixSql.includes("SET search_path = ''") &&
      !fixSql.includes("SECURITY DEFINER") &&
      originalSql.includes("pg_catalog.least"),
    "sql"
  );

  await psql("postgres", `DROP DATABASE IF EXISTS ${DB}`);
  const created = await psql("postgres", `CREATE DATABASE ${DB}`);
  if (created.code !== 0) {
    record("PostgreSQL local aceita o banco isolado", false, "psql indisponível");
    console.log(`\n${passed} ok, ${failed} falhas`);
    process.exit(1);
  }

  for (const statement of [
    "CREATE ROLE anon NOLOGIN NOINHERIT",
    "CREATE ROLE authenticated NOLOGIN NOINHERIT",
    "CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS",
    "CREATE ROLE rate_limit_plain NOLOGIN NOINHERIT",
  ]) {
    const role = await psql(DB, statement);
    if (role.code !== 0 && !/already exists/i.test(role.stderr)) {
      record("papéis de teste", false, role.stderr.split("\n")[0] || "falhou");
      console.log(`\n${passed} ok, ${failed} falhas`);
      process.exit(1);
    }
  }
  await psql(DB, "ALTER ROLE service_role BYPASSRLS");
  await psql(DB, "ALTER ROLE rate_limit_plain NOBYPASSRLS");
  const applied = await psqlFile(DB, ORIGINAL);
  record("migration original aplica", applied.code === 0, applied.code === 0 ? "ok" : "falhou");

  const broken = await psql(DB, `SET ROLE service_role; SELECT hit_count FROM public.hit_auth_rate_limit('k', 1000, 10);`);
  const afterBroken = await psql(DB, "SELECT count(*) FROM public.workshop_auth_rate_limits");
  record(
    "função original falha e não grava linha",
    broken.code !== 0 &&
      broken.stderr.includes("pg_catalog.least") &&
      broken.stderr.includes("does not exist") &&
      afterBroken.stdout.trim() === "0",
    broken.stderr.includes("does not exist") ? "sem linha" : broken.stderr.split("\n")[0]
  );

  const fixed = await psqlFile(DB, FIX);
  record("migration corretiva aplica", fixed.code === 0, fixed.code === 0 ? "ok" : "falhou");

  const defs = await psql(
    DB,
    `SELECT p.proname || '|' || p.prosecdef::text || '|' || coalesce(array_to_string(p.proconfig, ','), '')
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('hit_auth_rate_limit', 'purge_expired_auth_rate_limits')
     ORDER BY p.proname`
  );
  record(
    "funções continuam invoker com search_path vazio",
    defs.stdout.includes("hit_auth_rate_limit|false|search_path=") &&
      defs.stdout.includes("purge_expired_auth_rate_limits|false|search_path="),
    defs.stdout.trim().replace(/\s+/g, " ")
  );

  const first = await psql(DB, `SET ROLE service_role; SELECT hit_count || '|' || limited FROM public.hit_auth_rate_limit('login:ip:seq', 60000, 2);`);
  const second = await psql(DB, `SET ROLE service_role; SELECT hit_count || '|' || limited FROM public.hit_auth_rate_limit('login:ip:seq', 60000, 2);`);
  const third = await psql(DB, `SET ROLE service_role; SELECT hit_count || '|' || limited FROM public.hit_auth_rate_limit('login:ip:seq', 60000, 2);`);
  record(
    "incremento atômico bloqueia acima do máximo",
    lastLine(first.stdout) === "1|false" && lastLine(second.stdout) === "2|false" && lastLine(third.stdout) === "3|true",
    `${lastLine(first.stdout)} ${lastLine(second.stdout)} ${lastLine(third.stdout)}`
  );

  await psql(DB, `UPDATE public.workshop_auth_rate_limits SET reset_at = timestamptz '2000-01-01' WHERE bucket_key = 'login:ip:seq'`);
  const reopened = await psql(
    DB,
    `SET ROLE service_role; SELECT hit_count || '|' || limited FROM public.hit_auth_rate_limit('login:ip:seq', 60000, 2);`
  );
  record("janela vencida no relógio do banco recomeça em 1", lastLine(reopened.stdout) === "1|false", lastLine(reopened.stdout));

  const races = await Promise.all(
    Array.from({ length: 20 }, () =>
      psql(DB, `SET ROLE service_role; SELECT hit_count FROM public.hit_auth_rate_limit('login:ip:race', 60000, 100);`)
    )
  );
  const raceCount = await psql(DB, `SELECT hit_count FROM public.workshop_auth_rate_limits WHERE bucket_key = 'login:ip:race'`);
  record(
    "vinte chamadas simultâneas contam vinte",
    races.every((item) => item.code === 0) && raceCount.stdout.trim() === "20",
    `final ${raceCount.stdout.trim()}`
  );

  await psql(DB, `SET ROLE service_role; SELECT public.hit_auth_rate_limit('login:ip:live', 60000, 10);`);
  await psql(DB, `SET ROLE service_role; SELECT public.hit_auth_rate_limit('login:ip:old', 60000, 10);`);
  await psql(DB, `UPDATE public.workshop_auth_rate_limits SET reset_at = timestamptz '2000-01-01' WHERE bucket_key = 'login:ip:old'`);
  const purged = await psql(DB, `SET ROLE service_role; SELECT public.purge_expired_auth_rate_limits(50);`);
  const left = await psql(
    DB,
    `SELECT string_agg(bucket_key, ',' ORDER BY bucket_key) FROM public.workshop_auth_rate_limits`
  );
  record(
    "limpeza apaga só a linha vencida",
    lastLine(purged.stdout) === "1" && left.stdout.includes("login:ip:live") && !left.stdout.includes("login:ip:old"),
    `apagadas ${lastLine(purged.stdout)}; restam ${left.stdout.trim()}`
  );

  const anon = await psql(DB, `SET ROLE anon; SELECT public.hit_auth_rate_limit('login:ip:anon', 1000, 10);`);
  record("anon não executa a função", anon.code !== 0 && /permission denied/i.test(anon.stderr), "negado");

  await psql(
    DB,
    `GRANT USAGE ON SCHEMA public TO rate_limit_plain;
     GRANT SELECT, INSERT, UPDATE, DELETE ON public.workshop_auth_rate_limits TO rate_limit_plain;
     GRANT EXECUTE ON FUNCTION public.hit_auth_rate_limit(text, integer, integer) TO rate_limit_plain;`
  );
  const plain = await psql(DB, `SET ROLE rate_limit_plain; SELECT hit_count FROM public.hit_auth_rate_limit('login:ip:plain', 1000, 10);`);
  record(
    "papel sem bypass de RLS não grava",
    plain.code !== 0 && /row-level security|segurança de linha/i.test(plain.stderr),
    plain.stderr.split("\n").find((line) => line.startsWith("ERROR")) || "sem erro"
  );

  await psql("postgres", `DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  console.log(`\n${passed} ok, ${failed} falhas`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : "falha");
  process.exit(1);
});
