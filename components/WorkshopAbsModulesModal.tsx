import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpFromLine,
  History,
  Loader2,
  MapPin,
  Plus,
  Printer,
  QrCode,
  Search,
  X,
} from 'lucide-react';
import {
  createWorkshopAbsModule,
  createWorkshopAbsModuleMovement,
  getWorkshopAbsModuleMovements,
  getWorkshopAbsModules,
  lookupWorkshopAbsModuleByCode,
  type WorkshopAbsModule,
  type WorkshopAbsModuleMovement,
  type WorkshopAbsModuleWriteInput,
} from '../services/apiService';
import {
  ABS_MODULE_CONDITION_OPTIONS,
  ABS_MODULE_EXIT_REASON_OPTIONS,
  ABS_MODULE_KIND_OPTIONS,
  absModuleConditionLabel,
  absModuleKindLabel,
  absModuleStatusLabel,
  describeAbsModuleMovement,
  formatAbsModuleMoney,
  formatAbsModuleWhen,
  looksLikeAbsModuleCode,
  normalizeAbsModuleCode,
  type AbsModuleExitReason,
} from '../utils/workshopAbsModules';
import { printAbsModuleLabel } from '../utils/absModuleLabelPrint';
import { getStoredAuth } from './views/LoginView';
import { BarcodeScanField } from './BarcodeScanField';
import { RegistrationPortal } from './ui/RegistrationPortal';
import { resolveIosModalOverlayClass, NESTED_STOCK_OVERLAY_Z } from './ui/iosModalStyles';
import { useDesktopShellLayout } from './ui/DesktopShellContext';
import { useBrowserBackLayer } from './ui/BackNavigationContext';

export type WorkshopAbsModulesModalProps = {
  isOpen: boolean;
  onClose: () => void;
  /** Abre o formulário já com public_id sugerido (quando QR não existe). */
  initialMissingPublicId?: string | null;
  /** Abre direto o card do módulo após lookup. */
  initialPublicId?: string | null;
};

type View =
  | { kind: 'list' }
  | { kind: 'form'; preferPublicId?: string | null }
  | { kind: 'detail'; module: WorkshopAbsModule }
  | { kind: 'missing'; publicId: string };

type ActionPanel = null | 'exit' | 'entry' | 'transfer' | 'history';

const emptyForm = (): WorkshopAbsModuleWriteInput => ({
  manufacturer: '',
  original_code: '',
  application: '',
  model: '',
  year_label: '',
  module_kind: 'completo',
  condition: 'usado',
  unit_cost: 0,
  unit_price: 0,
  supplier: '',
  location: '',
  notes: '',
  status: 'disponivel',
});

function StatusPill({ status }: { status: string }) {
  const available = status !== 'fora_estoque';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold ${
        available
          ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
          : 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300'
      }`}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${available ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
      {absModuleStatusLabel(status)}
    </span>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[12px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  'w-full rounded-2xl border border-zinc-300 bg-white px-3 py-3 text-[15px] text-zinc-900 outline-none ring-emerald-500/30 focus:ring-2 dark:border-white/15 dark:bg-white/5 dark:text-white';

export function WorkshopAbsModulesModal({
  isOpen,
  onClose,
  initialMissingPublicId = null,
  initialPublicId = null,
}: WorkshopAbsModulesModalProps) {
  const isDesktopShell = useDesktopShellLayout();
  const [view, setView] = useState<View>({ kind: 'list' });
  const [modules, setModules] = useState<WorkshopAbsModule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanCode, setScanCode] = useState('');
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<WorkshopAbsModuleWriteInput>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [action, setAction] = useState<ActionPanel>(null);
  const [history, setHistory] = useState<WorkshopAbsModuleMovement[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [exitReason, setExitReason] = useState<AbsModuleExitReason>('venda_avulsa');
  const [exitRef, setExitRef] = useState('');
  const [exitNotes, setExitNotes] = useState('');
  const [transferLocation, setTransferLocation] = useState('');
  const [entryLocation, setEntryLocation] = useState('');
  const [confirmExit, setConfirmExit] = useState(false);
  const [printBusy, setPrintBusy] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useBrowserBackLayer(isOpen, onClose);

  const recordedByName = useMemo(() => {
    const auth = getStoredAuth();
    return auth?.displayName || auth?.username || (auth?.role === 'admin' ? 'Gerência' : null);
  }, []);

  const loadList = useCallback(async (q?: string) => {
    setLoading(true);
    setError(null);
    try {
      const list = await getWorkshopAbsModules({ q: q || undefined });
      setModules(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao listar módulos ABS.');
    } finally {
      setLoading(false);
    }
  }, []);

  const openDetail = useCallback((mod: WorkshopAbsModule) => {
    setView({ kind: 'detail', module: mod });
    setAction(null);
    setActionError(null);
    setSuccessMsg(null);
    setConfirmExit(false);
    setExitReason('venda_avulsa');
    setExitRef('');
    setExitNotes('');
    setTransferLocation(mod.location || '');
    setEntryLocation(mod.location || '');
  }, []);

  const refreshDetail = useCallback(
    async (publicId: string) => {
      const result = await lookupWorkshopAbsModuleByCode(publicId);
      if (result.found && result.module) openDetail(result.module);
    },
    [openDetail]
  );

  useEffect(() => {
    if (!isOpen) return;
    setScanCode('');
    setQuery('');
    setError(null);
    setSuccessMsg(null);
    setAction(null);
    setForm(emptyForm());

    const boot = async () => {
      if (initialPublicId) {
        setLoading(true);
        try {
          const result = await lookupWorkshopAbsModuleByCode(initialPublicId);
          if (result.found && result.module) {
            openDetail(result.module);
            return;
          }
          const pid = normalizeAbsModuleCode(initialPublicId) || initialPublicId.toUpperCase();
          setView({ kind: 'missing', publicId: pid });
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Falha na busca.');
          setView({ kind: 'list' });
          await loadList();
        } finally {
          setLoading(false);
        }
        return;
      }
      if (initialMissingPublicId) {
        const pid =
          normalizeAbsModuleCode(initialMissingPublicId) ||
          initialMissingPublicId.toUpperCase();
        setView({ kind: 'missing', publicId: pid });
        return;
      }
      setView({ kind: 'list' });
      await loadList();
    };
    void boot();
  }, [isOpen, initialMissingPublicId, initialPublicId, loadList, openDetail]);

  const handleScan = useCallback(
    async (raw: string) => {
      setError(null);
      setSuccessMsg(null);
      if (looksLikeAbsModuleCode(raw) && !normalizeAbsModuleCode(raw)) {
        setError('ID de módulo ABS inválido. Use o formato ABS-000001.');
        return;
      }
      const publicId = normalizeAbsModuleCode(raw);
      if (!publicId) {
        setError('Este leitor de módulos ABS espera um código ABS-000001.');
        return;
      }
      setLoading(true);
      try {
        const result = await lookupWorkshopAbsModuleByCode(publicId);
        if (result.found && result.module) {
          openDetail(result.module);
          return;
        }
        setView({ kind: 'missing', publicId });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha na busca do módulo.');
      } finally {
        setLoading(false);
      }
    },
    [openDetail]
  );

  const handleCreate = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const created = await createWorkshopAbsModule({
        ...form,
        recorded_by_name: recordedByName,
      });
      openDetail(created);
      setSuccessMsg(`Módulo ${created.public_id} cadastrado. Imprima a etiqueta QR.`);
      void loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao cadastrar.');
    } finally {
      setSaving(false);
    }
  }, [form, loadList, openDetail, recordedByName]);

  const handlePrint = useCallback(async (mod: WorkshopAbsModule) => {
    setPrintBusy(true);
    try {
      await printAbsModuleLabel({
        publicId: mod.public_id,
        moduleKind: mod.module_kind,
        manufacturer: mod.manufacturer,
        application: mod.application,
      });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Falha ao imprimir etiqueta.');
    } finally {
      setPrintBusy(false);
    }
  }, []);

  const loadHistory = useCallback(async (publicId: string) => {
    setLoadingHistory(true);
    setActionError(null);
    try {
      const items = await getWorkshopAbsModuleMovements(publicId);
      setHistory(items);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Falha ao carregar histórico.');
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const runMovement = useCallback(
    async (
      mod: WorkshopAbsModule,
      payload: Parameters<typeof createWorkshopAbsModuleMovement>[0]
    ) => {
      setActionBusy(true);
      setActionError(null);
      try {
        const result = await createWorkshopAbsModuleMovement({
          ...payload,
          recorded_by_name: recordedByName,
        });
        openDetail(result.module);
        setSuccessMsg('Movimentação registrada.');
        setAction(null);
        setConfirmExit(false);
        void loadList();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : 'Falha na movimentação.');
      } finally {
        setActionBusy(false);
      }
    },
    [loadList, openDetail, recordedByName]
  );

  if (!isOpen) return null;

  const detail = view.kind === 'detail' ? view.module : null;

  return (
    <RegistrationPortal>
      <div
        className={resolveIosModalOverlayClass(isDesktopShell, NESTED_STOCK_OVERLAY_Z)}
        role="dialog"
        aria-modal="true"
        aria-label="Módulos ABS"
      >
        {/* Painel com altura limitada + corpo rolável (mesmo padrão da saída de estoque). */}
        <div className="flex max-h-[min(920px,94dvh)] w-full max-w-3xl flex-col overflow-hidden rounded-[1.75rem] border border-zinc-200/80 bg-zinc-50 shadow-2xl dark:border-white/10 dark:bg-zinc-950 sm:rounded-[28px]">
          <header className="flex shrink-0 items-center gap-3 border-b border-zinc-200/80 px-4 py-4 dark:border-white/10">
              {view.kind !== 'list' ? (
                <button
                  type="button"
                  onClick={() => {
                    setView({ kind: 'list' });
                    setAction(null);
                    void loadList(query);
                  }}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-zinc-300 bg-white text-zinc-700 dark:border-white/15 dark:bg-white/5 dark:text-white"
                  aria-label="Voltar"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
              ) : (
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                  <QrCode className="h-5 w-5" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="text-[18px] font-bold text-zinc-900 dark:text-white">Módulos ABS</h2>
                <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
                  Inventário individual com QR Code interno (ABS-000001)
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-zinc-300 bg-white text-zinc-700 dark:border-white/15 dark:bg-white/5 dark:text-white"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div
              data-abs-modules-scroll
              className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-y-contain touch-pan-y px-4 py-4 pb-[max(2rem,env(safe-area-inset-bottom))] custom-scrollbar [-webkit-overflow-scrolling:touch]"
            >
              {error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                  {error}
                </div>
              ) : null}
              {successMsg ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200">
                  {successMsg}
                </div>
              ) : null}

              {view.kind === 'list' ? (
                <>
                  <BarcodeScanField
                    value={scanCode}
                    onChange={setScanCode}
                    onSubmitCode={handleScan}
                    placeholder="Leia o QR ABS-000001 ou digite o ID"
                  />
                  <div className="flex flex-wrap gap-2">
                    <div className="relative min-w-0 flex-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void loadList(query);
                        }}
                        placeholder="Buscar fabricante, OEM, aplicação…"
                        className={`${inputClass} pl-10`}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void loadList(query)}
                      className="rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-[14px] font-semibold text-zinc-800 dark:border-white/15 dark:bg-white/5 dark:text-white"
                    >
                      Filtrar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setForm(emptyForm());
                        setView({ kind: 'form' });
                        // Garante que o formulário longo comece no topo da área rolável.
                        requestAnimationFrame(() => {
                          document
                            .querySelector('[data-abs-modules-scroll]')
                            ?.scrollTo({ top: 0 });
                        });
                      }}
                      className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-[14px] font-semibold text-white"
                    >
                      <Plus className="h-4 w-4" />
                      Cadastrar módulo
                    </button>
                  </div>

                  {loading ? (
                    <div className="flex justify-center py-10 text-zinc-500">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : modules.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-zinc-300 px-4 py-10 text-center text-sm text-zinc-500 dark:border-white/15">
                      Nenhum módulo ABS cadastrado ainda.
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {modules.map((m) => (
                        <li key={m.id}>
                          <button
                            type="button"
                            onClick={() => openDetail(m)}
                            className="flex w-full items-start justify-between gap-3 rounded-3xl border border-zinc-200 bg-white px-4 py-3 text-left transition hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                          >
                            <span className="min-w-0">
                              <span className="block font-mono text-[15px] font-bold tracking-wide text-zinc-900 dark:text-white">
                                {m.public_id}
                              </span>
                              <span className="mt-0.5 block text-[13px] text-zinc-600 dark:text-zinc-300">
                                {[m.manufacturer, m.original_code, m.application]
                                  .filter(Boolean)
                                  .join(' · ') || absModuleKindLabel(m.module_kind)}
                              </span>
                              <span className="mt-1 block text-[12px] text-zinc-500">
                                {m.location ? `Local: ${m.location}` : 'Sem local'} ·{' '}
                                {absModuleConditionLabel(m.condition)}
                              </span>
                            </span>
                            <StatusPill status={m.status} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : null}

              {view.kind === 'missing' ? (
                <div className="space-y-4 rounded-3xl border border-amber-200 bg-amber-50/80 px-4 py-5 dark:border-amber-500/30 dark:bg-amber-950/30">
                  <p className="text-[16px] font-semibold text-amber-950 dark:text-amber-100">
                    QR Code não encontrado.
                  </p>
                  <p className="text-[14px] text-amber-900/80 dark:text-amber-200/80">
                    O identificador <span className="font-mono font-bold">{view.publicId}</span> não
                    existe no estoque de módulos ABS.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setForm(emptyForm());
                      setView({ kind: 'form', preferPublicId: view.publicId });
                    }}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3.5 text-[15px] font-semibold text-white"
                  >
                    <Plus className="h-5 w-5" />
                    Cadastrar novo módulo
                  </button>
                </div>
              ) : null}

              {view.kind === 'form' ? (
                <div className="space-y-3">
                  {view.preferPublicId ? (
                    <p className="rounded-2xl bg-zinc-100 px-3 py-2 text-[13px] text-zinc-600 dark:bg-white/5 dark:text-zinc-300">
                      O ID <span className="font-mono font-bold">{view.preferPublicId}</span> será
                      substituído pelo próximo ID automático (ABS-######) gerado pelo sistema.
                    </p>
                  ) : null}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Fabricante">
                      <input
                        className={inputClass}
                        value={form.manufacturer || ''}
                        onChange={(e) => setForm((f) => ({ ...f, manufacturer: e.target.value }))}
                      />
                    </Field>
                    <Field label="Código original / OEM">
                      <input
                        className={inputClass}
                        value={form.original_code || ''}
                        onChange={(e) => setForm((f) => ({ ...f, original_code: e.target.value }))}
                      />
                    </Field>
                    <Field label="Aplicação / veículo">
                      <input
                        className={inputClass}
                        value={form.application || ''}
                        onChange={(e) => setForm((f) => ({ ...f, application: e.target.value }))}
                      />
                    </Field>
                    <Field label="Modelo">
                      <input
                        className={inputClass}
                        value={form.model || ''}
                        onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                      />
                    </Field>
                    <Field label="Ano">
                      <input
                        className={inputClass}
                        value={form.year_label || ''}
                        onChange={(e) => setForm((f) => ({ ...f, year_label: e.target.value }))}
                      />
                    </Field>
                    <Field label="Tipo de módulo">
                      <select
                        className={inputClass}
                        value={form.module_kind || 'completo'}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            module_kind: e.target.value as WorkshopAbsModuleWriteInput['module_kind'],
                          }))
                        }
                      >
                        {ABS_MODULE_KIND_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Condição">
                      <select
                        className={inputClass}
                        value={form.condition || 'usado'}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            condition: e.target.value as WorkshopAbsModuleWriteInput['condition'],
                          }))
                        }
                      >
                        {ABS_MODULE_CONDITION_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Fornecedor / origem">
                      <input
                        className={inputClass}
                        value={form.supplier || ''}
                        onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))}
                      />
                    </Field>
                    <Field label="Custo">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className={inputClass}
                        value={form.unit_cost ?? 0}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, unit_cost: Number(e.target.value) || 0 }))
                        }
                      />
                    </Field>
                    <Field label="Preço de venda">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className={inputClass}
                        value={form.unit_price ?? 0}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, unit_price: Number(e.target.value) || 0 }))
                        }
                      />
                    </Field>
                    <Field label="Localização física">
                      <input
                        className={inputClass}
                        value={form.location || ''}
                        onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                        placeholder="Ex.: Prateleira B3"
                      />
                    </Field>
                  </div>
                  <Field label="Observações">
                    <textarea
                      rows={3}
                      className={inputClass}
                      value={form.notes || ''}
                      onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    />
                  </Field>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleCreate()}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3.5 text-[15px] font-semibold text-white disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
                    Salvar e gerar QR (ID automático)
                  </button>
                </div>
              ) : null}

              {detail ? (
                <div className="space-y-4">
                  <div className="rounded-3xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-white/5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[12px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                          Módulo ABS
                        </p>
                        <p className="mt-1 font-mono text-[22px] font-extrabold tracking-wide text-zinc-900 dark:text-white">
                          {detail.public_id}
                        </p>
                      </div>
                      <StatusPill status={detail.status} />
                    </div>
                    <dl className="mt-4 grid gap-2 text-[14px] sm:grid-cols-2">
                      <div>
                        <dt className="text-zinc-500">Fabricante</dt>
                        <dd className="font-semibold text-zinc-900 dark:text-white">
                          {detail.manufacturer || '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-zinc-500">Código original</dt>
                        <dd className="font-semibold text-zinc-900 dark:text-white">
                          {detail.original_code || '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-zinc-500">Aplicação</dt>
                        <dd className="font-semibold text-zinc-900 dark:text-white">
                          {[detail.application, detail.year_label].filter(Boolean).join(' ') || '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-zinc-500">Condição</dt>
                        <dd className="font-semibold text-zinc-900 dark:text-white">
                          {absModuleConditionLabel(detail.condition)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-zinc-500">Tipo</dt>
                        <dd className="font-semibold text-zinc-900 dark:text-white">
                          {absModuleKindLabel(detail.module_kind)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-zinc-500">Localização</dt>
                        <dd className="font-semibold text-zinc-900 dark:text-white">
                          {detail.location || '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-zinc-500">Custo</dt>
                        <dd className="font-semibold text-zinc-900 dark:text-white">
                          {formatAbsModuleMoney(detail.unit_cost)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-zinc-500">Preço</dt>
                        <dd className="font-semibold text-zinc-900 dark:text-white">
                          {formatAbsModuleMoney(detail.unit_price)}
                        </dd>
                      </div>
                    </dl>
                    {detail.status === 'fora_estoque' ? (
                      <p className="mt-3 rounded-2xl bg-zinc-100 px-3 py-2 text-[13px] font-medium text-zinc-700 dark:bg-white/10 dark:text-zinc-200">
                        Este módulo está fora do estoque.
                      </p>
                    ) : null}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {detail.status === 'fora_estoque' ? (
                      <button
                        type="button"
                        onClick={() => {
                          setAction('entry');
                          setActionError(null);
                        }}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3.5 text-[15px] font-semibold text-white"
                      >
                        <ArrowDownToLine className="h-5 w-5" />
                        Registrar entrada
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setAction('exit');
                          setConfirmExit(false);
                          setActionError(null);
                        }}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 py-3.5 text-[15px] font-semibold text-white"
                      >
                        <ArrowUpFromLine className="h-5 w-5" />
                        Dar saída
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setAction('transfer');
                        setTransferLocation(detail.location || '');
                        setActionError(null);
                      }}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-sky-300 bg-sky-50 px-4 py-3.5 text-[15px] font-semibold text-sky-900 dark:border-sky-500/30 dark:bg-sky-950/40 dark:text-sky-100"
                    >
                      <MapPin className="h-5 w-5" />
                      Transferir local
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAction('history');
                        void loadHistory(detail.public_id);
                      }}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-300 bg-white px-4 py-3.5 text-[15px] font-semibold text-zinc-800 dark:border-white/15 dark:bg-white/5 dark:text-white"
                    >
                      <History className="h-5 w-5" />
                      Ver histórico
                    </button>
                    <button
                      type="button"
                      disabled={printBusy}
                      onClick={() => void handlePrint(detail)}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-300 bg-white px-4 py-3.5 text-[15px] font-semibold text-zinc-800 dark:border-white/15 dark:bg-white/5 dark:text-white disabled:opacity-50"
                    >
                      {printBusy ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Printer className="h-5 w-5" />
                      )}
                      Imprimir etiqueta
                    </button>
                  </div>

                  {actionError ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                      {actionError}
                    </div>
                  ) : null}

                  {action === 'exit' ? (
                    <div className="space-y-3 rounded-3xl border border-rose-200 bg-rose-50/70 p-4 dark:border-rose-500/30 dark:bg-rose-950/30">
                      {!confirmExit ? (
                        <>
                          <p className="text-[15px] font-semibold text-rose-950 dark:text-rose-100">
                            Confirmar saída do módulo ABS {detail.public_id}?
                          </p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setConfirmExit(true)}
                              className="flex-1 rounded-2xl bg-rose-600 px-4 py-3 font-semibold text-white"
                            >
                              Sim, continuar
                            </button>
                            <button
                              type="button"
                              onClick={() => setAction(null)}
                              className="flex-1 rounded-2xl border border-zinc-300 bg-white px-4 py-3 font-semibold dark:border-white/15 dark:bg-white/5"
                            >
                              Cancelar
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <Field label="Motivo da saída">
                            <select
                              className={inputClass}
                              value={exitReason}
                              onChange={(e) =>
                                setExitReason(e.target.value as AbsModuleExitReason)
                              }
                            >
                              {ABS_MODULE_EXIT_REASON_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label="OS / venda / referência">
                            <input
                              className={inputClass}
                              value={exitRef}
                              onChange={(e) => setExitRef(e.target.value)}
                              placeholder="Ex.: OS #1842"
                            />
                          </Field>
                          <Field label="Observações">
                            <textarea
                              rows={2}
                              className={inputClass}
                              value={exitNotes}
                              onChange={(e) => setExitNotes(e.target.value)}
                            />
                          </Field>
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() =>
                              void runMovement(detail, {
                                public_id: detail.public_id,
                                movement_type: 'exit',
                                reason_type: exitReason,
                                reason_ref: exitRef || null,
                                notes: exitNotes || null,
                              })
                            }
                            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 py-3.5 font-semibold text-white disabled:opacity-50"
                          >
                            {actionBusy ? (
                              <Loader2 className="h-5 w-5 animate-spin" />
                            ) : null}
                            Confirmar saída
                          </button>
                        </>
                      )}
                    </div>
                  ) : null}

                  {action === 'entry' ? (
                    <div className="space-y-3 rounded-3xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-500/30 dark:bg-emerald-950/30">
                      <p className="text-[15px] font-semibold text-emerald-950 dark:text-emerald-100">
                        Registrar retorno de {detail.public_id} ao estoque?
                      </p>
                      <Field label="Local (opcional)">
                        <input
                          className={inputClass}
                          value={entryLocation}
                          onChange={(e) => setEntryLocation(e.target.value)}
                          placeholder={detail.location || 'Prateleira…'}
                        />
                      </Field>
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() =>
                          void runMovement(detail, {
                            public_id: detail.public_id,
                            movement_type: 'entry',
                            to_location: entryLocation || null,
                            notes: 'Retorno ao estoque',
                          })
                        }
                        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3.5 font-semibold text-white disabled:opacity-50"
                      >
                        {actionBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                        Confirmar entrada
                      </button>
                    </div>
                  ) : null}

                  {action === 'transfer' ? (
                    <div className="space-y-3 rounded-3xl border border-sky-200 bg-sky-50/70 p-4 dark:border-sky-500/30 dark:bg-sky-950/30">
                      <p className="text-[14px] text-sky-950 dark:text-sky-100">
                        Local atual: <strong>{detail.location || '—'}</strong>
                      </p>
                      <Field label="Novo local">
                        <input
                          className={inputClass}
                          value={transferLocation}
                          onChange={(e) => setTransferLocation(e.target.value)}
                          placeholder="Ex.: Prateleira C2"
                        />
                      </Field>
                      <button
                        type="button"
                        disabled={actionBusy || !transferLocation.trim()}
                        onClick={() =>
                          void runMovement(detail, {
                            public_id: detail.public_id,
                            movement_type: 'transfer',
                            to_location: transferLocation.trim(),
                          })
                        }
                        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-600 px-4 py-3.5 font-semibold text-white disabled:opacity-50"
                      >
                        {actionBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                        Confirmar transferência
                      </button>
                    </div>
                  ) : null}

                  {action === 'history' ? (
                    <div className="rounded-3xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-white/5">
                      <h3 className="mb-3 text-[15px] font-bold text-zinc-900 dark:text-white">
                        Histórico — {detail.public_id}
                      </h3>
                      {loadingHistory ? (
                        <div className="flex justify-center py-6">
                          <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
                        </div>
                      ) : history.length === 0 ? (
                        <p className="text-sm text-zinc-500">Sem movimentações.</p>
                      ) : (
                        <ul className="space-y-2">
                          {history.map((h) => (
                            <li
                              key={h.id}
                              className="rounded-2xl bg-zinc-50 px-3 py-2.5 text-[13px] dark:bg-black/25"
                            >
                              <span className="font-semibold text-zinc-900 dark:text-white">
                                {formatAbsModuleWhen(h.created_at)}
                              </span>
                              <span className="mt-0.5 block text-zinc-700 dark:text-zinc-300">
                                {describeAbsModuleMovement(h)}
                                {h.recorded_by_name ? ` — ${h.recorded_by_name}` : ''}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
      </div>
    </RegistrationPortal>
  );
}
