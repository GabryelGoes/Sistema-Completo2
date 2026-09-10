import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, PackageMinus, Search, ShoppingBag, X } from 'lucide-react';
import {
  createWorkshopPartStockMovement,
  getWorkshopPartStockMovements,
  lookupWorkshopPartByCode,
  type WorkshopPart,
  type WorkshopPartStockMovement,
  type WorkshopPartStockMovementType,
} from '../services/apiService';
import { formatWorkshopPartQty } from '../utils/workshopPartStock';
import { stockMovementTypeLabel } from '../utils/workshopPartStockOutbound';
import { searchWorkshopPartsByText } from '../utils/workshopPartBarcode';
import { getStoredAuth } from './views/LoginView';
import { BarcodeScanField } from './BarcodeScanField';
import { PartPhotoImg } from './ui/PartPhotoImg';
import { RegistrationPortal } from './ui/RegistrationPortal';
import { resolveIosModalOverlayClass, NESTED_STOCK_OVERLAY_Z } from './ui/iosModalStyles';
import { useDesktopShellLayout } from './ui/DesktopShellContext';
import { useBrowserBackLayer } from './ui/BackNavigationContext';

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
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [missingBarcode, setMissingBarcode] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<WorkshopPartStockMovement[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

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

  const qtyNumber = useMemo(() => {
    const n = Number(String(qty).replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }, [qty]);

  const priceNumber = useMemo(() => {
    const n = Number(String(unitPrice).replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }, [unitPrice]);

  const totalPreview = isSale && qtyNumber > 0 ? priceNumber * qtyNumber : null;

  const nameMatches = useMemo(
    () => searchWorkshopPartsByText(catalogParts, nameQuery, 15),
    [catalogParts, nameQuery]
  );

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
        // Fallback: se digitou texto (não só dígitos), tenta achar por nome no catálogo.
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

      const result = await createWorkshopPartStockMovement({
        movement_type: mode,
        part_id: part.id,
        quantity: qtyNumber,
        unit_price: isSale ? priceNumber : null,
        notes: notes.trim() || null,
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
      setQty('1');
      setNotes('');
      await loadHistory();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Não foi possível registrar.');
    } finally {
      setSaving(false);
    }
  }, [
    code,
    isSale,
    loadHistory,
    mode,
    notes,
    onStockChanged,
    part,
    priceNumber,
    qtyNumber,
  ]);

  if (!isOpen) return null;

  const overlayClass = resolveIosModalOverlayClass(isDesktopShell, NESTED_STOCK_OVERLAY_Z);
  const showNameList = nameQuery.trim().length > 0 && (!part || nameQuery.trim() !== part.name);

  return (
    <RegistrationPortal>
      <div className={overlayClass} role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex max-h-[min(920px,94vh)] w-full max-w-2xl flex-col overflow-hidden rounded-[1.75rem] border-0 bg-zinc-50 shadow-none dark:bg-zinc-950">
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
                      isSale ? 'bg-emerald-600 text-white' : 'bg-sky-600 text-white'
                    }`}
                  >
                    {isSale ? <ShoppingBag className="h-5 w-5" /> : <PackageMinus className="h-5 w-5" />}
                  </span>
                  <h2 className="text-[18px] font-bold text-zinc-900 dark:text-white">{title}</h2>
                </div>
                <p className="mt-1 text-[13px] text-zinc-500 dark:text-zinc-400">
                  {isSale
                    ? 'Baixa automática · código, nome ou lista'
                    : 'Insumo / consumo · código, nome ou lista'}
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
                <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 dark:border-red-900/50 dark:bg-red-950/40">
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
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-1.5">
                    <span className="text-[12px] font-semibold text-zinc-600 dark:text-zinc-300">
                      Quantidade
                    </span>
                    <input
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={qty}
                      onChange={(e) => setQty(e.target.value)}
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

                <label className="mt-3 block space-y-1.5">
                  <span className="text-[12px] font-semibold text-zinc-600 dark:text-zinc-300">
                    Observação (opcional)
                  </span>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={isSale ? 'Cliente, NF…' : 'Bancada, OS interna…'}
                    className="w-full rounded-xl border-0 bg-zinc-100 px-3 py-2.5 text-[15px] outline-none focus:ring-2 focus:ring-emerald-500/30 dark:bg-black/20 dark:text-white"
                  />
                </label>

                {submitError ? (
                  <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                    {submitError}
                  </p>
                ) : null}
                {successMsg ? (
                  <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200">
                    {successMsg}
                  </p>
                ) : null}

                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleConfirm()}
                  className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-[15px] font-semibold text-white shadow-md disabled:opacity-60 ${
                    isSale
                      ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/20'
                      : 'bg-sky-600 hover:bg-sky-500 shadow-sky-900/20'
                  }`}
                >
                  {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                  {isSale ? 'Confirmar venda e baixar estoque' : 'Confirmar consumo e baixar estoque'}
                </button>
              </section>
            ) : (
              <p className="rounded-2xl border border-dashed border-zinc-300 px-4 py-8 text-center text-[14px] text-zinc-500 dark:border-white/15 dark:text-zinc-400">
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
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-0 bg-white/80 px-3 py-2.5 text-[13px] dark:bg-white/5"
                    >
                      <span className="min-w-0">
                        <span className="block font-semibold text-zinc-900 dark:text-white">
                          {row.part_name || 'Produto'}
                        </span>
                        <span className="block text-[12px] text-zinc-500">
                          {formatWhen(row.created_at)}
                          {row.recorded_by_name ? ` · ${row.recorded_by_name}` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 text-right font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">
                        −{formatWorkshopPartQty(row.quantity)}
                        {isSale && row.total_amount != null ? (
                          <span className="block text-[12px] font-medium text-emerald-700 dark:text-emerald-300">
                            {moneyBRL(Number(row.total_amount))}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>
    </RegistrationPortal>
  );
}
