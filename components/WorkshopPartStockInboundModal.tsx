import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ClipboardList,
  Loader2,
  Minus,
  PackagePlus,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  createWorkshopPartPurchase,
  deleteWorkshopPartPurchase,
  getWorkshopPartPurchases,
  getWorkshopParts,
  updateWorkshopPart,
  updateWorkshopPartPurchase,
  type WorkshopPart,
  type WorkshopPartPurchase,
  type WorkshopPartPurchaseStatus,
} from '../services/apiService';
import { formatWorkshopPartQty, parseWorkshopPartQtyInt } from '../utils/workshopPartStock';
import {
  isPurchaseInProgress,
  PURCHASE_STATUS_LABEL,
} from '../utils/workshopPartStockMovementNotes';
import { storageSiteLabel } from '../utils/workshopPartFields';
import { PartPhotoImg } from './ui/PartPhotoImg';
import { RegistrationPortal } from './ui/RegistrationPortal';
import { resolveIosModalOverlayClass, NESTED_STOCK_OVERLAY_Z } from './ui/iosModalStyles';
import { useDesktopShellLayout } from './ui/DesktopShellContext';
import { useBrowserBackLayer } from './ui/BackNavigationContext';

export type WorkshopPartStockInboundModalProps = {
  isOpen: boolean;
  part: WorkshopPart;
  onClose: () => void;
  onStockChanged: (part: WorkshopPart) => void;
  /** Abre a ficha completa (opcional). */
  onOpenFullEdit?: (part: WorkshopPart) => void;
};

const STATUS_OPTIONS: WorkshopPartPurchaseStatus[] = [
  'pending',
  'ordered',
  'received',
  'cancelled',
];

function IntStepper({
  label,
  value,
  onChange,
  min = 0,
  disabled,
  emphasize,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  disabled?: boolean;
  emphasize?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <p
        className={`text-[11px] font-bold uppercase tracking-wide ${
          emphasize ? 'text-emerald-700 dark:text-emerald-300' : 'text-zinc-500'
        }`}
      >
        {label}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled || value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-200/90 text-zinc-800 disabled:opacity-40 dark:bg-white/10 dark:text-zinc-100"
          aria-label={`Diminuir ${label}`}
        >
          <Minus className="h-4 w-4" />
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={min}
          step={1}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(parseWorkshopPartQtyInt(e.target.value))}
          className={`min-w-0 flex-1 rounded-xl border-0 bg-zinc-100 px-3 py-2.5 text-center text-[18px] font-bold tabular-nums outline-none focus:ring-2 focus:ring-emerald-500/30 dark:bg-black/20 dark:text-white ${
            emphasize ? 'ring-1 ring-emerald-500/25' : ''
          }`}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(value + 1)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-200/90 text-zinc-800 disabled:opacity-40 dark:bg-white/10 dark:text-zinc-100"
          aria-label={`Aumentar ${label}`}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function WorkshopPartStockInboundModal({
  isOpen,
  part: initialPart,
  onClose,
  onStockChanged,
  onOpenFullEdit,
}: WorkshopPartStockInboundModalProps) {
  const isDesktopShell = useDesktopShellLayout();
  const [part, setPart] = useState<WorkshopPart>(initialPart);
  const [receiveQty, setReceiveQty] = useState(1);
  const [purchases, setPurchases] = useState<WorkshopPartPurchase[]>([]);
  const [loadingPurchases, setLoadingPurchases] = useState(false);
  const [savingStock, setSavingStock] = useState(false);
  const [savingPurchase, setSavingPurchase] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [newSupplier, setNewSupplier] = useState('');
  const [newQty, setNewQty] = useState(1);
  const [newCost, setNewCost] = useState('');
  const [newStatus, setNewStatus] = useState<WorkshopPartPurchaseStatus>('pending');

  useBrowserBackLayer(isOpen, onClose);

  const unit = part.unit_of_measure || 'UN';
  const projectedAfterReceive = useMemo(
    () => parseWorkshopPartQtyInt(part.stock_qty) + Math.max(0, receiveQty),
    [part.stock_qty, receiveQty]
  );

  const reloadPurchases = useCallback(async (partId: string) => {
    setLoadingPurchases(true);
    try {
      const rows = await getWorkshopPartPurchases(partId);
      setPurchases(rows);
    } catch {
      setPurchases([]);
    } finally {
      setLoadingPurchases(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setPart(initialPart);
    setReceiveQty(1);
    setError(null);
    setSuccess(null);
    setNewSupplier('');
    setNewQty(1);
    setNewCost('');
    setNewStatus('pending');
    void reloadPurchases(initialPart.id);
  }, [isOpen, initialPart, reloadPurchases]);

  const applyPartUpdate = useCallback(
    (updated: WorkshopPart) => {
      setPart(updated);
      onStockChanged(updated);
    },
    [onStockChanged]
  );

  const handleReceive = useCallback(async () => {
    const add = Math.max(0, Math.round(receiveQty));
    if (!(add > 0)) {
      setError('Informe a quantidade recebida.');
      return;
    }
    setSavingStock(true);
    setError(null);
    setSuccess(null);
    try {
      const nextQty = parseWorkshopPartQtyInt(part.stock_qty) + add;
      const updated = await updateWorkshopPart(part.id, { stock_qty: nextQty });
      applyPartUpdate(updated);
      setReceiveQty(1);
      setSuccess(`Recebimento registrado · estoque agora ${formatWorkshopPartQty(updated.stock_qty)} ${unit}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao registrar recebimento.');
    } finally {
      setSavingStock(false);
    }
  }, [applyPartUpdate, part.id, part.stock_qty, receiveQty, unit]);

  const refreshPartFromServer = useCallback(async () => {
    const all = await getWorkshopParts();
    const found = all.find((p) => p.id === part.id);
    if (found) applyPartUpdate(found);
  }, [applyPartUpdate, part.id]);

  const handleAddPurchase = useCallback(async () => {
    setSavingPurchase(true);
    setError(null);
    setSuccess(null);
    try {
      const cost = Number(String(newCost).replace(',', '.'));
      await createWorkshopPartPurchase(part.id, {
        supplier_name: newSupplier.trim() || null,
        quantity: Math.max(0, Math.round(newQty)),
        unit_cost: Number.isFinite(cost) && cost >= 0 ? cost : 0,
        status: newStatus,
      });
      setNewSupplier('');
      setNewQty(1);
      setNewCost('');
      setNewStatus('pending');
      await reloadPurchases(part.id);
      await refreshPartFromServer();
      setSuccess('Lista de compras atualizada.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao adicionar compra.');
    } finally {
      setSavingPurchase(false);
    }
  }, [
    newCost,
    newQty,
    newStatus,
    newSupplier,
    part.id,
    refreshPartFromServer,
    reloadPurchases,
  ]);

  const handlePurchaseStatus = useCallback(
    async (row: WorkshopPartPurchase, status: WorkshopPartPurchaseStatus) => {
      setSavingPurchase(true);
      setError(null);
      setSuccess(null);
      try {
        await updateWorkshopPartPurchase(part.id, row.id, { status });
        await reloadPurchases(part.id);
        await refreshPartFromServer();
        setSuccess(`Status atualizado: ${PURCHASE_STATUS_LABEL[status] ?? status}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao atualizar compra.');
      } finally {
        setSavingPurchase(false);
      }
    },
    [part.id, refreshPartFromServer, reloadPurchases]
  );

  const handleDeletePurchase = useCallback(
    async (row: WorkshopPartPurchase) => {
      setSavingPurchase(true);
      setError(null);
      try {
        await deleteWorkshopPartPurchase(part.id, row.id);
        await reloadPurchases(part.id);
        await refreshPartFromServer();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao remover compra.');
      } finally {
        setSavingPurchase(false);
      }
    },
    [part.id, refreshPartFromServer, reloadPurchases]
  );

  if (!isOpen) return null;

  const overlayClass = resolveIosModalOverlayClass(isDesktopShell, NESTED_STOCK_OVERLAY_Z);
  const busy = savingStock || savingPurchase;
  const inProgress = purchases.filter((p) => isPurchaseInProgress(p.status));

  return (
    <RegistrationPortal>
      <div className={overlayClass} role="dialog" aria-modal="true" aria-label="Registrar recebimento">
        <div
          className={`flex max-h-[min(940px,96vh)] w-full flex-col overflow-hidden rounded-[1.75rem] border-0 bg-zinc-50 shadow-none dark:bg-zinc-950 ${
            isDesktopShell ? 'max-w-4xl' : 'max-w-lg'
          }`}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-200/80 px-5 py-4 dark:border-white/10">
            <div className="flex min-w-0 items-start gap-3">
              <button
                type="button"
                onClick={onClose}
                className="mt-0.5 rounded-xl p-2 text-zinc-600 hover:bg-zinc-200/70 dark:text-zinc-300 dark:hover:bg-white/10"
                aria-label="Voltar"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white">
                    <PackagePlus className="h-5 w-5" />
                  </span>
                  <h2 className="text-[18px] font-bold text-zinc-900 dark:text-white">
                    Registrar recebimento
                  </h2>
                </div>
                <p className="mt-1 text-[13px] text-zinc-500 dark:text-zinc-400">
                  Entrada rápida de mercadoria e lista de compras
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-2 text-zinc-500 hover:bg-zinc-200/70 dark:hover:bg-white/10"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div
            className={`min-h-0 flex-1 overflow-y-auto px-5 py-4 custom-scrollbar ${
              isDesktopShell ? 'grid grid-cols-2 gap-4' : 'space-y-4'
            }`}
          >
            <div className="space-y-4">
            <section className="rounded-2xl border-0 bg-white p-4 dark:bg-white/5">
              <div className="flex gap-3">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-800">
                  {part.photo_url ? (
                    <PartPhotoImg src={part.photo_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[11px] font-bold text-zinc-400">
                      Sem foto
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[16px] font-bold text-zinc-900 dark:text-white">{part.name}</p>
                  <p className="text-[13px] text-zinc-500">
                    {[part.brand, part.barcode || part.original_code || part.numeric_code]
                      .filter(Boolean)
                      .join(' · ') || 'Sem código'}
                  </p>
                  <p className="mt-1 text-[12px] text-zinc-500">
                    {[storageSiteLabel(part.storage_site), part.location].filter(Boolean).join(' · ') ||
                      'Local não informado'}
                  </p>
                </div>
                {onOpenFullEdit ? (
                  <button
                    type="button"
                    onClick={() => onOpenFullEdit(part)}
                    className="shrink-0 self-start rounded-lg px-2 py-1 text-[12px] font-semibold text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-white/10"
                  >
                    Ficha
                  </button>
                ) : null}
              </div>

              <div className="mt-4 rounded-2xl bg-emerald-600 px-4 py-3.5 text-white">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] opacity-90">
                  Quantidade em estoque
                </p>
                <p className="mt-1 text-[2.1rem] font-bold tabular-nums leading-none">
                  {formatWorkshopPartQty(part.stock_qty)}
                  <span className="ml-2 text-[1rem] font-semibold opacity-90">{unit}</span>
                </p>
                <p className="mt-2 text-[12px] font-semibold opacity-90">
                  Mín. {formatWorkshopPartQty(part.min_stock_qty)} · Máx.{' '}
                  {part.max_stock_qty != null ? formatWorkshopPartQty(part.max_stock_qty) : '—'}
                </p>
              </div>
            </section>

            <section className="space-y-3 rounded-2xl border-0 bg-white p-4 dark:bg-white/5">
              <h3 className="text-[13px] font-bold uppercase tracking-wide text-zinc-500">
                Entrada de mercadoria
              </h3>
              <IntStepper
                label="Quantidade recebida"
                value={receiveQty}
                onChange={setReceiveQty}
                min={0}
                disabled={busy}
                emphasize
              />
              <p className="text-[13px] text-zinc-600 dark:text-zinc-300">
                Após confirmar: estoque passa a{' '}
                <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                  {formatWorkshopPartQty(projectedAfterReceive)} {unit}
                </span>
              </p>
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={busy || receiveQty <= 0}
                  onClick={() => void handleReceive()}
                  className="inline-flex w-auto items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {savingStock ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
                  Confirmar entrada
                </button>
              </div>
            </section>
            </div>

            <section className="space-y-3 rounded-2xl border-0 bg-white p-4 dark:bg-white/5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-amber-600" />
                  <h3 className="text-[13px] font-bold uppercase tracking-wide text-zinc-500">
                    Lista de compras
                  </h3>
                </div>
                {loadingPurchases ? <Loader2 className="h-4 w-4 animate-spin text-zinc-400" /> : null}
              </div>
              <p className="text-[12px] text-zinc-500">
                Solicite reposição e acompanhe o status (Pendente → Pedido emitido → Recebido).
              </p>

              {inProgress.length > 0 ? (
                <div className="rounded-xl bg-amber-50 px-3 py-2.5 text-[13px] font-medium text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
                  {inProgress.length} item(ns) em reposição junto ao fornecedor.
                </div>
              ) : null}

              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block space-y-1 sm:col-span-2">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                    Fornecedor
                  </span>
                  <input
                    type="text"
                    value={newSupplier}
                    disabled={busy}
                    onChange={(e) => setNewSupplier(e.target.value)}
                    placeholder="Nome do fornecedor"
                    className="w-full rounded-xl border-0 bg-zinc-100 px-3 py-2.5 text-[14px] outline-none focus:ring-2 focus:ring-emerald-500/30 dark:bg-black/20 dark:text-white"
                  />
                </label>
                <IntStepper label="Qtd solicitada" value={newQty} onChange={setNewQty} min={0} disabled={busy} />
                <label className="block space-y-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                    Custo un. (R$)
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={newCost}
                    disabled={busy}
                    onChange={(e) => setNewCost(e.target.value)}
                    className="w-full rounded-xl border-0 bg-zinc-100 px-3 py-2.5 text-[14px] tabular-nums outline-none focus:ring-2 focus:ring-emerald-500/30 dark:bg-black/20 dark:text-white"
                  />
                </label>
                <label className="block space-y-1.5 sm:col-span-2">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                    Status inicial
                  </span>
                  <select
                    value={newStatus}
                    disabled={busy}
                    onChange={(e) => setNewStatus(e.target.value as WorkshopPartPurchaseStatus)}
                    className="w-full rounded-xl border-0 bg-zinc-100 px-3 py-2.5 text-[14px] outline-none focus:ring-2 focus:ring-emerald-500/30 dark:bg-black/20 dark:text-white"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {PURCHASE_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleAddPurchase()}
                  className="inline-flex w-auto items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
                >
                  {savingPurchase ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Adicionar à lista
                </button>
              </div>

              {purchases.length === 0 ? (
                <p className="py-2 text-center text-[13px] text-zinc-500">Nenhuma compra na lista.</p>
              ) : (
                <ul className="space-y-2">
                  {purchases.map((row) => (
                    <li
                      key={row.id}
                      className="rounded-xl border-0 bg-zinc-50 px-3 py-3 dark:bg-white/[0.04]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[14px] font-semibold text-zinc-900 dark:text-white">
                            {row.supplier_name?.trim() || 'Fornecedor não informado'}
                          </p>
                          <p className="text-[12px] text-zinc-500">
                            {formatWorkshopPartQty(row.quantity)} {unit}
                            {row.unit_cost > 0
                              ? ` · R$ ${Number(row.unit_cost).toFixed(2)}`
                              : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleDeletePurchase(row)}
                          className="rounded-lg p-1.5 text-red-600 hover:bg-red-500/10 disabled:opacity-40"
                          aria-label="Remover"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <select
                        value={row.status}
                        disabled={busy}
                        onChange={(e) =>
                          void handlePurchaseStatus(
                            row,
                            e.target.value as WorkshopPartPurchaseStatus
                          )
                        }
                        className="mt-2 w-full rounded-lg border-0 bg-white px-2.5 py-2 text-[13px] font-semibold outline-none dark:bg-zinc-900 dark:text-white"
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {PURCHASE_STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {(error || success) && (
              <div className={isDesktopShell ? 'col-span-2' : undefined}>
                {error ? (
                  <p className="rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-800 dark:bg-red-950/40 dark:text-red-200">
                    {error}
                  </p>
                ) : null}
                {success ? (
                  <p className="rounded-xl bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                    {success}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </RegistrationPortal>
  );
}
