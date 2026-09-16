import React, { useEffect, useState } from 'react';
import { Bluetooth, BluetoothConnected, Loader2, Printer, Tag, X } from 'lucide-react';
import {
  NIIMBOT_MODEL_LABEL,
  NIIMBOT_SIZE_LABEL,
  niimbotService,
  type NiimbotServiceSnapshot,
} from '../services/niimbotService';
import {
  renderPatioKeyLabelDataUrl,
  type PatioKeyLabelInput,
} from '../utils/patioKeyLabelRender';
import { NIIMBOT_LABEL_H_PX, NIIMBOT_LABEL_W_PX } from '../utils/niimbotLabelRender';
import { ModalPortal } from './ui/ModalPortal';
import { IosModalHeader } from './ui/IosModalHeader';
import { iosModalClose, iosModalShell } from './ui/iosModalStyles';
import { useBrowserBackLayer } from './ui/BackNavigationContext';

export type PatioKeyLabelPrintModalProps = {
  open: boolean;
  label: PatioKeyLabelInput | null;
  onClose: () => void;
};

export function PatioKeyLabelPrintModal({ open, label, onClose }: PatioKeyLabelPrintModalProps) {
  const [snap, setSnap] = useState<NiimbotServiceSnapshot>(() => niimbotService.snapshot());
  const [copies, setCopies] = useState(1);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useBrowserBackLayer(open, onClose);

  useEffect(() => {
    if (!open) return;
    return niimbotService.subscribe(setSnap);
  }, [open]);

  useEffect(() => {
    if (!open || !label) {
      setPreviewUrl(null);
      return;
    }
    try {
      setLocalError(null);
      setPreviewUrl(renderPatioKeyLabelDataUrl(label));
    } catch (err) {
      setPreviewUrl(null);
      setLocalError(err instanceof Error ? err.message : 'Falha ao montar etiqueta');
    }
  }, [open, label]);

  if (!open || !label) return null;

  const unsupported = snap.status === 'unsupported';
  const printing = snap.status === 'printing' || busy;
  const connected = snap.status === 'connected' || snap.status === 'printing';

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setLocalError(null);
    try {
      await fn();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Operação falhou');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[240] flex items-center justify-center bg-black/50 p-3 sm:p-4"
        onClick={onClose}
        role="presentation"
      >
        <div
          className={`${iosModalShell} relative flex max-h-[min(92dvh,720px)] w-full max-w-md flex-col overflow-hidden`}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="patio-key-label-print-title"
        >
          <button type="button" onClick={onClose} className={iosModalClose} aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>

          <div className="shrink-0 border-b border-zinc-200/70 bg-white px-5 pb-4 pt-8 pr-24 dark:border-white/[0.06] dark:bg-transparent">
            <IosModalHeader
              icon={<Tag className="h-5 w-5 text-zinc-800" />}
              title="Imprimir etiqueta"
              subtitle={`${NIIMBOT_MODEL_LABEL} · chave · ${NIIMBOT_SIZE_LABEL}`}
            />
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 custom-scrollbar">
            <div>
              <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
                {label.customerName}
              </p>
              <p className="mt-0.5 text-[12px] text-zinc-500 dark:text-zinc-400">
                {[label.vehicleModel, label.vehicleColor, label.plate].filter(Boolean).join(' · ')}
              </p>
            </div>

            {previewUrl ? (
              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                  Pré-visualização 50 × 30 mm
                </p>
                <div className="flex justify-center rounded-xl bg-zinc-100 p-4 dark:bg-white/[0.04]">
                  <img
                    src={previewUrl}
                    alt="Prévia da etiqueta de chave 50×30 mm"
                    width={NIIMBOT_LABEL_W_PX}
                    height={NIIMBOT_LABEL_H_PX}
                    className="h-auto w-full max-w-[320px] border border-zinc-300 bg-white dark:border-white/20"
                    style={{
                      aspectRatio: `${NIIMBOT_LABEL_W_PX} / ${NIIMBOT_LABEL_H_PX}`,
                      imageRendering: 'pixelated',
                    }}
                  />
                </div>
                <p className="text-center text-[11px] text-zinc-500 dark:text-zinc-400">
                  Duas faces na mesma etiqueta (2ª cópia rotacionada 180°)
                </p>
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-3 rounded-xl bg-zinc-50 px-3 py-2.5 dark:bg-white/[0.03]">
              <div className="flex min-w-0 items-center gap-2">
                {connected ? (
                  <BluetoothConnected className="h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <Bluetooth className="h-4 w-4 shrink-0 text-zinc-500" />
                )}
                <p className="truncate text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
                  {snap.message ||
                    (connected
                      ? snap.printerLabel || 'Conectada'
                      : unsupported
                        ? 'Web Bluetooth indisponível'
                        : 'Desconectada')}
                </p>
              </div>
              {!unsupported ? (
                connected && snap.status !== 'printing' ? (
                  <button
                    type="button"
                    onClick={() => run(() => niimbotService.disconnect())}
                    disabled={printing}
                    className="shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-zinc-600 hover:bg-zinc-200/60 disabled:opacity-50 dark:text-zinc-300"
                  >
                    Desconectar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => run(() => niimbotService.connect())}
                    disabled={printing}
                    className="shrink-0 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                  >
                    Conectar
                  </button>
                )
              ) : null}
            </div>

            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                Quantidade
              </span>
              <input
                type="number"
                min={1}
                max={99}
                value={copies}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setCopies(Number.isFinite(n) ? Math.max(1, Math.min(99, Math.floor(n))) : 1);
                }}
                disabled={printing}
                className="mt-1 w-full rounded-xl border-0 bg-zinc-100 px-3 py-2.5 text-[15px] tabular-nums text-zinc-900 outline-none disabled:opacity-50 dark:bg-white/[0.06] dark:text-zinc-100"
              />
            </label>

            {(localError || unsupported) && (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-800 dark:bg-red-950/40 dark:text-red-200">
                {localError || snap.message}
              </p>
            )}
          </div>

          <div className="shrink-0 border-t border-zinc-200/60 px-5 py-4 dark:border-white/[0.06]">
            <button
              type="button"
              disabled={printing || unsupported || !previewUrl}
              onClick={() =>
                run(async () => {
                  const url = renderPatioKeyLabelDataUrl(label);
                  await niimbotService.printLabelImageUrl(url, { copies });
                })
              }
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-[15px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {printing ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Printer className="h-5 w-5" />
              )}
              {printing ? 'Imprimindo…' : copies > 1 ? `Imprimir ${copies} etiquetas` : 'Imprimir etiqueta'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
