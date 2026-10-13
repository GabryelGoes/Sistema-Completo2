import React, { useEffect, useState } from 'react';
import { Bluetooth, BluetoothConnected, Loader2, Printer, Tag, X } from 'lucide-react';
import {
  NIIMBOT_BLE_HELP,
  NIIMBOT_MODEL_LABEL,
  NIIMBOT_SIZE_LABEL,
  niimbotService,
  type NiimbotServiceSnapshot,
} from '../services/niimbotService';
import type { WorkshopAbsModule } from '../services/apiService';
import { renderNiimbotAbsModuleLabelDataUrl } from '../utils/niimbotLabelRender';
import {
  absModuleKindLabel,
  formatAbsModuleSequence,
} from '../utils/workshopAbsModules';
import { ModalPortal } from './ui/ModalPortal';
import { IosModalHeader } from './ui/IosModalHeader';
import { iosModalClose, iosModalShell } from './ui/iosModalStyles';
import { useBrowserBackLayer } from './ui/BackNavigationContext';

export type NiimbotAbsModuleLabelPrintModalProps = {
  open: boolean;
  module: WorkshopAbsModule | null;
  onClose: () => void;
};

function statusTone(status: NiimbotServiceSnapshot['status']): string {
  switch (status) {
    case 'connected':
      return 'text-emerald-700 dark:text-emerald-300';
    case 'printing':
    case 'connecting':
      return 'text-amber-700 dark:text-amber-300';
    case 'unsupported':
    case 'error':
      return 'text-red-700 dark:text-red-300';
    default:
      return 'text-zinc-600 dark:text-zinc-400';
  }
}

function statusLabel(snap: NiimbotServiceSnapshot): string {
  switch (snap.status) {
    case 'unsupported':
      return 'Navegador sem Web Bluetooth';
    case 'connecting':
      return 'Conectando…';
    case 'connected':
      return snap.printerLabel ? `Conectada · ${snap.printerLabel}` : 'Conectada';
    case 'printing':
      return 'Imprimindo…';
    case 'disconnected':
      return 'Desconectada';
    default:
      return snap.status;
  }
}

export function NiimbotAbsModuleLabelPrintModal({
  open,
  module,
  onClose,
}: NiimbotAbsModuleLabelPrintModalProps) {
  const [snap, setSnap] = useState<NiimbotServiceSnapshot>(() => niimbotService.snapshot());
  const [copies, setCopies] = useState(1);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [buildingPreview, setBuildingPreview] = useState(false);

  useBrowserBackLayer(open, onClose);

  useEffect(() => {
    if (!open) return;
    return niimbotService.subscribe(setSnap);
  }, [open]);

  useEffect(() => {
    if (!open || !module) {
      setPreviewUrl(null);
      setLocalError(null);
      return;
    }
    let cancelled = false;
    setBuildingPreview(true);
    setLocalError(null);
    void (async () => {
      try {
        const url = await renderNiimbotAbsModuleLabelDataUrl({
          publicId: module.public_id,
          sequenceNumber: module.sequence_number,
          moduleKind: module.module_kind,
          code: module.original_code || module.public_id,
          location: module.location,
          manufacturer: module.manufacturer,
          brand: 'REI DO ABS',
        });
        if (!cancelled) setPreviewUrl(url);
      } catch (err) {
        if (!cancelled) {
          setPreviewUrl(null);
          setLocalError(err instanceof Error ? err.message : 'Falha ao montar prévia.');
        }
      } finally {
        if (!cancelled) setBuildingPreview(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, module]);

  if (!open || !module) return null;

  const unsupported = snap.status === 'unsupported';
  const printing = snap.status === 'printing' || busy || buildingPreview;
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

  const handleConnect = () =>
    run(async () => {
      await niimbotService.connect();
    });

  const handleDisconnect = () =>
    run(async () => {
      await niimbotService.disconnect();
    });

  const handlePrint = () =>
    run(async () => {
      const url =
        previewUrl ||
        (await renderNiimbotAbsModuleLabelDataUrl({
          publicId: module.public_id,
          sequenceNumber: module.sequence_number,
          moduleKind: module.module_kind,
          code: module.original_code || module.public_id,
          location: module.location,
          manufacturer: module.manufacturer,
          brand: 'REI DO ABS',
        }));
      await niimbotService.printLabelImageUrl(url, { copies });
    });

  const handleTest = () =>
    run(async () => {
      const { renderNiimbotTestLabelDataUrl } = await import('../utils/niimbotLabelRender');
      const url = renderNiimbotTestLabelDataUrl();
      await niimbotService.printLabelImageUrl(url, { copies: 1 });
    });

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
          aria-labelledby="niimbot-abs-label-print-title"
        >
          <button type="button" onClick={onClose} className={iosModalClose} aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>

          <div className="shrink-0 border-b border-zinc-200/70 bg-white px-5 pb-4 pt-8 pr-24 dark:border-white/[0.06] dark:bg-transparent">
            <IosModalHeader
              icon={<Tag className="h-5 w-5 text-zinc-800" />}
              title="Imprimir etiqueta ABS"
              subtitle={`${NIIMBOT_MODEL_LABEL} · ${NIIMBOT_SIZE_LABEL}`}
            />
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 custom-scrollbar">
            <div>
              <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
                {formatAbsModuleSequence(module.sequence_number)} · {module.public_id}
              </p>
              <p className="mt-0.5 text-[12px] text-zinc-500 dark:text-zinc-400">
                {absModuleKindLabel(module.module_kind)}
                {module.manufacturer ? ` · ${module.manufacturer}` : ''}
                {module.original_code ? ` · ${module.original_code}` : ''}
              </p>
            </div>

            {previewUrl ? (
              <div className="overflow-hidden rounded-xl bg-zinc-100 p-3 dark:bg-white/[0.04]">
                <img
                  src={previewUrl}
                  alt="Prévia da etiqueta ABS"
                  className="mx-auto h-auto w-full max-w-[320px]"
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>
            ) : buildingPreview ? (
              <div className="flex items-center justify-center gap-2 rounded-xl bg-zinc-100 py-10 text-[13px] text-zinc-500 dark:bg-white/[0.04]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Montando prévia…
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-3 rounded-xl bg-zinc-50 px-3 py-2.5 dark:bg-white/[0.03]">
              <div className="flex min-w-0 items-center gap-2">
                {connected ? (
                  <BluetoothConnected className="h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <Bluetooth className="h-4 w-4 shrink-0 text-zinc-500" />
                )}
                <div className="min-w-0">
                  <p className={`truncate text-[13px] font-medium ${statusTone(snap.status)}`}>
                    {statusLabel(snap)}
                  </p>
                  {snap.message ? (
                    <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                      {snap.message}
                    </p>
                  ) : null}
                </div>
              </div>
              {!unsupported ? (
                connected && snap.status !== 'printing' ? (
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    disabled={printing}
                    className="shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-zinc-600 hover:bg-zinc-200/60 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-white/10"
                  >
                    Desconectar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleConnect}
                    disabled={printing || snap.status === 'connecting'}
                    className="shrink-0 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                  >
                    Conectar
                  </button>
                )
              ) : null}
            </div>

            <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">{NIIMBOT_BLE_HELP}</p>

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

          <div className="shrink-0 space-y-2 border-t border-zinc-200/60 px-5 py-4 dark:border-white/[0.06]">
            <button
              type="button"
              onClick={handlePrint}
              disabled={printing || unsupported || !previewUrl}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-[15px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {printing ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Printer className="h-5 w-5" />
              )}
              {printing ? 'Imprimindo…' : copies > 1 ? `Imprimir ${copies} etiquetas` : 'Imprimir'}
            </button>
            <button
              type="button"
              onClick={handleTest}
              disabled={printing || unsupported}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-0 bg-zinc-100 px-4 py-2.5 text-[14px] font-semibold text-zinc-800 hover:bg-zinc-200 disabled:opacity-50 dark:bg-white/[0.06] dark:text-zinc-100"
            >
              Etiqueta de teste
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
