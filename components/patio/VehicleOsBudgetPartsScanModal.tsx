import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CheckCircle2, ClipboardList, Loader2, Package, X } from 'lucide-react';
import {
  createWorkshopPartStockMovement,
  getServiceOrderBudgets,
  getWorkshopPartStockMovements,
  getWorkshopParts,
  lookupWorkshopPartByCode,
  type WorkshopPart,
  type WorkshopPartStockMovement,
} from '../../services/apiService';
import { normalizeBudgetPartName } from '../../utils/budgetPartStock';
import { formatWorkshopPartQty } from '../../utils/workshopPartStock';
import { formatConsumableMovementNotes } from '../../utils/workshopPartStockMovementNotes';
import { normalizeBarcodeInput } from '../../utils/workshopPartBarcode';
import { isLabOsQrPayload } from '../../utils/labOsQrCode';
import { setActiveBarcodeScanClaim } from '../../utils/activeBarcodeScanClaim';
import { PartPhotoImg } from '../ui/PartPhotoImg';
import { BarcodeScanner } from '../BarcodeScanner';
import { ModalPortal } from '../ui/ModalPortal';
import { iosModalShell, resolveIosModalOverlayClass, NESTED_STOCK_OVERLAY_Z } from '../ui/iosModalStyles';
import { useDesktopShellLayout } from '../ui/DesktopShellContext';
import { uiOsModalCardSectionTitle, uiOsModalSectionAppIcon } from '../ui/appTypography';

export type BudgetScanLine = {
  key: string;
  description: string;
  workshopPartId: string | null;
  neededQty: number;
  budgetIds: string[];
  photoUrl: string | null;
};

export type VehicleOsBudgetPartsScanModalProps = {
  isOpen: boolean;
  onClose: () => void;
  serviceOrderId: string;
  osLabel: string;
  osScope: 'patio' | 'lab';
  recordedByName: string;
  showCameraButton: boolean;
  /** Atualiza a lista de retiradas da seção pai. */
  onMovementCreated?: (movement: WorkshopPartStockMovement) => void;
};

function playBeep(ok: boolean) {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = ok ? 980 : 200;
    gain.gain.value = 0.045;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (ok ? 0.1 : 0.2));
    osc.stop(ctx.currentTime + (ok ? 0.11 : 0.22));
    window.setTimeout(() => void ctx.close(), 280);
  } catch {
    /* ignore */
  }
}

function parseQty(raw: string | undefined): number {
  const n = parseFloat(String(raw ?? '1').replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.round(n * 1000) / 1000;
}

/**
 * Modal: lista peças aprovadas do orçamento e permite bipar (USB/câmera)
 * para abater o estoque com feedback visual forte.
 */
export const VehicleOsBudgetPartsScanModal: React.FC<VehicleOsBudgetPartsScanModalProps> = ({
  isOpen,
  onClose,
  serviceOrderId,
  osLabel,
  osScope,
  recordedByName,
  showCameraButton,
  onMovementCreated,
}) => {
  const isDesktopShell = useDesktopShellLayout();
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState<BudgetScanLine[]>([]);
  const [fulfilled, setFulfilled] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [hitKey, setHitKey] = useState<string | null>(null);
  const [justCompletedKey, setJustCompletedKey] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const scanLockRef = useRef(false);
  const registerRef = useRef<(code: string) => Promise<boolean>>(async () => false);
  const lineRefs = useRef<Record<string, HTMLLIElement | null>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [budgets, movements, catalog] = await Promise.all([
        getServiceOrderBudgets(serviceOrderId),
        getWorkshopPartStockMovements({
          type: 'consumable',
          serviceOrderId,
          limit: 200,
        }),
        getWorkshopParts().catch(() => [] as Awaited<ReturnType<typeof getWorkshopParts>>),
      ]);

      const catalogById = new Map(catalog.map((p) => [p.id, p]));
      const catalogByName = new Map(
        catalog.map((p) => [normalizeBudgetPartName(p.name), p] as const)
      );

      const map = new Map<string, BudgetScanLine>();
      for (const b of budgets) {
        for (const p of b.parts ?? []) {
          if (p.approved !== true) continue;
          const desc = String(p.description ?? '').trim();
          if (!desc) continue;
          let partId = p.workshopPartId?.trim() || null;
          let catalogPart = partId ? catalogById.get(partId) : undefined;
          if (!catalogPart) {
            catalogPart = catalogByName.get(normalizeBudgetPartName(desc));
            if (catalogPart) partId = catalogPart.id;
          }
          const key = partId ? `id:${partId}` : `name:${normalizeBudgetPartName(desc)}`;
          const qty = parseQty(p.quantity);
          const prev = map.get(key);
          if (prev) {
            prev.neededQty = Math.round((prev.neededQty + qty) * 1000) / 1000;
            if (!prev.budgetIds.includes(b.id)) prev.budgetIds.push(b.id);
            if (!prev.photoUrl && catalogPart?.photo_url) prev.photoUrl = catalogPart.photo_url;
            if (!prev.workshopPartId && partId) prev.workshopPartId = partId;
          } else {
            map.set(key, {
              key,
              description: catalogPart?.name?.trim() || desc,
              workshopPartId: partId,
              neededQty: qty,
              budgetIds: [b.id],
              photoUrl: catalogPart?.photo_url ?? null,
            });
          }
        }
      }
      setLines([...map.values()].sort((a, b) => a.description.localeCompare(b.description, 'pt-BR')));

      const counts: Record<string, number> = {};
      for (const m of movements) {
        const idKey = m.part_id ? `id:${m.part_id}` : null;
        const nameKey = m.part_name
          ? `name:${normalizeBudgetPartName(m.part_name)}`
          : null;
        const qty = Number(m.quantity) || 0;
        if (idKey && map.has(idKey)) {
          counts[idKey] = Math.round(((counts[idKey] ?? 0) + qty) * 1000) / 1000;
        } else if (nameKey && map.has(nameKey)) {
          counts[nameKey] = Math.round(((counts[nameKey] ?? 0) + qty) * 1000) / 1000;
        } else if (idKey) {
          // Movimentação de peça do estoque que bate por id mesmo se a linha só tem nome
          for (const line of map.values()) {
            if (line.workshopPartId === m.part_id) {
              counts[line.key] = Math.round(((counts[line.key] ?? 0) + qty) * 1000) / 1000;
            }
          }
        }
      }
      setFulfilled(counts);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar o orçamento.');
      setLines([]);
      setFulfilled({});
    } finally {
      setLoading(false);
    }
  }, [serviceOrderId]);

  useEffect(() => {
    if (!isOpen) return;
    void load();
  }, [isOpen, load]);

  const stats = useMemo(() => {
    let needed = 0;
    let done = 0;
    for (const line of lines) {
      needed += line.neededQty;
      done += Math.min(fulfilled[line.key] ?? 0, line.neededQty);
    }
    return { needed, done, remaining: Math.max(0, needed - done) };
  }, [lines, fulfilled]);

  const findMatchingLine = useCallback(
    (part: WorkshopPart): BudgetScanLine | null => {
      const byId = lines.find((l) => l.workshopPartId === part.id);
      if (byId) {
        const got = fulfilled[byId.key] ?? 0;
        if (got < byId.neededQty) return byId;
      }
      const nameKey = normalizeBudgetPartName(part.name);
      const byName = lines.find(
        (l) =>
          (!l.workshopPartId || l.workshopPartId === part.id) &&
          normalizeBudgetPartName(l.description) === nameKey
      );
      if (byName) {
        const got = fulfilled[byName.key] ?? 0;
        if (got < byName.neededQty) return byName;
      }
      // Já completo? ainda assim aponta a linha para feedback.
      return byId ?? byName ?? null;
    },
    [fulfilled, lines]
  );

  const triggerHitAnimation = useCallback((key: string, completed: boolean) => {
    setHitKey(key);
    if (completed) setJustCompletedKey(key);
    const el = lineRefs.current[key];
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    window.setTimeout(() => setHitKey((k) => (k === key ? null : k)), 900);
    if (completed) {
      window.setTimeout(() => setJustCompletedKey((k) => (k === key ? null : k)), 1600);
    }
  }, []);

  const registerCode = useCallback(
    async (rawCode: string): Promise<boolean> => {
      const code = normalizeBarcodeInput(rawCode);
      if (!code) return false;
      if (isLabOsQrPayload(code)) return false;
      if (scanLockRef.current) return true;

      scanLockRef.current = true;
      setBusy(true);
      setError(null);
      setHint(null);
      try {
        const part = await lookupWorkshopPartByCode(code);
        if (!part) {
          setError(`Código não encontrado no estoque: ${code}`);
          playBeep(false);
          return true;
        }

        const line = findMatchingLine(part);
        if (!line) {
          setError(`“${part.name}” não está entre as peças aprovadas deste orçamento.`);
          playBeep(false);
          return true;
        }

        const got = fulfilled[line.key] ?? 0;
        if (got >= line.neededQty) {
          setError(`“${line.description}” já foi totalmente bipado (${formatWorkshopPartQty(line.neededQty)}).`);
          triggerHitAnimation(line.key, true);
          playBeep(false);
          return true;
        }

        if (Number(part.stock_qty ?? 0) < 1) {
          setError(`Sem estoque para “${part.name}”.`);
          playBeep(false);
          return true;
        }

        const notes = formatConsumableMovementNotes({
          osScope,
          osLabel,
          withdrawnBy: recordedByName || undefined,
          notes: `OS_ID:${serviceOrderId}\nOrçamento: peça aprovada`,
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

        const nextQty = Math.round((got + 1) * 1000) / 1000;
        setFulfilled((prev) => ({ ...prev, [line.key]: nextQty }));
        const completed = nextQty >= line.neededQty;
        triggerHitAnimation(line.key, completed);
        setHint(
          completed
            ? `Concluído: ${line.description}`
            : `${line.description} · ${formatWorkshopPartQty(nextQty)}/${formatWorkshopPartQty(line.neededQty)}`
        );
        playBeep(true);

        onMovementCreated?.({
          ...result.movement,
          part_name: result.part.name,
          part_unit_of_measure: result.part.unit_of_measure,
          part_photo_url: result.part.photo_url ?? null,
          service_order_id: serviceOrderId,
        });
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Não foi possível registrar.');
        playBeep(false);
        return true;
      } finally {
        scanLockRef.current = false;
        setBusy(false);
      }
    },
    [
      findMatchingLine,
      fulfilled,
      onMovementCreated,
      osLabel,
      osScope,
      recordedByName,
      serviceOrderId,
      triggerHitAnimation,
    ]
  );

  registerRef.current = registerCode;

  useEffect(() => {
    if (!isOpen) return;
    setActiveBarcodeScanClaim((code) => registerRef.current(code));
    return () => setActiveBarcodeScanClaim(null);
  }, [isOpen, serviceOrderId]);

  if (!isOpen) return null;

  const overlayClass = resolveIosModalOverlayClass(isDesktopShell, NESTED_STOCK_OVERLAY_Z);
  const progressPct =
    stats.needed > 0 ? Math.min(100, Math.round((stats.done / stats.needed) * 100)) : 0;

  return (
    <ModalPortal onRequestClose={onClose}>
      <style>{`
        @keyframes budget-scan-pulse {
          0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.45); }
          40% { transform: scale(1.03); box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
          100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
        @keyframes budget-scan-check {
          0% { transform: scale(0.4); opacity: 0; }
          55% { transform: scale(1.18); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes budget-scan-bar {
          from { transform: scaleX(0.85); }
          to { transform: scaleX(1); }
        }
        .budget-scan-hit {
          animation: budget-scan-pulse 0.85s ease-out;
        }
        .budget-scan-check {
          animation: budget-scan-check 0.55s cubic-bezier(0.22, 1.2, 0.36, 1);
        }
        .budget-scan-bar-fill {
          transform-origin: left center;
          animation: budget-scan-bar 0.45s ease-out;
        }
      `}</style>
      <div className={overlayClass} onClick={onClose} role="presentation">
        <div
          className={`${iosModalShell} flex max-h-[min(92dvh,860px)] w-full max-w-lg flex-col`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="budget-parts-scan-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-start gap-3 border-b border-zinc-200/80 px-4 pb-3.5 pt-[max(1rem,env(safe-area-inset-top))] dark:border-white/[0.08] sm:px-5 sm:pt-5">
            <div className={uiOsModalSectionAppIcon}>
              <img src="/icons/estoque-ios.png" alt="" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <p className={uiOsModalCardSectionTitle} id="budget-parts-scan-title">
                Peças do orçamento
              </p>
              <p className="mt-0.5 truncate text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
                {osLabel || 'OS'} · aprove e bipar
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-700 transition hover:bg-zinc-200 dark:bg-white/10 dark:text-zinc-200"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="shrink-0 space-y-3 border-b border-zinc-200/70 bg-zinc-50/90 px-4 py-3 dark:border-white/[0.06] dark:bg-white/[0.03] sm:px-5">
            <div className="flex items-center justify-between gap-2 text-[12px] font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">
              <span>
                {formatWorkshopPartQty(stats.done)} / {formatWorkshopPartQty(stats.needed)} bipados
              </span>
              <span className="text-emerald-700 dark:text-emerald-300">{progressPct}%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-zinc-200/90 dark:bg-white/10">
              <div
                className="budget-scan-bar-fill h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-[width] duration-500 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="flex-1 text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                Passe o código no leitor USB
                {showCameraButton ? ' ou use a câmera' : ''} — o item correspondente acende na lista.
              </p>
              {showCameraButton ? (
                <button
                  type="button"
                  disabled={busy || loading}
                  onClick={() => setScannerOpen(true)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[#007AFF]/25 bg-[#007AFF]/[0.09] px-3 py-2 text-[12px] font-semibold text-[#007AFF] disabled:opacity-50"
                >
                  <Camera className="h-3.5 w-3.5" strokeWidth={2.4} />
                  Câmera
                </button>
              ) : null}
            </div>
            {busy ? (
              <div className="flex items-center gap-2 text-[13px] font-medium text-zinc-600 dark:text-zinc-300">
                <Loader2 className="h-4 w-4 animate-spin text-[#007AFF]" />
                Registrando…
              </div>
            ) : null}
            {hint ? (
              <p className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[12px] font-semibold text-emerald-800 dark:text-emerald-200">
                {hint}
              </p>
            ) : null}
            {error ? (
              <p className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-[12px] font-semibold text-red-700 dark:text-red-300">
                {error}
              </p>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 custom-scrollbar sm:px-5 sm:py-4">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-zinc-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                Carregando peças aprovadas…
              </div>
            ) : lines.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-zinc-300/90 bg-zinc-50/80 px-4 py-10 text-center dark:border-white/10 dark:bg-white/[0.03]">
                <ClipboardList className="h-8 w-8 text-zinc-400" strokeWidth={1.75} />
                <p className="text-[14px] font-semibold text-zinc-800 dark:text-zinc-200">
                  Nenhuma peça aprovada
                </p>
                <p className="max-w-xs text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                  Aprove itens de peça no orçamento desta OS para bipá-los aqui e dar baixa no estoque.
                </p>
              </div>
            ) : (
              <ul className="space-y-2.5">
                {lines.map((line) => {
                  const got = Math.min(fulfilled[line.key] ?? 0, line.neededQty);
                  const pct = line.neededQty > 0 ? Math.min(100, (got / line.neededQty) * 100) : 0;
                  const complete = got >= line.neededQty;
                  const hitting = hitKey === line.key;
                  const justDone = justCompletedKey === line.key;
                  return (
                    <li
                      key={line.key}
                      ref={(node) => {
                        lineRefs.current[line.key] = node;
                      }}
                      className={`relative overflow-hidden rounded-2xl border px-3 py-3 transition-colors ${
                        complete
                          ? 'border-emerald-400/45 bg-emerald-50/90 dark:border-emerald-400/30 dark:bg-emerald-500/10'
                          : 'border-zinc-200/90 bg-white dark:border-white/[0.1] dark:bg-zinc-950/55'
                      } ${hitting ? 'budget-scan-hit' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-zinc-200/80 bg-zinc-50 dark:border-white/10 dark:bg-white/[0.04]">
                          {line.photoUrl ? (
                            <PartPhotoImg src={line.photoUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <Package className="h-5 w-5 text-zinc-400" aria-hidden />
                          )}
                          {complete ? (
                            <div
                              className={`absolute inset-0 flex items-center justify-center bg-emerald-600/85 ${
                                justDone ? 'budget-scan-check' : ''
                              }`}
                            >
                              <CheckCircle2 className="h-7 w-7 text-white" strokeWidth={2.4} />
                            </div>
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-semibold text-zinc-900 dark:text-white">
                            {line.description}
                          </p>
                          <p className="mt-0.5 text-[11px] font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
                            {complete
                              ? 'Baixa concluída'
                              : `Faltam ${formatWorkshopPartQty(line.neededQty - got)} de ${formatWorkshopPartQty(line.neededQty)}`}
                          </p>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-white/10">
                            <div
                              key={`${line.key}-${got}`}
                              className={`h-full rounded-full transition-[width] duration-500 ease-out ${
                                complete ? 'bg-emerald-500' : 'bg-[#007AFF] budget-scan-bar-fill'
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p
                            className={`text-[15px] font-bold tabular-nums ${
                              complete
                                ? 'text-emerald-700 dark:text-emerald-300'
                                : 'text-zinc-800 dark:text-zinc-100'
                            }`}
                          >
                            {formatWorkshopPartQty(got)}
                            <span className="text-[12px] font-semibold text-zinc-400">
                              /{formatWorkshopPartQty(line.neededQty)}
                            </span>
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="shrink-0 border-t border-zinc-200/80 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-white/[0.08] sm:px-5">
            <button
              type="button"
              onClick={onClose}
              className="flex w-full items-center justify-center rounded-2xl bg-zinc-900 px-4 py-3 text-[14px] font-semibold text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-900"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>

      {showCameraButton ? (
        <BarcodeScanner
          isOpen={scannerOpen}
          onClose={() => setScannerOpen(false)}
          title="Bipar peça do orçamento"
          onDetected={(code) => {
            setScannerOpen(false);
            void registerCode(code);
          }}
        />
      ) : null}
    </ModalPortal>
  );
};
