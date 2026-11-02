import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Send, Sparkles, X, Loader2, RefreshCw } from 'lucide-react';
import {
  getRdaStatus,
  postRdaChat,
  runRdaManagementScan,
  setRdaIntelligenceEnabled,
  type AuthSession,
  type RdaStatusDto,
} from '../../services/apiService';
import { ModalPortal } from '../ui/ModalPortal';
import { resolveIosModalOverlayClass } from '../ui/iosModalStyles';
import { useDesktopShellLayout } from '../ui/DesktopShellContext';

type ChatLine = { role: 'user' | 'assistant'; content: string };

type Props = {
  authSession: AuthSession | null;
  contextServiceOrderId?: string | null;
  onProposeOpenOs?: (serviceOrderId: string) => void;
};

function canSeeAssistant(session: AuthSession | null): boolean {
  if (!session) return false;
  if (session.role === 'admin') return true;
  const p = session.permissions || {};
  return !!(
    p.full_access ||
    p.access_radar_qualidade ||
    p.access_patio ||
    p.access_laboratorio ||
    p.access_home
  );
}

function canManageFlag(session: AuthSession | null): boolean {
  if (!session) return false;
  if (session.role === 'admin') return true;
  return !!session.permissions?.full_access;
}

/**
 * Assistente RDA — conversa real com tools do backend.
 * Voz: Web Speech API preenche o campo de texto (preparação).
 */
export const RdaAssistantPanel: React.FC<Props> = ({
  authSession,
  contextServiceOrderId,
  onProposeOpenOs,
}) => {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<RdaStatusDto | null>(null);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [input, setInput] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingConfirmTools, setPendingConfirmTools] = useState<string[]>([]);
  const listeningRef = useRef(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const { isDesktopShell } = useDesktopShellLayout();

  const visible = canSeeAssistant(authSession);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await getRdaStatus();
      setStatus(s);
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    if (!visible || !open) return;
    void refreshStatus();
  }, [visible, open, refreshStatus]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [open, lines, busy, error]);

  const send = async (humanConfirmedToolIds?: string[]) => {
    const message = input.trim();
    if (!message || busy) return;
    setBusy(true);
    setError(null);
    setLines((prev) => [...prev, { role: 'user', content: message }]);
    setInput('');
    try {
      const res = await postRdaChat({
        message,
        conversationId,
        contextServiceOrderId,
        humanConfirmedToolIds,
      });
      setConversationId(res.conversationId);
      setLines((prev) => [...prev, { role: 'assistant', content: res.assistantMessage }]);
      const needs = (res.toolTrace || [])
        .filter((t) => !t.ok && /confirmação|confirmation/i.test(t.summary))
        .map((t) => t.toolId);
      setPendingConfirmTools(needs);
      for (const action of res.proposedActions || []) {
        const a = action as { proposedAction?: string; serviceOrderId?: string };
        if (a.proposedAction === 'open_service_order' && a.serviceOrderId && onProposeOpenOs) {
          // só após confirmação explícita via botão
        }
      }
      void refreshStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha no assistente');
    } finally {
      setBusy(false);
    }
  };

  const startVoice = () => {
    const w = window as unknown as {
      webkitSpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        start: () => void;
        onresult: ((ev: { results?: ArrayLike<ArrayLike<{ transcript?: string }>> }) => void) | null;
        onerror: (() => void) | null;
        onend: (() => void) | null;
      };
      SpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        start: () => void;
        onresult: ((ev: { results?: ArrayLike<ArrayLike<{ transcript?: string }>> }) => void) | null;
        onerror: (() => void) | null;
        onend: (() => void) | null;
      };
    };
    const SR = w.webkitSpeechRecognition || w.SpeechRecognition;
    if (!SR) {
      setError('Reconhecimento de voz não disponível neste navegador.');
      return;
    }
    const rec = new SR();
    rec.lang = 'pt-BR';
    rec.interimResults = false;
    rec.onresult = (ev) => {
      const text = ev.results?.[0]?.[0]?.transcript || '';
      if (text) setInput((prev) => (prev ? `${prev} ${text}` : text));
    };
    rec.onerror = () => {
      listeningRef.current = false;
    };
    rec.onend = () => {
      listeningRef.current = false;
    };
    listeningRef.current = true;
    rec.start();
  };

  if (!visible) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-[80] flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900 text-white shadow-lg dark:bg-amber-500 dark:text-zinc-900 md:bottom-6"
        title="Assistente RDA"
        aria-label="Abrir assistente RDA"
      >
        <Sparkles className="h-5 w-5" />
      </button>

      {open ? (
        <ModalPortal forceBody onRequestClose={() => setOpen(false)}>
          <div
            className={resolveIosModalOverlayClass(isDesktopShell, 'z-[90]')}
            onClick={() => setOpen(false)}
            role="presentation"
          >
            <div
              className={`flex w-full min-h-0 flex-col overflow-hidden border-0 bg-white shadow-2xl dark:bg-zinc-900 ${
                isDesktopShell
                  ? 'h-[min(720px,88dvh)] max-h-[min(720px,88dvh)] max-w-lg rounded-[1.75rem]'
                  : 'h-[min(860px,94dvh)] max-h-[min(860px,94dvh)] max-w-lg rounded-[1.75rem]'
              }`}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Assistente RDA Intelligence"
            >
              <header className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
                <div>
                  <h2 className="text-[15px] font-semibold text-zinc-900 dark:text-white">
                    RDA Intelligence
                  </h2>
                  <p className="text-[12px] text-zinc-500">
                    {status?.feature.enabled
                      ? status.operational
                        ? 'Operacional'
                        : 'Ativo — configure OpenAI no servidor'
                      : 'Desligado (somente leitura/sugestões quando ativo)'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  aria-label="Fechar"
                >
                  <X className="h-5 w-5" />
                </button>
              </header>

              <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
                {canManageFlag(authSession) ? (
                  <button
                    type="button"
                    className="rounded-lg bg-zinc-100 px-2 py-1 text-[11px] dark:bg-zinc-800"
                    onClick={async () => {
                      try {
                        await setRdaIntelligenceEnabled(!status?.feature.enabled);
                        await refreshStatus();
                      } catch (e) {
                        setError(e instanceof Error ? e.message : 'Falha ao salvar');
                      }
                    }}
                  >
                    {status?.feature.enabled ? 'Desativar RDA' : 'Ativar RDA'}
                  </button>
                ) : null}
                {canManageFlag(authSession) || authSession?.permissions?.access_radar_qualidade ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-lg bg-zinc-100 px-2 py-1 text-[11px] dark:bg-zinc-800"
                    onClick={async () => {
                      try {
                        const r = await runRdaManagementScan();
                        setLines((prev) => [
                          ...prev,
                          {
                            role: 'assistant',
                            content: `Varredura: ${r.alertsCreated} alerta(s) novo(s).`,
                          },
                        ]);
                      } catch (e) {
                        setError(e instanceof Error ? e.message : 'Falha na varredura');
                      }
                    }}
                  >
                    <RefreshCw className="h-3 w-3" /> Scan gestão
                  </button>
                ) : null}
              </div>

              <div className="rda-chat-messages-shell">
                <div ref={listRef} className="rda-chat-messages-scroll px-4 py-3 custom-scrollbar">
                  <div className="space-y-3">
                    {lines.length === 0 ? (
                      <p className="text-[13px] text-zinc-500">
                        Exemplos: “Quais carros estão parados há mais tempo?” · “Resuma o desempenho
                        dos mecânicos nesta semana.” · “Mostre o histórico deste veículo.”
                      </p>
                    ) : null}
                    {lines.map((l, i) => (
                      <div
                        key={`${l.role}-${i}`}
                        className={`rounded-xl px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${
                          l.role === 'user'
                            ? 'ml-8 bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-900'
                            : 'mr-4 bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100'
                        }`}
                      >
                        {l.content}
                      </div>
                    ))}
                    {busy ? (
                      <p className="flex items-center gap-2 text-[12px] text-zinc-500">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Pensando…
                      </p>
                    ) : null}
                    {error ? <p className="text-[12px] text-red-600">{error}</p> : null}
                  </div>
                </div>
              </div>

              {pendingConfirmTools.length > 0 ? (
                <div className="shrink-0 border-t border-amber-200 bg-amber-50 px-3 py-2 text-[12px] dark:border-amber-900 dark:bg-amber-950/40">
                  Ação sensível pendente ({pendingConfirmTools.join(', ')}). Confirme para autorizar.
                  <button
                    type="button"
                    className="ml-2 font-semibold underline"
                    onClick={() => {
                      const tools = [...pendingConfirmTools];
                      setPendingConfirmTools([]);
                      setInput((v) => v || 'Confirmo a abertura da OS proposta.');
                      void send(tools);
                    }}
                  >
                    Confirmar
                  </button>
                </div>
              ) : null}

              <div className="flex shrink-0 items-end gap-2 border-t border-zinc-200 p-3 dark:border-zinc-700">
                <button
                  type="button"
                  onClick={startVoice}
                  className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  title="Falar (preenche o texto)"
                >
                  <Mic className="h-5 w-5" />
                </button>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  rows={2}
                  placeholder="Pergunte ao RDA…"
                  className="min-h-[44px] max-h-28 flex-1 resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={busy || !input.trim()}
                  onClick={() => void send()}
                  className="rounded-xl bg-zinc-900 p-2.5 text-white disabled:opacity-40 dark:bg-amber-500 dark:text-zinc-900"
                >
                  {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}
    </>
  );
};
