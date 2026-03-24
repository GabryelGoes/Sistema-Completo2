import React, { useCallback, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Bot, Mic, MicOff, Send, X } from "lucide-react";
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

interface AssistantChatProps {
  theme: "dark" | "light";
  allowedTabs: TabId[];
  onNavigateTab: (tab: TabId) => void;
  onOpenSettings: () => void;
  /** Quem executa mudança de etapa da OS (notificações), igual ao Pátio. */
  serviceOrderActor?: ServiceOrderUpdateActor;
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
  serviceOrderActor?: ServiceOrderUpdateActor
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
}) => {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Histórico exibido + enviado ao servidor (sem system). */
  const [messages, setMessages] = useState<AssistantApiMessage[]>([]);
  const [listening, setListening] = useState(false);
  const recRef = useRef<InstanceType<SpeechRecCtor> | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const runAssistantTurn = useCallback(
    async (history: AssistantApiMessage[]) => {
      setLoading(true);
      setError(null);
      try {
        let current = [...history];
        for (let step = 0; step < 8; step++) {
          const { message } = await postAssistantChat(current, allowedTabs);
          if (message.tool_calls?.length) {
            current = [...current, message];
            const toolResults = await executeToolCalls(
              message.tool_calls,
              allowedTabs,
              onNavigateTab,
              onOpenSettings,
              serviceOrderActor
            );
            for (const tr of toolResults) {
              current.push({ role: "tool", tool_call_id: tr.id, content: tr.content });
            }
            continue;
          }
          current = [...current, message];
          setMessages(current);
          return;
        }
        setError("Limite de passos da assistente atingido.");
        setMessages(current);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao falar com a assistente.");
      } finally {
        setLoading(false);
      }
    },
    [allowedTabs, onNavigateTab, onOpenSettings, serviceOrderActor]
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

  React.useEffect(() => {
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
        aria-label="Abrir assistente"
        onClick={() => setOpen(true)}
        className={`fixed bottom-24 right-4 z-[90] flex h-14 w-14 items-center justify-center rounded-full ${fabBg} transition-transform hover:scale-105 active:scale-95`}
      >
        <Bot className="h-7 w-7" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[110] flex flex-col justify-end bg-black/50 p-4 pb-28 sm:items-end sm:justify-end sm:p-6 sm:pb-28">
          <div
            className={`flex max-h-[min(520px,70vh)] w-full max-w-md flex-col overflow-hidden rounded-2xl border shadow-2xl ${panelBg}`}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 dark:border-white/10">
              <div className="flex items-center gap-2 font-semibold">
                <Bot className="h-5 w-5 text-brand-yellow" />
                Assistente
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full p-2 hover:bg-white/10"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
              {messages.length === 0 && (
                <p className="text-zinc-500 dark:text-zinc-400">
                  Pergunte sobre o app, peça para abrir uma aba ou liste/movimente veículos no Pátio
                  (por etapa). Você pode usar o microfone.
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
