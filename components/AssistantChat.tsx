import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import { markdownComponentsApp } from "./ui/markdownUi";
import { uiChatBubbleAssistant, uiChatMeta, uiChatScrollArea } from "./ui/appTypography";
import { Mic, Send, Sparkles, Volume2, VolumeX, X } from "lucide-react";
import {
  iosModalClose,
  iosModalInsetCard,
  iosModalShellZayaInner,
  iosInput,
} from "./ui/iosModalStyles";
import { AssistantIcon, ZayaAuroraModalFrame } from "./AssistantIcon";
import { ASSISTANT_NAME } from "../constants/assistant";
import type { TabId } from "./TabBar";
import {
  listAssistantLearnedCommands,
  listAssistantMemories,
  postAssistantChat,
  saveAssistantLearnedCommand,
  saveAssistantMemory,
  type AssistantApiMessage,
  type AssistantToolCall,
} from "../services/assistantApi";
import { postAssistantRealtimeSession } from "../services/assistantRealtimeApi";
import { OpenAiRealtimeClient } from "../services/openaiRealtimeClient";
import {
  appendWorkshopReminder,
  deleteWorkshopReminder,
  readWorkshopReminders,
  updateWorkshopReminder,
} from "../services/workshopRemindersStorage";
import {
  clearNotifications,
  createZayaRelayToManagement,
  createZayaRelayToTechnicians,
  getNotifications,
  getSystemUserTechnicians,
  getUnreadNotificationsCount,
  getZayaRelayPendingCountForManagement,
  getZayaRelayPendingCountForTechnician,
  getZayaRelayPendingForManagement,
  getZayaRelayPendingForTechnician,
  markAllNotificationsRead,
  markNotificationRead,
  markZayaRelayOpened,
  submitZayaRelayReply,
  deleteTvWeeklyGoal,
  getTvPlaylist,
  putTvWeeklyGoal,
  type ServiceOrderUpdateActor,
  type Notification,
  type ZayaRelayPendingRow,
} from "../services/apiService";
import {
  isValidServiceOrderStatus,
  listVehiclesInStageJson,
  updateServiceOrderStageJson,
} from "../services/assistantPatioTools";
import type { AssistantContext } from "../services/assistantExtendedTools";
import type { RelaySessionRole } from "../assistantOpenAiTools";
import {
  addServiceOrderCommentJson,
  addServiceOrderBudgetItemsJson,
  countCustomerOpenOrdersJson,
  countOrdersByStageJson,
  createAppointmentJson,
  createServiceOrderBudgetSimpleJson,
  getServiceOrderBudgetsJson,
  getServiceOrderCommentsJson,
  listAppointmentsJson,
  listOrdersByTechnicianJson,
  listUpcomingDeliveriesJson,
  registerCustomerVehicleIntakeJson,
  searchCustomersJson,
  searchServiceOrdersJson,
  openPatioVehicleModalJson,
  openPatioVehicleBudgetViewJson,
  getCustomerComplaintForVehicleJson,
  appendComplaintToVehicleJson,
  setVehicleTechnicianJson,
  openPatioVehicleHistoryJson,
  listArchivedVehicleOrdersJson,
  unarchiveVehicleServiceOrderJson,
  updateServiceOrderBudgetJson,
} from "../services/assistantExtendedTools";

interface AssistantChatProps {
  theme: "dark" | "light";
  allowedTabs: TabId[];
  onNavigateTab: (tab: TabId) => void;
  onOpenSettings: () => void;
  /** Quem executa mudança de etapa da OS (notificações), igual ao Pátio. */
  serviceOrderActor?: ServiceOrderUpdateActor;
  assistantAuthorDisplayName: string;
  assistantCommentActor: "admin" | "technician";
  /** UUID do usuário do sistema (técnico), para "minhas OS". */
  currentTechnicianUserId?: string | null;
  /** Abre o modal do veículo no Pátio (OS já resolvida pela Zaya). */
  onOpenPatioVehicle?: (serviceOrderId: string, options?: { budgetId?: string }) => void;
  /** Abre o modal de histórico de arquivados no Pátio ou Laboratório. */
  onOpenPatioHistory?: (target: "patio" | "laboratorio") => void;
  /** Recados entre gerência e técnicos (ferramentas + indicador). */
  relaySessionRole?: RelaySessionRole;
  /** Aviso da central (tipo zaya_*): abre o modal e fala o texto. */
  pendingZayaNotification?: Notification | null;
  onPendingZayaConsumed?: () => void;
}

/** API Web Speech (tipos podem não estar no tsconfig). */
type SpeechRecCtor = new () => {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((ev: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getSpeechRecognitionCtor(): SpeechRecCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecCtor;
    webkitSpeechRecognition?: SpeechRecCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

const TTS_STORAGE_KEY = "assistant_tts_enabled";

/** Remove markdown para leitura em voz ficar natural. */
function markdownToSpeechText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]+`/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/#{1,6}\s*/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Texto linear para leitura em voz (Realtime ou TTS do navegador). */
function combineRelayRowsForVoice(
  rows: ZayaRelayPendingRow[],
  scope: "technician" | "management"
): string {
  if (rows.length === 0) return "";
  if (scope === "technician") {
    return rows
      .map((r, i) =>
        rows.length > 1
          ? `Recado ${i + 1} de ${rows.length} da gerência: ${r.body.replace(/\s+/g, " ").trim()}`
          : `Recado da gerência: ${r.body.replace(/\s+/g, " ").trim()}`
      )
      .join(". ");
  }
  return rows
    .map((r, i) =>
      rows.length > 1
        ? `Recado ${i + 1} de ${rows.length} do técnico ${r.sender_label}: ${r.body.replace(/\s+/g, " ").trim()}`
        : `Recado do técnico ${r.sender_label}: ${r.body.replace(/\s+/g, " ").trim()}`
    )
    .join(". ");
}

function relayIsManagement(role: RelaySessionRole | undefined): boolean {
  return role === "management" || role === "both";
}

function relayIsTechnician(role: RelaySessionRole | undefined): boolean {
  return role === "technician" || role === "both";
}

type RelayMarkBatch = {
  ids: string[];
  scope: "technician" | "management";
  userId?: string;
};

type RelayPendingQueueItem = { row: ZayaRelayPendingRow; scope: "technician" | "management" };

function mergeRelayPendingQueues(
  role: RelaySessionRole,
  techRows: ZayaRelayPendingRow[],
  mgmtRows: ZayaRelayPendingRow[],
  technicianUserId: string | null | undefined
): RelayPendingQueueItem[] {
  const out: RelayPendingQueueItem[] = [];
  if (relayIsTechnician(role) && technicianUserId) {
    for (const row of techRows) out.push({ row, scope: "technician" });
  }
  if (relayIsManagement(role)) {
    for (const row of mgmtRows) out.push({ row, scope: "management" });
  }
  out.sort((a, b) => a.row.created_at.localeCompare(b.row.created_at));
  return out;
}

function buildRelayMarkBatches(
  items: RelayPendingQueueItem[],
  technicianUserId: string | null | undefined
): RelayMarkBatch[] {
  const techIds = items.filter((i) => i.scope === "technician").map((i) => i.row.id);
  const mgmtIds = items.filter((i) => i.scope === "management").map((i) => i.row.id);
  const batches: RelayMarkBatch[] = [];
  if (techIds.length) {
    batches.push({
      ids: techIds,
      scope: "technician",
      ...(technicianUserId ? { userId: technicianUserId } : {}),
    });
  }
  if (mgmtIds.length) batches.push({ ids: mgmtIds, scope: "management" });
  return batches;
}

function relayItemsToAssistantMessages(items: RelayPendingQueueItem[]): AssistantApiMessage[] {
  return items.map(({ row, scope }) =>
    scope === "technician"
      ? {
          role: "assistant" as const,
          content:
            `**Recado da gerência**\n\n${row.body}\n\n---\nPara responder, diga ou escreva sua resposta; o id deste recado é \`${row.id}\` (uso na ferramenta zaya_submit_relay_reply).`,
        }
      : {
          role: "assistant" as const,
          content:
            `**Recado do técnico ${row.sender_label}**\n\n${row.body}\n\n---\nPara responder a este recado, use a ferramenta de resposta com o id \`${row.id}\` e o texto da sua resposta.`,
        }
  );
}

function speakAssistantResponse(text: string): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const plain = markdownToSpeechText(text);
  if (!plain.trim()) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(plain);
  u.lang = "pt-BR";
  const voices = window.speechSynthesis.getVoices();
  const ptBr =
    voices.find((v) => /pt-BR|pt_BR/i.test(v.lang)) ||
    voices.find((v) => v.lang.toLowerCase().startsWith("pt"));
  if (ptBr) u.voice = ptBr;
  u.rate = 0.98;
  window.speechSynthesis.speak(u);
}

/** Frase falada pela Zaya ao receber aviso da central de notificações. */
function zayaAlertToSpokenLine(n: Notification): string {
  const p = n.payload;
  const model = (p.vehicle_model && String(p.vehicle_model).trim()) || "Veículo";
  const fullName = typeof p.customer_name === "string" ? p.customer_name.trim() : "";
  const firstName = fullName ? fullName.split(/\s+/)[0] : "";
  const vehicle = firstName ? `${model}, cliente ${firstName}` : model;
  switch (n.type) {
    case "zaya_stage_aguardando_aprovacao":
      return `${ASSISTANT_NAME}: ${vehicle} entrou na etapa aguardando aprovação.`;
    case "zaya_stage_finalizado":
      return `${ASSISTANT_NAME}: ${vehicle} está na etapa finalizado.`;
    case "zaya_orcamento_com_aprovacao":
      return `${ASSISTANT_NAME}: no orçamento de ${vehicle}, a gerência aprovou itens.`;
    case "zaya_orcamento_com_reprovacao":
      return `${ASSISTANT_NAME}: no orçamento de ${vehicle}, a gerência reprovou itens.`;
    default:
      return `${ASSISTANT_NAME}: alerta sobre ${vehicle}.`;
  }
}

function parseOsNumber(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = parseInt(raw.trim(), 10);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

async function executeToolCalls(
  calls: AssistantToolCall[],
  allowedTabs: TabId[],
  onNavigateTab: (tab: TabId) => void,
  onOpenSettings: () => void,
  serviceOrderActor: ServiceOrderUpdateActor | undefined,
  assistantCtx: AssistantContext,
  onOpenPatioVehicle?: (serviceOrderId: string, options?: { budgetId?: string }) => void,
  onOpenPatioHistory?: (target: "patio" | "laboratorio") => void
): Promise<{ id: string; content: string }[]> {
  const results: { id: string; content: string }[] = [];
  const assistantIsAdmin = assistantCtx.isAdminSession === true;
  const assistantUserId = assistantIsAdmin
    ? "admin"
    : typeof assistantCtx.currentTechnicianUserId === "string"
      ? assistantCtx.currentTechnicianUserId
      : undefined;
  const assistantUserDisplayName = assistantCtx.authorDisplayName;
  for (const tc of calls) {
    if (tc.type !== "function") continue;
    const name = tc.function.name;
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;
    } catch {
      payload = {};
    }
    if (name === "navigate_to_tab") {
      const tab = String(payload.tab ?? "").trim() as TabId;
      if (allowedTabs.includes(tab)) {
        onNavigateTab(tab);
        results.push({ id: tc.id, content: JSON.stringify({ ok: true, navigated: tab }) });
      } else {
        results.push({
          id: tc.id,
          content: JSON.stringify({
            ok: false,
            error: "Aba não permitida para este usuário.",
          }),
        });
      }
      continue;
    }
    if (name === "open_settings") {
      onOpenSettings();
      results.push({ id: tc.id, content: JSON.stringify({ ok: true, opened: "settings" }) });
      continue;
    }
    if (name === "zaya_save_user_memory") {
      const memoryText = String(payload.memory_text ?? "").trim();
      const category =
        payload.category === "routine" || payload.category === "context" ? payload.category : "preference";
      if (!memoryText) {
        results.push({ id: tc.id, content: JSON.stringify({ ok: false, error: "memory_text obrigatório." }) });
        continue;
      }
      try {
        const out = await saveAssistantMemory({
          assistantIsAdmin,
          assistantUserId,
          assistantUserDisplayName,
          memoryText,
          category,
        });
        results.push({ id: tc.id, content: JSON.stringify({ ok: out.ok, message: out.message }) });
      } catch (e) {
        results.push({
          id: tc.id,
          content: JSON.stringify({
            ok: false,
            error: e instanceof Error ? e.message : "Falha ao salvar memória.",
          }),
        });
      }
      continue;
    }
    if (name === "zaya_teach_command") {
      const triggerPhrase = String(payload.trigger_phrase ?? "").trim();
      const behaviorText = String(payload.behavior_text ?? "").trim();
      const behaviorKind =
        payload.behavior_kind === "action_only" || payload.behavior_kind === "text_only"
          ? payload.behavior_kind
          : "action_text";
      if (!triggerPhrase || !behaviorText) {
        results.push({
          id: tc.id,
          content: JSON.stringify({ ok: false, error: "trigger_phrase e behavior_text são obrigatórios." }),
        });
        continue;
      }
      try {
        const out = await saveAssistantLearnedCommand({
          assistantIsAdmin,
          assistantUserId,
          assistantUserDisplayName,
          triggerPhrase,
          behaviorText,
          behaviorKind,
        });
        results.push({ id: tc.id, content: JSON.stringify({ ok: out.ok, message: out.message }) });
      } catch (e) {
        results.push({
          id: tc.id,
          content: JSON.stringify({
            ok: false,
            error: e instanceof Error ? e.message : "Falha ao ensinar comando.",
          }),
        });
      }
      continue;
    }
    if (name === "zaya_list_user_memories") {
      try {
        const out = await listAssistantMemories({
          assistantIsAdmin,
          assistantUserId,
          assistantUserDisplayName,
        });
        results.push({
          id: tc.id,
          content: JSON.stringify({
            ok: out.ok,
            total: out.memories?.length ?? 0,
            memories: out.memories ?? [],
            message: out.message,
          }),
        });
      } catch (e) {
        results.push({
          id: tc.id,
          content: JSON.stringify({
            ok: false,
            error: e instanceof Error ? e.message : "Falha ao listar memórias.",
          }),
        });
      }
      continue;
    }
    if (name === "zaya_list_learned_commands") {
      try {
        const out = await listAssistantLearnedCommands({
          assistantIsAdmin,
          assistantUserId,
          assistantUserDisplayName,
        });
        results.push({
          id: tc.id,
          content: JSON.stringify({
            ok: out.ok,
            total: out.commands?.length ?? 0,
            commands: out.commands ?? [],
            message: out.message,
          }),
        });
      } catch (e) {
        results.push({
          id: tc.id,
          content: JSON.stringify({
            ok: false,
            error: e instanceof Error ? e.message : "Falha ao listar comandos ensinados.",
          }),
        });
      }
      continue;
    }
    if (name === "list_notifications") {
      const limRaw = payload.limit;
      const lim =
        typeof limRaw === "number" && Number.isFinite(limRaw) && limRaw > 0
          ? Math.min(Math.floor(limRaw), 100)
          : 50;
      try {
        const list = await getNotifications({ for: "all", limit: lim });
        const rows = list.map((n) => ({
          id: n.id,
          type: n.type,
          lida: n.read_at != null,
          created_at: n.created_at,
          target_type: n.target_type ?? null,
          target_slug: n.target_slug ?? null,
          payload: n.payload,
        }));
        results.push({
          id: tc.id,
          content: JSON.stringify({ ok: true, total: rows.length, notificacoes: rows }),
        });
      } catch (e) {
        results.push({
          id: tc.id,
          content: JSON.stringify({
            ok: false,
            error: e instanceof Error ? e.message : "Falha ao listar notificações.",
          }),
        });
      }
      continue;
    }
    if (name === "get_unread_notifications_count") {
      try {
        const count = await getUnreadNotificationsCount({ for: "all" });
        results.push({ id: tc.id, content: JSON.stringify({ ok: true, nao_lidas: count }) });
      } catch (e) {
        results.push({
          id: tc.id,
          content: JSON.stringify({
            ok: false,
            error: e instanceof Error ? e.message : "Falha ao contar notificações.",
          }),
        });
      }
      continue;
    }
    if (name === "mark_notification_read") {
      const nid = String(payload.notification_id ?? "").trim();
      if (!nid) {
        results.push({
          id: tc.id,
          content: JSON.stringify({ ok: false, error: "notification_id obrigatório." }),
        });
        continue;
      }
      try {
        await markNotificationRead(nid, { for: "all" });
        results.push({ id: tc.id, content: JSON.stringify({ ok: true, notification_id: nid }) });
      } catch (e) {
        results.push({
          id: tc.id,
          content: JSON.stringify({
            ok: false,
            error: e instanceof Error ? e.message : "Falha ao marcar como lida.",
          }),
        });
      }
      continue;
    }
    if (name === "mark_all_notifications_read") {
      try {
        await markAllNotificationsRead({ for: "all" });
        results.push({ id: tc.id, content: JSON.stringify({ ok: true, marcadas: "todas" }) });
      } catch (e) {
        results.push({
          id: tc.id,
          content: JSON.stringify({
            ok: false,
            error: e instanceof Error ? e.message : "Falha ao marcar todas como lidas.",
          }),
        });
      }
      continue;
    }
    if (name === "clear_all_notifications") {
      try {
        await clearNotifications({ for: "all" });
        results.push({ id: tc.id, content: JSON.stringify({ ok: true, removidas: "todas" }) });
      } catch (e) {
        results.push({
          id: tc.id,
          content: JSON.stringify({
            ok: false,
            error: e instanceof Error ? e.message : "Falha ao limpar notificações.",
          }),
        });
      }
      continue;
    }
    if (name === "get_tv_weekly_goal") {
      try {
        const { weeklyGoal } = await getTvPlaylist();
        results.push({
          id: tc.id,
          content: JSON.stringify({
            ok: true,
            weekly_goal: weeklyGoal
              ? {
                  label: weeklyGoal.label,
                  current_amount: weeklyGoal.currentAmount,
                  target_amount: weeklyGoal.targetAmount,
                  show_weekly_bar: weeklyGoal.showWeeklyBar !== false,
                }
              : null,
            mensagem: weeklyGoal
              ? "Meta semanal configurada."
              : "Nenhuma meta semanal cadastrada ainda.",
          }),
        });
      } catch (e) {
        results.push({
          id: tc.id,
          content: JSON.stringify({
            ok: false,
            error: e instanceof Error ? e.message : "Falha ao ler meta semanal.",
          }),
        });
      }
      continue;
    }
    if (name === "update_tv_weekly_goal") {
      if (!assistantCtx.isAdminSession) {
        results.push({
          id: tc.id,
          content: JSON.stringify({
            ok: false,
            error: "Só o administrador pode alterar a meta semanal pela Zaya.",
          }),
        });
        continue;
      }
      try {
        const { weeklyGoal } = await getTvPlaylist();
        const base = weeklyGoal ?? {
          label: "Meta semanal",
          currentAmount: 0,
          targetAmount: 0,
          showWeeklyBar: true,
        };
        let current = Number(base.currentAmount) || 0;
        const hasExplicitCurrent = payload.current_amount != null && String(payload.current_amount).trim() !== "";
        if (hasExplicitCurrent) {
          current = Number(payload.current_amount);
        } else if (payload.delta_current != null && Number.isFinite(Number(payload.delta_current))) {
          current += Number(payload.delta_current);
        }
        const label =
          typeof payload.label === "string" && payload.label.trim()
            ? payload.label.trim()
            : base.label;
        let target = Number(base.targetAmount) || 0;
        if (payload.target_amount != null && String(payload.target_amount).trim() !== "") {
          target = Number(payload.target_amount);
        }
        let showBar = base.showWeeklyBar !== false;
        if (typeof payload.show_weekly_bar === "boolean") {
          showBar = payload.show_weekly_bar;
        }
        await putTvWeeklyGoal({
          label,
          currentAmount: current,
          targetAmount: target,
          showWeeklyBar: showBar,
        });
        results.push({
          id: tc.id,
          content: JSON.stringify({
            ok: true,
            label,
            current_amount: current,
            target_amount: target,
            show_weekly_bar: showBar,
          }),
        });
      } catch (e) {
        results.push({
          id: tc.id,
          content: JSON.stringify({
            ok: false,
            error: e instanceof Error ? e.message : "Falha ao salvar meta semanal.",
          }),
        });
      }
      continue;
    }
    if (name === "clear_tv_weekly_goal") {
      if (!assistantCtx.isAdminSession) {
        results.push({
          id: tc.id,
          content: JSON.stringify({
            ok: false,
            error: "Só o administrador pode remover a meta semanal pela Zaya.",
          }),
        });
        continue;
      }
      try {
        await deleteTvWeeklyGoal();
        results.push({
          id: tc.id,
          content: JSON.stringify({ ok: true, removida: true }),
        });
      } catch (e) {
        results.push({
          id: tc.id,
          content: JSON.stringify({
            ok: false,
            error: e instanceof Error ? e.message : "Falha ao remover meta.",
          }),
        });
      }
      continue;
    }
    if (name === "list_technicians_for_zaya_relay") {
      if (!relayIsManagement(assistantCtx.relaySessionRole)) {
        results.push({
          id: tc.id,
          content: JSON.stringify({ ok: false, error: "Lista de técnicos só na sessão da gerência." }),
        });
        continue;
      }
      try {
        const list = await getSystemUserTechnicians();
        results.push({
          id: tc.id,
          content: JSON.stringify({
            ok: true,
            tecnicos: list.map((t) => ({
              id: t.id,
              username: t.username,
              nome_exibicao: t.display_name ?? t.username,
            })),
          }),
        });
      } catch (e) {
        results.push({
          id: tc.id,
          content: JSON.stringify({
            ok: false,
            error: e instanceof Error ? e.message : "Falha ao listar técnicos.",
          }),
        });
      }
      continue;
    }
    if (name === "zaya_send_relay_to_technician") {
      if (!relayIsManagement(assistantCtx.relaySessionRole)) {
        results.push({
          id: tc.id,
          content: JSON.stringify({ ok: false, error: "Só a gerência pode enviar recado aos técnicos." }),
        });
        continue;
      }
      const message = String(payload.message ?? "").trim();
      const recipientAll = payload.recipient_all === true;
      const recipientUsername = String(payload.recipient_username ?? "").trim();
      if (!message) {
        results.push({
          id: tc.id,
          content: JSON.stringify({ ok: false, error: "Informe o texto do recado (message)." }),
        });
        continue;
      }
      if (!recipientAll && !recipientUsername) {
        results.push({
          id: tc.id,
          content: JSON.stringify({
            ok: false,
            error: "Use recipient_all: true para todos ou recipient_username com o login do técnico.",
          }),
        });
        continue;
      }
      try {
        const out = await createZayaRelayToTechnicians(
          message,
          recipientAll ? { all: true } : { username: recipientUsername }
        );
        results.push({ id: tc.id, content: JSON.stringify({ ok: true, ...out }) });
      } catch (e) {
        results.push({
          id: tc.id,
          content: JSON.stringify({
            ok: false,
            error: e instanceof Error ? e.message : "Falha ao enviar recado.",
          }),
        });
      }
      continue;
    }
    if (name === "zaya_send_relay_to_management") {
      if (!relayIsTechnician(assistantCtx.relaySessionRole) || !assistantCtx.currentTechnicianUserId) {
        results.push({
          id: tc.id,
          content: JSON.stringify({
            ok: false,
            error: "Só técnicos podem enviar recado à gerência nesta sessão.",
          }),
        });
        continue;
      }
      const message = String(payload.message ?? "").trim();
      if (!message) {
        results.push({
          id: tc.id,
          content: JSON.stringify({ ok: false, error: "Informe o texto do recado (message)." }),
        });
        continue;
      }
      try {
        const out = await createZayaRelayToManagement(message, assistantCtx.currentTechnicianUserId);
        results.push({ id: tc.id, content: JSON.stringify({ ok: true, ...out }) });
      } catch (e) {
        results.push({
          id: tc.id,
          content: JSON.stringify({
            ok: false,
            error: e instanceof Error ? e.message : "Falha ao enviar recado.",
          }),
        });
      }
      continue;
    }
    if (name === "zaya_submit_relay_reply") {
      if (!assistantCtx.relaySessionRole || assistantCtx.relaySessionRole === "none") {
        results.push({
          id: tc.id,
          content: JSON.stringify({ ok: false, error: "Recados não disponíveis nesta sessão." }),
        });
        continue;
      }
      const messageId = String(payload.message_id ?? "").trim();
      const replyText = String(payload.reply_text ?? "").trim();
      if (!messageId || !replyText) {
        results.push({
          id: tc.id,
          content: JSON.stringify({ ok: false, error: "message_id e reply_text são obrigatórios." }),
        });
        continue;
      }
      try {
        const relay = assistantCtx.relaySessionRole;
        const replyAsRaw = String(payload.reply_as ?? "").trim().toLowerCase();
        let useAdmin: boolean;
        if (relay === "management") {
          useAdmin = true;
        } else if (relay === "technician") {
          useAdmin = false;
        } else {
          if (replyAsRaw !== "admin" && replyAsRaw !== "technician") {
            results.push({
              id: tc.id,
              content: JSON.stringify({
                ok: false,
                error:
                  "Informe reply_as: admin (recado de técnico à gerência) ou technician (recado da gerência para você).",
              }),
            });
            continue;
          }
          useAdmin = replyAsRaw === "admin";
        }
        if (useAdmin) {
          await submitZayaRelayReply(messageId, replyText, "admin");
        } else {
          await submitZayaRelayReply(
            messageId,
            replyText,
            "technician",
            assistantCtx.currentTechnicianUserId ?? undefined
          );
        }
        results.push({ id: tc.id, content: JSON.stringify({ ok: true }) });
      } catch (e) {
        results.push({
          id: tc.id,
          content: JSON.stringify({
            ok: false,
            error: e instanceof Error ? e.message : "Falha ao registrar resposta.",
          }),
        });
      }
      continue;
    }
    if (name === "create_workshop_reminder") {
      const text = String(payload.text ?? "").trim();
      const rawTarget = String(payload.target ?? "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{M}/gu, "");
      const target =
        rawTarget === "laboratorio" ? "laboratorio" : rawTarget === "patio" ? "patio" : "";
      if (!text) {
        results.push({
          id: tc.id,
          content: JSON.stringify({ ok: false, error: "Texto do lembrete vazio." }),
        });
        continue;
      }
      if (target !== "patio" && target !== "laboratorio") {
        results.push({
          id: tc.id,
          content: JSON.stringify({
            ok: false,
            error: 'Use target "patio" (Lembretes do Pátio) ou "laboratorio" (Lembretes do Laboratório).',
          }),
        });
        continue;
      }
      if (target === "patio" && !allowedTabs.includes("patio")) {
        results.push({
          id: tc.id,
          content: JSON.stringify({ ok: false, error: "Sem acesso ao Pátio para este lembrete." }),
        });
        continue;
      }
      if (target === "laboratorio" && !allowedTabs.includes("laboratorio")) {
        results.push({
          id: tc.id,
          content: JSON.stringify({
            ok: false,
            error: "Sem acesso ao Laboratório para este lembrete.",
          }),
        });
        continue;
      }
      try {
        const out = await appendWorkshopReminder(
          target,
          text,
          assistantCtx.authorDisplayName || ASSISTANT_NAME
        );
        results.push({ id: tc.id, content: JSON.stringify(out) });
      } catch (e) {
        results.push({
          id: tc.id,
          content: JSON.stringify({
            ok: false,
            error: e instanceof Error ? e.message : "Falha ao criar lembrete.",
          }),
        });
      }
      continue;
    }
    if (name === "list_workshop_reminders") {
      const rawTarget = String(payload.target ?? "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{M}/gu, "");
      const target =
        rawTarget === "laboratorio" ? "laboratorio" : rawTarget === "patio" ? "patio" : "";
      if (target !== "patio" && target !== "laboratorio") {
        results.push({
          id: tc.id,
          content: JSON.stringify({
            ok: false,
            error: 'Use target "patio" ou "laboratorio".',
          }),
        });
        continue;
      }
      if (target === "patio" && !allowedTabs.includes("patio")) {
        results.push({
          id: tc.id,
          content: JSON.stringify({ ok: false, error: "Sem acesso ao Pátio." }),
        });
        continue;
      }
      if (target === "laboratorio" && !allowedTabs.includes("laboratorio")) {
        results.push({
          id: tc.id,
          content: JSON.stringify({ ok: false, error: "Sem acesso ao Laboratório." }),
        });
        continue;
      }
      try {
        const list = await readWorkshopReminders(target);
        results.push({
          id: tc.id,
          content: JSON.stringify({
            ok: true,
            target,
            total: list.length,
            lembretes: list.map((r) => ({
              id: r.id,
              text: r.text,
              done: r.done,
              createdAt: r.createdAt,
              createdBy: r.createdBy ?? null,
            })),
          }),
        });
      } catch (e) {
        results.push({
          id: tc.id,
          content: JSON.stringify({
            ok: false,
            error: e instanceof Error ? e.message : "Falha ao listar lembretes.",
          }),
        });
      }
      continue;
    }
    if (name === "delete_workshop_reminder") {
      const rawTarget = String(payload.target ?? "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{M}/gu, "");
      const target =
        rawTarget === "laboratorio" ? "laboratorio" : rawTarget === "patio" ? "patio" : "";
      const reminderId = String(payload.reminder_id ?? "").trim();
      if (target !== "patio" && target !== "laboratorio") {
        results.push({
          id: tc.id,
          content: JSON.stringify({ ok: false, error: 'Use target "patio" ou "laboratorio".' }),
        });
        continue;
      }
      if (target === "patio" && !allowedTabs.includes("patio")) {
        results.push({
          id: tc.id,
          content: JSON.stringify({ ok: false, error: "Sem acesso ao Pátio." }),
        });
        continue;
      }
      if (target === "laboratorio" && !allowedTabs.includes("laboratorio")) {
        results.push({
          id: tc.id,
          content: JSON.stringify({ ok: false, error: "Sem acesso ao Laboratório." }),
        });
        continue;
      }
      try {
        const out = await deleteWorkshopReminder(target, reminderId);
        results.push({ id: tc.id, content: JSON.stringify(out) });
      } catch (e) {
        results.push({
          id: tc.id,
          content: JSON.stringify({
            ok: false,
            error: e instanceof Error ? e.message : "Falha ao excluir lembrete.",
          }),
        });
      }
      continue;
    }
    if (name === "update_workshop_reminder") {
      const rawTarget = String(payload.target ?? "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{M}/gu, "");
      const target =
        rawTarget === "laboratorio" ? "laboratorio" : rawTarget === "patio" ? "patio" : "";
      const reminderId = String(payload.reminder_id ?? "").trim();
      const hasText = typeof payload.text === "string";
      const hasDone = typeof payload.done === "boolean";
      if (target !== "patio" && target !== "laboratorio") {
        results.push({
          id: tc.id,
          content: JSON.stringify({ ok: false, error: 'Use target "patio" ou "laboratorio".' }),
        });
        continue;
      }
      if (target === "patio" && !allowedTabs.includes("patio")) {
        results.push({
          id: tc.id,
          content: JSON.stringify({ ok: false, error: "Sem acesso ao Pátio." }),
        });
        continue;
      }
      if (target === "laboratorio" && !allowedTabs.includes("laboratorio")) {
        results.push({
          id: tc.id,
          content: JSON.stringify({ ok: false, error: "Sem acesso ao Laboratório." }),
        });
        continue;
      }
      if (!hasText && !hasDone) {
        results.push({
          id: tc.id,
          content: JSON.stringify({
            ok: false,
            error: "Informe text (novo texto) e/ou done (boolean).",
          }),
        });
        continue;
      }
      try {
        const out = await updateWorkshopReminder(target, reminderId, {
          ...(hasText ? { text: String(payload.text) } : {}),
          ...(hasDone ? { done: payload.done as boolean } : {}),
        });
        results.push({ id: tc.id, content: JSON.stringify(out) });
      } catch (e) {
        results.push({
          id: tc.id,
          content: JSON.stringify({
            ok: false,
            error: e instanceof Error ? e.message : "Falha ao atualizar lembrete.",
          }),
        });
      }
      continue;
    }
    if (name === "list_vehicles_in_stage") {
      const status = String(payload.status ?? "").trim();
      const orderType = payload.order_type === "module" ? "module" : "vehicle";
      if (orderType === "vehicle" && !allowedTabs.includes("patio")) {
        results.push({
          id: tc.id,
          content: JSON.stringify({ ok: false, error: "Sem acesso ao Pátio para listar veículos." }),
        });
        continue;
      }
      if (orderType === "module" && !allowedTabs.includes("laboratorio")) {
        results.push({
          id: tc.id,
          content: JSON.stringify({
            ok: false,
            error: "Sem acesso ao Laboratório para listar módulos.",
          }),
        });
        continue;
      }
      if (!isValidServiceOrderStatus(status)) {
        results.push({
          id: tc.id,
          content: JSON.stringify({ ok: false, error: "Status de etapa inválido." }),
        });
        continue;
      }
      const out = await listVehiclesInStageJson(status, orderType);
      results.push({ id: tc.id, content: out });
      continue;
    }
    if (name === "update_service_order_status") {
      const newStatus = String(payload.new_status ?? "").trim();
      if (!isValidServiceOrderStatus(newStatus)) {
        results.push({
          id: tc.id,
          content: JSON.stringify({ ok: false, error: "Status de destino inválido." }),
        });
        continue;
      }
      const out = await updateServiceOrderStageJson(
        newStatus,
        {
          service_order_id:
            typeof payload.service_order_id === "string" ? payload.service_order_id.trim() : undefined,
          os_number: parseOsNumber(payload.os_number),
          plate: payload.plate != null ? String(payload.plate) : undefined,
        },
        allowedTabs,
        serviceOrderActor
      );
      results.push({ id: tc.id, content: out });
      continue;
    }
    if (name === "add_service_order_comment") {
      const out = await addServiceOrderCommentJson(
        {
          text: String(payload.text ?? ""),
          service_order_id:
            typeof payload.service_order_id === "string" ? payload.service_order_id.trim() : undefined,
          os_number: parseOsNumber(payload.os_number),
          plate: payload.plate != null ? String(payload.plate) : undefined,
        },
        assistantCtx
      );
      results.push({ id: tc.id, content: out });
      continue;
    }
    if (name === "get_service_order_comments") {
      const out = await getServiceOrderCommentsJson(
        {
          service_order_id:
            typeof payload.service_order_id === "string" ? payload.service_order_id.trim() : undefined,
          os_number: parseOsNumber(payload.os_number),
          plate: payload.plate != null ? String(payload.plate) : undefined,
        },
        assistantCtx
      );
      results.push({ id: tc.id, content: out });
      continue;
    }
    if (name === "list_orders_by_technician") {
      const out = await listOrdersByTechnicianJson(
        {
          only_mine: payload.only_mine === true,
          technician_user_id:
            typeof payload.technician_user_id === "string" ? payload.technician_user_id.trim() : undefined,
          technician_name_search:
            typeof payload.technician_name_search === "string"
              ? payload.technician_name_search.trim()
              : undefined,
        },
        assistantCtx
      );
      results.push({ id: tc.id, content: out });
      continue;
    }
    if (name === "list_upcoming_deliveries") {
      const out = await listUpcomingDeliveriesJson(
        { days_ahead: typeof payload.days_ahead === "number" ? payload.days_ahead : undefined },
        assistantCtx
      );
      results.push({ id: tc.id, content: out });
      continue;
    }
    if (name === "search_service_orders") {
      const out = await searchServiceOrdersJson({ query: String(payload.query ?? "") }, assistantCtx);
      results.push({ id: tc.id, content: out });
      continue;
    }
    if (name === "get_service_order_budgets") {
      const out = await getServiceOrderBudgetsJson(
        {
          service_order_id:
            typeof payload.service_order_id === "string" ? payload.service_order_id.trim() : undefined,
          os_number: parseOsNumber(payload.os_number),
          plate: payload.plate != null ? String(payload.plate) : undefined,
        },
        assistantCtx
      );
      results.push({ id: tc.id, content: out });
      continue;
    }
    if (name === "create_service_order_budget_simple") {
      const partsRaw = payload.parts;
      const parts = Array.isArray(partsRaw)
        ? (partsRaw as unknown[]).map((p) => {
            const o = p as { description?: unknown; quantity?: unknown };
            return {
              description: String(o.description ?? ""),
              quantity: String(o.quantity ?? "1"),
            };
          })
        : undefined;
      const out = await createServiceOrderBudgetSimpleJson(
        {
          service_order_id:
            typeof payload.service_order_id === "string" ? payload.service_order_id.trim() : undefined,
          os_number: parseOsNumber(payload.os_number),
          plate: payload.plate != null ? String(payload.plate) : undefined,
          card_name: typeof payload.card_name === "string" ? payload.card_name : undefined,
          diagnosis: String(payload.diagnosis ?? ""),
          service_description: String(payload.service_description ?? ""),
          parts,
          observations: typeof payload.observations === "string" ? payload.observations : undefined,
        },
        assistantCtx
      );
      results.push({ id: tc.id, content: out });
      continue;
    }
    if (name === "update_service_order_budget") {
      const servicesRaw = payload.services;
      const services = Array.isArray(servicesRaw)
        ? (servicesRaw as unknown[]).map((s) => {
            const o = s as { description?: unknown; approved?: unknown };
            return {
              description: String(o.description ?? ""),
              approved: typeof o.approved === "boolean" ? o.approved : undefined,
            };
          })
        : undefined;

      const partsRaw = payload.parts;
      const parts = Array.isArray(partsRaw)
        ? (partsRaw as unknown[]).map((p) => {
            const o = p as { description?: unknown; quantity?: unknown; approved?: unknown };
            return {
              description: String(o.description ?? ""),
              quantity: String(o.quantity ?? "1"),
              approved: typeof o.approved === "boolean" ? o.approved : undefined,
            };
          })
        : undefined;

      const out = await updateServiceOrderBudgetJson(
        {
          budget_id: String(payload.budget_id ?? ""),
          service_order_id:
            typeof payload.service_order_id === "string" ? payload.service_order_id.trim() : undefined,
          os_number: parseOsNumber(payload.os_number),
          plate: payload.plate != null ? String(payload.plate) : undefined,
          card_name: typeof payload.card_name === "string" ? payload.card_name : undefined,
          diagnosis: typeof payload.diagnosis === "string" ? payload.diagnosis : undefined,
          services,
          parts,
          observations: typeof payload.observations === "string" ? payload.observations : undefined,
        },
        assistantCtx
      );
      results.push({ id: tc.id, content: out });
      continue;
    }
    if (name === "add_service_order_budget_items") {
      const servicesToAddRaw = payload.services_to_add;
      const servicesToAdd = Array.isArray(servicesToAddRaw)
        ? (servicesToAddRaw as unknown[]).map((s) => {
            const o = s as { description?: unknown };
            return { description: String(o.description ?? "") };
          })
        : undefined;

      const partsToAddRaw = payload.parts_to_add;
      const partsToAdd = Array.isArray(partsToAddRaw)
        ? (partsToAddRaw as unknown[]).map((p) => {
            const o = p as { description?: unknown; quantity?: unknown };
            return {
              description: String(o.description ?? ""),
              quantity: String(o.quantity ?? "1"),
            };
          })
        : undefined;

      const out = await addServiceOrderBudgetItemsJson(
        {
          budget_id: String(payload.budget_id ?? ""),
          service_order_id:
            typeof payload.service_order_id === "string" ? payload.service_order_id.trim() : undefined,
          os_number: parseOsNumber(payload.os_number),
          plate: payload.plate != null ? String(payload.plate) : undefined,
          services_to_add: servicesToAdd,
          parts_to_add: partsToAdd,
          card_name: typeof payload.card_name === "string" ? payload.card_name : undefined,
          diagnosis: typeof payload.diagnosis === "string" ? payload.diagnosis : undefined,
          observations: typeof payload.observations === "string" ? payload.observations : undefined,
        },
        assistantCtx
      );
      results.push({ id: tc.id, content: out });
      continue;
    }
    if (name === "list_appointments") {
      const out = await listAppointmentsJson(assistantCtx);
      results.push({ id: tc.id, content: out });
      continue;
    }
    if (name === "create_appointment") {
      const out = await createAppointmentJson(
        {
          title: String(payload.title ?? ""),
          customer_name: String(payload.customer_name ?? ""),
          phone: typeof payload.phone === "string" ? payload.phone : undefined,
          vehicle_model: String(payload.vehicle_model ?? ""),
          plate: String(payload.plate ?? ""),
          date: String(payload.date ?? ""),
          time: String(payload.time ?? ""),
          notes: typeof payload.notes === "string" ? payload.notes : undefined,
        },
        assistantCtx
      );
      results.push({ id: tc.id, content: out });
      continue;
    }
    if (name === "count_orders_by_stage") {
      const out = await countOrdersByStageJson(assistantCtx);
      results.push({ id: tc.id, content: out });
      continue;
    }
    if (name === "count_customer_open_orders") {
      const out = await countCustomerOpenOrdersJson(
        { customer_name_fragment: String(payload.customer_name_fragment ?? "") },
        assistantCtx
      );
      results.push({ id: tc.id, content: out });
      continue;
    }
    if (name === "register_customer_vehicle_intake") {
      const out = await registerCustomerVehicleIntakeJson(
        {
          name: String(payload.name ?? ""),
          phone: String(payload.phone ?? ""),
          vehicle_model: String(payload.vehicle_model ?? ""),
          plate: String(payload.plate ?? ""),
          issue_description: String(payload.issue_description ?? ""),
        },
        assistantCtx
      );
      results.push({ id: tc.id, content: out });
      continue;
    }
    if (name === "search_customers") {
      const out = await searchCustomersJson({ query: String(payload.query ?? "") }, assistantCtx);
      results.push({ id: tc.id, content: out });
      continue;
    }
    if (name === "get_customer_complaint_for_vehicle") {
      const out = await getCustomerComplaintForVehicleJson(
        {
          vehicle_model_query: String(payload.vehicle_model_query ?? ""),
          customer_name_query:
            typeof payload.customer_name_query === "string" ? payload.customer_name_query : undefined,
          include_archived: payload.include_archived === true,
        },
        assistantCtx
      );
      results.push({ id: tc.id, content: out });
      continue;
    }
    if (name === "append_complaint_to_vehicle") {
      const out = await appendComplaintToVehicleJson(
        {
          complaint_text: String(payload.complaint_text ?? ""),
          vehicle_model_query: String(payload.vehicle_model_query ?? ""),
          customer_name_query:
            typeof payload.customer_name_query === "string" ? payload.customer_name_query : undefined,
          include_archived: payload.include_archived === true,
        },
        assistantCtx
      );
      results.push({ id: tc.id, content: out });
      continue;
    }
    if (name === "open_patio_vehicle_modal") {
      const out = await openPatioVehicleModalJson(
        {
          vehicle_model_query: String(payload.vehicle_model_query ?? ""),
          customer_name_query:
            typeof payload.customer_name_query === "string" ? payload.customer_name_query : undefined,
          include_archived: payload.include_archived === true,
        },
        allowedTabs
      );
      try {
        const parsed = JSON.parse(out) as {
          ok?: boolean;
          action?: string;
          service_order_id?: string;
        };
        if (
          parsed.ok &&
          parsed.action === "open" &&
          typeof parsed.service_order_id === "string" &&
          onOpenPatioVehicle
        ) {
          onOpenPatioVehicle(parsed.service_order_id);
        }
      } catch {
        /* ignore */
      }
      results.push({ id: tc.id, content: out });
      continue;
    }
    if (name === "open_patio_vehicle_budget_view") {
      const out = await openPatioVehicleBudgetViewJson(
        {
          vehicle_model_query: String(payload.vehicle_model_query ?? ""),
          customer_name_query:
            typeof payload.customer_name_query === "string" ? payload.customer_name_query : undefined,
          include_archived: payload.include_archived === true,
          budget_id: typeof payload.budget_id === "string" ? payload.budget_id : undefined,
          budget_index:
            typeof payload.budget_index === "number" && Number.isFinite(payload.budget_index)
              ? payload.budget_index
              : typeof payload.budget_index === "string" && payload.budget_index.trim() !== ""
                ? parseInt(payload.budget_index.trim(), 10)
                : undefined,
        },
        allowedTabs
      );
      try {
        const parsed = JSON.parse(out) as {
          ok?: boolean;
          action?: string;
          service_order_id?: string;
          budget_id?: string;
        };
        if (
          parsed.ok &&
          parsed.action === "open_budget" &&
          typeof parsed.service_order_id === "string" &&
          typeof parsed.budget_id === "string" &&
          onOpenPatioVehicle
        ) {
          onOpenPatioVehicle(parsed.service_order_id, { budgetId: parsed.budget_id });
        }
      } catch {
        /* ignore */
      }
      results.push({ id: tc.id, content: out });
      continue;
    }
    if (name === "open_patio_vehicle_history") {
      const out = await openPatioVehicleHistoryJson(
        {
          target: payload.target === "laboratorio" ? "laboratorio" : "patio",
        },
        allowedTabs
      );
      try {
        const parsed = JSON.parse(out) as {
          ok?: boolean;
          action?: string;
          target?: string;
        };
        if (parsed.ok && parsed.action === "open_history") {
          const tab = parsed.target === "laboratorio" ? "laboratorio" : "patio";
          onNavigateTab(tab);
          onOpenPatioHistory?.(tab);
        }
      } catch {
        /* ignore */
      }
      results.push({ id: tc.id, content: out });
      continue;
    }
    if (name === "list_archived_vehicle_orders") {
      const ot = payload.order_type === "module" ? "module" : "vehicle";
      const out = await listArchivedVehicleOrdersJson(ot, allowedTabs);
      results.push({ id: tc.id, content: out });
      continue;
    }
    if (name === "unarchive_vehicle_service_order") {
      const out = await unarchiveVehicleServiceOrderJson(
        {
          service_order_id:
            typeof payload.service_order_id === "string" ? payload.service_order_id.trim() : undefined,
          os_number: parseOsNumber(payload.os_number),
          plate: payload.plate != null ? String(payload.plate) : undefined,
        },
        assistantCtx
      );
      results.push({ id: tc.id, content: out });
      continue;
    }
    if (name === "set_vehicle_technician") {
      const out = await setVehicleTechnicianJson(
        {
          vehicle_model_query: String(payload.vehicle_model_query ?? ""),
          customer_name_query:
            typeof payload.customer_name_query === "string" ? payload.customer_name_query : undefined,
          include_archived: payload.include_archived === true,
          clear_technician: payload.clear_technician === true,
          technician_user_id:
            typeof payload.technician_user_id === "string" ? payload.technician_user_id : undefined,
          technician_username:
            typeof payload.technician_username === "string" ? payload.technician_username : undefined,
        },
        assistantCtx
      );
      results.push({ id: tc.id, content: out });
      continue;
    }
    results.push({ id: tc.id, content: JSON.stringify({ ok: false, error: "Função desconhecida." }) });
  }
  return results;
}

export const AssistantChat: React.FC<AssistantChatProps> = ({
  theme,
  allowedTabs,
  onNavigateTab,
  onOpenSettings,
  serviceOrderActor,
  assistantAuthorDisplayName,
  assistantCommentActor,
  currentTechnicianUserId,
  onOpenPatioVehicle,
  onOpenPatioHistory,
  relaySessionRole: relaySessionRoleProp = "none",
  pendingZayaNotification,
  onPendingZayaConsumed,
}) => {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(loading);
  loadingRef.current = loading;
  const [error, setError] = useState<string | null>(null);
  /** Histórico exibido + enviado ao servidor (sem system). */
  const [messages, setMessages] = useState<AssistantApiMessage[]>([]);
  const [listening, setListening] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(() => {
    try {
      return localStorage.getItem(TTS_STORAGE_KEY) !== "false";
    } catch {
      return true;
    }
  });
  const ttsEnabledRef = useRef(ttsEnabled);
  ttsEnabledRef.current = ttsEnabled;

  /** Conexão OpenAI Realtime (voz natural); fallback = chat HTTP clássico. */
  const [useClassicChat, setUseClassicChat] = useState(false);
  const [realtimeReady, setRealtimeReady] = useState(false);
  const realtimeClientRef = useRef<OpenAiRealtimeClient | null>(null);
  const messagesRef = useRef<AssistantApiMessage[]>([]);
  messagesRef.current = messages;

  const recRef = useRef<InstanceType<SpeechRecCtor> | null>(null);
  /** Mantém o microfone “ligado” no modo tempo real até o usuário desligar (reinício após pausa do navegador). */
  const listeningRef = useRef(false);
  /** Retoma o mic após a assistente terminar de falar (evita capturar o áudio dela). */
  const resumeMicTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const sendUserMessageRef = useRef<(text: string) => void>(() => {});
  /** Uma vez por abertura do painel: liga o mic após Realtime pronto. */
  const autoMicStartedForOpenRef = useRef(false);

  const relaySessionRole = relaySessionRoleProp;

  /** Refs para evitar recriar a sessão Realtime (histórico) por causa de identidades mutáveis de props. */
  const onNavigateTabRef = useRef(onNavigateTab);
  const onOpenSettingsRef = useRef(onOpenSettings);
  const onOpenPatioVehicleRef = useRef(onOpenPatioVehicle);
  const onOpenPatioHistoryRef = useRef(onOpenPatioHistory);
  const serviceOrderActorRef = useRef<ServiceOrderUpdateActor | undefined>(serviceOrderActor);
  const assistantAuthorDisplayNameRef = useRef(assistantAuthorDisplayName);
  const assistantCommentActorRef = useRef(assistantCommentActor);
  const currentTechnicianUserIdRef = useRef(currentTechnicianUserId);
  const relaySessionRoleRef = useRef(relaySessionRole);

  onNavigateTabRef.current = onNavigateTab;
  onOpenSettingsRef.current = onOpenSettings;
  onOpenPatioVehicleRef.current = onOpenPatioVehicle;
  onOpenPatioHistoryRef.current = onOpenPatioHistory;
  serviceOrderActorRef.current = serviceOrderActor;
  assistantAuthorDisplayNameRef.current = assistantAuthorDisplayName;
  assistantCommentActorRef.current = assistantCommentActor;
  currentTechnicianUserIdRef.current = currentTechnicianUserId;
  relaySessionRoleRef.current = relaySessionRole;

  const onNavigateTabStable = useCallback((tab: TabId) => onNavigateTabRef.current(tab), []);
  const onOpenSettingsStable = useCallback(() => onOpenSettingsRef.current(), []);
  const onOpenPatioVehicleStable = useCallback(
    (id: string, options?: { budgetId?: string }) => onOpenPatioVehicleRef.current?.(id, options),
    []
  );
  const onOpenPatioHistoryStable = useCallback(
    (target: "patio" | "laboratorio") => onOpenPatioHistoryRef.current?.(target),
    []
  );

  const [relayPendingTech, setRelayPendingTech] = useState(0);
  const [relayPendingMgmt, setRelayPendingMgmt] = useState(0);
  /** Dispara nova tentativa de entrega quando o contador de pendentes sobe. */
  const [relayRedeliveryTick, setRelayRedeliveryTick] = useState(0);
  const lastRelayPendingCountRef = useRef(0);
  /** Após `sendRelayVoiceAnnouncement`, marcar recados abertos no fim da resposta Realtime. */
  const relayMarkAfterResponseRef = useRef<RelayMarkBatch[] | null>(null);
  /** Evita reenviar o mesmo lote no modo clássico. */
  const relayClassicBatchKeyRef = useRef<string>("");
  /** Evita duas buscas paralelas de recados antes de enviar ao Realtime. */
  const relayRealtimeDeliveryLockRef = useRef(false);
  /** Evita entregar o mesmo aviso zaya duas vezes (ex.: Strict Mode). */
  const deliveredZayaNotificationIdsRef = useRef<Set<string>>(new Set());
  /** Fila de áudio da assistente no Realtime terminou (evita eco em respostas longas). */
  const [assistantPlaybackIdle, setAssistantPlaybackIdle] = useState(true);
  const assistantPlaybackIdleRef = useRef(true);
  assistantPlaybackIdleRef.current = assistantPlaybackIdle;

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const s = window.speechSynthesis;
    const warm = () => void s.getVoices();
    warm();
    s.addEventListener("voiceschanged", warm);
    return () => s.removeEventListener("voiceschanged", warm);
  }, []);

  const toggleTts = useCallback(() => {
    setTtsEnabled((v) => {
      const next = !v;
      try {
        localStorage.setItem(TTS_STORAGE_KEY, next ? "true" : "false");
      } catch {
        /* ignore */
      }
      if (!next && typeof window !== "undefined") {
        window.speechSynthesis?.cancel();
      }
      return next;
    });
  }, []);

  const runAssistantTurn = useCallback(
    async (history: AssistantApiMessage[]) => {
      setLoading(true);
      setError(null);
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
      try {
        let current = [...history];
        const assistantCtx: AssistantContext = {
          allowedTabs,
          serviceOrderActor,
          authorDisplayName: assistantAuthorDisplayName,
          commentActor: assistantCommentActor,
          currentTechnicianUserId: currentTechnicianUserId ?? null,
          relaySessionRole,
          isAdminSession: assistantCommentActor === "admin",
        };
        const assistantIdentity = {
          assistantIsAdmin: assistantCommentActor === "admin",
          assistantUserId:
            assistantCommentActor === "admin" ? "admin" : currentTechnicianUserId ?? undefined,
          assistantUserDisplayName: assistantAuthorDisplayName,
          relaySessionRole,
        };
        for (let step = 0; step < 15; step++) {
          const { message } = await postAssistantChat(current, allowedTabs, assistantIdentity);
          if (message.tool_calls?.length) {
            current = [...current, message];
            const toolResults = await executeToolCalls(
              message.tool_calls,
              allowedTabs,
              onNavigateTab,
              onOpenSettings,
              serviceOrderActor,
              assistantCtx,
              onOpenPatioVehicle,
              onOpenPatioHistory
            );
            for (const tr of toolResults) {
              current.push({ role: "tool", tool_call_id: tr.id, content: tr.content });
            }
            continue;
          }
          current = [...current, message];
          setMessages(current);
          if (
            ttsEnabledRef.current &&
            typeof message.content === "string" &&
            message.content.trim()
          ) {
            speakAssistantResponse(message.content);
          }
          return;
        }
        setError(`Limite de passos da ${ASSISTANT_NAME} atingido.`);
        setMessages(current);
      } catch (e) {
        setError(e instanceof Error ? e.message : `Falha ao falar com a ${ASSISTANT_NAME}.`);
      } finally {
        setLoading(false);
      }
    },
    [
      allowedTabs,
      onNavigateTab,
      onOpenSettings,
      serviceOrderActor,
      assistantAuthorDisplayName,
      assistantCommentActor,
      currentTechnicianUserId,
      onOpenPatioVehicle,
      onOpenPatioHistory,
      relaySessionRole,
    ]
  );

  const refreshRelayPendingCount = useCallback(() => {
    if (relaySessionRole === "none") return;
    if (relayIsTechnician(relaySessionRole) && currentTechnicianUserId) {
      void getZayaRelayPendingCountForTechnician(currentTechnicianUserId).then(setRelayPendingTech);
    } else {
      setRelayPendingTech(0);
    }
    if (relayIsManagement(relaySessionRole)) {
      void getZayaRelayPendingCountForManagement().then(setRelayPendingMgmt);
    } else {
      setRelayPendingMgmt(0);
    }
  }, [relaySessionRole, currentTechnicianUserId]);

  /** Novo recado enquanto o app está aberto: dispara entrega (Realtime ou clássico). */
  useEffect(() => {
    if (relaySessionRole === "none") {
      lastRelayPendingCountRef.current = 0;
      return;
    }
    const n =
      relaySessionRole === "technician"
        ? relayPendingTech
        : relaySessionRole === "management"
          ? relayPendingMgmt
          : relaySessionRole === "both"
            ? relayPendingTech + relayPendingMgmt
            : 0;
    if (n > lastRelayPendingCountRef.current) {
      setRelayRedeliveryTick((t) => t + 1);
      /** Novo recado: abre o modal da Zaya no destinatário para entregar voz/texto. */
      if (n > 0) {
        setOpen(true);
      }
    }
    lastRelayPendingCountRef.current = n;
  }, [relayPendingTech, relayPendingMgmt, relaySessionRole]);

  /** Avisos zaya_* da API: abre o modal da Zaya e fala o texto (como recados). */
  useEffect(() => {
    if (!pendingZayaNotification) return;
    const id = pendingZayaNotification.id;
    if (deliveredZayaNotificationIdsRef.current.has(id)) {
      onPendingZayaConsumed?.();
      return;
    }
    deliveredZayaNotificationIdsRef.current.add(id);
    setOpen(true);
    const text = zayaAlertToSpokenLine(pendingZayaNotification);
    const bubble = `🔔 ${text}`;
    setMessages((prev) => [{ role: "assistant", content: bubble }, ...prev]);
    if (ttsEnabledRef.current) {
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
      speakAssistantResponse(text);
    }
    onPendingZayaConsumed?.();
  }, [pendingZayaNotification, onPendingZayaConsumed]);

  /** Polling: recados pendentes (indicador no botão). */
  useEffect(() => {
    if (relaySessionRole === "none") {
      setRelayPendingTech(0);
      setRelayPendingMgmt(0);
      return;
    }
    const tick = () => {
      refreshRelayPendingCount();
    };
    tick();
    const id = window.setInterval(tick, 12000);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    const onFocus = () => tick();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
    };
  }, [relaySessionRole, refreshRelayPendingCount]);

  useEffect(() => {
    if (open) refreshRelayPendingCount();
  }, [open, refreshRelayPendingCount]);

  /** Modo clássico: recados na abertura ou quando chegam novos (TTS do navegador). */
  useEffect(() => {
    if (!open || relaySessionRole === "none" || !useClassicChat) return;
    if (relayIsTechnician(relaySessionRole) && !currentTechnicianUserId && !relayIsManagement(relaySessionRole)) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const techRows =
        relayIsTechnician(relaySessionRole) && currentTechnicianUserId
          ? await getZayaRelayPendingForTechnician(currentTechnicianUserId)
          : [];
      const mgmtRows = relayIsManagement(relaySessionRole)
        ? await getZayaRelayPendingForManagement()
        : [];
      const items = mergeRelayPendingQueues(
        relaySessionRole,
        techRows,
        mgmtRows,
        currentTechnicianUserId
      );
      if (cancelled || items.length === 0) return;
      const batchKey = items
        .map((i) => `${i.scope}:${i.row.id}`)
        .sort()
        .join(",");
      if (batchKey === relayClassicBatchKeyRef.current) return;
      const delivery = relayItemsToAssistantMessages(items);
      setMessages((prev) => [...delivery, ...prev]);
      relayClassicBatchKeyRef.current = batchKey;
      const batches = buildRelayMarkBatches(items, currentTechnicianUserId);
      try {
        await Promise.all(batches.map((b) => markZayaRelayOpened(b.ids, b.scope, b.userId)));
      } catch {
        relayClassicBatchKeyRef.current = "";
      }
      if (!cancelled) {
        if (batches.some((b) => b.scope === "technician")) setRelayPendingTech(0);
        if (batches.some((b) => b.scope === "management")) setRelayPendingMgmt(0);
        refreshRelayPendingCount();
      }
      if (!cancelled && ttsEnabledRef.current && items[0]) {
        const voiceParts = items.map(({ row, scope }) =>
          combineRelayRowsForVoice([row], scope)
        );
        speakAssistantResponse(voiceParts.join(". "));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    open,
    relaySessionRole,
    currentTechnicianUserId,
    useClassicChat,
    relayRedeliveryTick,
    refreshRelayPendingCount,
  ]);

  /** Realtime: voz da Zaya para recados; marca aberto após response.done. */
  useEffect(() => {
    if (!open || !realtimeReady || useClassicChat || relaySessionRole === "none") return;
    if (relayIsTechnician(relaySessionRole) && !currentTechnicianUserId && !relayIsManagement(relaySessionRole)) {
      return;
    }
    if (relayMarkAfterResponseRef.current) return;
    if (relayRealtimeDeliveryLockRef.current) return;
    const client = realtimeClientRef.current;
    if (!client) return;
    let cancelled = false;
    void (async () => {
      if (relayRealtimeDeliveryLockRef.current) return;
      relayRealtimeDeliveryLockRef.current = true;
      let releaseLockOnExit = true;
      try {
        const techRows =
          relayIsTechnician(relaySessionRole) && currentTechnicianUserId
            ? await getZayaRelayPendingForTechnician(currentTechnicianUserId)
            : [];
        const mgmtRows = relayIsManagement(relaySessionRole)
          ? await getZayaRelayPendingForManagement()
          : [];
        const items = mergeRelayPendingQueues(
          relaySessionRole,
          techRows,
          mgmtRows,
          currentTechnicianUserId
        );
        if (cancelled || items.length === 0) return;
        const voiceParts = items.map(({ row, scope }) =>
          combineRelayRowsForVoice([row], scope)
        );
        const voice = voiceParts.join(". ").trim();
        if (!voice) {
          const delivery = relayItemsToAssistantMessages(items);
          const batches = buildRelayMarkBatches(items, currentTechnicianUserId);
          setMessages((prev) => [...delivery, ...prev]);
          try {
            await Promise.all(batches.map((b) => markZayaRelayOpened(b.ids, b.scope, b.userId)));
          } catch {
            /* ignore */
          }
          if (!cancelled) {
            if (batches.some((b) => b.scope === "technician")) setRelayPendingTech(0);
            if (batches.some((b) => b.scope === "management")) setRelayPendingMgmt(0);
            refreshRelayPendingCount();
          }
          return;
        }
        relayMarkAfterResponseRef.current = buildRelayMarkBatches(items, currentTechnicianUserId);
        const userLabel =
          items.length === 1 && items[0].scope === "technician"
            ? "🔔 Recado da gerência"
            : items.length === 1 && items[0].scope === "management"
              ? "🔔 Recado de técnico"
              : "🔔 Recados";
        setMessages((prev) => [
          ...prev,
          { role: "user", content: userLabel },
          { role: "assistant", content: "" },
        ]);
        if (cancelled) {
          relayMarkAfterResponseRef.current = null;
          return;
        }
        releaseLockOnExit = false;
        loadingRef.current = true;
        assistantPlaybackIdleRef.current = false;
        setAssistantPlaybackIdle(false);
        setLoading(true);
        if (typeof window !== "undefined") window.speechSynthesis?.cancel();
        listeningRef.current = false;
        setListening(false);
        recRef.current?.stop();
        client.sendRelayVoiceAnnouncement(voice);
      } catch {
        relayMarkAfterResponseRef.current = null;
      } finally {
        if (releaseLockOnExit) relayRealtimeDeliveryLockRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    open,
    realtimeReady,
    useClassicChat,
    relaySessionRole,
    currentTechnicianUserId,
    relayRedeliveryTick,
  ]);

  useEffect(() => {
    if (!open) {
      relayClassicBatchKeyRef.current = "";
      relayMarkAfterResponseRef.current = null;
      relayRealtimeDeliveryLockRef.current = false;
      assistantPlaybackIdleRef.current = true;
      setAssistantPlaybackIdle(true);
      if (resumeMicTimeoutRef.current) {
        clearTimeout(resumeMicTimeoutRef.current);
        resumeMicTimeoutRef.current = null;
      }
      realtimeClientRef.current?.disconnect();
      realtimeClientRef.current = null;
      setRealtimeReady(false);
      return;
    }
    let cancelled = false;
    setRealtimeReady(false);
    setUseClassicChat(false);
    void (async () => {
      try {
        const assistantIdentity = {
          assistantIsAdmin: assistantCommentActor === "admin",
          assistantUserId:
            assistantCommentActor === "admin" ? "admin" : currentTechnicianUserId ?? undefined,
          assistantUserDisplayName: assistantAuthorDisplayName,
          relaySessionRole,
        };
        const session = await postAssistantRealtimeSession(allowedTabs, assistantIdentity);
        if (cancelled) return;
        const client = new OpenAiRealtimeClient({
          onSessionReady: () => {},
          onAssistantTranscriptDelta: (delta) => {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === "assistant") {
                next[next.length - 1] = {
                  ...last,
                  content: (last.content || "") + delta,
                };
              }
              return next;
            });
          },
          onAssistantTranscriptDone: () => {},
          onAssistantAudioPlaybackStart: () => {
            loadingRef.current = true;
            assistantPlaybackIdleRef.current = false;
            setAssistantPlaybackIdle(false);
            recRef.current?.stop();
            setLoading(true);
          },
          onAssistantAudioPlaybackEnd: () => {
            assistantPlaybackIdleRef.current = true;
            setAssistantPlaybackIdle(true);
          },
          onResponseDone: () => {
            setLoading(false);
            const pending = relayMarkAfterResponseRef.current;
            if (!pending?.length) return;
            relayMarkAfterResponseRef.current = null;
            relayRealtimeDeliveryLockRef.current = false;
            void Promise.all(pending.map((b) => markZayaRelayOpened(b.ids, b.scope, b.userId)))
              .then(() => {
                if (pending.some((b) => b.scope === "technician")) setRelayPendingTech(0);
                if (pending.some((b) => b.scope === "management")) setRelayPendingMgmt(0);
                refreshRelayPendingCount();
              })
              .catch(() => {
                refreshRelayPendingCount();
              });
          },
          onFunctionCall: async ({ name, arguments: argsStr, call_id }) => {
            const assistantCtx: AssistantContext = {
              allowedTabs,
              serviceOrderActor: serviceOrderActorRef.current,
              authorDisplayName: assistantAuthorDisplayNameRef.current,
              commentActor: assistantCommentActorRef.current,
              currentTechnicianUserId: currentTechnicianUserIdRef.current ?? null,
              relaySessionRole: relaySessionRoleRef.current,
              isAdminSession: assistantCommentActorRef.current === "admin",
            };
            const toolCalls: AssistantToolCall[] = [
              { id: call_id, type: "function", function: { name, arguments: argsStr } },
            ];
            const results = await executeToolCalls(
              toolCalls,
              allowedTabs,
              onNavigateTabStable,
              onOpenSettingsStable,
              serviceOrderActorRef.current,
              assistantCtx,
              onOpenPatioVehicleStable,
              onOpenPatioHistoryStable
            );
            return results.find((r) => r.id === call_id)?.content ?? '{"ok":false}';
          },
          onError: (msg) => {
            setError(msg);
            setLoading(false);
            assistantPlaybackIdleRef.current = true;
            setAssistantPlaybackIdle(true);
            const pending = relayMarkAfterResponseRef.current;
            if (pending?.length) {
              relayMarkAfterResponseRef.current = null;
              void Promise.all(pending.map((b) => markZayaRelayOpened(b.ids, b.scope, b.userId)))
                .then(() => {
                  if (pending.some((b) => b.scope === "technician")) setRelayPendingTech(0);
                  if (pending.some((b) => b.scope === "management")) setRelayPendingMgmt(0);
                  refreshRelayPendingCount();
                })
                .catch(() => {
                  refreshRelayPendingCount();
                });
            }
          },
        });
        await client.connect(session.client_secret, session.model);
        if (cancelled) {
          client.disconnect();
          return;
        }
        realtimeClientRef.current = client;
        setRealtimeReady(true);
      } catch {
        if (!cancelled) setUseClassicChat(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    open,
    allowedTabs,
    assistantAuthorDisplayName,
    assistantCommentActor,
    currentTechnicianUserId,
    relaySessionRole,
    refreshRelayPendingCount,
  ]);

  const sendUserMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;
      if (!useClassicChat && open && !realtimeReady) {
        setError(`Aguarde a conexão com a ${ASSISTANT_NAME}…`);
        return;
      }
      setInput("");
      setError(null);
      if (realtimeClientRef.current && realtimeReady && !useClassicChat) {
        if (typeof window !== "undefined") window.speechSynthesis?.cancel();
        listeningRef.current = false;
        setListening(false);
        loadingRef.current = true;
        assistantPlaybackIdleRef.current = true;
        setAssistantPlaybackIdle(true);
        recRef.current?.stop();
        setMessages((prev) => [
          ...prev,
          { role: "user", content: trimmed },
          { role: "assistant", content: "" },
        ]);
        setLoading(true);
        realtimeClientRef.current.sendUserText(trimmed);
        return;
      }
      const next: AssistantApiMessage[] = [...messagesRef.current, { role: "user", content: trimmed }];
      setMessages(next);
      void runAssistantTurn(next);
    },
    [loading, runAssistantTurn, useClassicChat, realtimeReady, open]
  );

  sendUserMessageRef.current = sendUserMessage;

  /** Ao mudar para modo clássico ou fechar, encerra o reconhecimento contínuo. */
  useEffect(() => {
    if (useClassicChat && listeningRef.current) {
      listeningRef.current = false;
      recRef.current?.stop();
      setListening(false);
    }
  }, [useClassicChat]);

  useEffect(() => {
    if (!open && listeningRef.current) {
      listeningRef.current = false;
      recRef.current?.stop();
      setListening(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) autoMicStartedForOpenRef.current = false;
  }, [open]);

  const startSpeechRecognition = useCallback(() => {
    const isRealtimeVoice = realtimeReady && !useClassicChat;
    if (!isRealtimeVoice) return;
    if (listeningRef.current) return;
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError("Reconhecimento de voz não suportado neste navegador.");
      return;
    }
    const rec = new Ctor();
    rec.lang = "pt-BR";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    /** Uma frase por ativação do mic; após enviar, o mic desliga (evita eco com a voz da Zaya). */
    rec.continuous = false;
    rec.onresult = (ev: { results: ArrayLike<{ 0: { transcript: string } }> }) => {
      const said = ev.results[0]?.[0]?.transcript?.trim();
      if (said) {
        if (isRealtimeVoice) {
          listeningRef.current = false;
          setListening(false);
          try {
            rec.stop();
          } catch {
            /* ignore */
          }
          sendUserMessageRef.current(said);
        } else {
          setInput((prev) => (prev ? `${prev} ${said}` : said));
          setListening(false);
          listeningRef.current = false;
        }
      } else if (!isRealtimeVoice) {
        setListening(false);
        listeningRef.current = false;
      }
    };
    rec.onerror = () => {
      listeningRef.current = false;
      setListening(false);
    };
    rec.onend = () => {
      if (!listeningRef.current) {
        setListening(false);
        return;
      }
      if (isRealtimeVoice) {
        listeningRef.current = false;
        setListening(false);
        return;
      }
      if (loadingRef.current) {
        return;
      }
      if (!assistantPlaybackIdleRef.current) {
        return;
      }
      setListening(false);
    };
    recRef.current = rec;
    listeningRef.current = true;
    try {
      rec.start();
      setListening(true);
    } catch {
      listeningRef.current = false;
      setListening(false);
    }
  }, [realtimeReady, useClassicChat]);

  const toggleMic = useCallback(() => {
    if (listening) {
      listeningRef.current = false;
      recRef.current?.stop();
      setListening(false);
      return;
    }
    startSpeechRecognition();
  }, [listening, startSpeechRecognition]);

  /** Ao abrir o chat com voz em tempo real pronta, liga o microfone uma vez (após relay inicial, se houver). */
  useEffect(() => {
    if (!open || !realtimeReady || useClassicChat || autoMicStartedForOpenRef.current) return;
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    const outer = window.setTimeout(() => {
      let attempts = 0;
      const poll = () => {
        if (cancelled || autoMicStartedForOpenRef.current) return;
        attempts++;
        const idle = !loadingRef.current && assistantPlaybackIdleRef.current;
        if (idle || attempts > 80) {
          autoMicStartedForOpenRef.current = true;
          startSpeechRecognition();
          return;
        }
        pollTimer = window.setTimeout(poll, 120);
      };
      poll();
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(outer);
      if (pollTimer) window.clearTimeout(pollTimer);
    };
  }, [open, realtimeReady, useClassicChat, startSpeechRecognition]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const connectingRealtime = open && !useClassicChat && !realtimeReady;

  /** Só o ícone da Zaya (bola escura animada), sem moldura âmbar/laranja. */
  const zayaIconWrap = "rounded-full bg-transparent p-0 shadow-none";

  const isRealtimeVoice = realtimeReady && !useClassicChat;

  useEffect(() => {
    if (!isRealtimeVoice) return;
    if (resumeMicTimeoutRef.current) {
      clearTimeout(resumeMicTimeoutRef.current);
      resumeMicTimeoutRef.current = null;
    }
    if (loading) {
      recRef.current?.stop();
      return;
    }
    if (!assistantPlaybackIdle) {
      return;
    }
    if (listeningRef.current && recRef.current) {
      resumeMicTimeoutRef.current = setTimeout(() => {
        resumeMicTimeoutRef.current = null;
        if (!listeningRef.current || loadingRef.current || !assistantPlaybackIdleRef.current) return;
        try {
          recRef.current?.start();
        } catch {
          /* ignore */
        }
      }, 1100);
    }
    return () => {
      if (resumeMicTimeoutRef.current) {
        clearTimeout(resumeMicTimeoutRef.current);
        resumeMicTimeoutRef.current = null;
      }
    };
  }, [loading, assistantPlaybackIdle, isRealtimeVoice]);

  return (
    <>
      <style>{`
        @keyframes assist-mic-pulse {
          0%, 100% { transform: scale(1); opacity: 0.88; }
          50% { transform: scale(1.42); opacity: 0.22; }
        }
        .assist-mic-pulse-a {
          animation: assist-mic-pulse 1.35s ease-in-out infinite;
        }
        .assist-mic-pulse-b {
          animation: assist-mic-pulse 1.35s ease-in-out infinite;
          animation-delay: 0.4s;
        }
        @keyframes zayaAuroraModalSpin {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }
      `}</style>
      {open && (
        <div className="fixed inset-0 z-[280] flex flex-col justify-end p-4 pb-28 pt-[max(1rem,env(safe-area-inset-top))] pointer-events-none sm:items-end sm:justify-end sm:p-6 sm:pb-28">
          <ZayaAuroraModalFrame className="pointer-events-auto max-w-md animate-in fade-in zoom-in-95 duration-200">
            <div
              className={`relative flex max-h-[min(560px,78vh)] w-full flex-col overflow-hidden ${iosModalShellZayaInner}`}
            >
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") window.speechSynthesis?.cancel();
                listeningRef.current = false;
                recRef.current?.stop();
                setListening(false);
                setOpen(false);
              }}
              className={iosModalClose}
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="shrink-0 border-b border-zinc-200/60 px-6 pb-4 pt-6 dark:border-white/[0.07] sm:px-7 sm:pt-7">
              <div className="flex items-start gap-3 pr-10">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center ${zayaIconWrap}`}>
                  <AssistantIcon className="h-12 w-12" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[22px] font-semibold leading-tight tracking-tight text-zinc-900 dark:text-white">
                    {ASSISTANT_NAME}
                  </h2>
                  <p className="mt-1 flex items-center gap-1.5 text-[13px] text-zinc-500 dark:text-zinc-400">
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-500/90" />
                    Assistente da oficina — pergunte por OS, pátio e lembretes
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {realtimeReady && !useClassicChat && (
                      <span className="inline-flex items-center rounded-full bg-emerald-500/12 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                        Voz em tempo real
                      </span>
                    )}
                    {useClassicChat && (
                      <span className="inline-flex items-center rounded-full bg-zinc-500/10 px-2.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:text-zinc-400">
                        Modo chat clássico
                      </span>
                    )}
                    {!useClassicChat && realtimeReady && (
                      <button
                        type="button"
                        className="rounded-full bg-black/[0.06] px-2.5 py-1 text-[11px] font-medium text-[#007AFF] transition-colors hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15"
                        onClick={() => {
                          listeningRef.current = false;
                          recRef.current?.stop();
                          setListening(false);
                          realtimeClientRef.current?.disconnect();
                          realtimeClientRef.current = null;
                          setRealtimeReady(false);
                          setUseClassicChat(true);
                        }}
                      >
                        Usar modo clássico
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div
              className={`min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6 ${uiChatScrollArea}`}
            >
              {messages.length === 0 && (
                <div className={`${iosModalInsetCard} p-4 ${uiChatMeta}`}>
                  Olá, eu sou a {ASSISTANT_NAME}. No modo tempo real, ligue o microfone: cada frase é
                  enviada automaticamente ao terminar. No modo clássico, o microfone só preenche o
                  texto — use Enviar.
                </div>
              )}
              {messages.map((m, i) => {
                if (m.role === "user") {
                  return (
                    <div key={i} className="flex justify-end">
                      <div
                        className={`max-w-[88%] ${iosModalInsetCard} border-amber-200/70 bg-amber-50/90 px-3.5 py-2.5 text-zinc-900 dark:border-amber-500/25 dark:bg-amber-950/35 dark:text-zinc-100`}
                      >
                        {m.content}
                      </div>
                    </div>
                  );
                }
                if (m.role === "assistant" && m.content) {
                  return (
                    <div key={i} className="flex justify-start">
                      <div
                        className={`max-w-[92%] ${iosModalInsetCard} px-3.5 py-2.5 ${uiChatBubbleAssistant}`}
                      >
                        <ReactMarkdown remarkPlugins={[remarkBreaks]} components={markdownComponentsApp}>
                          {m.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  );
                }
                return null;
              })}
              {connectingRealtime && (
                <p className={uiChatMeta}>Conectando voz em tempo real…</p>
              )}
              {loading && <p className={uiChatMeta}>Pensando…</p>}
              {error && (
                <p className="text-[13px] font-normal text-red-600 dark:text-red-400">{error}</p>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="shrink-0 border-t border-zinc-200/60 bg-white/40 p-3 dark:border-white/[0.07] dark:bg-zinc-950/30 sm:p-3.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleTts}
                  disabled={realtimeReady && !useClassicChat}
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full p-0 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    ttsEnabled
                      ? "bg-amber-500/15 text-amber-900 dark:text-amber-300"
                      : "bg-black/[0.05] text-zinc-600 hover:bg-black/10 dark:bg-white/10 dark:text-zinc-300 dark:hover:bg-white/15"
                  }`}
                  aria-label={ttsEnabled ? "Desativar voz da assistente" : "Ativar voz da assistente"}
                  title={
                    realtimeReady && !useClassicChat
                      ? "No modo tempo real a voz já vem do modelo"
                      : ttsEnabled
                        ? "Voz da Zaya ligada"
                        : "Voz da Zaya desligada"
                  }
                >
                  {ttsEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                </button>
                <div className="relative flex h-12 w-12 shrink-0 items-center justify-center">
                  {listening && (
                    <>
                      <span
                        className="assist-mic-pulse-a pointer-events-none absolute inset-0 m-auto h-10 w-10 rounded-full border-2 border-[#007AFF] bg-[#007AFF]/12"
                        aria-hidden
                      />
                      <span
                        className="assist-mic-pulse-b pointer-events-none absolute inset-0 m-auto h-[44px] w-[44px] rounded-full border border-[#007AFF]/45"
                        aria-hidden
                      />
                    </>
                  )}
                  <button
                    type="button"
                    onClick={toggleMic}
                    className={`relative z-10 flex h-11 w-11 items-center justify-center rounded-full p-0 transition-colors ${
                      listening
                        ? "bg-[#007AFF]/15 text-[#007AFF] shadow-[0_0_16px_rgba(0,122,255,0.35)] dark:text-[#64B5FF]"
                        : "bg-black/[0.05] text-zinc-600 hover:bg-black/10 dark:bg-white/10 dark:text-zinc-300 dark:hover:bg-white/15"
                    }`}
                    aria-label={listening ? "Parar de ouvir" : "Ativar microfone"}
                    title={
                      isRealtimeVoice
                        ? "Ligado: suas falas são enviadas ao terminar cada frase"
                        : "Ditar no campo; use Enviar para enviar"
                    }
                  >
                    <Mic className="h-5 w-5" />
                  </button>
                </div>
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendUserMessage(input)}
                  placeholder={
                    isRealtimeVoice
                      ? "Fale ou digite…"
                      : "Escreva e envie (Enter)…"
                  }
                  className={`min-w-0 flex-1 ${iosInput} py-2.5 text-[15px]`}
                />
                <button
                  type="button"
                  onClick={() => sendUserMessage(input)}
                  disabled={loading || connectingRealtime}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#007AFF] p-0 text-white shadow-lg shadow-blue-500/25 transition-transform hover:opacity-95 active:scale-[0.98] disabled:opacity-45"
                  title={
                    isRealtimeVoice
                      ? "Enviar texto (opcional; no microfone o envio é automático)"
                      : "Enviar mensagem"
                  }
                >
                  <Send className="h-5 w-5" />
                </button>
              </div>
            </div>
            </div>
          </ZayaAuroraModalFrame>
        </div>
      )}

      {/* Acima de modais do app (z~100–200); sem blur no fundo — painel Zaya com pointer-events-auto */}
      <div className="pointer-events-none fixed bottom-24 right-4 z-[320]">
        <div className="pointer-events-auto relative h-14 w-14">
          <button
            type="button"
            aria-label={`Abrir ${ASSISTANT_NAME}`}
            onClick={() => setOpen(true)}
            className={`relative z-10 flex h-14 w-14 items-center justify-center ${zayaIconWrap} transition-transform hover:scale-[1.03] active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/40`}
          >
            <AssistantIcon className="h-14 w-14" />
          </button>
        </div>
      </div>
    </>
  );
};
