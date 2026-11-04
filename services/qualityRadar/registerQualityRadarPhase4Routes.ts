/**
 * Radar Fase 4 — ciclo semanal, relatórios, aprovação, histórico, agendamento.
 */
import type { Express, Request, Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { prepareWeeklyCycle } from "./prepareWeeklyCycle.js";
import {
  DEFAULT_WEEKLY_CYCLE_SCHEDULE,
  emptyTeamReportBody,
  parseWeeklyCycleSchedule,
  shouldRunWeeklyPrepareNow,
  WEEKLY_CYCLE_SETTING_KEYS,
  weekBoundsInTimeZone,
  compareIndicatorWeeks,
  type PersonReportIndicators,
  type TeamReportBody,
} from "./weeklyCycleDefaults.js";

type SessionPayload = { r: "admin" | "user"; u?: string; n?: string };

type Deps = {
  WORKSHOP_ID: string | undefined;
  supabaseAdmin: SupabaseClient | null;
  requestCanAccessQualityRadar: (req: Request) => Promise<boolean>;
  getWorkshopSettingValue: (key: string) => Promise<string | null>;
  setWorkshopSettingValue?: (key: string, value: string) => Promise<void>;
};

function authFromReq(req: Request): SessionPayload | null {
  return (req as unknown as { auth?: SessionPayload }).auth ?? null;
}

function weeklyCycleSecretOk(req: Request): boolean {
  const expected = (process.env.WEEKLY_CYCLE_SECRET || "").trim();
  if (!expected) return false;
  const got =
    String(req.headers["x-weekly-cycle-secret"] || "").trim() ||
    (typeof req.body?.secret === "string" ? req.body.secret.trim() : "");
  return got.length > 0 && got === expected;
}

export function registerQualityRadarPhase4Routes(app: Express, deps: Deps): void {
  const { WORKSHOP_ID, supabaseAdmin, requestCanAccessQualityRadar } = deps;

  async function actorFromReq(req: Request): Promise<{ userId: string | null; name: string }> {
    const auth = authFromReq(req);
    if (!auth) return { userId: null, name: "" };
    if (auth.r === "admin") return { userId: auth.u || null, name: auth.n || "Administrador" };
    if (!auth.u || !supabaseAdmin || !WORKSHOP_ID) {
      return { userId: auth.u || null, name: auth.n || "" };
    }
    const { data } = await supabaseAdmin
      .from("workshop_system_users")
      .select("display_name, username")
      .eq("id", auth.u)
      .eq("workshop_id", WORKSHOP_ID)
      .maybeSingle();
    const name =
      String((data as { display_name?: string } | null)?.display_name || "").trim() ||
      String((data as { username?: string } | null)?.username || "").trim() ||
      auth.n ||
      "";
    return { userId: auth.u, name };
  }

  async function loadSchedule() {
    const keys = Object.values(WEEKLY_CYCLE_SETTING_KEYS);
    const entries: Record<string, string | null> = {};
    for (const k of keys) {
      entries[k] = await deps.getWorkshopSettingValue(k);
    }
    return parseWeeklyCycleSchedule(entries);
  }

  // -------- settings --------
  app.get("/api/quality-radar/weekly-cycle/settings", async (req, res) => {
    try {
      if (!(await requestCanAccessQualityRadar(req))) {
        return res.status(403).json({ error: "Acesso negado." });
      }
      const schedule = await loadSchedule();
      let lastRun = null;
      if (supabaseAdmin && WORKSHOP_ID) {
        const { data } = await supabaseAdmin
          .from("workshop_quality_weekly_cron_runs")
          .select("id, started_at, finished_at, ok, skipped, skip_reason, persons_prepared, trigger_source")
          .eq("workshop_id", WORKSHOP_ID)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        lastRun = data;
      }
      return res.json({
        schedule,
        defaults: DEFAULT_WEEKLY_CYCLE_SCHEDULE,
        lastRun,
        schedulerNotes: {
          vercel: "vercel.json sem crons nativos no Hobby para sexta-feira; use cron diário 19:00 UTC que só age na janela local, ou pg_cron.",
          preferred: "Supabase pg_cron → POST /api/quality-radar/weekly-cycle/prepare com x-weekly-cycle-secret",
          noLongLlm: true,
        },
      });
    } catch (err: unknown) {
      return res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.put("/api/quality-radar/weekly-cycle/settings", async (req, res) => {
    try {
      if (!(await requestCanAccessQualityRadar(req))) {
        return res.status(403).json({ error: "Acesso negado." });
      }
      if (!deps.setWorkshopSettingValue) {
        return res.status(500).json({ error: "Persistência de ajustes indisponível." });
      }
      const body = (req.body || {}) as Record<string, unknown>;
      const current = await loadSchedule();
      const next = {
        enabled: body.enabled != null ? Boolean(body.enabled) : current.enabled,
        weekday:
          body.weekday != null ? Number(body.weekday) : current.weekday,
        hour: body.hour != null ? Number(body.hour) : current.hour,
        minute: body.minute != null ? Number(body.minute) : current.minute,
        timezone:
          typeof body.timezone === "string" && body.timezone.trim()
            ? body.timezone.trim()
            : current.timezone,
      };
      await deps.setWorkshopSettingValue(
        WEEKLY_CYCLE_SETTING_KEYS.enabled,
        next.enabled ? "true" : "false"
      );
      await deps.setWorkshopSettingValue(
        WEEKLY_CYCLE_SETTING_KEYS.weekday,
        String(Math.min(6, Math.max(0, Math.floor(next.weekday))))
      );
      await deps.setWorkshopSettingValue(
        WEEKLY_CYCLE_SETTING_KEYS.hour,
        String(Math.min(23, Math.max(0, Math.floor(next.hour))))
      );
      await deps.setWorkshopSettingValue(
        WEEKLY_CYCLE_SETTING_KEYS.minute,
        String(Math.min(59, Math.max(0, Math.floor(next.minute))))
      );
      await deps.setWorkshopSettingValue(WEEKLY_CYCLE_SETTING_KEYS.timezone, next.timezone);
      return res.json({ schedule: parseWeeklyCycleSchedule({
        [WEEKLY_CYCLE_SETTING_KEYS.enabled]: next.enabled ? "true" : "false",
        [WEEKLY_CYCLE_SETTING_KEYS.weekday]: String(next.weekday),
        [WEEKLY_CYCLE_SETTING_KEYS.hour]: String(next.hour),
        [WEEKLY_CYCLE_SETTING_KEYS.minute]: String(next.minute),
        [WEEKLY_CYCLE_SETTING_KEYS.timezone]: next.timezone,
      }) });
    } catch (err: unknown) {
      return res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  // -------- prepare (secret OU gestão) — SEM LLM --------
  // GET: Vercel Cron (Hobby = diário). POST: pg_cron / manual.
  async function handlePrepare(req: Request, res: Response, fromCronGet: boolean) {
    if (!supabaseAdmin || !WORKSHOP_ID) {
      return res.status(500).json({ error: "Servidor não configurado." });
    }
    const secretOk = weeklyCycleSecretOk(req);
    const cronAuth =
      fromCronGet &&
      !!process.env.CRON_SECRET &&
      String(req.headers.authorization || "") === `Bearer ${process.env.CRON_SECRET}`;
    const radarOk = await requestCanAccessQualityRadar(req);
    if (!secretOk && !cronAuth && !radarOk) {
      return res.status(403).json({ error: "Acesso negado (secret, CRON_SECRET ou Radar)." });
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const force = !fromCronGet && (body.force === true || radarOk);
    const respectSchedule =
      fromCronGet || body.respectSchedule === true || (!!secretOk && !force);
    const schedule = await loadSchedule();

    if (respectSchedule && !force) {
      const gate = shouldRunWeeklyPrepareNow(schedule);
      if (!gate.run) {
        const { data: cronRun } = await supabaseAdmin
          .from("workshop_quality_weekly_cron_runs")
          .insert({
            workshop_id: WORKSHOP_ID,
            trigger_source: fromCronGet ? "vercel" : secretOk ? "cron" : "manual",
            started_at: new Date().toISOString(),
            finished_at: new Date().toISOString(),
            ok: true,
            skipped: true,
            skip_reason: gate.reason,
            detail_json: { local: gate.local, schedule },
          })
          .select("id")
          .maybeSingle();
        return res.json({
          ok: true,
          skipped: true,
          skipReason: gate.reason,
          cronRunId: (cronRun as { id?: string } | null)?.id,
          personsPrepared: 0,
          personsExisting: 0,
          notified: false,
        });
      }
    }

    const triggerSource =
      fromCronGet
        ? "vercel"
        : body.triggerSource === "vercel" || body.triggerSource === "pg_cron"
          ? body.triggerSource
          : secretOk
            ? "cron"
            : "manual";

    const result = await prepareWeeklyCycle({
      workshopId: WORKSHOP_ID,
      supabase: supabaseAdmin,
      triggerSource,
      timezone: schedule.timezone,
      weekFrom: typeof body.weekFrom === "string" ? body.weekFrom : undefined,
      weekTo: typeof body.weekTo === "string" ? body.weekTo : undefined,
      force: true,
      notify: body.notify !== false,
    });

    const status = result.ok ? 200 : result.skipped ? 503 : 500;
    return res.status(status).json(result);
  }

  app.get("/api/quality-radar/weekly-cycle/prepare", async (req, res) => {
    try {
      await handlePrepare(req, res, true);
    } catch (err: unknown) {
      console.error("[API] GET weekly-cycle/prepare:", err);
      return res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.post("/api/quality-radar/weekly-cycle/prepare", async (req, res) => {
    try {
      await handlePrepare(req, res, false);
    } catch (err: unknown) {
      console.error("[API] POST weekly-cycle/prepare:", err);
      return res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  // -------- list cycles --------
  app.get("/api/quality-radar/weekly-cycles", async (req, res) => {
    try {
      if (!(await requestCanAccessQualityRadar(req))) {
        return res.status(403).json({ error: "Acesso negado." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const { data, error } = await supabaseAdmin
        .from("workshop_quality_weekly_cycles")
        .select("*")
        .eq("workshop_id", WORKSHOP_ID)
        .order("week_from", { ascending: false })
        .limit(24);
      if (error) {
        if (/does not exist|schema cache/i.test(error.message)) {
          return res.status(503).json({ cycles: [], code: "MIGRATION_PENDING", error: error.message });
        }
        return res.status(500).json({ error: error.message });
      }
      return res.json({ cycles: data || [] });
    } catch (err: unknown) {
      return res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.get("/api/quality-radar/weekly-cycles/:id", async (req, res) => {
    try {
      if (!(await requestCanAccessQualityRadar(req))) {
        return res.status(403).json({ error: "Acesso negado." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const id = String(req.params.id || "").trim();
      const { data: cycle, error } = await supabaseAdmin
        .from("workshop_quality_weekly_cycles")
        .select("*")
        .eq("workshop_id", WORKSHOP_ID)
        .eq("id", id)
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      if (!cycle) return res.status(404).json({ error: "Ciclo não encontrado." });

      const [{ data: reports }, { data: team }] = await Promise.all([
        supabaseAdmin
          .from("workshop_quality_weekly_person_reports")
          .select("*")
          .eq("cycle_id", id)
          .order("person_name"),
        supabaseAdmin
          .from("workshop_quality_weekly_team_reports")
          .select("*")
          .eq("cycle_id", id)
          .maybeSingle(),
      ]);

      return res.json({ cycle, reports: reports || [], teamReport: team || null });
    } catch (err: unknown) {
      return res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  // -------- person report detail + versions --------
  app.get("/api/quality-radar/weekly-person-reports/:id", async (req, res) => {
    try {
      if (!(await requestCanAccessQualityRadar(req))) {
        return res.status(403).json({ error: "Acesso negado." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const id = String(req.params.id || "").trim();
      const { data: report, error } = await supabaseAdmin
        .from("workshop_quality_weekly_person_reports")
        .select("*")
        .eq("workshop_id", WORKSHOP_ID)
        .eq("id", id)
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      if (!report) return res.status(404).json({ error: "Relatório não encontrado." });

      const { data: versions } = await supabaseAdmin
        .from("workshop_quality_weekly_person_report_versions")
        .select("*")
        .eq("report_id", id)
        .order("version", { ascending: false });

      return res.json({ report, versions: versions || [] });
    } catch (err: unknown) {
      return res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.post("/api/quality-radar/weekly-person-reports/:id/skip", async (req, res) => {
    try {
      if (!(await requestCanAccessQualityRadar(req))) {
        return res.status(403).json({ error: "Acesso negado." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const id = String(req.params.id || "").trim();
      const actor = await actorFromReq(req);
      const reason =
        typeof req.body?.reason === "string" ? req.body.reason.trim() : "Pulado pelo líder";
      const insufficient = req.body?.insufficientData === true;
      const { data, error } = await supabaseAdmin
        .from("workshop_quality_weekly_person_reports")
        .update({
          status: insufficient ? "insufficient_data" : "skipped",
          skip_reason: reason,
          leader_user_id: actor.userId,
          leader_name: actor.name,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .select("*")
        .single();
      if (error) return res.status(500).json({ error: error.message });

      const cycleId = String((data as { cycle_id: string }).cycle_id);
      const { count } = await supabaseAdmin
        .from("workshop_quality_weekly_person_reports")
        .select("id", { count: "exact", head: true })
        .eq("cycle_id", cycleId)
        .in("status", ["skipped", "insufficient_data"]);
      await supabaseAdmin
        .from("workshop_quality_weekly_cycles")
        .update({
          skipped_count: count || 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", cycleId);

      return res.json({ report: data });
    } catch (err: unknown) {
      return res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  /** Salva nova versão (não apaga a anterior). */
  app.put("/api/quality-radar/weekly-person-reports/:id/content", async (req, res) => {
    try {
      if (!(await requestCanAccessQualityRadar(req))) {
        return res.status(403).json({ error: "Acesso negado." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const id = String(req.params.id || "").trim();
      const actor = await actorFromReq(req);
      const body = (req.body || {}) as Record<string, unknown>;

      const { data: report, error } = await supabaseAdmin
        .from("workshop_quality_weekly_person_reports")
        .select("*")
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      if (!report) return res.status(404).json({ error: "Relatório não encontrado." });
      if ((report as { status: string }).status === "approved") {
        // correção pós-aprovação: cria versão nova e volta para awaiting_review
      }

      const { data: latest } = await supabaseAdmin
        .from("workshop_quality_weekly_person_report_versions")
        .select("*")
        .eq("report_id", id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextVersion = latest ? Number((latest as { version: number }).version) + 1 : 1;
      if (latest && (latest as { status: string }).status !== "approved") {
        await supabaseAdmin
          .from("workshop_quality_weekly_person_report_versions")
          .update({ status: "superseded" })
          .eq("id", (latest as { id: string }).id);
      } else if (latest && (latest as { status: string }).status === "approved") {
        await supabaseAdmin
          .from("workshop_quality_weekly_person_report_versions")
          .update({ status: "superseded" })
          .eq("id", (latest as { id: string }).id);
      }

      const header = (body.header as object) || (latest as { header_json?: object })?.header_json || {};
      const indicators =
        (body.indicators as object) ||
        (latest as { indicators_json?: object })?.indicators_json ||
        {};
      const analysis =
        (body.analysis as object) || (latest as { analysis_json?: object })?.analysis_json || {};
      const actionPlan =
        (body.actionPlan as object) ||
        (latest as { action_plan_json?: object })?.action_plan_json ||
        {};
      const conclusion =
        (body.conclusion as object) ||
        (latest as { conclusion_json?: object })?.conclusion_json ||
        {};
      const unavailableFields = Array.isArray(body.unavailableFields)
        ? body.unavailableFields
        : (latest as { unavailable_fields?: unknown[] })?.unavailable_fields || [];

      const { data: version, error: vErr } = await supabaseAdmin
        .from("workshop_quality_weekly_person_report_versions")
        .insert({
          workshop_id: WORKSHOP_ID,
          report_id: id,
          version: nextVersion,
          status: "awaiting_review",
          header_json: header,
          indicators_json: indicators,
          analysis_json: analysis,
          action_plan_json: actionPlan,
          conclusion_json: conclusion,
          unavailable_fields: unavailableFields,
          created_by_user_id: actor.userId,
          created_by_name: actor.name,
          change_summary:
            typeof body.changeSummary === "string"
              ? body.changeSummary
              : `Versão ${nextVersion} editada pelo líder`,
        })
        .select("*")
        .single();
      if (vErr) return res.status(500).json({ error: vErr.message });

      const { data: updated } = await supabaseAdmin
        .from("workshop_quality_weekly_person_reports")
        .update({
          status: "awaiting_review",
          current_version: nextVersion,
          leader_user_id: actor.userId,
          leader_name: actor.name,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("*")
        .single();

      return res.json({ report: updated, version });
    } catch (err: unknown) {
      return res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.post("/api/quality-radar/weekly-person-reports/:id/approve", async (req, res) => {
    try {
      if (!(await requestCanAccessQualityRadar(req))) {
        return res.status(403).json({ error: "Acesso negado." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const id = String(req.params.id || "").trim();
      const actor = await actorFromReq(req);
      const { data: latest } = await supabaseAdmin
        .from("workshop_quality_weekly_person_report_versions")
        .select("*")
        .eq("report_id", id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!latest) return res.status(404).json({ error: "Sem versão para aprovar." });

      await supabaseAdmin
        .from("workshop_quality_weekly_person_report_versions")
        .update({ status: "approved" })
        .eq("id", (latest as { id: string }).id);

      const { data: report, error } = await supabaseAdmin
        .from("workshop_quality_weekly_person_reports")
        .update({
          status: "approved",
          approved_at: new Date().toISOString(),
          approved_by_user_id: actor.userId,
          approved_by_name: actor.name,
          leader_user_id: actor.userId,
          leader_name: actor.name,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .select("*")
        .single();
      if (error) return res.status(500).json({ error: error.message });

      const cycleId = String((report as { cycle_id: string }).cycle_id);
      const { count } = await supabaseAdmin
        .from("workshop_quality_weekly_person_reports")
        .select("id", { count: "exact", head: true })
        .eq("cycle_id", cycleId)
        .eq("status", "approved");
      await supabaseAdmin
        .from("workshop_quality_weekly_cycles")
        .update({
          approved_count: count || 0,
          status: "awaiting_review",
          updated_at: new Date().toISOString(),
        })
        .eq("id", cycleId);

      return res.json({
        report,
        version: latest,
        note: "Aprovado pela gerência. Nenhuma promoção/punição automática.",
      });
    } catch (err: unknown) {
      return res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  // -------- team report --------
  app.get("/api/quality-radar/weekly-cycles/:id/team-report", async (req, res) => {
    try {
      if (!(await requestCanAccessQualityRadar(req))) {
        return res.status(403).json({ error: "Acesso negado." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const cycleId = String(req.params.id || "").trim();
      const { data: team } = await supabaseAdmin
        .from("workshop_quality_weekly_team_reports")
        .select("*")
        .eq("cycle_id", cycleId)
        .eq("workshop_id", WORKSHOP_ID)
        .maybeSingle();
      if (!team) return res.status(404).json({ error: "Relatório de equipe inexistente." });
      const { data: versions } = await supabaseAdmin
        .from("workshop_quality_weekly_team_report_versions")
        .select("*")
        .eq("team_report_id", (team as { id: string }).id)
        .order("version", { ascending: false });
      return res.json({ teamReport: team, versions: versions || [] });
    } catch (err: unknown) {
      return res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.put("/api/quality-radar/weekly-cycles/:id/team-report", async (req, res) => {
    try {
      if (!(await requestCanAccessQualityRadar(req))) {
        return res.status(403).json({ error: "Acesso negado." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const cycleId = String(req.params.id || "").trim();
      const actor = await actorFromReq(req);
      const body = (req.body || {}) as Partial<TeamReportBody>;

      let { data: team } = await supabaseAdmin
        .from("workshop_quality_weekly_team_reports")
        .select("*")
        .eq("cycle_id", cycleId)
        .eq("workshop_id", WORKSHOP_ID)
        .maybeSingle();
      if (!team) {
        const ins = await supabaseAdmin
          .from("workshop_quality_weekly_team_reports")
          .insert({
            workshop_id: WORKSHOP_ID,
            cycle_id: cycleId,
            status: "in_progress",
          })
          .select("*")
          .single();
        if (ins.error) return res.status(500).json({ error: ins.error.message });
        team = ins.data;
      }

      const { data: latest } = await supabaseAdmin
        .from("workshop_quality_weekly_team_report_versions")
        .select("*")
        .eq("team_report_id", (team as { id: string }).id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latest) {
        await supabaseAdmin
          .from("workshop_quality_weekly_team_report_versions")
          .update({ status: "superseded" })
          .eq("id", (latest as { id: string }).id);
      }
      const nextVersion = latest ? Number((latest as { version: number }).version) + 1 : 1;
      const base = emptyTeamReportBody();
      const prevBody = ((latest as { body_json?: TeamReportBody } | null)?.body_json ||
        base) as TeamReportBody;
      const merged: TeamReportBody = {
        ...base,
        ...prevBody,
        ...body,
        noteNoRanking: base.noteNoRanking,
      };

      const { data: version, error } = await supabaseAdmin
        .from("workshop_quality_weekly_team_report_versions")
        .insert({
          workshop_id: WORKSHOP_ID,
          team_report_id: (team as { id: string }).id,
          version: nextVersion,
          status: "awaiting_review",
          body_json: merged,
          unavailable_fields: merged.unavailableFields || [],
          created_by_user_id: actor.userId,
          created_by_name: actor.name,
          change_summary: `Versão ${nextVersion}`,
        })
        .select("*")
        .single();
      if (error) return res.status(500).json({ error: error.message });

      const { data: updated } = await supabaseAdmin
        .from("workshop_quality_weekly_team_reports")
        .update({
          status: "awaiting_review",
          current_version: nextVersion,
          updated_at: new Date().toISOString(),
        })
        .eq("id", (team as { id: string }).id)
        .select("*")
        .single();

      return res.json({ teamReport: updated, version });
    } catch (err: unknown) {
      return res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.post("/api/quality-radar/weekly-cycles/:id/team-report/approve", async (req, res) => {
    try {
      if (!(await requestCanAccessQualityRadar(req))) {
        return res.status(403).json({ error: "Acesso negado." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const cycleId = String(req.params.id || "").trim();
      const actor = await actorFromReq(req);
      const { data: team } = await supabaseAdmin
        .from("workshop_quality_weekly_team_reports")
        .select("*")
        .eq("cycle_id", cycleId)
        .eq("workshop_id", WORKSHOP_ID)
        .maybeSingle();
      if (!team) return res.status(404).json({ error: "Relatório de equipe inexistente." });

      const { data: latest } = await supabaseAdmin
        .from("workshop_quality_weekly_team_report_versions")
        .select("*")
        .eq("team_report_id", (team as { id: string }).id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!latest) return res.status(404).json({ error: "Sem versão." });

      await supabaseAdmin
        .from("workshop_quality_weekly_team_report_versions")
        .update({ status: "approved" })
        .eq("id", (latest as { id: string }).id);

      const { data: updated } = await supabaseAdmin
        .from("workshop_quality_weekly_team_reports")
        .update({
          status: "approved",
          approved_at: new Date().toISOString(),
          approved_by_user_id: actor.userId,
          approved_by_name: actor.name,
          updated_at: new Date().toISOString(),
        })
        .eq("id", (team as { id: string }).id)
        .select("*")
        .single();

      await supabaseAdmin
        .from("workshop_quality_weekly_cycles")
        .update({ status: "approved", updated_at: new Date().toISOString() })
        .eq("id", cycleId);

      return res.json({
        teamReport: updated,
        version: latest,
        note: "Consolidado aprovado. Decisões de diretoria permanecem humanas.",
      });
    } catch (err: unknown) {
      return res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  // -------- history / compare --------
  app.get("/api/quality-radar/weekly-history", async (req, res) => {
    try {
      if (!(await requestCanAccessQualityRadar(req))) {
        return res.status(403).json({ error: "Acesso negado." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const systemUserId =
        typeof req.query.systemUserId === "string" ? req.query.systemUserId.trim() : "";
      const technicianId =
        typeof req.query.technicianId === "string" ? req.query.technicianId.trim() : "";
      const months = Math.min(12, Math.max(1, Number(req.query.months || 3) || 3));

      let q = supabaseAdmin
        .from("workshop_quality_weekly_person_reports")
        .select(
          "id, cycle_id, person_name, status, current_version, approved_at, job_title, system_user_id, workshop_technician_id, created_at"
        )
        .eq("workshop_id", WORKSHOP_ID)
        .order("created_at", { ascending: false })
        .limit(40);
      if (systemUserId) q = q.eq("system_user_id", systemUserId);
      if (technicianId) q = q.eq("workshop_technician_id", technicianId);
      const { data: reports, error } = await q;
      if (error) {
        if (/does not exist|schema cache/i.test(error.message)) {
          return res.status(503).json({ code: "MIGRATION_PENDING", items: [] });
        }
        return res.status(500).json({ error: error.message });
      }

      const fromDate = new Date();
      fromDate.setMonth(fromDate.getMonth() - months);

      const items = [];
      for (const r of reports || []) {
        const { data: cycle } = await supabaseAdmin
          .from("workshop_quality_weekly_cycles")
          .select("week_from, week_to, status")
          .eq("id", (r as { cycle_id: string }).cycle_id)
          .maybeSingle();
        if (cycle && String((cycle as { week_from: string }).week_from) < fromDate.toISOString().slice(0, 10)) {
          continue;
        }
        const { data: ver } = await supabaseAdmin
          .from("workshop_quality_weekly_person_report_versions")
          .select(
            "version, status, indicators_json, analysis_json, conclusion_json, unavailable_fields, created_at"
          )
          .eq("report_id", (r as { id: string }).id)
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle();
        items.push({ report: r, cycle, latestVersion: ver });
      }

      // comparação semana atual vs anterior (se houver 2+)
      let weekCompare: unknown = null;
      if (items.length >= 2) {
        const cur = items[0]?.latestVersion?.indicators_json as PersonReportIndicators | undefined;
        const prev = items[1]?.latestVersion?.indicators_json as PersonReportIndicators | undefined;
        if (cur && prev) weekCompare = compareIndicatorWeeks(cur, prev);
      }

      return res.json({
        months,
        items,
        weekCompare,
        note: "Sem rankings entre funções distintas. Apenas indicadores disponíveis.",
      });
    } catch (err: unknown) {
      return res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  // current week bounds helper
  app.get("/api/quality-radar/weekly-cycle/week-bounds", async (req, res) => {
    try {
      if (!(await requestCanAccessQualityRadar(req))) {
        return res.status(403).json({ error: "Acesso negado." });
      }
      const schedule = await loadSchedule();
      return res.json({
        ...weekBoundsInTimeZone(new Date(), schedule.timezone),
        timezone: schedule.timezone,
      });
    } catch (err: unknown) {
      return res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });
}
