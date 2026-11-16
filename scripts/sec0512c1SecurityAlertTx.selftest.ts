/**
 * SEC-05.1.2-C.1: estado e histórico do alerta na mesma transação.
 * npm run test:sec0512c1-alert-transactions
 * Não imprime senha, token, IP nem chave.
 */
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AddressInfo } from "node:net";

const exec = promisify(execFile);
const DB = "sec0512c1_alerts";
const MIGRATION = "supabase/migrations/20261116160000_security_alert_transactions.sql";
const BASE_MIGRATION = "supabase/migrations/20261116150000_workshop_security_alerts.sql";
const WORKSHOP = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ALERT = "55555555-5555-4555-8555-555555555555";
const USER = "33333333-3333-4333-8333-333333333333";
const OTHER_USER = "44444444-4444-4444-8444-444444444444";
const EVIDENCE = JSON.stringify({
  source: "recorded",
  recordedCount: 1,
  removedCount: 0,
  omittedRepeats: true,
  truncated: false,
  countedUntil: "2026-11-16T11:05:00.000Z",
  countedId: "00000000-0000-4000-8000-0000000000a2",
});

let passed = 0;
let failed = 0;

function record(name: string, ok: boolean, detail: string) {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? "OK  " : "FAIL"} ${name} — ${detail}`);
}

async function psql(db: string, sql: string): Promise<string> {
  const file = `/tmp/sec0512c1-${process.pid}-${crypto.randomBytes(4).toString("hex")}.sql`;
  fs.writeFileSync(file, sql);
  try {
    const { stdout } = await exec(
      "sudo",
      ["-n", "-u", "postgres", "psql", "-d", db, "-v", "ON_ERROR_STOP=1", "-tA", "-f", file],
      { maxBuffer: 4_000_000 }
    );
    return stdout.trim();
  } finally {
    fs.rmSync(file, { force: true });
  }
}

async function psqlMayFail(sql: string): Promise<{ ok: boolean; text: string }> {
  try {
    return { ok: true, text: await psql(DB, sql) };
  } catch (err) {
    const error = err as { stderr?: string; stdout?: string };
    return { ok: false, text: `${error.stderr || ""}\n${error.stdout || ""}` };
  }
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function setupDatabase() {
  await psql("postgres", `
    SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB}' AND pid <> pg_backend_pid();
    DROP DATABASE IF EXISTS ${DB};
    CREATE DATABASE ${DB};
  `);
  await psql(DB, `
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
    END $$;
    CREATE TABLE public.workshops (id uuid PRIMARY KEY);
    CREATE TABLE public.workshop_system_users (
      id uuid PRIMARY KEY,
      workshop_id uuid NOT NULL REFERENCES public.workshops(id)
    );
    INSERT INTO public.workshops (id) VALUES (${quote(WORKSHOP)}), (${quote(OTHER)});
    INSERT INTO public.workshop_system_users (id, workshop_id) VALUES
      (${quote(USER)}, ${quote(WORKSHOP)}),
      (${quote(OTHER_USER)}, ${quote(OTHER)});
  `);
  await exec("sudo", ["-n", "-u", "postgres", "psql", "-d", DB, "-v", "ON_ERROR_STOP=1", "-f", BASE_MIGRATION]);
  await exec("sudo", ["-n", "-u", "postgres", "psql", "-d", DB, "-v", "ON_ERROR_STOP=1", "-f", MIGRATION]);
  await psql(DB, `
    CREATE OR REPLACE FUNCTION public.sec0512c1_fail_history()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $fn$
    BEGIN
      IF current_setting('sec0512c1.fail_history', true) = '1' THEN
        RAISE EXCEPTION 'history failed';
      END IF;
      RETURN NEW;
    END;
    $fn$;
    CREATE TRIGGER sec0512c1_fail_history
    BEFORE INSERT ON public.workshop_security_alert_updates
    FOR EACH ROW EXECUTE FUNCTION public.sec0512c1_fail_history();
  `);
}

async function seedAlert(status = "new") {
  await psql(DB, `
    INSERT INTO public.workshop_security_alerts (
      id, workshop_id, dedupe_key, rule_id, severity, status, title, explanation, occurrence_count, evidence
    ) VALUES (
      ${quote(ALERT)}, ${quote(WORKSHOP)}, 'admin_password', 'admin_password', 'important', ${quote(status)},
      'Senha alterada', 'Um administrador alterou senha em 1 registro(s).', 1, ${quote(EVIDENCE)}::jsonb
    );
  `);
}

function applyCall(dedupe: string, alertId: string | null, count: number) {
  const idSql = alertId ? quote(alertId) : "NULL";
  return `SELECT public.apply_security_alert(
    ${quote(WORKSHOP)}, ${idSql}, ${quote(dedupe)}, ${quote(dedupe)}, 'warning',
    'Bloqueio por excesso de tentativas', 'O sistema registrou o bloqueio.', ${count}, true,
    ${quote(EVIDENCE)}::jsonb
  );`;
}

async function postgresCases() {
  const sql = fs.readFileSync(MIGRATION, "utf8");
  const api = fs.readFileSync("apiApp.ts", "utf8");
  const modal = fs.readFileSync("components/SecurityCenterModal.tsx", "utf8");
  record(
    "a função trava a linha e só o serviço executa",
    sql.includes("SECURITY INVOKER") &&
      sql.includes("SET search_path = ''") &&
      sql.includes("FOR UPDATE") &&
      sql.includes("REVOKE ALL ON FUNCTION public.transition_security_alert(uuid, uuid, text, text, uuid, text) FROM anon, authenticated") &&
      sql.includes("GRANT EXECUTE ON FUNCTION public.transition_security_alert(uuid, uuid, text, text, uuid, text) TO service_role") &&
      sql.includes("WHEN unique_violation") &&
      !sql.includes("SECURITY DEFINER"),
    "sql"
  );
  record(
    "a API usa a transação e a central não muda",
    api.includes('rpc("transition_security_alert"') &&
      api.includes('rpc("apply_security_alert"') &&
      !api.includes("recordAlertUpdate") &&
      !modal.includes("transition_security_alert") &&
      modal.includes("evaluateSecurityAlerts"),
    "api"
  );

  await setupDatabase();
  await seedAlert();
  const changed = await psql(DB, `SELECT public.transition_security_alert(${quote(WORKSHOP)}, ${quote(ALERT)}, 'new', 'seen', NULL, 'admin');`);
  const afterSeen = await psql(DB, `
    SELECT status || '|' || count(*)::text
    FROM public.workshop_security_alerts AS alert
    JOIN public.workshop_security_alert_updates AS update ON update.alert_id = alert.id
    WHERE alert.id = ${quote(ALERT)}
    GROUP BY status;
  `);
  record("mudança grava estado e histórico juntos", changed === "changed" && afterSeen === "seen|1", afterSeen || changed);

  const holdFile = "/tmp/sec0512c1-hold.sql";
  const waitFile = "/tmp/sec0512c1-wait.sql";
  fs.writeFileSync(holdFile, `
    BEGIN;
    SELECT id FROM public.workshop_security_alerts WHERE id = ${quote(ALERT)} FOR UPDATE;
    SELECT pg_sleep(0.7);
    SELECT public.transition_security_alert(${quote(WORKSHOP)}, ${quote(ALERT)}, 'seen', 'resolved', NULL, 'admin');
    COMMIT;
  `);
  fs.writeFileSync(waitFile, `
    SELECT public.transition_security_alert(${quote(WORKSHOP)}, ${quote(ALERT)}, 'seen', 'resolved', ${quote(USER)}, 'user');
  `);
  const hold = psql(DB, fs.readFileSync(holdFile, "utf8"));
  await new Promise((resolve) => setTimeout(resolve, 200));
  const wait = psql(DB, fs.readFileSync(waitFile, "utf8"));
  const [holdOut, waitOut] = await Promise.all([hold, wait]);
  const results = `${holdOut}\n${waitOut}`.split(/\s+/).filter((item) => item === "changed" || item === "conflict");
  const finalState = await psql(DB, `
    SELECT alert.status || '|' || count(update.id)::text || '|' || coalesce(string_agg(update.to_status, ',' ORDER BY update.occurred_at), '')
    FROM public.workshop_security_alerts AS alert
    LEFT JOIN public.workshop_security_alert_updates AS update ON update.alert_id = alert.id
    WHERE alert.id = ${quote(ALERT)}
    GROUP BY alert.status;
  `);
  record(
    "duas alterações simultâneas deixam um único histórico",
    results.filter((item) => item === "changed").length === 1 &&
      results.filter((item) => item === "conflict").length === 1 &&
      finalState === "resolved|2|seen,resolved",
    finalState || results.join(",")
  );

  const resolvedAgain = await psql(DB, `SELECT public.transition_security_alert(${quote(WORKSHOP)}, ${quote(ALERT)}, 'resolved', 'seen', NULL, 'admin');`);
  const historyAfterResolved = await psql(DB, `SELECT count(*) FROM public.workshop_security_alert_updates WHERE alert_id = ${quote(ALERT)};`);
  record("alerta resolvido não gera outra transição", resolvedAgain === "conflict" && historyAfterResolved === "2", resolvedAgain);

  const invalid = await psql(DB, `SELECT public.transition_security_alert(${quote(WORKSHOP)}, ${quote(ALERT)}, 'new', 'new', NULL, 'admin');`);
  record("transição inválida não grava histórico", invalid === "conflict" && historyAfterResolved === "2", invalid);

  await psql(DB, `UPDATE public.workshop_security_alerts SET status = 'seen', resolved_at = NULL WHERE id = ${quote(ALERT)};`);
  const failedWrite = await psqlMayFail(`
    BEGIN;
    SELECT set_config('sec0512c1.fail_history', '1', true);
    SELECT public.transition_security_alert(${quote(WORKSHOP)}, ${quote(ALERT)}, 'seen', 'resolved', NULL, 'admin');
    COMMIT;
  `);
  const afterFail = await psql(DB, `
    SELECT status FROM public.workshop_security_alerts WHERE id = ${quote(ALERT)};
    SELECT count(*) FROM public.workshop_security_alert_updates WHERE alert_id = ${quote(ALERT)};
  `);
  record(
    "falha no histórico desfaz o estado",
    !failedWrite.ok && failedWrite.text.includes("history failed") && afterFail === "seen\n2",
    afterFail.replace(/\s+/g, " ")
  );
  await psql(DB, `UPDATE public.workshop_security_alerts SET status = 'resolved', resolved_at = pg_catalog.now() WHERE id = ${quote(ALERT)};`);

  const isolated = await psql(DB, `SELECT public.transition_security_alert(${quote(OTHER)}, ${quote(ALERT)}, 'seen', 'resolved', NULL, 'admin');`);
  const stillResolved = await psql(DB, `SELECT status FROM public.workshop_security_alerts WHERE id = ${quote(ALERT)};`);
  record("outra oficina não altera o alerta", isolated === "missing" && stillResolved === "resolved", isolated);

  const foreignActor = await psqlMayFail(`
    SELECT public.transition_security_alert(${quote(WORKSHOP)}, ${quote(ALERT)}, 'resolved', 'seen', ${quote(OTHER_USER)}, 'user');
  `);
  const historyStill = await psql(DB, `SELECT count(*) FROM public.workshop_security_alert_updates WHERE alert_id = ${quote(ALERT)};`);
  record("ator de outra oficina não grava", !foreignActor.ok && foreignActor.text.includes("invalid actor") && historyStill === "2", "ator");

  const anon = await psqlMayFail(`
    SET ROLE anon;
    SELECT public.transition_security_alert(${quote(WORKSHOP)}, ${quote(ALERT)}, 'resolved', 'seen', NULL, 'admin');
  `);
  record("o navegador não executa a função", !anon.ok && /permission denied/i.test(anon.text), "anon");

  const firstApply = psql(DB, applyCall("recorded_rate_limit", null, 1));
  const secondApply = psql(DB, applyCall("recorded_rate_limit", null, 2));
  const [firstId, secondId] = await Promise.all([firstApply, secondApply]);
  const applied = await psql(DB, `
    SELECT count(*)::text || '|' || count(DISTINCT alert.id)::text
    FROM public.workshop_security_alerts AS alert
    JOIN public.workshop_security_alert_updates AS update ON update.alert_id = alert.id
    WHERE alert.dedupe_key = 'recorded_rate_limit' AND update.to_status = 'new';
  `);
  const openCount = await psql(DB, `SELECT count(*) FROM public.workshop_security_alerts WHERE dedupe_key = 'recorded_rate_limit' AND status <> 'resolved';`);
  record(
    "avaliações simultâneas não duplicam o alerta nem o histórico",
    firstId.length === 36 && firstId === secondId && applied === "1|1" && openCount === "1",
    applied || `${firstId.slice(0, 8)}/${secondId.slice(0, 8)}`
  );
  const again = await psql(DB, applyCall("recorded_rate_limit", firstId, 3));
  const historyAfterUpdate = await psql(DB, `
    SELECT count(*) FROM public.workshop_security_alert_updates WHERE alert_id = ${quote(firstId)};
  `);
  const occurrence = await psql(DB, `SELECT occurrence_count FROM public.workshop_security_alerts WHERE id = ${quote(firstId)};`);
  record("atualizar a regra não cria outra transição", again === firstId && historyAfterUpdate === "1" && occurrence === "3", occurrence);

  const poisoned = await psqlMayFail(`
    SELECT public.apply_security_alert(
      ${quote(WORKSHOP)}, NULL, 'admin_settings', 'admin_settings', 'important',
      'Configuração sensível alterada', 'texto', 1, true,
      '{"source":"recorded","bucket_key":"login:ip:203.0.113.50"}'::jsonb
    );
  `);
  const poisonedRows = await psql(DB, `SELECT count(*) FROM public.workshop_security_alerts WHERE dedupe_key = 'admin_settings';`);
  record("evidência com chave de origem é recusada", !poisoned.ok && poisonedRows === "0", poisonedRows);
}

type Row = Record<string, unknown>;

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

async function httpCases() {
  const tables: Record<string, Row[]> = {
    workshop_settings: [{
      workshop_id: WORKSHOP,
      key: "admin_password",
      value: hashPassword("gerencia-sec0512c1"),
      updated_at: "2026-01-01T00:00:00.000Z",
    }],
    workshop_system_users: [{
      id: USER,
      workshop_id: WORKSHOP,
      username: "ana",
      display_name: "Ana",
      password_hash: hashPassword("senha-ana-sec0512c1"),
      permissions: {},
      is_technician: false,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    }],
    workshop_device_sessions: [],
    workshop_blocked_devices: [],
    workshop_security_events: [{
      id: "00000000-0000-4000-8000-0000000000a2",
      workshop_id: WORKSHOP,
      occurred_at: "2026-11-16T11:05:00.000Z",
      event_type: "rate_limited",
      outcome: "denied",
    }],
    workshop_security_alerts: [],
    workshop_security_alert_updates: [],
  };
  let failHistory = false;
  let chains = Promise.resolve();
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const name = decodeURIComponent(url.pathname.replace(/^\/rest\/v1\//, ""));
    const raw = await new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      req.on("error", reject);
    });
    const run = chains.then(async () => {
      if (name.startsWith("rpc/transition_security_alert")) {
        const args = JSON.parse(raw) as Record<string, unknown>;
        const backup = structuredClone(tables);
        const row = tables.workshop_security_alerts.find((item) => item.id === args.p_alert_id && item.workshop_id === args.p_workshop_id);
        const allowed = (args.p_expected_status === "new" && (args.p_next_status === "seen" || args.p_next_status === "resolved"))
          || (args.p_expected_status === "seen" && args.p_next_status === "resolved");
        if (!row || !allowed || row.status !== args.p_expected_status) {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(!row ? "missing" : "conflict"));
          return;
        }
        row.status = args.p_next_status;
        if (failHistory) {
          tables.workshop_security_alerts = backup.workshop_security_alerts;
          tables.workshop_security_alert_updates = backup.workshop_security_alert_updates;
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ code: "P0001", message: "history failed" }));
          return;
        }
        tables.workshop_security_alert_updates.push({
          alert_id: row.id,
          occurred_at: new Date().toISOString(),
          from_status: args.p_expected_status,
          to_status: args.p_next_status,
          actor_user_id: args.p_actor_user_id,
          actor_role: args.p_actor_role,
        });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify("changed"));
        return;
      }
      if (name.startsWith("rpc/apply_security_alert")) {
        const args = JSON.parse(raw) as Record<string, unknown>;
        const created = {
          id: crypto.randomUUID(),
          workshop_id: args.p_workshop_id,
          dedupe_key: args.p_dedupe_key,
          rule_id: args.p_rule_id,
          severity: args.p_severity,
          status: "new",
          title: args.p_title,
          explanation: args.p_explanation,
          occurrence_count: args.p_occurrence_count,
          condition_active: true,
          first_seen_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
          evidence: args.p_evidence,
        };
        tables.workshop_security_alerts.push(created);
        tables.workshop_security_alert_updates.push({
          alert_id: created.id,
          occurred_at: created.first_seen_at,
          from_status: null,
          to_status: "new",
          actor_user_id: null,
          actor_role: "system",
        });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(created.id));
        return;
      }
      if (req.method === "GET" || req.method === "HEAD") {
        const rows = (tables[name] || []).filter((row) => {
          for (const [key, value] of url.searchParams) {
            if (["select", "order", "limit", "offset"].includes(key)) continue;
            if (value.startsWith("eq.") && String(row[key] ?? "") !== value.slice(3)) return false;
            if (value.startsWith("gte.") && String(row[key] ?? "") < value.slice(4)) return false;
            if (value.startsWith("in.(")) {
              const parts = value.slice(4, -1).split(",").map((part) => part.replace(/"/g, ""));
              if (!parts.includes(String(row[key] ?? ""))) return false;
            }
          }
          return true;
        });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(rows));
        return;
      }
      if (req.method === "POST" && tables[name]) {
        const body = raw ? JSON.parse(raw) : {};
        const incoming = (Array.isArray(body) ? body : [body]) as Row[];
        const stored = incoming.map((row) => {
          const created = { id: crypto.randomUUID(), ...row };
          tables[name].push(created);
          return created;
        });
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify(stored));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end("[]");
    });
    chains = run.then(() => undefined, () => undefined);
    await run;
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  process.env.SUPABASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "homolog-service-role-sec0512c1";
  process.env.WORKSHOP_ID = WORKSHOP;
  process.env.SESSION_SECRET = "homolog-session-sec0512c1";
  process.env.ADMIN_PASSWORD = "gerencia-sec0512c1";
  delete process.env.AUTH_RATE_LIMIT_STORE;
  const { createApiApp } = await import("../apiApp.ts");
  const app = http.createServer(createApiApp());
  await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", () => resolve()));
  const base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
  const call = async (token: string | null, method: string, path: string, body?: unknown) => {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text();
    return { status: response.status, json: text ? JSON.parse(text) : null };
  };
  try {
    const admin = await call(null, "POST", "/api/auth/login", { username: "Gerência", password: "gerencia-sec0512c1", deviceId: "device-admin-c1" });
    const ana = await call(null, "POST", "/api/auth/login", { username: "ana", password: "senha-ana-sec0512c1", deviceId: "device-ana-c1" });
    const token = admin.json.token as string;
    const anaToken = ana.json.token as string;
    const evaluated = await call(token, "POST", "/api/security-alerts/evaluate", {});
    const alertId = evaluated.json.alerts[0].id as string;
    const denied = await call(anaToken, "POST", `/api/security-alerts/${alertId}/state`, { status: "resolved" });
    const [seen, resolved] = await Promise.all([
      call(token, "POST", `/api/security-alerts/${alertId}/state`, { status: "seen" }),
      call(token, "POST", `/api/security-alerts/${alertId}/state`, { status: "resolved" }),
    ]);
    const outcomes = [seen.status, resolved.status].sort();
    const stateUpdates = () => tables.workshop_security_alert_updates.filter((row) => row.alert_id === alertId && row.from_status);
    record(
      "a API aceita uma transição simultânea e recusa o funcionário",
      denied.status === 403 && outcomes.join(",") === "200,409" && stateUpdates().length === 1,
      outcomes.join(",")
    );
    const current = tables.workshop_security_alerts.find((row) => row.id === alertId);
    if (current) current.status = "seen";
    failHistory = true;
    const before = "seen";
    const broken = await call(token, "POST", `/api/security-alerts/${alertId}/state`, { status: "resolved" });
    const after = String(tables.workshop_security_alerts.find((row) => row.id === alertId)?.status);
    record(
      "falha da API não deixa histórico pela metade",
      broken.status === 500 && after === before && stateUpdates().length === 1,
      `${broken.status} ${before}->${after}`
    );
  } finally {
    await new Promise<void>((resolve, reject) => app.close((err) => (err ? reject(err) : resolve())));
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

async function main() {
  try {
    await postgresCases();
    await httpCases();
  } finally {
    await psql("postgres", `
      SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB}' AND pid <> pg_backend_pid();
      DROP DATABASE IF EXISTS ${DB};
    `).catch(() => undefined);
  }
  console.log(`\n${passed} ok, ${failed} falha(s)`);
  if (failed) process.exit(1);
}

main();
