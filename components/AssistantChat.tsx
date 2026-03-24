import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Mic, MicOff, Send, Volume2, VolumeX, X } from "lucide-react";
import { AssistantIcon } from "./AssistantIcon";
import { ASSISTANT_NAME } from "../constants/assistant";
import type { TabId } from "./TabBar";
import {
  postAssistantChat,
  type AssistantApiMessage,
  type AssistantToolCall,
} from "../services/assistantApi";
import type { ServiceOrderUpdateActor } from "../services/apiService";
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
}) => {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
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

  const recRef = useRef<InstanceType<SpeechRecCtor> | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

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
        };
        for (let step = 0; step < 15; step++) {
          const { message } = await postAssistantChat(current, allowedTabs);
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
    ]
  );

  const sendUserMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;
      const next: AssistantApiMessage[] = [...messages, { role: "user", content: trimmed }];
      setMessages(next);
      setInput("");
      void runAssistantTurn(next);
    },
    [messages, loading, runAssistantTurn]
  );

  const toggleMic = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError("Reconhecimento de voz não suportado neste navegador.");
      return;
    }
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new Ctor();
    rec.lang = "pt-BR";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (ev: { results: ArrayLike<{ 0: { transcript: string } }> }) => {
      const said = ev.results[0]?.[0]?.transcript?.trim();
      if (said) setInput((prev) => (prev ? `${prev} ${said}` : said));
      setListening(false);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, [listening]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const panelBg =
    theme === "dark"
      ? "bg-zinc-900/95 border-white/10 text-white"
      : "bg-white/95 border-zinc-200 text-zinc-900";
  const fabBg =
    theme === "dark"
      ? "bg-brand-yellow text-zinc-900 shadow-lg shadow-brand-yellow/20"
      : "bg-zinc-900 text-brand-yellow shadow-lg";

  return (
    <>
      <button
        type="button"
        aria-label={`Abrir ${ASSISTANT_NAME}`}
        onClick={() => setOpen(true)}
        className={`fixed bottom-24 right-4 z-[90] flex h-14 w-14 items-center justify-center rounded-full ${fabBg} transition-transform hover:scale-105 active:scale-95`}
      >
        <AssistantIcon className="h-7 w-7" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[110] flex flex-col justify-end bg-black/50 p-4 pb-28 sm:items-end sm:justify-end sm:p-6 sm:pb-28">
          <div
            className={`flex max-h-[min(520px,70vh)] w-full max-w-md flex-col overflow-hidden rounded-2xl border shadow-2xl ${panelBg}`}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 dark:border-white/10">
              <div className="flex items-center gap-2 font-semibold">
                <AssistantIcon className="h-5 w-5 shrink-0" />
                {ASSISTANT_NAME}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
                  setOpen(false);
                }}
                className="rounded-full p-2 hover:bg-white/10"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
              {messages.length === 0 && (
                <p className="text-zinc-500 dark:text-zinc-400">
                  Olá, eu sou a {ASSISTANT_NAME}. Pergunte sobre o app, peça para abrir uma aba ou
                  liste/movimente veículos no Pátio (por etapa). Use o microfone; as respostas podem
                  ser lidas em voz (botão de alto-falante).
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
                className={`shrink-0 rounded-xl p-3 ${
                  ttsEnabled ? "bg-brand-yellow/20 text-zinc-900 dark:text-brand-yellow" : "bg-white/10 hover:bg-white/15"
                }`}
                aria-label={ttsEnabled ? "Desativar voz da assistente" : "Ativar voz da assistente"}
                title={ttsEnabled ? "Voz da Zaya ligada" : "Voz da Zaya desligada"}
              >
                {ttsEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
              </button>
              <button
                type="button"
                onClick={toggleMic}
                className={`shrink-0 rounded-xl p-3 ${
                  listening ? "bg-red-500/20 text-red-400" : "bg-white/10 hover:bg-white/15"
                }`}
                aria-label={listening ? "Parar microfone" : "Falar"}
              >
                {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </button>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendUserMessage(input)}
                placeholder="Escreva uma mensagem…"
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-inherit placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-brand-yellow/50"
              />
              <button
                type="button"
                onClick={() => sendUserMessage(input)}
                disabled={loading}
                className="shrink-0 rounded-xl bg-brand-yellow px-4 py-2 font-medium text-zinc-900 disabled:opacity-50"
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
