/**
 * Executa os 22 itens de 03_roteiro_api.txt contra o projeto de HOMOLOGAÇÃO.
 *
 * Pré-requisitos:
 *   - .env.homologation preenchido (ver env.homologation.example)
 *   - HOMOLOGATION_OK=rei-do-abs-homologacao
 *   - 02_verify.sql com ALL_OK=true no projeto de teste
 *
 * Uso:
 *   npm run test:rda-homologation-api
 *
 * NÃO envie chaves pelo chat. NÃO aponta para produção.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { config as loadDotenv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const ROOT = process.cwd();
const ENV_PATH = join(ROOT, ".env.homologation");
const OS_A = "33333333-3333-4333-8333-333333333301";
const OS_B = "33333333-3333-4333-8333-333333333302";
const TECH1 = "22222222-2222-4222-8222-222222222201";
const TECH2 = "22222222-2222-4222-8222-222222222202";
const WS = "11111111-1111-4111-8111-111111111111";
const PROD_REF_BLOCKLIST = ["hvxzloicztmwxmtnwfii"];

type TestResult = {
  id: number;
  name: string;
  ok: boolean;
  detail: string;
};

function failGate(msg: string): never {
  console.error(`\nBLOQUEADO: ${msg}\n`);
  process.exit(2);
}

function assertHomologEnv(): void {
  if (!existsSync(ENV_PATH)) {
    failGate(
      "Arquivo .env.homologation ausente. Copie env.homologation.example, " +
        "preencha com o projeto rei-do-abs-homologacao e rode de novo. " +
        "Não cole chaves neste chat."
    );
  }
  loadDotenv({ path: ENV_PATH, override: true });

  if (process.env.HOMOLOGATION_OK !== "rei-do-abs-homologacao") {
    failGate(
      "Defina HOMOLOGATION_OK=rei-do-abs-homologacao em .env.homologation " +
        "(confirmação explícita do projeto de teste)."
    );
  }

  const url = (process.env.SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const workshop = (process.env.WORKSHOP_ID || "").trim();

  if (!url || !key) {
    failGate("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios em .env.homologation.");
  }
  if (workshop !== WS) {
    failGate(`WORKSHOP_ID deve ser o do seed (${WS}).`);
  }
  if (!url.includes("supabase.co")) {
    failGate("SUPABASE_URL não parece um projeto Supabase.");
  }
  for (const ref of PROD_REF_BLOCKLIST) {
    if (url.includes(ref)) {
      failGate(`SUPABASE_URL contém ref de produção bloqueada (${ref}).`);
    }
  }
  if (String(process.env.RDA_INTELLIGENCE_ENABLED || "").toLowerCase() === "true") {
    failGate("RDA_INTELLIGENCE_ENABLED deve ser false (IA desligada).");
  }
  if ((process.env.OPENAI_API_KEY || "").trim()) {
    failGate("OPENAI_API_KEY deve ficar vazio nesta etapa.");
  }
  if (String(process.env.RDA_ALLOW_LLM_CALLS || "").toLowerCase() === "true") {
    failGate("RDA_ALLOW_LLM_CALLS deve ser false.");
  }

  // Garante defaults seguros
  process.env.RDA_INTELLIGENCE_ENABLED = "false";
  process.env.RDA_ALLOW_LLM_CALLS = "false";
  process.env.RDA_LLM_PROVIDER = process.env.RDA_LLM_PROVIDER || "noop";
  delete process.env.OPENAI_API_KEY;
}

async function startApiServer(): Promise<{ baseUrl: string; server: Server }> {
  const { createApiApp } = await import("../../apiApp.js");
  const app = createApiApp();
  const preferred = Number(process.env.RDA_HOMOLOG_PORT || "0");
  const server = await new Promise<Server>((resolve, reject) => {
    const s = app.listen(preferred, "127.0.0.1", () => resolve(s));
    s.on("error", reject);
  });
  const addr = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${addr.port}`, server };
}

function mut(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function login(
  baseUrl: string,
  username: string,
  password: string
): Promise<{ token: string; userId?: string; status: number; body: unknown }> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json().catch(() => ({}));
  return {
    status: res.status,
    body,
    token: typeof (body as { token?: string }).token === "string"
      ? (body as { token: string }).token
      : "",
    userId:
      typeof (body as { userId?: string }).userId === "string"
        ? (body as { userId: string }).userId
        : undefined,
  };
}

async function api(
  baseUrl: string,
  token: string,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

async function soStatus(
  sb: SupabaseClient,
  osId: string
): Promise<{ status: string | null; updated_at: string | null }> {
  const { data } = await sb
    .from("service_orders")
    .select("status, updated_at")
    .eq("id", osId)
    .maybeSingle();
  return {
    status: data ? String((data as { status: string }).status) : null,
    updated_at: data
      ? String((data as { updated_at: string }).updated_at)
      : null,
  };
}

async function finishSessionQuick(
  baseUrl: string,
  token: string,
  osId: string,
  prefix: string
): Promise<{ sessionId: string; requestId: string | null }> {
  const mStart = mut(`${prefix}-start`);
  const started = await api(baseUrl, token, "POST", "/api/rda/work-sessions/start", {
    serviceOrderId: osId,
    clientMutationId: mStart,
  });
  const session = started.json.session as { id?: string } | undefined;
  if (!session?.id) {
    throw new Error(`start falhou (${started.status}): ${JSON.stringify(started.json)}`);
  }
  const mFinish = mut(`${prefix}-finish`);
  const finished = await api(
    baseUrl,
    token,
    "POST",
    `/api/rda/work-sessions/${session.id}/finish`,
    { clientMutationId: mFinish }
  );
  if (finished.status >= 400) {
    throw new Error(
      `finish falhou (${finished.status}): ${JSON.stringify(finished.json)}`
    );
  }
  return { sessionId: session.id, requestId: null };
}

async function main(): Promise<void> {
  console.log("RDA homologation — roteiro API (03)\n");
  console.log(`Branch tip esperado: cursor/rda-intelligence-485b`);
  console.log(`Env: ${ENV_PATH}\n`);

  assertHomologEnv();

  const sb = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  // Sanity: workshop seed
  const { data: wsRow, error: wsErr } = await sb
    .from("workshops")
    .select("id, name")
    .eq("id", WS)
    .maybeSingle();
  if (wsErr || !wsRow) {
    failGate(
      "Não consegui ler workshops no projeto configurado. " +
        "Confirme SUPABASE_* do rei-do-abs-homologacao e que o seed rodou."
    );
  }

  const { baseUrl, server } = await startApiServer();
  console.log(`API efêmera: ${baseUrl} (só localhost)\n`);

  const results: TestResult[] = [];
  const mark = (id: number, name: string, ok: boolean, detail: string) => {
    results.push({ id, name, ok, detail });
    console.log(`${ok ? "OK  " : "FAIL"} #${id} ${name} — ${detail}`);
  };

  try {
    const runId = Date.now().toString(36);
    const m1 = mut(`m1-${runId}`);
    const m2 = mut(`m2-${runId}`);
    const m3 = mut(`m3-${runId}`);
    const m4 = mut(`m4-${runId}`);

    // Logins
    const t1 = await login(baseUrl, "homolog_tech1", "homolog123");
    const t2 = await login(baseUrl, "homolog_tech2", "homolog123");
    const g = await login(baseUrl, "homolog_gerente", "homolog123");
    const p = await login(baseUrl, "homolog_patio", "homolog123");

    if (!t1.token || t1.userId !== TECH1) {
      failGate(`Login T1 falhou (${t1.status}). Verifique seed/senha homolog123.`);
    }
    if (!t2.token || t2.userId !== TECH2) {
      failGate(`Login T2 falhou (${t2.status}).`);
    }
    if (!g.token) failGate(`Login G falhou (${g.status}).`);
    if (!p.token) failGate(`Login P falhou (${p.status}).`);

    // #1 start
    const start1 = await api(baseUrl, t1.token, "POST", "/api/rda/work-sessions/start", {
      serviceOrderId: OS_A,
      clientMutationId: m1,
    });
    const session1 = start1.json.session as
      | { id?: string; status?: string; productiveMs?: number }
      | undefined;
    mark(
      1,
      "T1 start OS-A → running",
      start1.status === 201 && session1?.status === "running" && !!session1.id,
      `HTTP ${start1.status} status=${session1?.status ?? "?"} id=${session1?.id ?? "?"}`
    );
    const sessionId = session1?.id || "";

    // #2 idempotent
    const start2 = await api(baseUrl, t1.token, "POST", "/api/rda/work-sessions/start", {
      serviceOrderId: OS_A,
      clientMutationId: m1,
    });
    const { count: sessCount } = await sb
      .from("rda_work_sessions")
      .select("id", { count: "exact", head: true })
      .eq("workshop_id", WS)
      .eq("client_mutation_id", m1);
    mark(
      2,
      "Repetir m1 → idempotent; 1 sessão",
      (start2.status === 200 || start2.status === 201) &&
        start2.json.idempotent === true &&
        sessCount === 1,
      `HTTP ${start2.status} idempotent=${String(start2.json.idempotent)} count=${sessCount}`
    );

    // #3 T2 finish T1 → 403
    const finishAlien = await api(
      baseUrl,
      t2.token,
      "POST",
      `/api/rda/work-sessions/${sessionId}/finish`,
      { clientMutationId: m1 }
    );
    mark(
      3,
      "T2 finish sessão/mutação de T1 → 403",
      finishAlien.status === 403,
      `HTTP ${finishAlien.status} code=${String(finishAlien.json.code ?? finishAlien.json.error ?? "")}`
    );

    // #4 pause
    const prodBeforePause = Number(
      (start2.json.session as { liveProductiveMs?: number } | undefined)
        ?.liveProductiveMs ??
        (session1?.productiveMs ?? 0)
    );
    await new Promise((r) => setTimeout(r, 200));
    const pause = await api(
      baseUrl,
      t1.token,
      "POST",
      `/api/rda/work-sessions/${sessionId}/pause`,
      { reasonId: "break", clientMutationId: m2 }
    );
    const paused = pause.json.session as
      | { status?: string; productiveMs?: number; liveProductiveMs?: number }
      | undefined;
    await new Promise((r) => setTimeout(r, 250));
    const pauseAgain = await api(baseUrl, t1.token, "GET", "/api/rda/work-sessions/mine/active");
    const stillPaused = pauseAgain.json.session as
      | { status?: string; productiveMs?: number; liveProductiveMs?: number }
      | undefined;
    const prodFrozen =
      stillPaused?.status === "paused" &&
      Number(stillPaused.productiveMs ?? 0) === Number(paused?.productiveMs ?? -1);
    mark(
      4,
      "T1 pause break → paused; produtivo congela",
      pause.status === 200 && paused?.status === "paused" && prodFrozen,
      `HTTP ${pause.status} status=${paused?.status} prod=${paused?.productiveMs} (antes≈${prodBeforePause})`
    );

    // #5 resume
    const resume = await api(
      baseUrl,
      t1.token,
      "POST",
      `/api/rda/work-sessions/${sessionId}/resume`,
      { clientMutationId: m3 }
    );
    const resumed = resume.json.session as { status?: string } | undefined;
    mark(
      5,
      "T1 resume → running",
      resume.status === 200 && resumed?.status === "running",
      `HTTP ${resume.status} status=${resumed?.status ?? "?"}`
    );

    // #6 anotar stage/status
    const beforeFinish = await soStatus(sb, OS_A);
    mark(
      6,
      "Anotar status OS-A",
      beforeFinish.status != null,
      `status=${beforeFinish.status} updated_at=${beforeFinish.updated_at}`
    );

    // #11a 409 while active (antes do finish)
    const conflict = await api(baseUrl, t1.token, "POST", "/api/rda/work-sessions/start", {
      serviceOrderId: OS_B,
      clientMutationId: mut(`m11a-${runId}`),
    });
    // Continuará no #11 após finish

    // #7 finish + eval request
    const finish = await api(
      baseUrl,
      t1.token,
      "POST",
      `/api/rda/work-sessions/${sessionId}/finish`,
      { clientMutationId: m4 }
    );
    const finished = finish.json.session as { status?: string } | undefined;
    const { data: evalRows } = await sb
      .from("rda_eval_requests")
      .select("id, status")
      .eq("workshop_id", WS)
      .eq("work_session_id", sessionId);
    const pendingReq = (evalRows || []).find(
      (r) => String((r as { status: string }).status) === "pending"
    );
    mark(
      7,
      "T1 finish → finished + 1 request pending",
      (finish.status === 200 || finish.status === 201) &&
        finished?.status === "finished" &&
        (evalRows || []).length >= 1 &&
        !!pendingReq,
      `HTTP ${finish.status} session=${finished?.status} requests=${(evalRows || []).length}`
    );
    const requestId1 = pendingReq
      ? String((pendingReq as { id: string }).id)
      : "";

    // #8 OS inalterada
    const afterFinish = await soStatus(sb, OS_A);
    mark(
      8,
      "Status OS-A inalterado após finish",
      afterFinish.status === beforeFinish.status,
      `antes=${beforeFinish.status} depois=${afterFinish.status}`
    );

    // #9 finish idempotent m4
    const finish2 = await api(
      baseUrl,
      t1.token,
      "POST",
      `/api/rda/work-sessions/${sessionId}/finish`,
      { clientMutationId: m4 }
    );
    const { count: reqCountAfterIdem } = await sb
      .from("rda_eval_requests")
      .select("id", { count: "exact", head: true })
      .eq("work_session_id", sessionId);
    mark(
      9,
      "finish de novo m4 → idempotent; 1 request",
      (finish2.status === 200 || finish2.status === 201) &&
        (finish2.json.idempotent === true || finish2.json.alreadyFinished === true) &&
        reqCountAfterIdem === 1,
      `HTTP ${finish2.status} idempotent=${String(finish2.json.idempotent)} already=${String(finish2.json.alreadyFinished)} count=${reqCountAfterIdem}`
    );

    // #10 SQL count
    mark(
      10,
      "count rda_eval_requests por sessão = 1",
      reqCountAfterIdem === 1,
      `count=${reqCountAfterIdem}`
    );

    // #11 409 while active + start OS-B após finish
    const startB = await api(baseUrl, t1.token, "POST", "/api/rda/work-sessions/start", {
      serviceOrderId: OS_B,
      clientMutationId: mut(`m11b-${runId}`),
    });
    const sessionB = startB.json.session as { id?: string; status?: string } | undefined;
    mark(
      11,
      "start OS-B com sessão ativa → 409; após finish → OK",
      conflict.status === 409 &&
        startB.status === 201 &&
        sessionB?.status === "running",
      `409_check=${conflict.status} code=${String(conflict.json.code ?? "")}; after_finish HTTP ${startB.status}`
    );

    // Finish OS-B to keep tech free (helper for later uses OS-A path carefully)
    if (sessionB?.id) {
      await api(
        baseUrl,
        t1.token,
        "POST",
        `/api/rda/work-sessions/${sessionB.id}/finish`,
        { clientMutationId: mut(`m11c-${runId}`) }
      );
    }

    // #12 P → 403
    const pList = await api(baseUrl, p.token, "GET", "/api/rda/evaluations/requests");
    mark(
      12,
      "Login P → GET evaluations/requests → 403",
      pList.status === 403,
      `HTTP ${pList.status}`
    );

    // #13 T1 → 403
    const t1List = await api(baseUrl, t1.token, "GET", "/api/rda/evaluations/requests");
    mark(
      13,
      "Login T1 → GET evaluations/requests → 403",
      t1List.status === 403,
      `HTTP ${t1List.status}`
    );

    // #14 G summary pending ≥ 1
    const summary = await api(baseUrl, g.token, "GET", "/api/rda/evaluations/summary");
    const pending = Number(summary.json.pending ?? 0);
    mark(
      14,
      "G GET summary → pending ≥ 1",
      summary.status === 200 && pending >= 1,
      `HTTP ${summary.status} pending=${pending}`
    );

    // #15 evaluate
    const osBeforeEval = await soStatus(sb, OS_A);
    const evaluate = await api(
      baseUrl,
      g.token,
      "POST",
      `/api/rda/evaluations/requests/${requestId1}/evaluate`,
      {
        scores: {
          technicalQuality: 4,
          organization: 4,
          procedures: 5,
          autonomy: 3,
          communication: 4,
        },
        positives: "Homologação — ponto positivo fictício",
        improvements: "Homologação — melhoria fictícia",
        clientMutationId: mut(`eval1-${runId}`),
      }
    );
    const evalReqStatus = (evaluate.json.request as { status?: string } | undefined)
      ?.status;
    const osAfterEval = await soStatus(sb, OS_A);
    mark(
      15,
      "G evaluate 1–5 → evaluated; OS inalterada",
      evaluate.status === 200 &&
        evalReqStatus === "evaluated" &&
        osAfterEval.status === osBeforeEval.status,
      `HTTP ${evaluate.status} req=${evalReqStatus} os=${osAfterEval.status}`
    );

    // #16 nova sessão + defer
    const quick2 = await finishSessionQuick(baseUrl, t1.token, OS_A, `def-${runId}`);
    {
      const { data: bySession } = await sb
        .from("rda_eval_requests")
        .select("id")
        .eq("work_session_id", quick2.sessionId)
        .maybeSingle();
      quick2.requestId = bySession
        ? String((bySession as { id: string }).id)
        : null;
    }
    const deferReqId = quick2.requestId || "";
    const defer = await api(
      baseUrl,
      g.token,
      "POST",
      `/api/rda/evaluations/requests/${deferReqId}/defer`,
      { note: "Homologação defer", clientMutationId: mut(`defer-${runId}`) }
    );
    mark(
      16,
      "Nova request → G defer → deferred",
      defer.status === 200 &&
        (defer.json.request as { status?: string } | undefined)?.status === "deferred",
      `HTTP ${defer.status} req=${(defer.json.request as { status?: string } | undefined)?.status} id=${deferReqId}`
    );

    // #17 dismiss
    const quick3 = await finishSessionQuick(baseUrl, t1.token, OS_B, `dis-${runId}`);
    {
      const { data: bySession } = await sb
        .from("rda_eval_requests")
        .select("id")
        .eq("work_session_id", quick3.sessionId)
        .maybeSingle();
      quick3.requestId = bySession
        ? String((bySession as { id: string }).id)
        : null;
    }
    const dismissReqId = quick3.requestId || "";
    const dismiss = await api(
      baseUrl,
      g.token,
      "POST",
      `/api/rda/evaluations/requests/${dismissReqId}/dismiss`,
      { reason: "Homologação dismiss", clientMutationId: mut(`dismiss-${runId}`) }
    );
    const summaryAfterDismiss = await api(
      baseUrl,
      g.token,
      "GET",
      "/api/rda/evaluations/summary"
    );
    mark(
      17,
      "Outra request → G dismiss → dismissed",
      dismiss.status === 200 &&
        (dismiss.json.request as { status?: string } | undefined)?.status ===
          "dismissed",
      `HTTP ${dismiss.status}; summary HTTP ${summaryAfterDismiss.status}`
    );

    // #18 score inválido
    const quick4 = await finishSessionQuick(baseUrl, t1.token, OS_A, `bad-${runId}`);
    {
      const { data: bySession } = await sb
        .from("rda_eval_requests")
        .select("id")
        .eq("work_session_id", quick4.sessionId)
        .maybeSingle();
      quick4.requestId = bySession
        ? String((bySession as { id: string }).id)
        : null;
    }
    const badReqId = quick4.requestId || "";
    const bad0 = await api(
      baseUrl,
      g.token,
      "POST",
      `/api/rda/evaluations/requests/${badReqId}/evaluate`,
      {
        scores: {
          technicalQuality: 0,
          organization: 4,
          procedures: 4,
          autonomy: 4,
          communication: 4,
        },
      }
    );
    const bad6 = await api(
      baseUrl,
      g.token,
      "POST",
      `/api/rda/evaluations/requests/${badReqId}/evaluate`,
      {
        scores: {
          technicalQuality: 6,
          organization: 4,
          procedures: 4,
          autonomy: 4,
          communication: 4,
        },
      }
    );
    mark(
      18,
      "evaluate score 0 ou 6 → 400",
      bad0.status === 400 && bad6.status === 400,
      `score0=${bad0.status} score6=${bad6.status}`
    );

    // #19 evaluatorUserId no body
    const spoof = await api(
      baseUrl,
      g.token,
      "POST",
      `/api/rda/evaluations/requests/${badReqId}/evaluate`,
      {
        evaluatorUserId: TECH1,
        scores: {
          technicalQuality: 4,
          organization: 4,
          procedures: 4,
          autonomy: 4,
          communication: 4,
        },
      }
    );
    mark(
      19,
      "evaluate com evaluatorUserId → 400",
      spoof.status === 400,
      `HTTP ${spoof.status}`
    );

    // #20 persistência (re-fetch)
    const listA = await api(baseUrl, g.token, "GET", "/api/rda/evaluations/requests");
    const sumA = await api(baseUrl, g.token, "GET", "/api/rda/evaluations/summary");
    const listB = await api(baseUrl, g.token, "GET", "/api/rda/evaluations/requests");
    const sumB = await api(baseUrl, g.token, "GET", "/api/rda/evaluations/summary");
    mark(
      20,
      "Re-fetch lista/totais persistem",
      listA.status === 200 &&
        listB.status === 200 &&
        sumA.status === 200 &&
        sumB.status === 200 &&
        JSON.stringify(listA.json) === JSON.stringify(listB.json) &&
        JSON.stringify(sumA.json) === JSON.stringify(sumB.json),
      `list=${listA.status}/${listB.status} summary=${sumA.status}/${sumB.status}`
    );

    // #21 RPC ownership mismatch (service_role)
    const { data: rpcData, error: rpcErr } = await sb.rpc("rda_work_session_finish", {
      p_workshop_id: WS,
      p_session_id: sessionId,
      p_technician_user_id: TECH2,
      p_client_mutation_id: m4,
    });
    const rpcObj = (rpcData || {}) as { ok?: boolean; code?: string };
    mark(
      21,
      "RPC finish tech2 + mut T1 → OWNER_MISMATCH",
      !rpcErr && rpcObj.ok === false && rpcObj.code === "RDA_MUTATION_OWNER_MISMATCH",
      rpcErr
        ? `rpc error: ${rpcErr.message}`
        : `ok=${String(rpcObj.ok)} code=${String(rpcObj.code)}`
    );

    // #22 revoke anon/authenticated
    const anon = (
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      ""
    ).trim();
    if (anon) {
      const anonClient = createClient(process.env.SUPABASE_URL!, anon, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error: anonExecErr } = await anonClient.rpc("rda_work_session_finish", {
        p_workshop_id: WS,
        p_session_id: sessionId,
        p_technician_user_id: TECH1,
        p_client_mutation_id: mut(`anon-${runId}`),
      });
      const denied =
        !!anonExecErr &&
        /permission denied|not exist|42501|403/i.test(anonExecErr.message);
      mark(
        22,
        "anon sem EXECUTE nas RPCs",
        denied,
        anonExecErr
          ? anonExecErr.message
          : "anon conseguiu EXECUTE (falha de segurança)"
      );
    } else {
      mark(
        22,
        "anon/authenticated sem EXECUTE",
        false,
        "PENDENTE: adicione VITE_SUPABASE_ANON_KEY (anon do TESTE) em .env.homologation — " +
          "02_verify já cobriu revoke_anon no SQL Editor, mas o runner não prova sem a anon key."
      );
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  console.log(`\nResultado: ${passed}/${results.length} ok`);
  if (failed.length) {
    console.log("Falhas:");
    for (const f of failed) console.log(`  #${f.id} ${f.name}: ${f.detail}`);
  }
  console.log(
    "\nPendências: sem merge/deploy/produção; IA continua desligada."
  );
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
