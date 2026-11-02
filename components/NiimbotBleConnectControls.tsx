import React from 'react';
import { niimbotService } from '../services/niimbotService';

type Props = {
  connected: boolean;
  busy: boolean;
  connecting: boolean;
  onConnect: (opts?: { anyDevice?: boolean; forceChooser?: boolean }) => void;
  onDisconnect: () => void;
};

/**
 * Conectar / Desconectar + fallback “Ver todos” (lista BLE sem filtro).
 * O padrão tenta reconectar a impressora salva e, se precisar do seletor,
 * mostra só Niimbot por perto.
 */
export function NiimbotBleConnectControls({
  connected,
  busy,
  connecting,
  onConnect,
  onDisconnect,
}: Props) {
  const remembered = niimbotService.getRememberedPrinterLabel();

  if (connected) {
    return (
      <button
        type="button"
        onClick={onDisconnect}
        disabled={busy}
        className="shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-zinc-600 hover:bg-zinc-200/60 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-white/10"
      >
        Desconectar
      </button>
    );
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => onConnect()}
        disabled={busy || connecting}
        className="rounded-lg bg-zinc-900 px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {remembered ? 'Reconectar' : 'Conectar'}
      </button>
      <button
        type="button"
        onClick={() => onConnect({ anyDevice: true, forceChooser: true })}
        disabled={busy || connecting}
        className="text-[10px] font-medium text-zinc-500 underline-offset-2 hover:text-zinc-700 hover:underline disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        Ver todos os dispositivos
      </button>
    </div>
  );
}
