import React, { useEffect, useMemo, useRef } from 'react';
import {
  BarChart3,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Command,
  History,
  Loader2,
  Package,
  Pencil,
  Plus,
  QrCode,
  ScanLine,
  Search,
  Tags,
  Trash2,
  X,
} from 'lucide-react';
import type { WorkshopPart, WorkshopPartCategory, WorkshopPartPendingReservation } from '../services/apiService';
import {
  formatWorkshopPartQty,
  formatWorkshopPartsCurrency,
  getWorkshopPartStockStatus,
  sumWorkshopPartsInventoryValue,
  type WorkshopPartSortMode,
} from '../utils/workshopPartStock';
import { storageSiteLabel } from '../utils/workshopPartFields';
import { PartPhotoImg } from './ui/PartPhotoImg';
import { WorkshopPartStockBadge } from './ui/WorkshopPartStockBadge';

export type WorkshopPartsHomeDashboardProps = {
  loading: boolean;
  error: string | null;
  parts: WorkshopPart[];
  filteredParts: WorkshopPart[];
  partsInCategoryScopeCount: number;
  partsAfterStockFilterEmpty: boolean;
  categories: WorkshopPartCategory[];
  categoryCounts: {
    counts: Map<string, number>;
    uncategorized: number;
    total: number;
  };
  stockAlerts: { zero: number; low: number };
  pendingReservations: WorkshopPartPendingReservation[];
  reservationsExpanded: boolean;
  onToggleReservations: () => void;
  reservedQtyByPartId: Record<string, number>;
  partNumberById: Map<string, number>;
  categoryFilter: string;
  categoryFilterLabel: string;
  categoryFilterOptions: { value: string; countLabel: string }[];
  categoryFilterMenuOpen: boolean;
  setCategoryFilterMenuOpen: (open: boolean | ((v: boolean) => boolean)) => void;
  categoryFilterDropdownRef: React.RefObject<HTMLDivElement | null>;
  onCategoryFilterChange: (value: string) => void;
  stockAlertFilter: 'all' | 'zero' | 'low' | 'alerts';
  onStockAlertFilterChange: (value: 'all' | 'zero' | 'low' | 'alerts') => void;
  partsSearchQuery: string;
  onPartsSearchQueryChange: (value: string) => void;
  sortMode: WorkshopPartSortMode;
  onSortModeChange: (mode: WorkshopPartSortMode) => void;
  categoryNamesForPart: (part: WorkshopPart) => string[];
  onOpenScan: () => void;
  onOpenAnalytics: () => void;
  onOpenCategories: () => void;
  /** Opcional: só aparece se o fluxo de módulos ABS estiver disponível nesta build. */
  onOpenAbsModules?: () => void;
  onAddPart: () => void;
  onOpenPart: (part: WorkshopPart) => void;
  onEditPart: (part: WorkshopPart) => void;
  onDeletePart: (id: string) => void;
  editingId: string | null;
  editingName: string;
  editingPrice: string;
  editingStock: string;
  onEditingNameChange: (v: string) => void;
  onEditingPriceChange: (v: string) => void;
  onEditingStockChange: (v: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
};

const actionBtnSecondary =
  'inline-flex items-center justify-center gap-2 rounded-2xl border-0 bg-zinc-100 px-4 py-3 text-[14px] font-semibold text-zinc-800 transition-colors hover:bg-zinc-200/90 dark:bg-white/5 dark:text-zinc-100 dark:hover:bg-white/10';
const actionBtnGreen =
  'inline-flex items-center justify-center gap-2 rounded-2xl border-0 bg-emerald-50 px-4 py-3 text-[14px] font-semibold text-emerald-800 transition-colors hover:bg-emerald-100/90 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-900/50';
const actionBtnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-2xl bg-[#0F7A4B] px-4 py-3 text-[14px] font-semibold text-white shadow-none transition-colors hover:bg-[#0c6a41]';

export function WorkshopPartsHomeDashboard({
  loading,
  error,
  parts,
  filteredParts,
  partsInCategoryScopeCount,
  partsAfterStockFilterEmpty,
  categories,
  categoryCounts,
  stockAlerts,
  pendingReservations,
  reservationsExpanded,
  onToggleReservations,
  reservedQtyByPartId,
  partNumberById,
  categoryFilter,
  categoryFilterLabel,
  categoryFilterOptions,
  categoryFilterMenuOpen,
  setCategoryFilterMenuOpen,
  categoryFilterDropdownRef,
  onCategoryFilterChange,
  stockAlertFilter,
  onStockAlertFilterChange,
  partsSearchQuery,
  onPartsSearchQueryChange,
  sortMode,
  onSortModeChange,
  categoryNamesForPart,
  onOpenScan,
  onOpenAnalytics,
  onOpenCategories,
  onOpenAbsModules,
  onAddPart,
  onOpenPart,
  onEditPart,
  onDeletePart,
  editingId,
  editingName,
  editingPrice,
  editingStock,
  onEditingNameChange,
  onEditingPriceChange,
  onEditingStockChange,
  onSaveEdit,
  onCancelEdit,
}: WorkshopPartsHomeDashboardProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);

  const inventoryValue = useMemo(() => sumWorkshopPartsInventoryValue(parts), [parts]);

  const showAllParts = () => {
    onCategoryFilterChange('all');
    onStockAlertFilterChange('all');
    onPartsSearchQueryChange('');
    setCategoryFilterMenuOpen(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'k') return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      e.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const gridCols =
    'lg:grid-cols-[minmax(14rem,2.2fr)_minmax(7rem,0.9fr)_minmax(7rem,0.9fr)_minmax(5.5rem,0.7fr)_minmax(5.5rem,0.7fr)_minmax(4.5rem,0.55fr)_minmax(7.5rem,0.9fr)_5.5rem]';

  /** Container com overflow: padding-bottom reserva faixa da scrollbar abaixo das pills. */
  const categoryScrollCls =
    'overflow-x-auto overflow-y-hidden pt-0.5 pb-2 [scrollbar-width:thin] [scrollbar-color:rgba(113,113,122,0.22)_transparent] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-400/20 hover:[&::-webkit-scrollbar-thumb]:bg-zinc-400/35 dark:[&::-webkit-scrollbar-thumb]:bg-white/15';

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-auto touch-pan-y px-4 pb-[max(2rem,env(safe-area-inset-bottom))] custom-scrollbar [scrollbar-gutter:stable] sm:px-6 lg:px-8">
      {/* Barra de ações — sobe e some ao rolar */}
      <div className="mb-5 flex flex-col gap-3 pt-1 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
        {!loading ? (
          <div className="min-w-0 w-full overflow-hidden rounded-2xl border-0 bg-amber-50/95 shadow-none dark:bg-amber-950/35 sm:max-w-md">
            <button
              type="button"
              onClick={onToggleReservations}
              className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
              aria-expanded={reservationsExpanded}
            >
              <span className="min-w-0 flex items-center gap-2.5">
                <span className="text-[15px] font-semibold text-amber-950 dark:text-amber-100">
                  Em Orçamentos
                </span>
                <span className="rounded-lg bg-amber-500/25 px-2 py-0.5 text-[12px] font-bold tabular-nums text-amber-950 dark:bg-amber-400/20 dark:text-amber-100">
                  {pendingReservations.length}
                </span>
              </span>
              <ChevronDown
                className={`h-5 w-5 shrink-0 text-amber-800 transition-transform dark:text-amber-200 ${
                  reservationsExpanded ? 'rotate-180' : ''
                }`}
                aria-hidden
              />
            </button>
            {reservationsExpanded ? (
              pendingReservations.length > 0 ? (
                <ul className="max-h-[min(280px,40vh)] space-y-1.5 overflow-y-auto border-t border-amber-200/70 px-3 py-3 dark:border-amber-500/20 custom-scrollbar">
                  {pendingReservations.map((row) => {
                    const vehicleBits = [
                      row.osNumber != null ? `OS #${row.osNumber}` : null,
                      row.plate,
                      row.vehicleModel,
                    ].filter(Boolean);
                    return (
                      <li
                        key={`${row.budgetId}-${row.workshopPartId ?? row.partName}-${row.serviceOrderId}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/80 px-3 py-2.5 text-[13px] dark:bg-black/25"
                      >
                        <span className="min-w-0">
                          <span className="block font-semibold text-zinc-900 dark:text-white">
                            {row.partName}
                          </span>
                          <span className="block text-[12px] text-zinc-500 dark:text-zinc-400">
                            {vehicleBits.length > 0 ? vehicleBits.join(' · ') : 'Veículo'}
                            {row.budgetCardName ? ` · ${row.budgetCardName}` : ''}
                          </span>
                        </span>
                        <span className="shrink-0 rounded-lg bg-amber-500/15 px-2.5 py-1 text-[13px] font-bold tabular-nums text-amber-950 dark:text-amber-100">
                          {row.quantityLabel} un.
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="border-t border-amber-200/70 px-4 py-3 text-[13px] text-amber-900/80 dark:border-amber-500/20 dark:text-amber-200/80">
                  Nenhum produto em orçamento aguardando baixa.
                </p>
              )
            ) : null}
          </div>
        ) : (
          <div className="min-w-0 w-full sm:max-w-md" />
        )}

        <div className="flex flex-wrap gap-2 justify-end shrink-0">
          <button type="button" onClick={onOpenScan} className={actionBtnGreen}>
            <ScanLine className="h-4 w-4" aria-hidden />
            Escanear código
          </button>
          <button type="button" onClick={onOpenAnalytics} className={actionBtnGreen}>
            <BarChart3 className="h-4 w-4" aria-hidden />
            Gráficos
          </button>
          <button type="button" onClick={onOpenCategories} className={actionBtnSecondary}>
            <Tags className="h-4 w-4" aria-hidden />
            Categorias
          </button>
          {onOpenAbsModules ? (
            <button type="button" onClick={onOpenAbsModules} className={actionBtnSecondary}>
              <QrCode className="h-4 w-4" aria-hidden />
              Módulos ABS
            </button>
          ) : null}
          <button type="button" onClick={onAddPart} className={actionBtnPrimary}>
            <Plus className="h-4 w-4" aria-hidden />
            Adicionar peça
          </button>
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-xl border-0 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-none dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {/* KPIs — sobem e somem ao rolar */}
      {!loading && parts.length > 0 ? (
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <button
            type="button"
            onClick={showAllParts}
            className={`flex items-center gap-3 rounded-2xl border-0 px-4 py-3.5 text-left shadow-none transition-colors ${
              categoryFilter === 'all' && stockAlertFilter === 'all' && !partsSearchQuery.trim()
                ? 'bg-emerald-50 ring-2 ring-emerald-500/35 dark:bg-emerald-950/40'
                : 'bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800/80'
            }`}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700 dark:bg-white/10 dark:text-zinc-200">
              <Package className="h-5 w-5" strokeWidth={2} aria-hidden />
            </span>
            <span className="min-w-0 flex-1 text-[14px] font-semibold leading-snug text-zinc-900 dark:text-white">
              <span className="tabular-nums">{categoryCounts.total}</span>{' '}
              {categoryCounts.total === 1 ? 'peça no estoque' : 'peças no estoque'}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
          </button>

          <button
            type="button"
            onClick={() => onStockAlertFilterChange(stockAlertFilter === 'zero' ? 'all' : 'zero')}
            className={`flex items-center gap-3 rounded-2xl border-0 px-4 py-3.5 text-left shadow-none transition-colors ${
              stockAlertFilter === 'zero'
                ? 'bg-amber-100 ring-2 ring-amber-400/50 dark:bg-amber-950/50'
                : 'bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800/80'
            }`}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
              <AlertTriangle className="h-5 w-5" strokeWidth={2} aria-hidden />
            </span>
            <span className="min-w-0 flex-1 text-[14px] font-semibold text-zinc-900 dark:text-white">
              <span className="tabular-nums">{stockAlerts.zero}</span> sem estoque
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
          </button>

          <button
            type="button"
            onClick={() => onStockAlertFilterChange(stockAlertFilter === 'low' ? 'all' : 'low')}
            className={`flex items-center gap-3 rounded-2xl border-0 px-4 py-3.5 text-left shadow-none transition-colors ${
              stockAlertFilter === 'low'
                ? 'bg-amber-100 ring-2 ring-amber-400/50 dark:bg-amber-950/50'
                : 'bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800/80'
            }`}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300">
              <PackageX className="h-5 w-5" strokeWidth={2} aria-hidden />
            </span>
            <span className="min-w-0 flex-1 text-[14px] font-semibold text-zinc-900 dark:text-white">
              <span className="tabular-nums">{stockAlerts.low}</span> acabando
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
          </button>

          <div className="flex items-center gap-3 rounded-2xl border-0 bg-white px-4 py-3.5 shadow-none dark:bg-zinc-900">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
              <FileText className="h-5 w-5" strokeWidth={2} aria-hidden />
            </span>
            <div className="min-w-0 flex flex-col gap-0.5">
              <p className="text-[15px] font-bold tabular-nums leading-tight text-zinc-900 dark:text-white">
                {formatWorkshopPartsCurrency(inventoryValue)}
              </p>
              <p className="text-[12px] font-medium leading-snug text-zinc-500 dark:text-zinc-400">
                valor total em estoque
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* Busca + categorias: sticky — trava aqui; abaixo só a lista rola */}
      {!loading && parts.length > 0 ? (
        <div className="sticky top-0 z-30 -mx-4 mb-4 space-y-2.5 border-b border-zinc-200/60 bg-[#F4F5F7] px-4 pb-2.5 pt-1 dark:border-white/[0.06] dark:bg-zinc-950 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
            <div className="relative min-w-0 flex-1">
              <label htmlFor="workshop-parts-search" className="sr-only">
                Pesquisar peças
              </label>
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                aria-hidden
              />
              <input
                ref={searchInputRef}
                id="workshop-parts-search"
                type="search"
                value={partsSearchQuery}
                onChange={(e) => onPartsSearchQueryChange(e.target.value)}
                placeholder="Pesquisar peça, código, marca, categoria..."
                autoComplete="off"
                className="w-full rounded-2xl border-0 bg-white py-3 pl-11 pr-20 text-[15px] text-zinc-900 shadow-none placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/35 dark:bg-zinc-900 dark:text-white dark:placeholder:text-zinc-500"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-500 sm:inline-flex dark:border-white/10 dark:bg-white/5 dark:text-zinc-400">
                <Command className="h-3 w-3" aria-hidden />
                K
              </span>
              {partsSearchQuery ? (
                <button
                  type="button"
                  onClick={() => onPartsSearchQueryChange('')}
                  className="absolute right-14 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/10 sm:right-16"
                  aria-label="Limpar pesquisa"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            <div ref={categoryFilterDropdownRef} className="relative z-40 w-full shrink-0 lg:w-[min(100%,240px)]">
              <button
                type="button"
                id="workshop-parts-category-filter"
                aria-haspopup="listbox"
                aria-expanded={categoryFilterMenuOpen}
                aria-controls="workshop-parts-category-listbox"
                onClick={() => setCategoryFilterMenuOpen((open) => !open)}
                className="flex w-full min-h-[48px] items-center justify-between gap-2 rounded-2xl border-0 bg-white py-3 pl-4 pr-3 text-left text-[14px] font-semibold text-zinc-900 shadow-none focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:bg-zinc-900 dark:text-white"
              >
                <span className="min-w-0 truncate">{categoryFilterLabel}</span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform duration-200 ${
                    categoryFilterMenuOpen ? 'rotate-180' : ''
                  }`}
                  aria-hidden
                />
              </button>
              {categoryFilterMenuOpen ? (
                <ul
                  id="workshop-parts-category-listbox"
                  role="listbox"
                  aria-label="Opções de filtro por categoria"
                  className="absolute left-0 right-0 top-full z-[60] mt-1.5 max-h-[min(280px,45vh)] overflow-y-auto rounded-2xl border-0 bg-white py-1.5 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.25)] dark:bg-zinc-900"
                >
                  {categoryFilterOptions.map((opt) => {
                    const selected = categoryFilter === opt.value;
                    return (
                      <li key={opt.value} role="none">
                        <button
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => {
                            onCategoryFilterChange(opt.value);
                            setCategoryFilterMenuOpen(false);
                          }}
                          className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-[14px] transition-colors ${
                            selected
                              ? 'bg-emerald-500/14 font-semibold text-emerald-950 dark:bg-emerald-400/18 dark:text-emerald-50'
                              : 'font-medium text-zinc-900 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-white/[0.08]'
                          }`}
                        >
                          <span className="min-w-0 truncate">{opt.countLabel}</span>
                          {selected ? (
                            <Check className="h-4 w-4 shrink-0 text-emerald-600" strokeWidth={2.5} aria-hidden />
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>

            <div
              role="group"
              aria-label="Ordenar lista"
              className="inline-flex w-full shrink-0 rounded-2xl border-0 bg-white p-1 shadow-none dark:bg-zinc-900 lg:w-auto"
            >
              <button
                type="button"
                onClick={() => onSortModeChange('recent')}
                aria-pressed={sortMode === 'recent'}
                className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3.5 py-2.5 text-[13px] font-semibold transition-colors lg:flex-initial ${
                  sortMode === 'recent'
                    ? 'bg-[#0F7A4B] text-white shadow-none'
                    : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/[0.08]'
                }`}
              >
                <Clock className="h-4 w-4 shrink-0" aria-hidden />
                Recentes
              </button>
              <button
                type="button"
                onClick={() => onSortModeChange('oldest')}
                aria-pressed={sortMode === 'oldest'}
                className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3.5 py-2.5 text-[13px] font-semibold transition-colors lg:flex-initial ${
                  sortMode === 'oldest'
                    ? 'bg-[#0F7A4B] text-white shadow-none'
                    : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/[0.08]'
                }`}
              >
                <History className="h-4 w-4 shrink-0" aria-hidden />
                Antigo
              </button>
            </div>
          </div>

          <div className={categoryScrollCls}>
            <div className="flex w-max min-w-full gap-2">
              <button
                type="button"
                onClick={() => {
                  onCategoryFilterChange('all');
                  setCategoryFilterMenuOpen(false);
                }}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                  categoryFilter === 'all'
                    ? 'bg-[#0F7A4B] text-white'
                    : 'bg-zinc-200/90 text-zinc-800 hover:bg-zinc-300/90 dark:bg-white/10 dark:text-zinc-200 dark:hover:bg-white/15'
                }`}
              >
                Todos <span className="tabular-nums">({categoryCounts.total})</span>
              </button>
              {categoryCounts.uncategorized > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    onCategoryFilterChange('uncategorized');
                    setCategoryFilterMenuOpen(false);
                  }}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                    categoryFilter === 'uncategorized'
                      ? 'bg-[#0F7A4B] text-white'
                      : 'bg-zinc-200/90 text-zinc-800 hover:bg-zinc-300/90 dark:bg-white/10 dark:text-zinc-200 dark:hover:bg-white/15'
                  }`}
                >
                  Sem categoria <span className="tabular-nums">({categoryCounts.uncategorized})</span>
                </button>
              ) : null}
              {categories.map((c) => {
                const n = categoryCounts.counts.get(c.id) ?? 0;
                if (n === 0) return null;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      onCategoryFilterChange(c.id);
                      setCategoryFilterMenuOpen(false);
                    }}
                    className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                      categoryFilter === c.id
                        ? 'bg-[#0F7A4B] text-white'
                        : 'bg-zinc-200/90 text-zinc-800 hover:bg-zinc-300/90 dark:bg-white/10 dark:text-zinc-200 dark:hover:bg-white/15'
                    }`}
                  >
                    {c.name} <span className="tabular-nums">({n})</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {/* Tabela de produtos — continua rolando sob o cabeçalho sticky */}
      <div className="rounded-[22px] border-0 bg-white shadow-none dark:bg-zinc-900">
        <div
          className={`hidden border-b border-zinc-100 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-400 dark:border-white/[0.06] dark:text-zinc-500 lg:grid lg:gap-3 ${gridCols}`}
        >
          <span>Peça</span>
          <span>Código / Marca</span>
          <span>Categoria</span>
          <span>Localização</span>
          <span className="text-right">Preço</span>
          <span className="text-right">Qtd.</span>
          <span>Status</span>
          <span className="text-center">Ações</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-zinc-500 dark:text-zinc-400">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : parts.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-[15px] text-zinc-500 dark:text-zinc-400">Nenhuma peça cadastrada.</p>
            <p className="mt-1 text-[13px] text-zinc-400 dark:text-zinc-500">
              Toque em <span className="font-medium text-zinc-600 dark:text-zinc-300">Adicionar peça</span> para
              incluir a primeira peça.
            </p>
          </div>
        ) : partsInCategoryScopeCount === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-[15px] text-zinc-500 dark:text-zinc-400">Nenhum produto nesta seleção.</p>
            <button
              type="button"
              className="mt-3 text-[14px] font-semibold text-emerald-600 underline hover:brightness-110 dark:text-emerald-400"
              onClick={() => {
                onCategoryFilterChange('all');
                onPartsSearchQueryChange('');
                setCategoryFilterMenuOpen(false);
              }}
            >
              Ver todas as peças
            </button>
          </div>
        ) : partsAfterStockFilterEmpty ? (
          <div className="px-4 py-12 text-center">
            <p className="text-[15px] text-zinc-500 dark:text-zinc-400">
              Nenhum produto com este alerta nesta seleção.
            </p>
            <button
              type="button"
              className="mt-3 text-[14px] font-semibold text-emerald-600 underline hover:brightness-110 dark:text-emerald-400"
              onClick={() => onStockAlertFilterChange('all')}
            >
              Mostrar todas as peças
            </button>
          </div>
        ) : filteredParts.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-[15px] text-zinc-500 dark:text-zinc-400">
              Nenhum resultado para a pesquisa nesta seleção.
            </p>
            <button
              type="button"
              className="mt-3 text-[14px] font-semibold text-emerald-600 underline dark:text-emerald-400"
              onClick={() => onPartsSearchQueryChange('')}
            >
              Limpar a busca
            </button>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
            {filteredParts.map((p) => {
              const catNames = categoryNamesForPart(p);
              const originalCode = (p.original_code ?? '').trim() || null;
              const partNum = partNumberById.get(p.id);
              const stockStatus = getWorkshopPartStockStatus(p);
              const location = (p.location ?? '').trim() || '—';
              const brand = (p.brand ?? '').trim() || '—';
              const rowAlertCls =
                stockStatus === 'zero'
                  ? 'bg-red-50/70 dark:bg-red-950/20'
                  : stockStatus === 'low'
                    ? 'bg-[#FFF9E6] dark:bg-amber-950/20'
                    : 'bg-transparent';

              return (
                <div
                  key={p.id}
                  className={`min-h-[64px] px-4 py-3 transition-colors hover:bg-zinc-50/80 dark:hover:bg-white/[0.03] lg:grid lg:items-center lg:gap-3 ${gridCols} ${rowAlertCls}`}
                >
                  {editingId === p.id ? (
                    <div className="col-span-full flex flex-col gap-2 lg:flex-row lg:items-center">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => onEditingNameChange(e.target.value)}
                        className="min-w-0 flex-1 rounded-xl border-0 bg-zinc-100 px-3 py-2 text-[15px] text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:bg-white/5 dark:text-white"
                        autoFocus
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={editingPrice}
                        onChange={(e) => onEditingPriceChange(e.target.value)}
                        className="w-full rounded-xl border-0 bg-zinc-100 px-3 py-2 text-right text-[14px] tabular-nums text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:bg-white/5 dark:text-white lg:w-28"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={editingStock}
                        onChange={(e) => onEditingStockChange(e.target.value)}
                        className="w-full rounded-xl border-0 bg-zinc-100 px-3 py-2 text-right text-[14px] tabular-nums text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:bg-white/5 dark:text-white lg:w-24"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={onSaveEdit}
                          className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-500"
                          aria-label="Salvar"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={onCancelEdit}
                          className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-200 text-zinc-600 hover:bg-zinc-300 dark:bg-white/10"
                          aria-label="Cancelar"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => onOpenPart(p)}
                        className="flex min-w-0 w-full items-center gap-3 rounded-xl text-left transition hover:bg-zinc-100/70 dark:hover:bg-white/[0.05] lg:w-auto"
                        title="Ver detalhes do produto"
                      >
                        <div className="isolate h-12 w-12 shrink-0 overflow-hidden rounded-xl border-0 bg-zinc-100 dark:bg-white/5">
                          {p.photo_url ? (
                            <PartPhotoImg
                              src={p.photo_url}
                              alt=""
                              className="h-full w-full object-cover [transform:translateZ(0)]"
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-zinc-300 dark:text-zinc-600">
                              <Package className="h-5 w-5" aria-hidden />
                            </span>
                          )}
                        </div>
                        <span className="min-w-0 flex flex-col gap-0.5">
                          <span className="truncate text-[15px] font-bold leading-snug text-zinc-900 dark:text-white">
                            {p.name}
                          </span>
                          <span className="truncate text-[12px] text-zinc-500 dark:text-zinc-400">
                            {storageSiteLabel(p.storage_site)}
                          </span>
                          <span className="lg:hidden">
                            <WorkshopPartStockBadge status={stockStatus} showOk className="mt-1" />
                          </span>
                        </span>
                      </button>

                      <div className="mt-2 flex min-w-0 flex-col gap-0.5 lg:mt-0">
                        <span className="text-[13px] font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                          {partNum != null ? `#${partNum}` : '—'}
                          {originalCode ? (
                            <span className="ml-1 font-medium text-zinc-500 dark:text-zinc-400">
                              · {originalCode}
                            </span>
                          ) : null}
                        </span>
                        <span className="truncate text-[12px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                          {brand}
                        </span>
                      </div>

                      <div className="mt-2 min-w-0 lg:mt-0">
                        {catNames.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {catNames.slice(0, 2).map((name) => (
                              <span
                                key={name}
                                className="inline-flex max-w-full truncate rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:bg-white/10 dark:text-zinc-300"
                              >
                                {name}
                              </span>
                            ))}
                            {catNames.length > 2 ? (
                              <span className="text-[11px] font-semibold text-zinc-400">
                                +{catNames.length - 2}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-[12px] text-zinc-400">—</span>
                        )}
                      </div>

                      <span className="mt-2 block text-[13px] font-medium tabular-nums text-zinc-700 dark:text-zinc-300 lg:mt-0">
                        {location}
                      </span>

                      <span className="mt-2 block text-[13px] font-medium tabular-nums text-zinc-800 dark:text-zinc-200 lg:mt-0 lg:text-right">
                        {formatWorkshopPartsCurrency(Number(p.unit_price ?? 0))}
                      </span>

                      <div className="mt-2 flex flex-col items-start gap-0.5 lg:mt-0 lg:items-end">
                        <span
                          className={`text-[14px] font-bold tabular-nums ${
                            stockStatus === 'zero'
                              ? 'text-red-700 dark:text-red-300'
                              : stockStatus === 'low'
                                ? 'text-amber-800 dark:text-amber-300'
                                : 'text-zinc-900 dark:text-white'
                          }`}
                        >
                          {formatWorkshopPartQty(p.stock_qty)}
                        </span>
                        {(reservedQtyByPartId[p.id] ?? 0) > 0 ? (
                          <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                            {formatWorkshopPartQty(reservedQtyByPartId[p.id])} em orçamento
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-2 hidden lg:mt-0 lg:block">
                        <WorkshopPartStockBadge status={stockStatus} showOk />
                      </div>

                      <div className="mt-2 flex items-center justify-end gap-1 lg:mt-0 lg:justify-center">
                        <button
                          type="button"
                          onClick={() => onEditPart(p)}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-emerald-500/10 hover:text-emerald-700 dark:hover:text-emerald-400"
                          aria-label="Editar cadastro completo"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeletePart(p.id)}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-600"
                          aria-label="Excluir"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
