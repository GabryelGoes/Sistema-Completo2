import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  Command,
  Loader2,
  Package,
  Plus,
  ScanLine,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  deleteWorkshopAbsModuleModel,
  getWorkshopAbsModuleModels,
  type WorkshopAbsModuleModel,
} from '../services/apiService';
import {
  ABS_MODULE_KIND_OPTIONS,
  ABS_MODULE_STATUS_OPTIONS,
  absModuleKindLabel,
  formatAbsModuleMoney,
  primaryCodeForScope,
  type AbsModuleKind,
  type AbsModuleStatus,
} from '../utils/workshopAbsModules';
import { WorkshopAbsModulesModal } from './WorkshopAbsModulesModal';

export type WorkshopAbsModulesHomeDashboardProps = {
  onBack: () => void;
  /** Deep-link: abre unidade ao montar. */
  initialPublicId?: string | null;
  onInitialPublicIdConsumed?: () => void;
};

const actionBtnSecondary =
  'inline-flex items-center justify-center gap-2 rounded-2xl border-0 bg-zinc-100 px-4 py-3 text-[14px] font-semibold text-zinc-800 transition-colors hover:bg-zinc-200/90 dark:bg-white/5 dark:text-zinc-100 dark:hover:bg-white/10';
const actionBtnGreen =
  'inline-flex items-center justify-center gap-2 rounded-2xl border-0 bg-emerald-50 px-4 py-3 text-[14px] font-semibold text-emerald-800 transition-colors hover:bg-emerald-100/90 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-900/50';
const actionBtnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-2xl bg-[#0F7A4B] px-4 py-3 text-[14px] font-semibold text-white shadow-none transition-colors hover:bg-[#0c6a41]';

function modelPrimaryCode(m: WorkshopAbsModuleModel): string {
  const kind = m.module_kind;
  const scope =
    kind === 'hidraulico' ? 'hidraulico' : kind === 'eletronico' ? 'eletronico' : 'completo';
  return primaryCodeForScope(m.codes, scope) || primaryCodeForScope(m.codes, 'completo') || '—';
}

export function WorkshopAbsModulesHomeDashboard({
  onBack,
  initialPublicId,
  onInitialPublicIdConsumed,
}: WorkshopAbsModulesHomeDashboardProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<WorkshopAbsModuleModel[]>([]);
  const [query, setQuery] = useState('');
  const [filterKind, setFilterKind] = useState<AbsModuleKind | ''>('');
  const [filterStatus, setFilterStatus] = useState<AbsModuleStatus | ''>('disponivel');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [flowOpen, setFlowOpen] = useState(false);
  const [flowPublicId, setFlowPublicId] = useState<string | null>(null);
  const [flowMissingId, setFlowMissingId] = useState<string | null>(null);
  const [flowForm, setFlowForm] = useState(false);
  const [flowModelId, setFlowModelId] = useState<string | null>(null);
  const [flowScan, setFlowScan] = useState(false);

  const loadModels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getWorkshopAbsModuleModels({
        q: query.trim() || undefined,
        module_kind: filterKind || undefined,
        status: filterStatus || undefined,
      });
      setModels(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao listar módulos ABS.');
    } finally {
      setLoading(false);
    }
  }, [filterKind, filterStatus, query]);

  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  useEffect(() => {
    if (!initialPublicId) return;
    setFlowPublicId(initialPublicId);
    setFlowOpen(true);
    onInitialPublicIdConsumed?.();
  }, [initialPublicId, onInitialPublicIdConsumed]);

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

  const kpis = useMemo(() => {
    let available = 0;
    let total = 0;
    let complete = 0;
    let value = 0;
    for (const m of models) {
      available += Number(m.available_qty ?? 0);
      total += Number(m.total_qty ?? 0);
      if (m.module_kind === 'completo') complete += Number(m.available_qty ?? 0);
      for (const u of m.units || []) {
        if (u.status === 'disponivel') value += Number(u.unit_price ?? 0);
      }
    }
    return { models: models.length, available, total, complete, value };
  }, [models]);

  const openNew = () => {
    setFlowPublicId(null);
    setFlowMissingId(null);
    setFlowModelId(null);
    setFlowForm(true);
    setFlowScan(false);
    setFlowOpen(true);
  };

  const openScan = () => {
    setFlowPublicId(null);
    setFlowMissingId(null);
    setFlowModelId(null);
    setFlowForm(false);
    setFlowScan(true);
    setFlowOpen(true);
  };

  const openModel = (model: WorkshopAbsModuleModel) => {
    setFlowModelId(model.id);
    setFlowPublicId(null);
    setFlowMissingId(null);
    setFlowForm(false);
    setFlowScan(false);
    setFlowOpen(true);
  };

  const handleDeleteModel = async (model: WorkshopAbsModuleModel) => {
    const qty = Number(model.total_qty ?? 0);
    const label = [model.manufacturer, modelPrimaryCode(model)].filter(Boolean).join(' · ') || 'modelo';
    const msg =
      qty > 0
        ? `Excluir “${label}” e suas ${qty} unidade(s)?\n\nOs códigos ABS-###### dessas unidades não serão reutilizados.`
        : `Excluir o modelo técnico “${label}”?`;
    if (!window.confirm(msg)) return;
    setDeletingId(model.id);
    setError(null);
    try {
      await deleteWorkshopAbsModuleModel(model.id, { force: qty > 0 });
      await loadModels();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao excluir modelo.');
    } finally {
      setDeletingId(null);
    }
  };

  const gridCols =
    'lg:grid-cols-[minmax(14rem,2.4fr)_minmax(7rem,0.9fr)_minmax(6rem,0.8fr)_minmax(5rem,0.7fr)_minmax(5rem,0.7fr)_minmax(6rem,0.8fr)_5.5rem]';

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-auto touch-pan-y px-4 pb-[max(2rem,env(safe-area-inset-bottom))] custom-scrollbar [scrollbar-gutter:stable] sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-col gap-3 pt-1 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="mb-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-emerald-700 hover:underline dark:text-emerald-300"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar ao Estoque
            </button>
            <h2 className="text-[22px] font-bold tracking-tight text-zinc-900 dark:text-white">
              Módulos ABS
            </h2>
            <p className="mt-0.5 text-[14px] text-zinc-500 dark:text-zinc-400">
              Catálogo técnico, unidades físicas e desmembramento
            </p>
          </div>

          <div className="flex flex-wrap gap-2 justify-end shrink-0">
            <button type="button" onClick={openScan} className={actionBtnGreen}>
              <ScanLine className="h-4 w-4" aria-hidden />
              Escanear código
            </button>
            <button type="button" onClick={openNew} className={actionBtnPrimary}>
              <Plus className="h-4 w-4" aria-hidden />
              Novo módulo
            </button>
          </div>
        </div>

        {error ? (
          <div className="mb-4 rounded-xl border-0 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-none dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        ) : null}

        {!loading && models.length > 0 ? (
          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <button
              type="button"
              onClick={() => {
                setFilterStatus('');
                setFilterKind('');
                setQuery('');
              }}
              className="flex items-center gap-3 rounded-2xl border-0 bg-white px-4 py-3.5 text-left shadow-none transition-colors hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800/80"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40">
                <Package className="h-6 w-6 text-emerald-700 dark:text-emerald-300" />
              </span>
              <span className="min-w-0 flex-1 text-[14px] font-semibold text-zinc-900 dark:text-white">
                <span className="tabular-nums">{kpis.models}</span>{' '}
                {kpis.models === 1 ? 'modelo técnico' : 'modelos técnicos'}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
            </button>
            <div className="flex items-center gap-3 rounded-2xl border-0 bg-white px-4 py-3.5 shadow-none dark:bg-zinc-900">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40">
                <span className="text-[15px] font-black tabular-nums text-emerald-700 dark:text-emerald-300">
                  {kpis.available}
                </span>
              </span>
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-zinc-900 dark:text-white">
                  unidades disponíveis
                </p>
                <p className="text-[12px] text-zinc-500">{kpis.total} no total</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFilterKind(filterKind === 'completo' ? '' : 'completo')}
              className={`flex items-center gap-3 rounded-2xl border-0 px-4 py-3.5 text-left shadow-none transition-colors ${
                filterKind === 'completo'
                  ? 'bg-amber-50 ring-2 ring-amber-400/45 dark:bg-amber-950/40'
                  : 'bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800/80'
              }`}
            >
              <span className="min-w-0 flex-1 text-[14px] font-semibold text-zinc-900 dark:text-white">
                <span className="tabular-nums">{kpis.complete}</span> completos disponíveis
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
            </button>
            <div className="flex items-center gap-3 rounded-2xl border-0 bg-white px-4 py-3.5 shadow-none dark:bg-zinc-900">
              <div className="min-w-0">
                <p className="text-[15px] font-bold tabular-nums text-zinc-900 dark:text-white">
                  {formatAbsModuleMoney(kpis.value)}
                </p>
                <p className="text-[12px] font-medium text-zinc-500">valor das unidades disponíveis</p>
              </div>
            </div>
          </div>
        ) : null}

        {!loading ? (
          <div className="sticky top-0 z-30 -mx-4 mb-4 border-b border-zinc-200/60 bg-[#F4F5F7] px-4 pb-2.5 pt-1 dark:border-white/[0.06] dark:bg-zinc-950 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input
                  ref={searchInputRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void loadModels();
                  }}
                  placeholder="Pesquisar fabricante, código, família…"
                  autoComplete="off"
                  className="w-full rounded-2xl border-0 bg-white py-3 pl-11 pr-20 text-[15px] text-zinc-900 shadow-none placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/35 dark:bg-zinc-900 dark:text-white"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-500 sm:inline-flex dark:border-white/10 dark:bg-white/5">
                  <Command className="h-3 w-3" />K
                </span>
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="absolute right-14 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 sm:right-16"
                    aria-label="Limpar pesquisa"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
              <select
                className="w-full rounded-2xl border-0 bg-white px-4 py-3 text-[14px] font-semibold text-zinc-800 shadow-none dark:bg-zinc-900 dark:text-white lg:w-[200px]"
                value={filterKind}
                onChange={(e) => setFilterKind(e.target.value as AbsModuleKind | '')}
              >
                <option value="">Todos os tipos</option>
                {ABS_MODULE_KIND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <select
                className="w-full rounded-2xl border-0 bg-white px-4 py-3 text-[14px] font-semibold text-zinc-800 shadow-none dark:bg-zinc-900 dark:text-white lg:w-[200px]"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as AbsModuleStatus | '')}
              >
                <option value="">Qualquer status</option>
                {ABS_MODULE_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => void loadModels()} className={actionBtnSecondary}>
                Filtrar
              </button>
            </div>
          </div>
        ) : null}

        <div className="rounded-[22px] border-0 bg-white shadow-none dark:bg-zinc-900">
          <div
            className={`hidden border-b border-zinc-100 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-400 dark:border-white/[0.06] dark:text-zinc-500 lg:grid lg:gap-3 ${gridCols}`}
          >
            <span>Modelo</span>
            <span>Código</span>
            <span>Tipo</span>
            <span className="text-right">Disp.</span>
            <span className="text-right">Total</span>
            <span>Família</span>
            <span className="text-center">Ações</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-zinc-500">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : models.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <p className="text-[15px] text-zinc-500 dark:text-zinc-400">
                Nenhum módulo ABS cadastrado.
              </p>
              <p className="mt-1 text-[13px] text-zinc-400">
                Toque em <span className="font-medium text-zinc-600 dark:text-zinc-300">Novo módulo</span>{' '}
                para incluir o primeiro.
              </p>
              <button type="button" onClick={openNew} className={`${actionBtnPrimary} mt-4`}>
                <Plus className="h-4 w-4" />
                Novo módulo
              </button>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
              {models.map((m) => {
                const code = modelPrimaryCode(m);
                const title =
                  [m.manufacturer, code !== '—' ? code : null].filter(Boolean).join(' · ') ||
                  absModuleKindLabel(m.module_kind);
                return (
                  <div
                    key={m.id}
                    className={`min-h-[64px] px-4 py-3 transition-colors hover:bg-zinc-50/80 dark:hover:bg-white/[0.03] lg:grid lg:items-center lg:gap-3 ${gridCols}`}
                  >
                    <button
                      type="button"
                      onClick={() => openModel(m)}
                      className="flex min-w-0 w-full items-center gap-3 rounded-xl text-left transition hover:bg-zinc-100/70 dark:hover:bg-white/[0.05] lg:w-auto"
                    >
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-100 dark:bg-white/5">
                        <Package className="h-5 w-5 text-zinc-400" />
                      </div>
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-bold text-zinc-900 dark:text-white">
                          {title}
                        </span>
                        <span className="mt-0.5 block text-[12px] text-zinc-500 lg:hidden">
                          {absModuleKindLabel(m.module_kind)} · {m.available_qty ?? 0} disp.
                        </span>
                      </span>
                    </button>
                    <span className="mt-2 truncate text-[13px] font-semibold tabular-nums text-emerald-700 dark:text-emerald-400 lg:mt-0">
                      {code}
                    </span>
                    <span className="mt-2 text-[13px] font-medium text-zinc-700 dark:text-zinc-300 lg:mt-0">
                      {absModuleKindLabel(m.module_kind)}
                    </span>
                    <span className="mt-2 text-[14px] font-bold tabular-nums text-zinc-900 dark:text-white lg:mt-0 lg:text-right">
                      {m.available_qty ?? 0}
                    </span>
                    <span className="mt-2 text-[13px] font-medium tabular-nums text-zinc-600 dark:text-zinc-400 lg:mt-0 lg:text-right">
                      {m.total_qty ?? 0}
                    </span>
                    <span className="mt-2 truncate text-[13px] text-zinc-600 dark:text-zinc-400 lg:mt-0">
                      {m.family || '—'}
                    </span>
                    <div className="mt-2 flex items-center justify-end gap-1 lg:mt-0 lg:justify-center">
                      <button
                        type="button"
                        onClick={() => openModel(m)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-emerald-500/10 hover:text-emerald-700"
                        aria-label="Abrir modelo"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        disabled={deletingId === m.id}
                        onClick={() => void handleDeleteModel(m)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-600 disabled:opacity-50"
                        aria-label="Excluir modelo"
                      >
                        {deletingId === m.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {flowOpen ? (
        <WorkshopAbsModulesModal
          isOpen
          onClose={() => {
            setFlowOpen(false);
            setFlowPublicId(null);
            setFlowMissingId(null);
            setFlowModelId(null);
            setFlowForm(false);
            setFlowScan(false);
            void loadModels();
          }}
          initialPublicId={flowPublicId}
          initialMissingPublicId={flowMissingId}
          initialModelId={flowModelId}
          initialShowForm={flowForm}
          initialShowScan={flowScan}
        />
      ) : null}
    </>
  );
}
