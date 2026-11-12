import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Minus, PackagePlus, Plus, Search, X } from 'lucide-react';
import type { WorkshopPart } from '../../services/apiService';
import { getWorkshopParts } from '../../services/apiService';
import {
  findWorkshopPartByCode,
  normalizeBarcodeInput,
  searchWorkshopPartsByText,
} from '../../utils/workshopPartBarcode';
import { formatWorkshopPartQty } from '../../utils/workshopPartStock';
import { PartPhotoImg } from '../ui/PartPhotoImg';
import { ModalPortal } from '../ui/ModalPortal';
import { useDesktopShellLayout } from '../ui/DesktopShellContext';
import {
  iosModalShell,
  NESTED_STOCK_OVERLAY_Z,
  resolveIosModalOverlayClass,
} from '../ui/iosModalStyles';
import { patioOsSecModalPcClass, usePatioOsPcLayout } from './PatioOsPcLayoutContext';

export type VehicleOsStockManualAddPopoverProps = {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  onAdd: (part: WorkshopPart, quantity: number) => Promise<boolean>;
};

/**
 * Janelinha para retirar peça do estoque digitando código ou nome (com sugestões).
 * Permite quantidade > 1 do mesmo produto.
 */
export const VehicleOsStockManualAddPopover: React.FC<VehicleOsStockManualAddPopoverProps> = ({
  open,
  onClose,
  busy,
  onAdd,
}) => {
  const isDesktopShell = useDesktopShellLayout();
  const patioOsPcLayout = usePatioOsPcLayout();
  const [catalog, setCatalog] = useState<WorkshopPart[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<WorkshopPart | null>(null);
  const [qty, setQty] = useState(1);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(null);
    setQty(1);
    setLocalError(null);
    let cancelled = false;
    setCatalogLoading(true);
    void getWorkshopParts()
      .then((list) => {
        if (!cancelled) setCatalog(list);
      })
      .catch(() => {
        if (!cancelled) setCatalog([]);
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    const t = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [open]);

  const suggestions = useMemo(() => {
    const q = query.trim();
    if (!q) return [] as WorkshopPart[];
    const byCode = findWorkshopPartByCode(catalog, q);
    const byText = searchWorkshopPartsByText(catalog, q, 10);
    if (!byCode) return byText;
    return [byCode, ...byText.filter((p) => p.id !== byCode.id)].slice(0, 10);
  }, [catalog, query]);

  const maxQty = selected ? Math.max(0, Math.floor(Number(selected.stock_qty ?? 0))) : 0;

  const selectPart = (part: WorkshopPart) => {
    setSelected(part);
    setLocalError(null);
    const stock = Math.max(0, Math.floor(Number(part.stock_qty ?? 0)));
    setQty(stock >= 1 ? 1 : 0);
  };

  const handleAdd = async () => {
    if (!selected) {
      setLocalError('Escolha um produto na lista.');
      return;
    }
    if (qty < 1) {
      setLocalError('Informe a quantidade.');
      return;
    }
    if (qty > maxQty) {
      setLocalError(`Estoque insuficiente (disponível: ${formatWorkshopPartQty(maxQty)}).`);
      return;
    }
    setLocalError(null);
    const ok = await onAdd(selected, qty);
    if (!ok) return;
    // Mantém aberto para repetir / acrescentar mais do mesmo (ou outro).
    setCatalog((prev) =>
      prev.map((p) =>
        p.id === selected.id
          ? { ...p, stock_qty: Math.max(0, Number(p.stock_qty ?? 0) - qty) }
          : p
      )
    );
    setSelected((prev) =>
      prev && prev.id === selected.id
        ? { ...prev, stock_qty: Math.max(0, Number(prev.stock_qty ?? 0) - qty) }
        : prev
    );
    setQty(1);
    setQuery('');
    window.setTimeout(() => inputRef.current?.focus(), 30);
  };

  const tryExactCodeOrFirst = async () => {
    const code = normalizeBarcodeInput(query);
    if (!code) return;
    const exact = findWorkshopPartByCode(catalog, code);
    if (exact) {
      selectPart(exact);
      return;
    }
    if (suggestions.length === 1) {
      selectPart(suggestions[0]!);
      return;
    }
    if (suggestions.length === 0) {
      setLocalError(`Nenhum produto para “${query.trim()}”.`);
    }
  };

  if (!open) return null;

  // Mesmo empilhamento do modal “Peças do orçamento” — z-[80] ficava atrás do modal do veículo.
  const overlayClass = resolveIosModalOverlayClass(isDesktopShell, NESTED_STOCK_OVERLAY_Z);

  return (
    <ModalPortal onRequestClose={busy ? undefined : onClose} forceBody>
      <div
        className={patioOsSecModalPcClass(
          patioOsPcLayout,
          `${overlayClass} animate-in fade-in duration-150 patio-os-sec-overlay`
        )}
        data-patio-os-sec-role={patioOsPcLayout ? 'overlay' : undefined}
        onClick={() => {
          if (!busy) onClose();
        }}
        role="presentation"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="vehicle-os-stock-manual-add-title"
          className={patioOsSecModalPcClass(
            patioOsPcLayout,
            `${iosModalShell} flex max-h-[min(88dvh,560px)] w-full max-w-md flex-col patio-os-sec-shell`
          )}
          data-patio-os-sec-role={patioOsPcLayout ? 'shell' : undefined}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="patio-os-sec-header flex items-center justify-between gap-2 border-b border-zinc-200/80 px-3 py-2.5 dark:border-white/10">
            <div className="min-w-0">
              <p
                id="vehicle-os-stock-manual-add-title"
                className="patio-os-sec-title text-[14px] font-semibold text-zinc-900 dark:text-white"
              >
                Adicionar do estoque
              </p>
              <p className="mt-0.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                Digite o código ou o nome do produto
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 disabled:opacity-50 dark:hover:bg-white/10 dark:hover:text-zinc-200"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" strokeWidth={2.2} />
            </button>
          </div>

          <div className="space-y-3 px-3 py-3">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                strokeWidth={2.2}
                aria-hidden
              />
              <input
                ref={inputRef}
                type="text"
                value={query}
                disabled={busy || catalogLoading}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLocalError(null);
                  if (selected) setSelected(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void tryExactCodeOrFirst();
                  }
                }}
                placeholder="Código de barras ou nome…"
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2.5 pl-9 pr-3 text-[14px] text-zinc-900 outline-none ring-[#007AFF]/30 placeholder:text-zinc-400 focus:border-[#007AFF]/50 focus:bg-white focus:ring-2 dark:border-white/15 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-zinc-500"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>

            {catalogLoading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-[13px] text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando estoque…
              </div>
            ) : query.trim() ? (
              suggestions.length === 0 ? (
                <p className="rounded-xl border border-dashed border-zinc-300/90 px-3 py-4 text-center text-[12px] text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                  Nenhum produto encontrado.
                </p>
              ) : (
                <ul className="max-h-[min(240px,36vh)] space-y-1 overflow-y-auto overscroll-contain custom-scrollbar">
                  {suggestions.map((part) => {
                    const active = selected?.id === part.id;
                    const stock = Number(part.stock_qty ?? 0);
                    return (
                      <li key={part.id}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => selectPart(part)}
                          className={`flex w-full items-center gap-2.5 rounded-xl border px-2 py-2 text-left transition-colors ${
                            active
                              ? 'border-[#007AFF]/45 bg-[#007AFF]/10 dark:border-[#007AFF]/50 dark:bg-[#007AFF]/15'
                              : 'border-transparent hover:border-zinc-200 hover:bg-zinc-50 dark:hover:border-white/10 dark:hover:bg-white/[0.04]'
                          }`}
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-zinc-200/80 bg-zinc-50 dark:border-white/10 dark:bg-white/[0.04]">
                            {part.photo_url ? (
                              <PartPhotoImg
                                src={part.photo_url}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <PackagePlus className="h-4 w-4 text-zinc-400" aria-hidden />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-semibold text-zinc-900 dark:text-white">
                              {part.name}
                            </p>
                            <p className="mt-0.5 truncate text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
                              {part.barcode || part.original_code || part.numeric_code || '—'}
                              {' · '}
                              estoque {formatWorkshopPartQty(stock)}
                              {part.unit_of_measure ? ` ${part.unit_of_measure}` : ''}
                            </p>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )
            ) : (
              <p className="rounded-xl border border-dashed border-zinc-300/90 px-3 py-4 text-center text-[12px] text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                Comece a digitar para ver sugestões.
              </p>
            )}

            {selected ? (
              <div className="rounded-xl border border-zinc-200/90 bg-zinc-50/90 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.03]">
                <p className="truncate text-[13px] font-semibold text-zinc-900 dark:text-white">
                  {selected.name}
                </p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-1 rounded-xl border border-zinc-200 bg-white p-0.5 dark:border-white/15 dark:bg-zinc-900">
                    <button
                      type="button"
                      disabled={busy || qty <= 1}
                      onClick={() => setQty((n) => Math.max(1, n - 1))}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-white/10"
                      aria-label="Diminuir quantidade"
                    >
                      <Minus className="h-3.5 w-3.5" strokeWidth={2.4} />
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={String(qty)}
                      disabled={busy}
                      onChange={(e) => {
                        const n = Number(e.target.value.replace(/\D/g, ''));
                        if (!Number.isFinite(n)) return;
                        setQty(Math.max(1, Math.min(maxQty || 1, n)));
                      }}
                      className="w-10 bg-transparent text-center text-[14px] font-semibold tabular-nums text-zinc-900 outline-none dark:text-white"
                      aria-label="Quantidade"
                    />
                    <button
                      type="button"
                      disabled={busy || qty >= maxQty}
                      onClick={() => setQty((n) => Math.min(maxQty, n + 1))}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-white/10"
                      aria-label="Aumentar quantidade"
                    >
                      <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={busy || qty < 1 || maxQty < 1}
                    onClick={() => void handleAdd()}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#007AFF] px-3 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-[#0066d6] disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <PackagePlus className="h-3.5 w-3.5" strokeWidth={2.4} />
                    )}
                    Adicionar
                  </button>
                </div>
                {maxQty < 1 ? (
                  <p className="mt-1.5 text-[11px] font-semibold text-red-600 dark:text-red-300">
                    Sem estoque disponível.
                  </p>
                ) : (
                  <p className="mt-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                    Disponível: {formatWorkshopPartQty(maxQty)}
                    {selected.unit_of_measure ? ` ${selected.unit_of_measure}` : ''}
                  </p>
                )}
              </div>
            ) : null}

            {localError ? (
              <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[12px] font-semibold text-red-700 dark:text-red-300">
                {localError}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
