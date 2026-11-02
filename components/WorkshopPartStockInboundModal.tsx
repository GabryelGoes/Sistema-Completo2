import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  Check,
  Loader2,
  Minus,
  PackagePlus,
  Plus,
  Search,
  X,
} from 'lucide-react';
import {
  getWorkshopSuppliers,
  receiveWorkshopPartStock,
  type WorkshopPart,
  type WorkshopSupplier,
} from '../services/apiService';
import { formatWorkshopPartQty, parseWorkshopPartQtyInt } from '../utils/workshopPartStock';
import { filterSuppliers, supplierDisplayName } from '../utils/workshopSuppliers';
import { storageSiteLabel } from '../utils/workshopPartFields';
import { getStoredAuth } from './views/LoginView';
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
  onOpenFullEdit?: (part: WorkshopPart) => void;
  /** Abre o cadastro de fornecedores (opcional). */
  onOpenSuppliers?: () => void;
};

function parseMoneyInput(raw: string): number | null {
  const t = String(raw ?? '').trim().replace(/\s/g, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function formatMoneyDisplay(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

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
  onOpenSuppliers,
}: WorkshopPartStockInboundModalProps) {
  const isDesktopShell = useDesktopShellLayout();
  const [part, setPart] = useState<WorkshopPart>(initialPart);
  const [receiveQty, setReceiveQty] = useState(1);
  const [nfeNumber, setNfeNumber] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [productTotal, setProductTotal] = useState('');
  const [invoiceTotal, setInvoiceTotal] = useState('');
  const [productTotalTouched, setProductTotalTouched] = useState(false);
  const [updatePartCost, setUpdatePartCost] = useState(false);
  const [notes, setNotes] = useState('');
  const [supplierQuery, setSupplierQuery] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState<WorkshopSupplier | null>(null);
  const [suppliers, setSuppliers] = useState<WorkshopSupplier[]>([]);
  const [supplierMenuOpen, setSupplierMenuOpen] = useState(false);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const supplierBoxRef = useRef<HTMLDivElement | null>(null);

  useBrowserBackLayer(isOpen, onClose);

  const unit = part.unit_of_measure || 'UN';
  const projectedAfterReceive = useMemo(
    () => parseWorkshopPartQtyInt(part.stock_qty) + Math.max(0, receiveQty),
    [part.stock_qty, receiveQty]
  );

  const unitCostNumber = parseMoneyInput(unitCost) ?? 0;
  const autoProductTotal = Math.round(unitCostNumber * Math.max(0, receiveQty) * 100) / 100;
  const productTotalNumber = productTotalTouched
    ? parseMoneyInput(productTotal) ?? autoProductTotal
    : autoProductTotal;
  const invoiceTotalNumber = parseMoneyInput(invoiceTotal);

  const suggestedSuppliers = useMemo(
    () => filterSuppliers(suppliers, supplierQuery, { activeOnly: true }).slice(0, 8),
    [suppliers, supplierQuery]
  );

  const reloadSuppliers = useCallback(async () => {
    setLoadingSuppliers(true);
    try {
      const rows = await getWorkshopSuppliers({ activeOnly: true });
      setSuppliers(rows);
    } catch {
      setSuppliers([]);
    } finally {
      setLoadingSuppliers(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setPart(initialPart);
    setReceiveQty(1);
    setNfeNumber('');
    setUnitCost('');
    setProductTotal('');
    setInvoiceTotal('');
    setProductTotalTouched(false);
    setUpdatePartCost(false);
    setNotes('');
    setSupplierQuery('');
    setSelectedSupplier(null);
    setSupplierMenuOpen(false);
    setError(null);
    setSuccess(null);
    void reloadSuppliers();
  }, [isOpen, initialPart, reloadSuppliers]);

  useEffect(() => {
    if (!productTotalTouched) {
      setProductTotal(autoProductTotal > 0 ? autoProductTotal.toFixed(2) : '');
    }
  }, [autoProductTotal, productTotalTouched]);

  useEffect(() => {
    if (!supplierMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!supplierBoxRef.current?.contains(e.target as Node)) {
        setSupplierMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [supplierMenuOpen]);

  const applyPartUpdate = useCallback(
    (updated: WorkshopPart) => {
      setPart(updated);
      onStockChanged(updated);
    },
    [onStockChanged]
  );

  const pickSupplier = (s: WorkshopSupplier) => {
    setSelectedSupplier(s);
    setSupplierQuery(supplierDisplayName(s));
    setSupplierMenuOpen(false);
  };

  const clearSupplier = () => {
    setSelectedSupplier(null);
    setSupplierQuery('');
  };

  const handleReceive = useCallback(async () => {
    const add = Math.max(0, Math.round(receiveQty));
    if (!(add > 0)) {
      setError('Informe a quantidade recebida.');
      return;
    }
    if (unitCost && parseMoneyInput(unitCost) == null) {
      setError('Custo por unidade inválido.');
      return;
    }
    if (productTotalTouched && productTotal && parseMoneyInput(productTotal) == null) {
      setError('Valor total do produto inválido.');
      return;
    }
    if (invoiceTotal && parseMoneyInput(invoiceTotal) == null) {
      setError('Valor total da nota inválido.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const auth = getStoredAuth();
      const recordedBy =
        auth?.displayName?.trim() ||
        auth?.username?.trim() ||
        (auth?.role === 'admin' ? 'Gerência' : null);

      const freeSupplierName =
        !selectedSupplier && supplierQuery.trim() ? supplierQuery.trim() : null;

      const result = await receiveWorkshopPartStock(part.id, {
        quantity: add,
        unit_cost: unitCostNumber,
        product_total: productTotalNumber,
        invoice_total: invoiceTotalNumber,
        nfe_number: nfeNumber.trim() || null,
        supplier_id: selectedSupplier?.id ?? null,
        supplier_name: selectedSupplier
          ? supplierDisplayName(selectedSupplier)
          : freeSupplierName,
        notes: notes.trim() || null,
        recorded_by_name: recordedBy,
        update_part_cost: updatePartCost,
      });

      const updated: WorkshopPart = {
        ...part,
        stock_qty: Number(result.part.stock_qty),
        unit_price: Number(result.part.unit_price ?? part.unit_price),
      };
      applyPartUpdate(updated);
      setReceiveQty(1);
      setNfeNumber('');
      setUnitCost('');
      setProductTotal('');
      setInvoiceTotal('');
      setProductTotalTouched(false);
      setNotes('');
      clearSupplier();
      setSuccess(
        `Recebimento registrado · estoque agora ${formatWorkshopPartQty(updated.stock_qty)} ${unit}`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao registrar recebimento.');
    } finally {
      setSaving(false);
    }
  }, [
    applyPartUpdate,
    invoiceTotal,
    invoiceTotalNumber,
    nfeNumber,
    notes,
    part,
    productTotal,
    productTotalNumber,
    productTotalTouched,
    receiveQty,
    selectedSupplier,
    supplierQuery,
    unit,
    unitCost,
    unitCostNumber,
    updatePartCost,
  ]);

  if (!isOpen) return null;

  const overlayClass = resolveIosModalOverlayClass(isDesktopShell, NESTED_STOCK_OVERLAY_Z);

  return (
    <RegistrationPortal>
      <div className={overlayClass} role="dialog" aria-modal="true" aria-label="Registrar recebimento">
        <div
          className={`flex w-full flex-col overflow-hidden rounded-[1.75rem] border-0 bg-zinc-50 shadow-none dark:bg-zinc-950 ${
            isDesktopShell
              ? 'h-[min(78vh,640px)] max-w-6xl'
              : 'max-h-[min(92vh,720px)] max-w-5xl'
          }`}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200/80 px-5 py-3.5 dark:border-white/10 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl p-2 text-zinc-600 hover:bg-zinc-200/70 dark:text-zinc-300 dark:hover:bg-white/10"
                aria-label="Voltar"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
                <PackagePlus className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="text-[17px] font-bold text-zinc-900 dark:text-white">
                  Registrar recebimento
                </h2>
                <p className="truncate text-[12px] text-zinc-500 dark:text-zinc-400">
                  Entrada de mercadoria com NF-e e fornecedor
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

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 custom-scrollbar sm:px-6">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)] lg:items-start">
              {/* Coluna esquerda: produto + quantidade */}
              <div className="space-y-4">
                <section className="rounded-2xl border-0 bg-white p-4 dark:bg-white/5">
                  <div className="flex gap-3">
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-800">
                      {part.photo_url ? (
                        <PartPhotoImg
                          src={part.photo_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[11px] font-bold text-zinc-400">
                          Sem foto
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[16px] font-bold text-zinc-900 dark:text-white">
                        {part.name}
                      </p>
                      <p className="text-[13px] text-zinc-500">
                        {[part.brand, part.barcode || part.original_code || part.numeric_code]
                          .filter(Boolean)
                          .join(' · ') || 'Sem código'}
                      </p>
                      <p className="mt-1 text-[12px] text-zinc-500">
                        {[storageSiteLabel(part.storage_site), part.location]
                          .filter(Boolean)
                          .join(' · ') || 'Local não informado'}
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

                  <div className="mt-3 rounded-2xl bg-emerald-600 px-4 py-3 text-white">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] opacity-90">
                      Quantidade em estoque
                    </p>
                    <p className="mt-1 text-[1.85rem] font-bold tabular-nums leading-none">
                      {formatWorkshopPartQty(part.stock_qty)}
                      <span className="ml-2 text-[0.95rem] font-semibold opacity-90">{unit}</span>
                    </p>
                  </div>
                </section>

                <section className="space-y-3 rounded-2xl border-0 bg-white p-4 dark:bg-white/5">
                  <h3 className="text-[13px] font-bold uppercase tracking-wide text-zinc-500">
                    Quantidade recebida
                  </h3>
                  <IntStepper
                    label="Quantidade"
                    value={receiveQty}
                    onChange={setReceiveQty}
                    min={0}
                    disabled={saving}
                    emphasize
                  />
                  <p className="text-[13px] text-zinc-600 dark:text-zinc-300">
                    Após confirmar: estoque passa a{' '}
                    <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                      {formatWorkshopPartQty(projectedAfterReceive)} {unit}
                    </span>
                  </p>
                </section>
              </div>

              {/* Coluna direita: NF-e / fornecedor / valores */}
              <section className="space-y-3 rounded-2xl border-0 bg-white p-4 dark:bg-white/5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[13px] font-bold uppercase tracking-wide text-zinc-500">
                    Dados da compra / NF-e
                  </h3>
                  {onOpenSuppliers ? (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenSuppliers();
                        void reloadSuppliers();
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                    >
                      <Building2 className="h-3.5 w-3.5" />
                      Fornecedores
                    </button>
                  ) : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                      Número da NF-e
                    </span>
                    <input
                      type="text"
                      value={nfeNumber}
                      disabled={saving}
                      onChange={(e) => setNfeNumber(e.target.value)}
                      placeholder="Ex.: 123456"
                      className="w-full rounded-xl border-0 bg-zinc-100 px-3 py-2.5 text-[14px] outline-none focus:ring-2 focus:ring-emerald-500/30 dark:bg-black/20 dark:text-white"
                    />
                  </label>

                  <div ref={supplierBoxRef} className="relative space-y-1.5 sm:col-span-1">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                      Fornecedor
                    </span>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                      <input
                        type="text"
                        value={supplierQuery}
                        disabled={saving}
                        onFocus={() => setSupplierMenuOpen(true)}
                        onChange={(e) => {
                          setSupplierQuery(e.target.value);
                          setSelectedSupplier(null);
                          setSupplierMenuOpen(true);
                        }}
                        placeholder="Buscar ou digitar…"
                        className="w-full rounded-xl border-0 bg-zinc-100 py-2.5 pl-9 pr-10 text-[14px] outline-none focus:ring-2 focus:ring-emerald-500/30 dark:bg-black/20 dark:text-white"
                        autoComplete="off"
                      />
                      {supplierQuery || selectedSupplier ? (
                        <button
                          type="button"
                          onClick={clearSupplier}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-zinc-400 hover:bg-zinc-200/80 hover:text-zinc-700 dark:hover:bg-white/10"
                          aria-label="Limpar fornecedor"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                    {selectedSupplier ? (
                      <p className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                        <Check className="h-3.5 w-3.5" />
                        Do cadastro
                        {selectedSupplier.document ? ` · ${selectedSupplier.document}` : ''}
                      </p>
                    ) : (
                      <p className="text-[11px] text-zinc-500">
                        Sugestões do cadastro ou nome livre.
                        {loadingSuppliers ? ' Carregando…' : ''}
                      </p>
                    )}
                    {supplierMenuOpen && suggestedSuppliers.length > 0 ? (
                      <ul className="absolute z-20 mt-1 max-h-40 w-full overflow-y-auto rounded-xl border-0 bg-white py-1 shadow-lg dark:bg-zinc-900">
                        {suggestedSuppliers.map((s) => (
                          <li key={s.id}>
                            <button
                              type="button"
                              onClick={() => pickSupplier(s)}
                              className="flex w-full flex-col items-start px-3 py-2.5 text-left hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                            >
                              <span className="text-[14px] font-semibold text-zinc-900 dark:text-white">
                                {supplierDisplayName(s)}
                              </span>
                              <span className="text-[11px] text-zinc-500">
                                {[s.document, s.address_city, s.phone].filter(Boolean).join(' · ') ||
                                  'Sem detalhes'}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>

                  <label className="block space-y-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                      Custo por unidade (R$)
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={unitCost}
                      disabled={saving}
                      onChange={(e) => setUnitCost(e.target.value)}
                      placeholder="0,00"
                      className="w-full rounded-xl border-0 bg-zinc-100 px-3 py-2.5 text-[14px] tabular-nums outline-none focus:ring-2 focus:ring-emerald-500/30 dark:bg-black/20 dark:text-white"
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                      Valor deste produto (R$)
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={productTotal}
                      disabled={saving}
                      onChange={(e) => {
                        setProductTotalTouched(true);
                        setProductTotal(e.target.value);
                      }}
                      placeholder="qtd × custo"
                      className="w-full rounded-xl border-0 bg-zinc-100 px-3 py-2.5 text-[14px] tabular-nums outline-none focus:ring-2 focus:ring-emerald-500/30 dark:bg-black/20 dark:text-white"
                    />
                    <p className="text-[11px] text-zinc-500">
                      Calculado: {formatMoneyDisplay(autoProductTotal)}
                      {productTotalTouched ? ' · editado' : ''}
                    </p>
                  </label>
                  <label className="block space-y-1.5 sm:col-span-2">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                      Valor total da NF-e (R$)
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={invoiceTotal}
                      disabled={saving}
                      onChange={(e) => setInvoiceTotal(e.target.value)}
                      placeholder="Opcional — quando a nota tem outros itens"
                      className="w-full rounded-xl border-0 bg-zinc-100 px-3 py-2.5 text-[14px] tabular-nums outline-none focus:ring-2 focus:ring-emerald-500/30 dark:bg-black/20 dark:text-white"
                    />
                  </label>
                </div>

                <label className="flex items-center gap-2.5 rounded-xl bg-zinc-50 px-3 py-2.5 dark:bg-white/[0.04]">
                  <input
                    type="checkbox"
                    checked={updatePartCost}
                    disabled={saving || unitCostNumber <= 0}
                    onChange={(e) => setUpdatePartCost(e.target.checked)}
                    className="h-4 w-4 accent-emerald-600"
                  />
                  <span className="text-[13px] font-medium text-zinc-700 dark:text-zinc-200">
                    Atualizar preço de custo do produto com este valor unitário
                  </span>
                </label>

                <label className="block space-y-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                    Observações
                  </span>
                  <textarea
                    value={notes}
                    disabled={saving}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="Opcional"
                    className="w-full resize-none rounded-xl border-0 bg-zinc-100 px-3 py-2.5 text-[14px] outline-none focus:ring-2 focus:ring-emerald-500/30 dark:bg-black/20 dark:text-white"
                  />
                </label>
              </section>
            </div>

            {(error || success) && (
              <div className="mt-4">
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

          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-zinc-200/70 px-5 py-3.5 dark:border-white/10 sm:px-6">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-[14px] font-semibold text-zinc-600 hover:bg-zinc-200/70 dark:text-zinc-300 dark:hover:bg-white/10"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving || receiveQty <= 0}
              onClick={() => void handleReceive()}
              className="inline-flex min-w-[12rem] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
              {saving ? 'Registrando…' : 'Confirmar recebimento'}
            </button>
          </div>
        </div>
      </div>
    </RegistrationPortal>
  );
}
