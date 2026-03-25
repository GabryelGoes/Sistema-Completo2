import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Mic, Send, Volume2, VolumeX, X } from "lucide-react";
import { AssistantIcon } from "./AssistantIcon";
import { ASSISTANT_NAME } from "../constants/assistant";
import type { TabId } from "./TabBar";
import {
  postAssistantChat,
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
  type ServiceOrderUpdateActor,
  type ZayaRelayPendingRow,
} from "../services/apiService";
import {
  isValidServiceOrderStatus,
  listVehiclesInStageJson,
  updateServiceOrderStageJson,
} from "../services/assistantPatioTools";
import type { AssistantContext } from "../services/assistantExtendedTools";
import {
  addServiceOrderCommentJson,
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
  /** Recados entre gerência e técnicos (ferramentas + indicador). */
  relaySessionRole?: "management" | "technician" | "none";
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
  onOpenPatioVehicle?: (serviceOrderId: string, options?: { budgetId?: string }) => void
): Promise<{ id: string; content: string }[]> {
  const results: { id: string; content: string }[] = [];
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
    if (name === "list_technicians_for_zaya_relay") {
      if (assistantCtx.relaySessionRole !== "management") {
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
      if (assistantCtx.relaySessionRole !== "management") {
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
      if (assistantCtx.relaySessionRole !== "technician" || !assistantCtx.currentTechnicianUserId) {
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
        if (assistantCtx.relaySessionRole === "management") {
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
      const out = appendWorkshopReminder(
        target,
        text,
        assistantCtx.authorDisplayName || ASSISTANT_NAME
      );
      results.push({ id: tc.id, content: JSON.stringify(out) });
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
      const list = readWorkshopReminders(target);
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
      const out = deleteWorkshopReminder(target, reminderId);
      results.push({ id: tc.id, content: JSON.stringify(out) });
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
      const out = updateWorkshopReminder(target, reminderId, {
        ...(hasText ? { text: String(payload.text) } : {}),
        ...(hasDone ? { done: payload.done as boolean } : {}),
      });
      results.push({ id: tc.id, content: JSON.stringify(out) });
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
  relaySessionRole: relaySessionRoleProp = "none",
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

  const relaySessionRole = relaySessionRoleProp;
  const [relayPendingTech, setRelayPendingTech] = useState(0);
  const [relayPendingMgmt, setRelayPendingMgmt] = useState(0);
  /** Dispara nova tentativa de entrega quando o contador de pendentes sobe. */
  const [relayRedeliveryTick, setRelayRedeliveryTick] = useState(0);
  const lastRelayPendingCountRef = useRef(0);
  /** Após `sendRelayVoiceAnnouncement`, marcar recados abertos no fim da resposta Realtime. */
  const relayMarkAfterResponseRef = useRef<{
    ids: string[];
    scope: "technician" | "management";
    userId?: string;
  } | null>(null);
  /** Evita reenviar o mesmo lote no modo clássico. */
  const relayClassicBatchKeyRef = useRef<string>("");
  /** Evita duas buscas paralelas de recados antes de enviar ao Realtime. */
  const relayRealtimeDeliveryLockRef = useRef(false);
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
        };
        const assistantIdentity = {
          assistantIsAdmin: assistantCommentActor === "admin",
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
              onOpenPatioVehicle
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
      relaySessionRole,
    ]
  );

  const refreshRelayPendingCount = useCallback(() => {
    if (relaySessionRole === "none") return;
    if (relaySessionRole === "technician" && currentTechnicianUserId) {
      void getZayaRelayPendingCountForTechnician(currentTechnicianUserId).then(setRelayPendingTech);
    } else if (relaySessionRole === "management") {
      void getZayaRelayPendingCountForManagement().then(setRelayPendingMgmt);
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
          : 0;
    if (n > lastRelayPendingCountRef.current) {
      setRelayRedeliveryTick((t) => t + 1);
    }
    lastRelayPendingCountRef.current = n;
  }, [relayPendingTech, relayPendingMgmt, relaySessionRole]);

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
    if (relaySessionRole === "technician" && !currentTechnicianUserId) return;
    let cancelled = false;
    void (async () => {
      const rows =
        relaySessionRole === "technician" && currentTechnicianUserId
          ? await getZayaRelayPendingForTechnician(currentTechnicianUserId)
          : await getZayaRelayPendingForManagement();
      if (cancelled || rows.length === 0) return;
      const ids = rows.map((r) => r.id).sort();
      const batchKey = ids.join(",");
      if (batchKey === relayClassicBatchKeyRef.current) return;
      const scope = relaySessionRole === "technician" ? "technician" : "management";
      const delivery: AssistantApiMessage[] =
        relaySessionRole === "technician"
          ? rows.map((r) => ({
              role: "assistant" as const,
              content:
                `**Recado da gerência**\n\n${r.body}\n\n---\nPara responder, diga ou escreva sua resposta; o id deste recado é \`${r.id}\` (uso na ferramenta zaya_submit_relay_reply).`,
            }))
          : rows.map((r) => ({
              role: "assistant" as const,
              content:
                `**Recado do técnico ${r.sender_label}**\n\n${r.body}\n\n---\nPara responder a este recado, use a ferramenta de resposta com o id \`${r.id}\` e o texto da sua resposta.`,
            }));
      setMessages((prev) => [...delivery, ...prev]);
      relayClassicBatchKeyRef.current = batchKey;
      try {
        await markZayaRelayOpened(
          ids,
          scope,
          scope === "technician" ? currentTechnicianUserId : undefined
        );
      } catch {
        relayClassicBatchKeyRef.current = "";
      }
      if (!cancelled) {
        if (scope === "technician") setRelayPendingTech(0);
        else setRelayPendingMgmt(0);
        refreshRelayPendingCount();
      }
      if (!cancelled && ttsEnabledRef.current && rows[0]) {
        speakAssistantResponse(combineRelayRowsForVoice(rows, scope));
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
    if (relaySessionRole === "technician" && !currentTechnicianUserId) return;
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
        const rows =
          relaySessionRole === "technician" && currentTechnicianUserId
            ? await getZayaRelayPendingForTechnician(currentTechnicianUserId)
            : await getZayaRelayPendingForManagement();
        if (cancelled || rows.length === 0) return;
        const ids = rows.map((r) => r.id);
        const scope = relaySessionRole === "technician" ? "technician" : "management";
        const voice = combineRelayRowsForVoice(rows, scope);
        relayMarkAfterResponseRef.current = {
          ids,
          scope,
          ...(scope === "technician" && currentTechnicianUserId
            ? { userId: currentTechnicianUserId }
            : {}),
        };
        const userLabel =
          scope === "technician" ? "🔔 Recado da gerência" : "🔔 Recado de técnico";
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
            if (!pending) return;
            relayMarkAfterResponseRef.current = null;
            relayRealtimeDeliveryLockRef.current = false;
            void markZayaRelayOpened(pending.ids, pending.scope, pending.userId)
              .then(() => {
                if (pending.scope === "technician") setRelayPendingTech(0);
                else setRelayPendingMgmt(0);
                refreshRelayPendingCount();
              })
              .catch(() => {
                refreshRelayPendingCount();
              });
          },
          onFunctionCall: async ({ name, arguments: argsStr, call_id }) => {
            const assistantCtx: AssistantContext = {
              allowedTabs,
              serviceOrderActor,
              authorDisplayName: assistantAuthorDisplayName,
              commentActor: assistantCommentActor,
              currentTechnicianUserId: currentTechnicianUserId ?? null,
              relaySessionRole,
            };
            const toolCalls: AssistantToolCall[] = [
              { id: call_id, type: "function", function: { name, arguments: argsStr } },
            ];
            const results = await executeToolCalls(
              toolCalls,
              allowedTabs,
              onNavigateTab,
              onOpenSettings,
              serviceOrderActor,
              assistantCtx,
              onOpenPatioVehicle
            );
            return results.find((r) => r.id === call_id)?.content ?? '{"ok":false}';
          },
          onError: (msg) => {
            setError(msg);
            setLoading(false);
            assistantPlaybackIdleRef.current = true;
            setAssistantPlaybackIdle(true);
            const pending = relayMarkAfterResponseRef.current;
            if (pending) {
              relayMarkAfterResponseRef.current = null;
              void markZayaRelayOpened(pending.ids, pending.scope, pending.userId)
                .then(() => {
                  if (pending.scope === "technician") setRelayPendingTech(0);
                  else setRelayPendingMgmt(0);
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
    onNavigateTab,
    onOpenSettings,
    serviceOrderActor,
    assistantAuthorDisplayName,
    assistantCommentActor,
    currentTechnicianUserId,
    onOpenPatioVehicle,
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

  const toggleMic = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError("Reconhecimento de voz não suportado neste navegador.");
      return;
    }
    if (listening) {
      listeningRef.current = false;
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const isRealtimeVoice = realtimeReady && !useClassicChat;
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
  }, [listening, realtimeReady, useClassicChat]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const connectingRealtime = open && !useClassicChat && !realtimeReady;

  const panelBg =
    theme === "dark"
      ? "bg-zinc-900/95 border-white/10 text-white"
      : "bg-white/95 border-zinc-200 text-zinc-900";
  const fabBg =
    theme === "dark"
      ? "bg-brand-yellow text-zinc-900 shadow-lg shadow-brand-yellow/20"
      : "bg-zinc-900 text-brand-yellow shadow-lg";

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
        @keyframes assist-relay-green {
          0%, 100% { transform: scale(1); opacity: 0.88; }
          50% { transform: scale(1.2); opacity: 0.2; }
        }
        .assist-relay-green-a {
          animation: assist-relay-green 1.55s ease-in-out infinite;
        }
        .assist-relay-green-b {
          animation: assist-relay-green 1.55s ease-in-out infinite;
          animation-delay: 0.38s;
        }
      `}</style>
      <div className="fixed bottom-24 right-4 z-[90]">
        <div className="relative h-14 w-14">
          {relaySessionRole === "technician" && relayPendingTech > 0 && (
            <>
              <span
                className="pointer-events-none absolute inset-0 -m-[2px] rounded-full border-2 border-emerald-500 assist-relay-green-a"
                aria-hidden
              />
              <span
                className="pointer-events-none absolute inset-0 -m-[5px] rounded-full border border-emerald-400/55 assist-relay-green-b"
                aria-hidden
              />
            </>
          )}
          {relaySessionRole === "management" && relayPendingMgmt > 0 && (
            <>
              <span
                className="pointer-events-none absolute inset-0 -m-[2px] rounded-full border-2 border-emerald-500 assist-relay-green-a"
                aria-hidden
              />
              <span
                className="pointer-events-none absolute inset-0 -m-[5px] rounded-full border border-emerald-400/55 assist-relay-green-b"
                aria-hidden
              />
            </>
          )}
          <button
            type="button"
            aria-label={`Abrir ${ASSISTANT_NAME}${
              relaySessionRole === "technician" && relayPendingTech > 0
                ? " — há recado da gerência"
                : relaySessionRole === "management" && relayPendingMgmt > 0
                  ? " — há recado de técnico"
                  : ""
            }`}
            onClick={() => setOpen(true)}
            className={`relative z-10 flex h-14 w-14 items-center justify-center rounded-full ${fabBg} transition-transform hover:scale-105 active:scale-95`}
          >
            <AssistantIcon className="h-7 w-7" />
          </button>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-[110] flex flex-col justify-end bg-black/50 p-4 pb-28 sm:items-end sm:justify-end sm:p-6 sm:pb-28">
          <div
            className={`flex max-h-[min(520px,70vh)] w-full max-w-md flex-col overflow-hidden rounded-2xl border shadow-2xl ${panelBg}`}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 dark:border-white/10">
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex items-center gap-2 font-semibold">
                  <AssistantIcon className="h-5 w-5 shrink-0" />
                  {ASSISTANT_NAME}
                </div>
                {realtimeReady && !useClassicChat && (
                  <span className="text-[10px] font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                    Voz em tempo real
                  </span>
                )}
                {useClassicChat && (
                  <span className="text-[10px] text-zinc-500">Modo chat clássico</span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {!useClassicChat && realtimeReady && (
                  <button
                    type="button"
                    className="rounded-lg px-2 py-1 text-[11px] text-zinc-500 hover:bg-white/10 hover:text-zinc-300"
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
                    Modo clássico
                  </button>
                )}
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
                  listeningRef.current = false;
                  recRef.current?.stop();
                  setListening(false);
                  setOpen(false);
                }}
                className="rounded-full p-2 hover:bg-white/10"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
              {messages.length === 0 && (
                <p className="text-zinc-500 dark:text-zinc-400">
                  Olá, eu sou a {ASSISTANT_NAME}. No modo tempo real, ligue o microfone: cada frase é
                  enviada automaticamente ao terminar. No modo clássico, o microfone só preenche o
                  texto — use Enviar.
                </p>
              )}
              {messages.map((m, i) => {
                if (m.role === "user") {
                  return (
                    <div key={i} className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl bg-brand-yellow/20 px-3 py-2 text-zinc-900 dark:text-zinc-100">
                        {m.content}
                      </div>
                    </div>
                  );
                }
                if (m.role === "assistant" && m.content) {
                  return (
                    <div key={i} className="flex justify-start">
                      <div className="prose prose-sm dark:prose-invert max-w-[90%] rounded-2xl bg-white/5 px-3 py-2">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>
                    </div>
                  );
                }
                return null;
              })}
              {connectingRealtime && (
                <div className="text-zinc-500 dark:text-zinc-400">Conectando voz em tempo real…</div>
              )}
              {loading && (
                <div className="text-zinc-500 dark:text-zinc-400">Pensando…</div>
              )}
              {error && <div className="text-red-500">{error}</div>}
              <div ref={bottomRef} />
            </div>

            <div className="flex gap-2 border-t border-white/10 p-3 dark:border-white/10">
              <button
                type="button"
                onClick={toggleTts}
                disabled={realtimeReady && !useClassicChat}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full p-0 disabled:cursor-not-allowed disabled:opacity-40 ${
                  ttsEnabled ? "bg-brand-yellow/20 text-zinc-900 dark:text-brand-yellow" : "bg-white/10 hover:bg-white/15"
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
                      className="assist-mic-pulse-a pointer-events-none absolute inset-0 m-auto h-10 w-10 rounded-full border-2 border-sky-500 bg-sky-500/15"
                      aria-hidden
                    />
                    <span
                      className="assist-mic-pulse-b pointer-events-none absolute inset-0 m-auto h-[44px] w-[44px] rounded-full border border-sky-400/55"
                      aria-hidden
                    />
                  </>
                )}
                <button
                  type="button"
                  onClick={toggleMic}
                  className={`relative z-10 flex h-11 w-11 items-center justify-center rounded-full p-0 ${
                    listening
                      ? "bg-sky-500/15 text-sky-300 shadow-[0_0_14px_rgba(56,189,248,0.4)] dark:text-sky-200"
                      : "bg-white/10 hover:bg-white/15"
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
                    ? "Ou fale com o microfone (envio automático) ou digite…"
                    : "Escreva e envie (Enter ou botão)…"
                }
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-inherit placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-brand-yellow/50"
              />
              <button
                type="button"
                onClick={() => sendUserMessage(input)}
                disabled={loading || connectingRealtime}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-yellow p-0 font-medium text-zinc-900 disabled:opacity-50"
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
      )}
    </>
  );
};
