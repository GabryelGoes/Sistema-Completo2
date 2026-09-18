import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, PackageMinus, Search, ShoppingBag, Trash2, X } from 'lucide-react';
import {
  cancelWorkshopPartStockMovement,
  createWorkshopPartStockMovement,
  getServiceOrders,
  getSystemUsersDirectory,
  getWorkshopPartStockMovements,
  lookupWorkshopPartByCode,
  type ServiceOrderListItem,
  type SystemUserDirectoryEntry,
  type WorkshopPart,
  type WorkshopPartStockMovement,
  type WorkshopPartStockMovementType,
} from '../services/apiService';
import { formatWorkshopPartQty, parseWorkshopPartQtyInt } from '../utils/workshopPartStock';
import { stockMovementTypeLabel } from '../utils/workshopPartStockOutbound';
import {
  formatConsumableMovementNotes,
  formatSaleMovementNotes,
} from '../utils/workshopPartStockMovementNotes';
import { searchWorkshopPartsByText } from '../utils/workshopPartBarcode';
import { getStoredAuth } from './views/LoginView';
import { BarcodeScanField } from './BarcodeScanField';
import { PartPhotoImg } from './ui/PartPhotoImg';
import { RegistrationPortal } from './ui/RegistrationPortal';
import { resolveIosModalOverlayClass, NESTED_STOCK_OVERLAY_Z } from './ui/iosModalStyles';
import { useDesktopShellLayout } from './ui/DesktopShellContext';
import { useBrowserBackLayer } from './ui/BackNavigationContext';
import { StockGuardPasswordModal } from './StockGuardPasswordModal';

export type WorkshopPartStockOutboundModalProps = {
  isOpen: boolean;
  mode: WorkshopPartStockMovementType;
  onClose: () => void;
  onStockChanged: (part: Pick<WorkshopPart, 'id' | 'stock_qty' | 'unit_price' | 'name'>) => void;
  initialPart?: WorkshopPart | null;
  /** Catálogo atual do estoque para busca por nome/marca. */
  catalogParts?: WorkshopPart[];
  /** Abre o cadastro de produto com o código lido pré-preenchido. */
  onRegisterMissingProduct?: (barcode: string) => void;
};

const PAYMENT_OPTIONS = ['PIX', 'Dinheiro', 'Cartão de crédito', 'Cartão de débito', 'Transferência', 'Outro'];

function moneyBRL(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function osDisplayLabel(os: ServiceOrderListItem): string {
  const num = os.os_number != null ? `OS #${os.os_number}` : 'OS';
  const plate = os.plate?.trim();
  const model = os.vehicle_model?.trim() || os.module_identification?.trim();
  return [num, plate, model].filter(Boolean).join(' · ');
}

export function WorkshopPartStockOutboundModal({
  isOpen,
  mode,
  onClose,
  onStockChanged,
  initialPart = null,
  catalogParts = [],
  onRegisterMissingProduct,
}: WorkshopPartStockOutboundModalProps) {
  const isDesktopShell = useDesktopShellLayout();
  const isSale = mode === 'sale';
  const title = stockMovementTypeLabel(mode);

  const [code, setCode] = useState('');
  const [nameQuery, setNameQuery] = useState('');
  const [part, setPart] = useState<WorkshopPart | null>(null);
  const [qty, setQty] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [osScope, setOsScope] = useState<'patio' | 'lab' | ''>('');
  const [osQuery, setOsQuery] = useState('');
  const [selectedOs, setSelectedOs] = useState<ServiceOrderListItem | null>(null);
  const [serviceOrders, setServiceOrders] = useState<ServiceOrderListItem[]>([]);
  const [employees, setEmployees] = useState<SystemUserDirectoryEntry[]>([]);
  const [withdrawnBy, setWithdrawnBy] = useState('');
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [missingBarcode, setMissingBarcode] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<WorkshopPartStockMovement[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<WorkshopPartStockMovement | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  useBrowserBackLayer(isOpen, onClose);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const items = await getWorkshopPartStockMovements({ type: mode, limit: 12 });
      setHistory(items);
    } catch {
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, [mode]);

  useEffect(() => {
    if (!isOpen) return;
    setCode('');
    setNameQuery('');
    setLookupError(null);
    setMissingBarcode(null);
    setSubmitError(null);
    setSuccessMsg(null);
    setNotes('');
    setCustomerName('');
    setInvoiceRef('');
    setPaymentMethod('');
    setOsScope('');
    setOsQuery('');
    setSelectedOs(null);
    setWithdrawnBy('');
    setQty('1');
    if (initialPart) {
      setPart(initialPart);
      setUnitPrice(Number(initialPart.unit_price ?? 0).toFixed(2));
    } else {
      setPart(null);
      setUnitPrice('');
    }
    void loadHistory();
  }, [isOpen, mode, initialPart, loadHistory]);

  useEffect(() => {
    if (!isOpen || isSale) return;
    let cancelled = false;
    void Promise.all([
      getServiceOrders(undefined, 'vehicle').catch(() => [] as ServiceOrderListItem[]),
      getServiceOrders(undefined, 'module').catch(() => [] as ServiceOrderListItem[]),
      getSystemUsersDirectory().catch(() => [] as SystemUserDirectoryEntry[]),
    ]).then(([patio, lab, users]) => {
      if (cancelled) return;
      setServiceOrders([...patio, ...lab]);
      setEmployees(users);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, isSale]);

  /** Mantém o produto selecionado sincronizado com o catálogo (estoque atualizado). */
  useEffect(() => {
    if (!part?.id || catalogParts.length === 0) return;
    const fresh = catalogParts.find((p) => p.id === part.id);
    if (!fresh) return;
    if (
      Number(fresh.stock_qty) !== Number(part.stock_qty) ||
      Number(fresh.unit_price) !== Number(part.unit_price) ||
      fresh.name !== part.name
    ) {
      setPart(fresh);
      setUnitPrice(Number(fresh.unit_price ?? 0).toFixed(2));
    }
  }, [catalogParts, part]);

  const qtyNumber = useMemo(() => parseWorkshopPartQtyInt(qty), [qty]);

  const priceNumber = useMemo(() => {
    const n = Number(String(unitPrice).replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }, [unitPrice]);

  const totalPreview = isSale && qtyNumber > 0 ? priceNumber * qtyNumber : null;

  const nameMatches = useMemo(
    () => searchWorkshopPartsByText(catalogParts, nameQuery, 15),
    [catalogParts, nameQuery]
  );

  const osMatches = useMemo(() => {
    if (!osScope) return [];
    const wantType = osScope === 'lab' ? 'module' : 'vehicle';
    const q = osQuery.trim().toLowerCase();
    return serviceOrders
      .filter((o) => (o.order_type || 'vehicle') === wantType)
      .filter((o) => {
        if (!q) return true;
        const hay = [
          o.os_number != null ? String(o.os_number) : '',
          o.plate,
          o.vehicle_model,
          o.module_identification,
          o.issue_description,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 12);
  }, [osQuery, osScope, serviceOrders]);

  const selectPart = useCallback((p: WorkshopPart) => {
    setPart(p);
    setUnitPrice(Number(p.unit_price ?? 0).toFixed(2));
    setLookupError(null);
    setMissingBarcode(null);
    setSubmitError(null);
    setSuccessMsg(null);
    setQty('1');
    setNameQuery(p.name || '');
  }, []);

  const handleLookup = useCallback(
    async (rawCode: string) => {
      setLookingUp(true);
      setLookupError(null);
      setMissingBarcode(null);
      setSuccessMsg(null);
      try {
        const found = await lookupWorkshopPartByCode(rawCode);
        if (found) {
          selectPart(found);
          return;
        }
        const byName = searchWorkshopPartsByText(catalogParts, rawCode, 8);
        if (byName.length === 1) {
          selectPart(byName[0]);
          setNameQuery(byName[0].name || rawCode);
          return;
        }
        if (byName.length > 1) {
          setPart(null);
          setNameQuery(rawCode);
          setLookupError(
            `Nenhum código exato. ${byName.length} produtos com nome parecido — escolha na lista abaixo.`
          );
          return;
        }
        setPart(null);
        setMissingBarcode(rawCode);
        setLookupError('Produto não cadastrado');
      } catch (e) {
        setLookupError(e instanceof Error ? e.message : 'Falha na busca.');
      } finally {
        setLookingUp(false);
      }
    },
    [catalogParts, selectPart]
  );

  const resetMovementFields = () => {
    setNotes('');
    setCustomerName('');
    setInvoiceRef('');
    setPaymentMethod('');
    setOsScope('');
    setOsQuery('');
    setSelectedOs(null);
    setWithdrawnBy('');
    setQty('1');
  };

  const handleConfirm = useCallback(async () => {
    if (!part) {
      setSubmitError('Leia o código ou escolha o produto pelo nome.');
      return;
    }
    if (!(qtyNumber > 0)) {
      setSubmitError('Informe uma quantidade válida.');
      return;
    }
    if (qtyNumber > Number(part.stock_qty ?? 0)) {
      setSubmitError(`Estoque insuficiente. Disponível: ${formatWorkshopPartQty(part.stock_qty)}.`);
      return;
    }
    if (isSale && priceNumber < 0) {
      setSubmitError('Preço inválido.');
      return;
    }

    setSaving(true);
    setSubmitError(null);
    setSuccessMsg(null);
    try {
      const auth = getStoredAuth();
      const recordedBy =
        auth?.displayName?.trim() ||
        auth?.username?.trim() ||
        (auth?.role === 'admin' ? 'Gerência' : null);

      const composedNotes = isSale
        ? formatSaleMovementNotes({
            customerName,
            invoiceRef,
            paymentMethod,
            notes,
          })
        : formatConsumableMovementNotes({
            osScope,
            osLabel: selectedOs ? osDisplayLabel(selectedOs) : osQuery.trim() || undefined,
            withdrawnBy,
            notes,
          });

      const result = await createWorkshopPartStockMovement({
        movement_type: mode,
        part_id: part.id,
        quantity: qtyNumber,
        unit_price: isSale ? priceNumber : null,
        notes: composedNotes,
        barcode_scanned: code.trim() || part.barcode || null,
        recorded_by_name: recordedBy,
      });

      const updated: WorkshopPart = {
        ...part,
        stock_qty: Number(result.part.stock_qty),
        unit_price: Number(result.part.unit_price ?? part.unit_price),
      };
      setPart(updated);
      onStockChanged(updated);
      setSuccessMsg(
        isSale
          ? `Venda registrada · estoque agora ${formatWorkshopPartQty(updated.stock_qty)}`
          : `Consumo registrado · estoque agora ${formatWorkshopPartQty(updated.stock_qty)}`
      );
      resetMovementFields();
      await loadHistory();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Não foi possível registrar.');
    } finally {
      setSaving(false);
    }
  }, [
    code,
    customerName,
    invoiceRef,
    isSale,
    loadHistory,
    mode,
    notes,
    onStockChanged,
    osQuery,
    osScope,
    part,
    paymentMethod,
    priceNumber,
    qtyNumber,
    selectedOs,
    withdrawnBy,
  ]);

  if (!isOpen) return null;

  const overlayClass = resolveIosModalOverlayClass(isDesktopShell, NESTED_STOCK_OVERLAY_Z);
  const showNameList = nameQuery.trim().length > 0 && (!part || nameQuery.trim() !== part.name);

  const handleCancelMovement = async (password: string) => {
    if (!cancelTarget) return;
    setCancelBusy(true);
    setCancelError(null);
    try {
      const updatedPart = await cancelWorkshopPartStockMovement(cancelTarget.id, password);
      if (part && part.id === updatedPart.id) {
        const next = { ...part, stock_qty: Number(updatedPart.stock_qty) };
        setPart(next);
        onStockChanged(next);
      } else {
        onStockChanged({
          id: updatedPart.id,
          name: updatedPart.name,
          stock_qty: Number(updatedPart.stock_qty),
          unit_price: Number(updatedPart.unit_price ?? 0),
        });
      }
      setCancelTarget(null);
      setSuccessMsg(
        isSale
          ? `Venda cancelada · estoque restaurado`
          : `Consumo cancelado · estoque restaurado`
      );
      await loadHistory();
    } catch (e) {
      setCancelError(e instanceof Error ? e.message : 'Não foi possível cancelar.');
    } finally {
      setCancelBusy(false);
    }
  };

  return (
    <RegistrationPortal>
      <div className={overlayClass} role="dialog" aria-modal="true" aria-label={title}>
        <div
          className={`flex max-h-[min(940px,96vh)] w-full flex-col overflow-hidden rounded-[1.75rem] border-0 bg-zinc-50 shadow-none dark:bg-zinc-950 ${
            isDesktopShell ? 'max-w-4xl' : 'max-w-lg'
          }`}
        >
          <div className="flex items-start justify-between gap-3 border-b border-zinc-200/80 px-5 py-4 dark:border-white/10">
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
                  <span
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${
                      isSale ? 'bg-violet-600 text-white' : 'bg-sky-600 text-white'
                    }`}
                  >
                    {isSale ? <ShoppingBag className="h-5 w-5" /> : <PackageMinus className="h-5 w-5" />}
                  </span>
                  <h2 className="text-[18px] font-bold text-zinc-900 dark:text-white">{title}</h2>
                </div>
                <p className="mt-1 text-[13px] text-zinc-500 dark:text-zinc-400">
                  {isSale
                    ? 'Baixa por venda · todos os dados ficam no histórico'
                    : 'Baixa por consumo interno · vincule OS e quem retirou'}
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

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 custom-scrollbar">
            {!initialPart ? (
              <>
                <section className="space-y-2">
                  <h3 className="text-[13px] font-bold uppercase tracking-wide text-zinc-500">
                    Por código de barras
                  </h3>
                  <BarcodeScanField
                    value={code}
                    onChange={setCode}
                    onSubmitCode={handleLookup}
                    disabled={lookingUp || saving}
                    autoFocus={!initialPart}
                  />
                  {lookingUp ? (
                    <p className="flex items-center gap-2 text-[13px] text-zinc-500">
                      <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
                    </p>
                  ) : null}
                  {lookupError ? (
                    <div className="space-y-2 rounded-xl border-0 bg-red-50 shadow-none px-3 py-2.5 dark:border-red-900/50 dark:bg-red-950/40">
                      <p className="text-[13px] font-semibold text-red-700 dark:text-red-300">
                        {lookupError}
                        {missingBarcode ? (
                          <span className="mt-0.5 block font-normal tabular-nums opacity-90">
                            Código: {missingBarcode}
                          </span>
                        ) : null}
                      </p>
                      {missingBarcode && onRegisterMissingProduct ? (
                        <button
                          type="button"
                          onClick={() => onRegisterMissingProduct(missingBarcode)}
                          className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-3 py-2 text-[13px] font-semibold text-white hover:bg-emerald-500"
                        >
                          Cadastrar produto
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </section>

                <section className="space-y-2">
                  <h3 className="text-[13px] font-bold uppercase tracking-wide text-zinc-500">
                    Por nome do produto
                  </h3>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <input
                      type="search"
                      value={nameQuery}
                      onChange={(e) => {
                        setNameQuery(e.target.value);
                        setLookupError(null);
                        setSuccessMsg(null);
                      }}
                      disabled={saving}
                      placeholder="Digite o nome, marca ou modelo…"
                      className="w-full rounded-2xl border-0 bg-zinc-100 py-3 pl-10 pr-3 text-[15px] text-zinc-900 outline-none ring-emerald-500/30 focus:ring-2 dark:bg-white/5 dark:text-white"
                      aria-label="Buscar produto por nome"
                      autoComplete="off"
                    />
                  </div>

                  {showNameList ? (
                    nameMatches.length > 0 ? (
                      <ul className="max-h-[min(240px,32vh)] space-y-1 overflow-y-auto rounded-2xl border-0 bg-white p-1.5 dark:bg-white/5 custom-scrollbar">
                        {nameMatches.map((p) => {
                          const selected = part?.id === p.id;
                          return (
                            <li key={p.id}>
                              <button
                                type="button"
                                onClick={() => selectPart(p)}
                                disabled={saving}
                                className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                                  selected
                                    ? 'bg-emerald-500/15 text-emerald-950 dark:text-emerald-100'
                                    : 'hover:bg-zinc-100 dark:hover:bg-white/10'
                                }`}
                              >
                                <span className="min-w-0">
                                  <span className="block truncate text-[14px] font-semibold text-zinc-900 dark:text-white">
                                    {p.name}
                                  </span>
                                  <span className="block truncate text-[12px] text-zinc-500">
                                    {[p.brand, p.original_code || p.numeric_code || p.barcode]
                                      .filter(Boolean)
                                      .join(' · ') || 'Sem código'}
                                  </span>
                                </span>
                                <span className="shrink-0 text-[12px] font-semibold tabular-nums text-zinc-600 dark:text-zinc-300">
                                  {formatWorkshopPartQty(p.stock_qty)} {p.unit_of_measure || 'UN'}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="rounded-xl border border-dashed border-zinc-300 px-3 py-3 text-[13px] text-zinc-500 dark:border-white/15 dark:text-zinc-400">
                        Nenhum produto com “{nameQuery.trim()}”.
                      </p>
                    )
                  ) : catalogParts.length > 0 && !part ? (
                    <p className="text-[13px] text-zinc-500">
                      Digite parte do nome para ver sugestões ({catalogParts.length} no estoque).
                    </p>
                  ) : null}
                </section>
              </>
            ) : null}

            {part ? (
              <section className="rounded-2xl border-0 bg-white p-4 dark:bg-white/5">
                <div className="flex gap-3">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-800">
                    {part.photo_url ? (
                      <PartPhotoImg src={part.photo_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-zinc-400">
                        <ShoppingBag className="h-6 w-6" />
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
                    <p className="mt-1 text-[13px] font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                      Estoque: {formatWorkshopPartQty(part.stock_qty)} {part.unit_of_measure || 'UN'}
                    </p>
                  </div>
                  {!initialPart ? (
                    <button
                      type="button"
                      onClick={() => {
                        setPart(null);
                        setNameQuery('');
                        setCode('');
                        setSuccessMsg(null);
                        setSubmitError(null);
                      }}
                      className="shrink-0 self-start rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10"
                      aria-label="Trocar produto"
                      title="Trocar produto"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-1.5">
                    <span className="text-[12px] font-semibold text-zinc-600 dark:text-zinc-300">
                      Quantidade
                    </span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="1"
                      step="1"
                      value={qty}
                      onChange={(e) => setQty(String(parseWorkshopPartQtyInt(e.target.value) || ''))}
                      className="w-full rounded-xl border-0 bg-zinc-100 px-3 py-2.5 text-[15px] tabular-nums outline-none focus:ring-2 focus:ring-emerald-500/30 dark:bg-black/20 dark:text-white"
                    />
                  </label>
                  {isSale ? (
                    <label className="block space-y-1.5">
                      <span className="text-[12px] font-semibold text-zinc-600 dark:text-zinc-300">
                        Preço unitário (R$)
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={unitPrice}
                        onChange={(e) => setUnitPrice(e.target.value)}
                        className="w-full rounded-xl border-0 bg-zinc-100 px-3 py-2.5 text-[15px] tabular-nums outline-none focus:ring-2 focus:ring-emerald-500/30 dark:bg-black/20 dark:text-white"
                      />
                    </label>
                  ) : null}
                </div>

                {totalPreview != null ? (
                  <p className="mt-2 text-[14px] font-semibold text-zinc-800 dark:text-zinc-100">
                    Total: {moneyBRL(totalPreview)}
                  </p>
                ) : null}

                {isSale ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-1.5 sm:col-span-2">
                      <span className="text-[12px] font-semibold text-zinc-600 dark:text-zinc-300">
                        Cliente
                      </span>
                      <input
                        type="text"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Nome do cliente"
                        className="w-full rounded-xl border-0 bg-zinc-100 px-3 py-2.5 text-[15px] outline-none focus:ring-2 focus:ring-emerald-500/30 dark:bg-black/20 dark:text-white"
                      />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-[12px] font-semibold text-zinc-600 dark:text-zinc-300">
                        NF / documento
                      </span>
                      <input
                        type="text"
                        value={invoiceRef}
                        onChange={(e) => setInvoiceRef(e.target.value)}
                        placeholder="Número da NF…"
                        className="w-full rounded-xl border-0 bg-zinc-100 px-3 py-2.5 text-[15px] outline-none focus:ring-2 focus:ring-emerald-500/30 dark:bg-black/20 dark:text-white"
                      />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-[12px] font-semibold text-zinc-600 dark:text-zinc-300">
                        Forma de pagamento
                      </span>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className="w-full rounded-xl border-0 bg-zinc-100 px-3 py-2.5 text-[15px] outline-none focus:ring-2 focus:ring-emerald-500/30 dark:bg-black/20 dark:text-white"
                      >
                        <option value="">Selecionar…</option>
                        {PAYMENT_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    <div className="space-y-1.5">
                      <span className="text-[12px] font-semibold text-zinc-600 dark:text-zinc-300">
                        OS de utilização
                      </span>
                      <div className="flex gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-black/20">
                        {(
                          [
                            { value: '', label: 'Nenhuma' },
                            { value: 'patio', label: 'Pátio' },
                            { value: 'lab', label: 'Laboratório' },
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.value || 'none'}
                            type="button"
                            disabled={saving}
                            onClick={() => {
                              setOsScope(opt.value);
                              setSelectedOs(null);
                              setOsQuery('');
                            }}
                            className={`flex-1 rounded-lg px-2 py-2 text-[12px] font-semibold transition ${
                              osScope === opt.value
                                ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white'
                                : 'text-zinc-600 dark:text-zinc-300'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {osScope ? (
                      <div className="space-y-2">
                        <input
                          type="search"
                          value={osQuery}
                          onChange={(e) => {
                            setOsQuery(e.target.value);
                            setSelectedOs(null);
                          }}
                          disabled={saving}
                          placeholder={
                            osScope === 'lab'
                              ? 'Buscar OS do laboratório (nº, módulo…)…'
                              : 'Buscar OS do pátio (nº, placa…)…'
                          }
                          className="w-full rounded-xl border-0 bg-zinc-100 px-3 py-2.5 text-[14px] outline-none focus:ring-2 focus:ring-sky-500/30 dark:bg-black/20 dark:text-white"
                        />
                        {selectedOs ? (
                          <p className="rounded-xl bg-sky-50 px-3 py-2 text-[13px] font-semibold text-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
                            {osDisplayLabel(selectedOs)}
                          </p>
                        ) : osMatches.length > 0 ? (
                          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-xl bg-zinc-50 p-1 dark:bg-white/[0.04] custom-scrollbar">
                            {osMatches.map((os) => (
                              <li key={os.id}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedOs(os);
                                    setOsQuery(osDisplayLabel(os));
                                  }}
                                  className="w-full rounded-lg px-3 py-2 text-left text-[13px] font-medium text-zinc-800 hover:bg-white dark:text-zinc-100 dark:hover:bg-white/10"
                                >
                                  {osDisplayLabel(os)}
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-[12px] text-zinc-500">
                            Digite para filtrar ou deixe em branco e confirme sem OS.
                          </p>
                        )}
                      </div>
                    ) : null}

                    <label className="block space-y-1.5">
                      <span className="text-[12px] font-semibold text-zinc-600 dark:text-zinc-300">
                        Funcionário que retirou
                      </span>
                      <select
                        value={withdrawnBy}
                        onChange={(e) => setWithdrawnBy(e.target.value)}
                        disabled={saving}
                        className="w-full rounded-xl border-0 bg-zinc-100 px-3 py-2.5 text-[15px] outline-none focus:ring-2 focus:ring-sky-500/30 dark:bg-black/20 dark:text-white"
                      >
                        <option value="">Selecionar…</option>
                        {employees.map((u) => {
                          const label = u.display_name?.trim() || u.username;
                          return (
                            <option key={u.id} value={label}>
                              {label}
                              {u.job_title ? ` · ${u.job_title}` : ''}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                  </div>
                )}

                <label className="mt-3 block space-y-1.5">
                  <span className="text-[12px] font-semibold text-zinc-600 dark:text-zinc-300">
                    Observação {isSale ? '(opcional)' : ''}
                  </span>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder={isSale ? 'Detalhes da venda…' : 'Detalhes do consumo…'}
                    className="w-full resize-y rounded-xl border-0 bg-zinc-100 px-3 py-2.5 text-[15px] outline-none focus:ring-2 focus:ring-emerald-500/30 dark:bg-black/20 dark:text-white"
                  />
                </label>

                {submitError ? (
                  <p className="mt-3 rounded-xl border-0 bg-red-50 shadow-none px-3 py-2 text-[13px] text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                    {submitError}
                  </p>
                ) : null}
                {successMsg ? (
                  <p className="mt-3 rounded-xl border-0 bg-emerald-50 shadow-none px-3 py-2 text-[13px] text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200">
                    {successMsg}
                  </p>
                ) : null}

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleConfirm()}
                    className={`inline-flex w-auto items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-white shadow-none disabled:opacity-60 ${
                      isSale ? 'bg-violet-600 hover:bg-violet-500' : 'bg-sky-600 hover:bg-sky-500'
                    }`}
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {isSale ? 'Confirmar venda' : 'Confirmar consumo'}
                  </button>
                </div>
              </section>
            ) : (
              <p className="rounded-2xl border-0 bg-zinc-100 px-4 py-8 text-center text-[14px] text-zinc-500 shadow-none dark:bg-white/5 dark:text-zinc-400">
                Use o código de barras, digite o nome do produto ou escolha na lista de sugestões.
              </p>
            )}

            <section className="space-y-2 pb-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[13px] font-bold uppercase tracking-wide text-zinc-500">
                  Últimas {isSale ? 'vendas' : 'consumos'}
                </h3>
                {loadingHistory ? <Loader2 className="h-4 w-4 animate-spin text-zinc-400" /> : null}
              </div>
              {history.length === 0 ? (
                <p className="text-[13px] text-zinc-500">Nenhum registro ainda.</p>
              ) : (
                <ul className="space-y-1.5">
                  {history.map((row) => (
                    <li
                      key={row.id}
                      className="rounded-xl border-0 bg-white px-3 py-3 text-[13px] shadow-none ring-1 ring-zinc-100 dark:bg-white/5 dark:ring-white/[0.06]"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block font-semibold text-zinc-900 dark:text-white">
                            {row.part_name || 'Produto'}
                          </span>
                          <span className="block text-[12px] text-zinc-500">
                            {formatWhen(row.created_at)}
                            {row.recorded_by_name ? ` · ${row.recorded_by_name}` : ''}
                          </span>
                        </span>
                        <div className="flex shrink-0 items-start gap-2">
                          <span className="text-right font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">
                            −{formatWorkshopPartQty(row.quantity)}
                            {isSale && row.total_amount != null ? (
                              <span className="block text-[12px] font-medium text-violet-700 dark:text-violet-300">
                                {moneyBRL(Number(row.total_amount))}
                              </span>
                            ) : null}
                          </span>
                          {!isSale ? (
                            <button
                              type="button"
                              title="Cancelar consumo"
                              onClick={() => {
                                setCancelError(null);
                                setCancelTarget(row);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12px] font-semibold text-red-600 hover:bg-red-500/10"
                              aria-label="Cancelar consumo"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Cancelar
                            </button>
                          ) : null}
                        </div>
                      </div>
                      {row.notes?.trim() ? (
                        <p className="mt-1.5 whitespace-pre-line rounded-lg bg-zinc-50 px-2.5 py-1.5 text-[12px] leading-snug text-zinc-600 dark:bg-white/[0.04] dark:text-zinc-300">
                          {row.notes.trim()}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>

      <StockGuardPasswordModal
        open={Boolean(cancelTarget)}
        title="Cancelar consumo"
        subtitle="A quantidade voltará ao estoque. Informe a senha da Gerência ou a senha de proteção do estoque."
        confirmLabel="Cancelar consumo"
        busy={cancelBusy}
        error={cancelError}
        onClose={() => {
          if (cancelBusy) return;
          setCancelTarget(null);
          setCancelError(null);
        }}
        onConfirm={handleCancelMovement}
      />
    </RegistrationPortal>
  );
}
