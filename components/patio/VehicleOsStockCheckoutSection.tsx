import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Loader2, PackageMinus, Trash2 } from 'lucide-react';
import {
  cancelWorkshopPartStockMovement,
  createWorkshopPartStockMovement,
  getWorkshopPartStockMovements,
  lookupWorkshopPartByCode,
  type WorkshopPartStockMovement,
} from '../../services/apiService';
import { formatWorkshopPartQty } from '../../utils/workshopPartStock';
import { formatConsumableMovementNotes } from '../../utils/workshopPartStockMovementNotes';
import { normalizeBarcodeInput } from '../../utils/workshopPartBarcode';
import { isLabOsQrPayload } from '../../utils/labOsQrCode';
import { setActiveBarcodeScanClaim } from '../../utils/activeBarcodeScanClaim';
import { PartPhotoImg } from '../ui/PartPhotoImg';
import { BarcodeScanner } from '../BarcodeScanner';
import { StockGuardPasswordModal } from '../StockGuardPasswordModal';
import {
  uiOsModalCardSectionTitle,
  uiOsModalSectionAppIcon,
} from '../ui/appTypography';

export type VehicleOsStockCheckoutSectionProps = {
  serviceOrderId: string;
  /** Ex.: "OS #12 · ABC1D23 · Civic" */
  osLabel: string;
  osScope: 'patio' | 'lab';
  insetCardClass: string;
  recordedByName: string;
  /** Modal da OS aberto e pronto para capturar a pistola USB. */
  claimUsbScanner: boolean;
  /** Botão de câmera só em tablet/mobile. */
  showCameraButton: boolean;
};

function playCheckoutBeep(ok: boolean) {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = ok ? 880 : 220;
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (ok ? 0.08 : 0.18));
    osc.stop(ctx.currentTime + (ok ? 0.09 : 0.2));
    window.setTimeout(() => void ctx.close(), 250);
  } catch {
    /* ignore */
  }
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

/**
 * Caixa de retirada de peças/produtos do estoque no modal da OS.
 * Pistola USB (e câmera no tablet/mobile) registra e abate o estoque na hora.
 */
export const VehicleOsStockCheckoutSection: React.FC<VehicleOsStockCheckoutSectionProps> = ({
  serviceOrderId,
  osLabel,
  osScope,
  insetCardClass,
  recordedByName,
  claimUsbScanner,
  showCameraButton,
}) => {
  const [items, setItems] = useState<WorkshopPartStockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastOk, setLastOk] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<WorkshopPartStockMovement | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const scanLockRef = useRef(false);
  const registerRef = useRef<(code: string) => Promise<boolean>>(async () => false);
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const listAnchorRef = useRef<HTMLDivElement | null>(null);

  const scrollToRegisteredProducts = useCallback(() => {
    const run = () => {
      const target = listAnchorRef.current ?? sectionRef.current;
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
    };
    // setState do item novo ainda não pintou — espera o próximo frame + tick.
    window.requestAnimationFrame(() => {
      window.setTimeout(run, 40);
    });
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getWorkshopPartStockMovements({
        type: 'consumable',
        serviceOrderId,
        limit: 80,
      });
      setItems(list);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [serviceOrderId]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const registerCode = useCallback(
    async (rawCode: string): Promise<boolean> => {
      const code = normalizeBarcodeInput(rawCode);
      if (!code) return false;
      if (isLabOsQrPayload(code)) return false;
      if (scanLockRef.current) return true;

      scanLockRef.current = true;
      setBusyCode(code);
      setError(null);
      setLastOk(null);
      try {
        const part = await lookupWorkshopPartByCode(code);
        if (!part) {
          setError(`Código não encontrado no estoque: ${code}`);
          playCheckoutBeep(false);
          return true;
        }
        if (Number(part.stock_qty ?? 0) < 1) {
          setError(`Sem estoque para “${part.name}”.`);
          playCheckoutBeep(false);
          return true;
        }

        const notes = formatConsumableMovementNotes({
          osScope,
          osLabel,
          withdrawnBy: recordedByName || undefined,
          notes: `OS_ID:${serviceOrderId}`,
        });

        const result = await createWorkshopPartStockMovement({
          movement_type: 'consumable',
          part_id: part.id,
          quantity: 1,
          notes,
          barcode_scanned: code,
          recorded_by_name: recordedByName || null,
          service_order_id: serviceOrderId,
        });

        const movement: WorkshopPartStockMovement = {
          ...result.movement,
          part_name: result.part.name,
          part_unit_of_measure: result.part.unit_of_measure,
          part_photo_url: result.part.photo_url ?? null,
          service_order_id: serviceOrderId,
        };
        setItems((prev) => [movement, ...prev.filter((m) => m.id !== movement.id)]);
        setFlashId(movement.id);
        setLastOk(`${result.part.name} · estoque ${formatWorkshopPartQty(result.part.stock_qty)}`);
        playCheckoutBeep(true);
        scrollToRegisteredProducts();
        window.setTimeout(() => setFlashId((id) => (id === movement.id ? null : id)), 1200);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Não foi possível registrar a peça.');
        playCheckoutBeep(false);
        return true;
      } finally {
        scanLockRef.current = false;
        setBusyCode(null);
      }
    },
    [osLabel, osScope, recordedByName, scrollToRegisteredProducts, serviceOrderId]
  );

  registerRef.current = registerCode;

  useEffect(() => {
    if (!claimUsbScanner) {
      setActiveBarcodeScanClaim(null);
      return;
    }
    setActiveBarcodeScanClaim((code) => registerRef.current(code));
    return () => setActiveBarcodeScanClaim(null);
  }, [claimUsbScanner, serviceOrderId]);

  const handleCancel = async (password: string) => {
    if (!cancelTarget) return;
    setCancelBusy(true);
    setCancelError(null);
    try {
      await cancelWorkshopPartStockMovement(cancelTarget.id, password);
      setItems((prev) => prev.filter((m) => m.id !== cancelTarget.id));
      setCancelTarget(null);
      setLastOk('Retirada cancelada e estoque devolvido.');
    } catch (e) {
      setCancelError(e instanceof Error ? e.message : 'Não foi possível cancelar.');
    } finally {
      setCancelBusy(false);
    }
  };

  const totalUnits = items.reduce((acc, m) => acc + Number(m.quantity || 0), 0);

  return (
    <div
      ref={sectionRef}
      className={`${insetCardClass} min-w-0 overflow-hidden shadow-none`}
    >
      <div className="relative flex items-center justify-between gap-2 border-b border-black/[0.06] bg-white/85 px-2.5 py-2 pl-3 backdrop-blur-[2px] dark:border-white/[0.08] dark:bg-zinc-950/35 sm:gap-3 sm:px-3 sm:py-2.5 sm:pl-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-2.5">
          <div className={uiOsModalSectionAppIcon}>
            <img src="/icons/estoque-ios.png" alt="" className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0">
            <p className={uiOsModalCardSectionTitle}>Peças do estoque</p>
            <p className="mt-0.5 truncate text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              Caixa · leitor USB{claimUsbScanner ? ' ativo' : ''}
            </p>
          </div>
        </div>
        {showCameraButton ? (
          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            disabled={!!busyCode}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[#007AFF]/25 bg-[#007AFF]/[0.09] px-2.5 py-1.5 text-[11px] font-semibold text-[#007AFF] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] transition-colors hover:border-[#007AFF]/40 hover:bg-[#007AFF]/15 disabled:opacity-50 dark:border-[#007AFF]/35 dark:bg-[#007AFF]/15 dark:text-[#b8d9ff]"
          >
            <Camera className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
            Câmera
          </button>
        ) : null}
      </div>

      <div className="space-y-3 border-t border-zinc-200/60 bg-zinc-50/90 px-3 py-3 dark:border-white/[0.06] dark:bg-white/[0.02] sm:px-4 sm:py-4">
        {busyCode ? (
          <div className="flex items-center gap-2 text-[13px] font-medium text-zinc-600 dark:text-zinc-300">
            <Loader2 className="h-4 w-4 animate-spin text-[#007AFF]" />
            Registrando {busyCode}…
          </div>
        ) : null}

        {lastOk ? (
          <p className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[12px] font-semibold text-emerald-800 dark:text-emerald-200">
            {lastOk}
          </p>
        ) : null}

        {error ? (
          <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[12px] font-semibold text-red-700 dark:text-red-300">
            {error}
          </p>
        ) : null}

        <div
          ref={listAnchorRef}
          className="flex items-center justify-between gap-2"
        >
          <p className="text-[12px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Retiradas desta OS
          </p>
          <p className="text-[12px] font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">
            {totalUnits} un.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-[13px] text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando…
          </div>
        ) : items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300/90 bg-white/70 px-3 py-4 text-center text-[12px] text-zinc-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-400">
            Nenhuma peça retirada ainda. Passe o primeiro código no leitor.
          </p>
        ) : (
          <ul className="max-h-[min(320px,40vh)] space-y-2 overflow-y-auto overscroll-contain pr-0.5 custom-scrollbar">
            {items.map((m) => {
              const flashing = flashId === m.id;
              return (
                <li
                  key={m.id}
                  className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-2 transition-colors ${
                    flashing
                      ? 'border-emerald-400/50 bg-emerald-50/90 dark:border-emerald-400/35 dark:bg-emerald-500/15'
                      : 'border-zinc-200/80 bg-white/90 dark:border-white/[0.1] dark:bg-zinc-950/50'
                  }`}
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-zinc-200/80 bg-zinc-50 dark:border-white/10 dark:bg-white/[0.04]">
                    {m.part_photo_url ? (
                      <PartPhotoImg src={m.part_photo_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <PackageMinus className="h-4 w-4 text-zinc-400" aria-hidden />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-zinc-900 dark:text-white">
                      {m.part_name || 'Peça'}
                    </p>
                    <p className="mt-0.5 text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
                      −{formatWorkshopPartQty(m.quantity)}
                      {m.part_unit_of_measure ? ` ${m.part_unit_of_measure}` : ''}
                      {' · '}
                      estoque {formatWorkshopPartQty(m.stock_after)}
                      {' · '}
                      {formatWhen(m.created_at)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCancelError(null);
                      setCancelTarget(m);
                    }}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-red-200/70 bg-red-50/50 text-red-500/90 transition-colors hover:bg-red-100/80 dark:border-red-400/25 dark:bg-red-500/10"
                    aria-label="Cancelar retirada"
                    title="Cancelar e devolver ao estoque"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {showCameraButton ? (
        <BarcodeScanner
          isOpen={scannerOpen}
          onClose={() => setScannerOpen(false)}
          title="Ler código da peça"
          onDetected={(code) => {
            setScannerOpen(false);
            void registerCode(code);
          }}
        />
      ) : null}

      <StockGuardPasswordModal
        open={!!cancelTarget}
        title="Cancelar retirada"
        subtitle="A quantidade volta ao estoque. Informe a senha da Gerência ou a de proteção do estoque."
        confirmLabel="Cancelar retirada"
        error={cancelError}
        busy={cancelBusy}
        onClose={() => {
          if (cancelBusy) return;
          setCancelTarget(null);
          setCancelError(null);
        }}
        onConfirm={handleCancel}
      />
    </div>
  );
};
