import React, { useEffect, useState } from 'react';
import { Bluetooth, BluetoothConnected, Loader2, Printer, Tag, X } from 'lucide-react';
import {
  NIIMBOT_BLE_HELP,
  NIIMBOT_MODEL_LABEL,
  NIIMBOT_SIZE_LABEL,
  niimbotService,
  type NiimbotServiceSnapshot,
} from '../services/niimbotService';
import {
  renderPatioPecasLabelDataUrl,
  type PatioPecasLabelInput,
} from '../utils/patioPecasLabelRender';
import { NIIMBOT_LABEL_H_PX, NIIMBOT_LABEL_W_PX } from '../utils/niimbotLabelRender';
import { ModalPortal } from './ui/ModalPortal';
import { patioOsSecModalPcClass, usePatioOsPcLayout } from './patio/PatioOsPcLayoutContext';
import { IosModalHeader } from './ui/IosModalHeader';
import { iosModalClose, iosModalShell } from './ui/iosModalStyles';
import { useBrowserBackLayer } from './ui/BackNavigationContext';
import { NiimbotBleConnectControls } from './NiimbotBleConnectControls';

export type PatioPecasLabelPrintModalProps = {
  open: boolean;
  label: PatioPecasLabelInput | null;
  onClose: () => void;
};

export function PatioPecasLabelPrintModal({
  open,
  label,
  onClose,
}: PatioPecasLabelPrintModalProps) {
  const patioOsPcLayout = usePatioOsPcLayout();
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
      setPreviewUrl(renderPatioPecasLabelDataUrl(label));
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
        className={patioOsSecModalPcClass(
          patioOsPcLayout,
          'fixed inset-0 z-[240] flex items-center justify-center bg-black/50 p-3 sm:p-4 patio-os-sec-overlay'
        )}
        data-patio-os-sec-role={patioOsPcLayout ? 'overlay' : undefined}
        onClick={onClose}
        role="presentation"
      >
        <div
          className={patioOsSecModalPcClass(
            patioOsPcLayout,
            `${iosModalShell} relative flex max-h-[min(92dvh,720px)] w-full max-w-md flex-col overflow-hidden patio-os-sec-shell`
          )}
          data-patio-os-sec-role={patioOsPcLayout ? 'shell' : undefined}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="patio-pecas-label-print-title"
        >
          <button type="button" onClick={onClose} className={iosModalClose} aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>

          <div className="patio-os-sec-header shrink-0 border-b border-zinc-200/70 bg-white px-5 pb-4 pt-8 pr-24 dark:border-white/[0.06] dark:bg-transparent">
            <IosModalHeader
              icon={<Tag className="h-5 w-5 text-zinc-800" />}
              title="Etiqueta de peças"
              subtitle={`${NIIMBOT_MODEL_LABEL} · peças · ${NIIMBOT_SIZE_LABEL}`}
            />
          </div>

          <div className="patio-os-sec-body min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 custom-scrollbar">
            <div>
              <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
                {label.vehicleModel}
              </p>
              <p className="mt-0.5 text-[12px] text-zinc-500 dark:text-zinc-400">
                {[label.vehicleColor, label.plate].filter(Boolean).join(' · ')}
              </p>
            </div>

            <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
              Pré-visualização 50 × 30 mm
            </p>
            {previewUrl ? (
              <div className="flex justify-center overflow-hidden rounded-xl bg-zinc-100 p-3 dark:bg-white/[0.04]">
                <img
                  src={previewUrl}
                  alt="Prévia da etiqueta de peças 50×30 mm"
                  width={NIIMBOT_LABEL_W_PX}
                  height={NIIMBOT_LABEL_H_PX}
                  className="h-auto w-full max-w-[320px] border border-zinc-300 bg-white dark:border-white/20"
                  style={{
                    aspectRatio: `${NIIMBOT_LABEL_W_PX} / ${NIIMBOT_LABEL_H_PX}`,
                    imageRendering: 'pixelated',
                  }}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 py-8 text-[13px] text-zinc-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                Montando etiqueta…
              </div>
            )}

            <p className="rounded-xl bg-sky-50 px-3 py-2 text-[12px] text-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
              Layout editável em Configurações → Editor de etiquetas → Peças (OS veículo).
            </p>

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
                <NiimbotBleConnectControls
                  connected={connected}
                  busy={printing}
                  connecting={snap.status === 'connecting'}
                  onConnect={(opts) => run(() => niimbotService.connect(opts))}
                  onDisconnect={() => run(() => niimbotService.disconnect())}
                />
              ) : null}
            </div>

            <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
              {NIIMBOT_BLE_HELP}
            </p>

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
                  const url = renderPatioPecasLabelDataUrl(label);
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
              {printing ? 'Imprimindo…' : copies > 1 ? `Imprimir ${copies} etiquetas` : 'Imprimir'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
