import React, { useCallback, useEffect, useState } from 'react';
import {
  Ban,
  Loader2,
  LogOut,
  RefreshCw,
  ShieldOff,
  Smartphone,
  Tablet,
  Monitor,
  X,
} from 'lucide-react';
import {
  iosModalShell,
  iosModalClose,
  iosModalInsetCard,
  resolveIosModalOverlayClass,
} from './ui/iosModalStyles';
import { ModalPortal } from './ui/ModalPortal';
import { IosModalHeader } from './ui/IosModalHeader';
import { useRegisterModalOpen } from './ui/ModalLayerContext';
import { useDesktopShellLayout } from './ui/DesktopShellContext';
import {
  blockDevice,
  getConnectedDevices,
  revokeDeviceSession,
  unblockDevice,
  type BlockedDevice,
  type ConnectedDeviceSession,
} from '../services/apiService';

interface ConnectedDevicesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function platformIcon(platform: string | null | undefined) {
  const p = (platform || '').toLowerCase();
  if (p === 'smartphone') return <Smartphone className="h-4 w-4" strokeWidth={1.9} />;
  if (p === 'tablet') return <Tablet className="h-4 w-4" strokeWidth={1.9} />;
  return <Monitor className="h-4 w-4" strokeWidth={1.9} />;
}

function platformLabel(platform: string | null | undefined): string {
  const p = (platform || '').toLowerCase();
  if (p === 'smartphone') return 'Smartphone';
  if (p === 'tablet') return 'Tablet';
  if (p === 'desktop') return 'PC';
  return 'Dispositivo';
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return '—';
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function shortDeviceId(id: string): string {
  if (!id) return '—';
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

export const ConnectedDevicesModal: React.FC<ConnectedDevicesModalProps> = ({
  isOpen,
  onClose,
}) => {
  useRegisterModalOpen(isOpen);
  const isDesktopShell = useDesktopShellLayout();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ConnectedDeviceSession[]>([]);
  const [blocked, setBlocked] = useState<BlockedDevice[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getConnectedDevices();
      setSessions(data.sessions || []);
      setBlocked(data.blocked || []);
      setCanManage(!!data.canManage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar dispositivos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void load();
    const t = window.setInterval(() => {
      void load();
    }, 20000);
    return () => window.clearInterval(t);
  }, [isOpen, load]);

  const handleRevoke = async (session: ConnectedDeviceSession) => {
    if (!canManage) return;
    if (session.isCurrent) {
      window.alert('Esta é a sessão atual. Use Sair em Conta e usuários para encerrar aqui.');
      return;
    }
    if (
      !window.confirm(
        `Deslogar ${session.displayName} neste aparelho?\n\nO usuário precisará entrar de novo.`
      )
    ) {
      return;
    }
    setBusyId(session.id);
    setError(null);
    try {
      await revokeDeviceSession(session.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao deslogar.');
    } finally {
      setBusyId(null);
    }
  };

  const handleBlock = async (session: ConnectedDeviceSession) => {
    if (!canManage) return;
    if (session.isCurrent) {
      window.alert('Não é possível bloquear o dispositivo em que você está agora.');
      return;
    }
    if (
      !window.confirm(
        `Bloquear este aparelho?\n\nTodas as sessões nele serão encerradas e novos logins neste dispositivo serão recusados até o desbloqueio.`
      )
    ) {
      return;
    }
    setBusyId(`block-${session.id}`);
    setError(null);
    try {
      await blockDevice({ sessionId: session.id, deviceId: session.deviceId });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao bloquear.');
    } finally {
      setBusyId(null);
    }
  };

  const handleUnblock = async (device: BlockedDevice) => {
    if (!canManage) return;
    if (!window.confirm('Desbloquear este aparelho e permitir login novamente?')) return;
    setBusyId(`unblock-${device.deviceId}`);
    setError(null);
    try {
      await unblockDevice(device.deviceId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao desbloquear.');
    } finally {
      setBusyId(null);
    }
  };

  if (!isOpen) return null;

  const onlineCount = sessions.filter((s) => s.online).length;

  return (
    <ModalPortal>
      <div className={resolveIosModalOverlayClass(isDesktopShell)}>
        <div className={`${iosModalShell} max-h-[94vh] max-w-2xl`}>
          <button
            type="button"
            onClick={onClose}
            className={`${iosModalClose} z-50 shadow-sm ring-1 ring-zinc-200/80 dark:ring-white/10`}
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="shrink-0 px-6 pb-3 pt-8 pr-14 sm:px-8">
              <IosModalHeader
                icon={
                  <span className="flex h-full w-full items-center justify-center text-zinc-700 dark:text-zinc-200">
                    <Smartphone className="h-[55%] w-[55%]" strokeWidth={2} />
                  </span>
                }
                title="Dispositivos conectados"
                subtitle="Sessões ativas no sistema — online e último acesso"
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                  {onlineCount} online
                </span>
                <span className="rounded-full bg-zinc-500/10 px-2.5 py-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                  {sessions.length} sessão{sessions.length === 1 ? '' : 'ões'}
                </span>
                <button
                  type="button"
                  onClick={() => void load()}
                  disabled={loading}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/[0.06]"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                  Atualizar
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 sm:px-8">
              {error ? (
                <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                  {error}
                </p>
              ) : null}

              {loading && sessions.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-16 text-zinc-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-[13px]">Carregando dispositivos…</span>
                </div>
              ) : sessions.length === 0 ? (
                <div className={`${iosModalInsetCard} px-4 py-10 text-center text-[13px] text-zinc-500`}>
                  Nenhuma sessão ativa no momento.
                  <p className="mt-1 text-[12px] text-zinc-400">
                    Novos logins passam a aparecer aqui automaticamente.
                  </p>
                </div>
              ) : (
                <ul className="space-y-2.5">
                  {sessions.map((session) => {
                    const revoking = busyId === session.id;
                    const blocking = busyId === `block-${session.id}`;
                    return (
                      <li
                        key={session.id}
                        className={`${iosModalInsetCard} flex flex-col gap-3 p-3.5 sm:p-4`}
                      >
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-zinc-200/80 bg-zinc-50 text-zinc-700 dark:border-white/[0.1] dark:bg-zinc-900 dark:text-zinc-200">
                            {platformIcon(session.platform)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-[15px] font-semibold text-zinc-900 dark:text-white">
                                {session.displayName}
                              </p>
                              {session.online ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                  Online
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-zinc-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                  Offline
                                </span>
                              )}
                              {session.isCurrent ? (
                                <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:text-sky-300">
                                  Este aparelho
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-0.5 text-[12px] text-zinc-500 dark:text-zinc-400">
                              {platformLabel(session.platform)}
                              {session.username ? ` · @${session.username}` : ''}
                              {session.role === 'admin' ? ' · Gerência' : ''}
                            </p>
                            <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-300">
                              Entrou em {formatDateTime(session.createdAt)}
                              <span className="text-zinc-400"> · </span>
                              Última atividade {formatDateTime(session.lastSeenAt)}
                            </p>
                            <p className="mt-0.5 font-mono text-[11px] text-zinc-400">
                              ID {shortDeviceId(session.deviceId)}
                            </p>
                          </div>
                        </div>

                        {canManage && !session.isCurrent ? (
                          <div className="flex flex-wrap gap-2 border-t border-zinc-200/70 pt-3 dark:border-white/[0.06]">
                            <button
                              type="button"
                              disabled={!!busyId}
                              onClick={() => void handleRevoke(session)}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[12px] font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-white/[0.1] dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                            >
                              {revoking ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <LogOut className="h-3.5 w-3.5" />
                              )}
                              Deslogar
                            </button>
                            <button
                              type="button"
                              disabled={!!busyId}
                              onClick={() => void handleBlock(session)}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/70"
                            >
                              {blocking ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Ban className="h-3.5 w-3.5" />
                              )}
                              Bloquear aparelho
                            </button>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}

              {canManage && blocked.length > 0 ? (
                <div className="mt-6">
                  <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Aparelhos bloqueados
                  </h3>
                  <ul className="space-y-2">
                    {blocked.map((device) => {
                      const unblocking = busyId === `unblock-${device.deviceId}`;
                      return (
                        <li
                          key={device.id}
                          className={`${iosModalInsetCard} flex items-center gap-3 p-3.5`}
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] border border-red-200/80 bg-red-50 text-red-600 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300">
                            <ShieldOff className="h-4 w-4" strokeWidth={1.9} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[14px] font-semibold text-zinc-900 dark:text-white">
                              {device.label || platformLabel(device.platform)}
                            </p>
                            <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
                              Bloqueado em {formatDateTime(device.blockedAt)}
                            </p>
                            <p className="font-mono text-[11px] text-zinc-400">
                              ID {shortDeviceId(device.deviceId)}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={!!busyId}
                            onClick={() => void handleUnblock(device)}
                            className="shrink-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[12px] font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-white/[0.1] dark:bg-zinc-900 dark:text-zinc-100"
                          >
                            {unblocking ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              'Desbloquear'
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}

              {!canManage ? (
                <p className="mt-4 text-center text-[11px] text-zinc-400">
                  Deslogar ou bloquear aparelhos exige acesso total.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
