import React, { useEffect, useState } from 'react';
import {
  Bluetooth,
  BluetoothConnected,
  Loader2,
  Printer,
  Tag,
  X,
} from 'lucide-react';
import {
  NIIMBOT_MODEL_LABEL,
  NIIMBOT_SIZE_LABEL,
  NIIMBOT_BLE_HELP,
  niimbotService,
  type NiimbotServiceSnapshot,
} from '../services/niimbotService';
import type { PatioKeyLabelInput } from '../utils/patioKeyLabelRender';
import {
  renderChaveLabelFromSvg,
  type ChaveLabelFitWarning,
} from '../utils/chaveLabelSvg';
import { NIIMBOT_LABEL_H_PX, NIIMBOT_LABEL_W_PX } from '../utils/niimbotLabelRender';
import { ModalPortal } from './ui/ModalPortal';
import { patioOsSecModalPcClass, usePatioOsPcLayout } from './patio/PatioOsPcLayoutContext';
import { IosModalHeader } from './ui/IosModalHeader';
import { iosModalClose, iosModalShell } from './ui/iosModalStyles';
import { useBrowserBackLayer } from './ui/BackNavigationContext';
import { NiimbotBleConnectControls } from './NiimbotBleConnectControls';

export type PatioKeyLabelPrintModalProps = {
  open: boolean;
  label: PatioKeyLabelInput | null;
  onClose: () => void;
};

function warningLabel(w: ChaveLabelFitWarning): string {
  const field =
    w.field === 'modelo'
      ? 'Modelo'
      : w.field === 'cor'
        ? 'Cor'
        : w.field === 'cliente'
          ? 'Cliente'
          : 'Placa';
  if (w.reason === 'abbreviated') {
    return `${field} abreviado na prévia (“${w.fitted}”) para caber sem corte.`;
  }
  if (w.reason === 'empty') {
    return `${field} ausente — exibindo traço.`;
  }
  return `${field}: fonte reduzida ao mínimo legível.`;
}

export function PatioKeyLabelPrintModal({ open, label, onClose }: PatioKeyLabelPrintModalProps) {
  const patioOsPcLayout = usePatioOsPcLayout();
  const [snap, setSnap] = useState<NiimbotServiceSnapshot>(() => niimbotService.snapshot());
  const [copies, setCopies] = useState(1);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<ChaveLabelFitWarning[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);

  useBrowserBackLayer(open, onClose);

  useEffect(() => {
    if (!open) return;
    return niimbotService.subscribe(setSnap);
  }, [open]);

  useEffect(() => {
    if (!open || !label) {
      setPreviewUrl(null);
      setWarnings([]);
      return;
    }
    let cancelled = false;
    setLocalError(null);
    void renderChaveLabelFromSvg(label)
      .then((result) => {
        if (cancelled) return;
        setPreviewUrl(result.dataUrl);
        setWarnings(result.warnings);
      })
      .catch((err) => {
        if (cancelled) return;
        setPreviewUrl(null);
        setWarnings([]);
        setLocalError(err instanceof Error ? err.message : 'Falha ao montar etiqueta');
      });
    return () => {
      cancelled = true;
    };
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
          'fixed inset-0 z-[240] flex items-center justify-center bg-black/50 p-2 sm:p-4 patio-os-sec-overlay'
        )}
        data-patio-os-sec-role={patioOsPcLayout ? 'overlay' : undefined}
        onClick={onClose}
        role="presentation"
      >
        <div
          className={patioOsSecModalPcClass(
            patioOsPcLayout,
            `${iosModalShell} relative flex h-[min(98dvh,860px)] w-full max-w-4xl flex-col overflow-hidden patio-os-sec-shell`
          )}
          data-patio-os-sec-role={patioOsPcLayout ? 'shell' : undefined}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="patio-key-label-print-title"
        >
          <button type="button" onClick={onClose} className={iosModalClose} aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>

          <div className="patio-os-sec-header shrink-0 border-b border-zinc-200/70 bg-white px-5 pb-3 pt-8 pr-24 dark:border-white/[0.06] dark:bg-transparent sm:px-6">
            <IosModalHeader
              icon={<Tag className="h-5 w-5 text-zinc-800" />}
              title="Imprimir etiqueta"
              subtitle={`${NIIMBOT_MODEL_LABEL} · chave · ${NIIMBOT_SIZE_LABEL}`}
            />
          </div>

          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <div className="shrink-0 space-y-2 border-b border-zinc-200/60 bg-white px-5 py-3 dark:border-white/[0.06] dark:bg-transparent sm:px-6 lg:w-[min(48%,480px)] lg:border-b-0 lg:border-r lg:py-4">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
                  {label.customerName}
                </p>
                <p className="mt-0.5 truncate text-[12px] text-zinc-500 dark:text-zinc-400">
                  {[label.vehicleModel, label.vehicleColor, label.plate].filter(Boolean).join(' · ')}
                </p>
              </div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                Pré-visualização 50 × 30 mm (SVG-base)
              </p>
              <div className="flex justify-center rounded-xl bg-zinc-100 px-4 py-3 dark:bg-white/[0.04]">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Prévia da etiqueta de chave 50×30 mm"
                    width={NIIMBOT_LABEL_W_PX}
                    height={NIIMBOT_LABEL_H_PX}
                    className="h-auto w-full max-w-[420px] border border-zinc-300 bg-white dark:border-white/20"
                    style={{
                      aspectRatio: `${NIIMBOT_LABEL_W_PX} / ${NIIMBOT_LABEL_H_PX}`,
                      imageRendering: 'pixelated',
                    }}
                  />
                ) : (
                  <div className="flex h-[120px] w-full max-w-[420px] items-center justify-center text-[13px] text-zinc-500">
                    Montando prévia…
                  </div>
                )}
              </div>
              <p className="text-center text-[11px] text-zinc-500 dark:text-zinc-400">
                Arte fixa do SVG-base · textos rotacionados −90° · duas faces idênticas
              </p>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4 custom-scrollbar sm:px-6">
              <p className="rounded-xl bg-sky-50 px-3 py-2 text-[12px] text-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
                A composição gráfica vem do template SVG fixo. Só os dados da OS (modelo, cor,
                cliente e placa) são preenchidos nas duas faces.
              </p>

              {warnings.length > 0 ? (
                <div className="space-y-1.5 rounded-xl bg-amber-50 px-3 py-2.5 dark:bg-amber-950/30">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-200">
                    Ajustes automáticos na prévia
                  </p>
                  <ul className="list-disc space-y-1 pl-4 text-[12px] text-amber-900 dark:text-amber-100">
                    {warnings.map((w) => (
                      <li key={`${w.field}-${w.reason}`}>{warningLabel(w)}</li>
                    ))}
                  </ul>
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
          </div>

          <div className="shrink-0 border-t border-zinc-200/60 px-5 py-4 dark:border-white/[0.06] sm:px-6">
            <button
              type="button"
              disabled={printing || unsupported || !previewUrl}
              onClick={() =>
                run(async () => {
                  const { dataUrl } = await renderChaveLabelFromSvg(label);
                  await niimbotService.printLabelImageUrl(dataUrl, { copies });
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
