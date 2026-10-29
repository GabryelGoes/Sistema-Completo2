import React, { useEffect, useMemo, useState } from 'react';
import { Bluetooth, BluetoothConnected, Loader2, Printer, ScrollText, X } from 'lucide-react';
import {
  NIIMBOT_BLE_HELP,
  NIIMBOT_B1_HEAD_W_PX,
  NIIMBOT_CONTINUOUS_HELP,
  NIIMBOT_CONTINUOUS_SIZE_LABEL,
  NIIMBOT_MODEL_LABEL,
  niimbotService,
  type NiimbotPaperKind,
  type NiimbotServiceSnapshot,
} from '../services/niimbotService';
import type { ServiceOrderDetail } from '../services/apiService';
import type { BudgetPrintBudget } from '../utils/budgetPrintWithDetail';
import { renderBudgetContinuousDataUrl } from '../utils/budgetNiimbotContinuousRender';
import { ModalPortal } from './ui/ModalPortal';
import { IosModalHeader } from './ui/IosModalHeader';
import { iosModalClose, iosModalShell } from './ui/iosModalStyles';
import { useBrowserBackLayer } from './ui/BackNavigationContext';
import { NiimbotBleConnectControls } from './NiimbotBleConnectControls';

export type BudgetNiimbotPrintModalProps = {
  open: boolean;
  budget: BudgetPrintBudget | null;
  detail: ServiceOrderDetail | null;
  isModuleMode: boolean;
  mileageKm?: string | null;
  onClose: () => void;
};

const PAPER_OPTIONS: { id: NiimbotPaperKind; label: string; hint: string }[] = [
  {
    id: 'roll',
    label: 'Bobina 50 mm',
    hint: 'Máquina de cartão / sem gaps (recomendado)',
  },
  {
    id: 'transparent',
    label: 'Transparente',
    hint: 'Tipo 5 — suportado nativamente na B1',
  },
  {
    id: 'continuous',
    label: 'Contínuo (tipo 3)',
    hint: 'Protocolo contínuo; a B1 pode rejeitar',
  },
  {
    id: 'black',
    label: 'Marca preta',
    hint: 'Só se a bobina tiver marca preta no verso',
  },
];

export function BudgetNiimbotPrintModal({
  open,
  budget,
  detail,
  isModuleMode,
  mileageKm,
  onClose,
}: BudgetNiimbotPrintModalProps) {
  const [snap, setSnap] = useState<NiimbotServiceSnapshot>(() => niimbotService.snapshot());
  const [copies, setCopies] = useState(1);
  const [density, setDensity] = useState(4);
  const [paperKind, setPaperKind] = useState<NiimbotPaperKind>('roll');
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [previewMeta, setPreviewMeta] = useState<string | null>(null);

  useBrowserBackLayer(open, onClose);

  useEffect(() => {
    if (!open) return;
    return niimbotService.subscribe(setSnap);
  }, [open]);

  const approvedCount = useMemo(() => {
    if (!budget) return 0;
    const s = budget.services.filter((x) => x.approved === true).length;
    const p = budget.parts.filter((x) => x.approved === true).length;
    return s + p;
  }, [budget]);

  useEffect(() => {
    if (!open || !budget) {
      setPreviewUrl(null);
      setPreviewMeta(null);
      return;
    }
    let cancelled = false;
    setBuilding(true);
    setLocalError(null);
    try {
      const widthPx = niimbotService.isConnected()
        ? niimbotService.getPrintHeadWidthPx()
        : NIIMBOT_B1_HEAD_W_PX;
      const url = renderBudgetContinuousDataUrl({
        budget,
        detail,
        isModuleMode,
        mileageKm,
        widthPx,
      });
      if (!cancelled) {
        setPreviewUrl(url);
        const img = new Image();
        img.onload = () => {
          if (!cancelled) {
            setPreviewMeta(`${img.naturalWidth}×${img.naturalHeight} px · bobina 50 mm`);
          }
        };
        img.src = url;
      }
    } catch (err) {
      if (!cancelled) {
        setPreviewUrl(null);
        setPreviewMeta(null);
        setLocalError(err instanceof Error ? err.message : 'Falha ao montar a via');
      }
    } finally {
      if (!cancelled) setBuilding(false);
    }
    return () => {
      cancelled = true;
    };
  }, [open, budget, detail, isModuleMode, mileageKm, snap.status]);

  if (!open || !budget) return null;

  const unsupported = snap.status === 'unsupported';
  const printing = snap.status === 'printing' || busy || building;
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
          className={`${iosModalShell} relative flex max-h-[min(92dvh,760px)] w-full max-w-md flex-col overflow-hidden`}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="budget-niimbot-print-title"
        >
          <button type="button" onClick={onClose} className={iosModalClose} aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>

          <div className="shrink-0 border-b border-zinc-200/70 bg-white px-5 pb-4 pt-8 pr-24 dark:border-white/[0.06] dark:bg-transparent">
            <IosModalHeader
              icon={<ScrollText className="h-5 w-5 text-zinc-800" />}
              title="Imprimir na B1"
              subtitle={`${NIIMBOT_MODEL_LABEL} · ${NIIMBOT_CONTINUOUS_SIZE_LABEL}`}
            />
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 custom-scrollbar">
            <div>
              <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
                Orçamento aprovado · bobina contínua
              </p>
              <p className="mt-0.5 text-[12px] text-zinc-500 dark:text-zinc-400">
                {approvedCount === 0
                  ? 'Nenhum item aprovado — a via sairá só com o cabeçalho.'
                  : `${approvedCount} item${approvedCount === 1 ? '' : 's'} aprovado${approvedCount === 1 ? '' : 's'}`}
                {previewMeta ? ` · ${previewMeta}` : ''}
              </p>
            </div>

            {previewUrl ? (
              <div className="max-h-[280px] overflow-auto rounded-xl bg-zinc-100 p-3 dark:bg-white/[0.04]">
                <img
                  src={previewUrl}
                  alt="Prévia da via contínua do orçamento"
                  className="mx-auto h-auto w-full max-w-[260px] bg-white"
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>
            ) : building ? (
              <div className="flex items-center justify-center gap-2 py-8 text-[13px] text-zinc-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                Montando via…
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

            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                Tipo de papel
              </p>
              <div className="mt-1.5 grid grid-cols-1 gap-1.5">
                {PAPER_OPTIONS.map((opt) => {
                  const active = paperKind === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={printing}
                      onClick={() => setPaperKind(opt.id)}
                      className={`rounded-xl border px-3 py-2 text-left transition-colors disabled:opacity-50 ${
                        active
                          ? 'border-[#007AFF]/45 bg-[#007AFF]/10'
                          : 'border-zinc-200/80 bg-white hover:bg-zinc-50 dark:border-white/[0.08] dark:bg-white/[0.03]'
                      }`}
                    >
                      <span className="block text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
                        {opt.label}
                      </span>
                      <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">
                        {opt.hint}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                Densidade (1–5)
              </span>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={density}
                onChange={(e) => setDensity(Number(e.target.value) || 4)}
                disabled={printing}
                className="mt-2 w-full"
              />
              <span className="text-[12px] tabular-nums text-zinc-600 dark:text-zinc-300">
                {density} {density >= 4 ? '(mais escuro — bom p/ bobina térmica)' : ''}
              </span>
            </label>

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

            <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
              {NIIMBOT_CONTINUOUS_HELP}
            </p>
            <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
              {NIIMBOT_BLE_HELP}
            </p>

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
                  if (!budget) return;
                  if (!niimbotService.isConnected()) {
                    await niimbotService.connect();
                  }
                  const widthPx = niimbotService.getPrintHeadWidthPx();
                  const url = renderBudgetContinuousDataUrl({
                    budget,
                    detail,
                    isModuleMode,
                    mileageKm,
                    widthPx,
                  });
                  setPreviewUrl(url);
                  await niimbotService.printContinuousImageUrl(url, {
                    copies,
                    density,
                    paperKind,
                  });
                })
              }
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-[15px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {printing ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Printer className="h-5 w-5" />
              )}
              {printing ? 'Imprimindo…' : copies > 1 ? `Imprimir ${copies} vias` : 'Imprimir bobina 50 mm'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
