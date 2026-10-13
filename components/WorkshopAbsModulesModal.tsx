import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpFromLine,
  ChevronDown,
  ChevronRight,
  History,
  Loader2,
  MapPin,
  Plus,
  Printer,
  QrCode,
  Scissors,
  Search,
  X,
} from 'lucide-react';
import {
  createWorkshopAbsModule,
  createWorkshopAbsModuleMovement,
  disassembleWorkshopAbsModule,
  getWorkshopAbsModuleModel,
  getWorkshopAbsModuleModels,
  getWorkshopAbsModuleMovements,
  lookupWorkshopAbsModuleByCode,
  searchWorkshopAbsModules,
  type WorkshopAbsModule,
  type WorkshopAbsModuleModel,
  type WorkshopAbsModuleMovement,
  type WorkshopAbsModuleSearchResult,
} from '../services/apiService';
import {
  ABS_CODE_ROLE_OPTIONS,
  ABS_DISASSEMBLE_DESTINATION_OPTIONS,
  ABS_MODULE_EXIT_REASON_OPTIONS,
  ABS_MODULE_ITEM_CONDITION_OPTIONS,
  ABS_MODULE_ITEM_STATE_OPTIONS,
  ABS_MODULE_KIND_OPTIONS,
  ABS_MODULE_STATUS_OPTIONS,
  absModuleItemConditionLabel,
  absModuleItemStateLabel,
  absModuleKindLabel,
  absModuleStatusLabel,
  describeAbsModuleMovement,
  formatAbsModuleMoney,
  formatAbsModuleSequence,
  formatAbsModuleWhen,
  looksLikeAbsModuleCode,
  normalizeAbsModuleCode,
  primaryCodeForScope,
  type AbsComponentScope,
  type AbsDisassembleDestination,
  type AbsModuleExitReason,
  type AbsModuleItemCondition,
  type AbsModuleItemState,
  type AbsModuleKind,
  type AbsModuleStatus,
  type WorkshopAbsModuleApplicationInput,
  type WorkshopAbsModuleCodeInput,
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
  /** Abre o assistente de desmembramento para o módulo. */
  initialDisassemblePublicId?: string | null;
};

type View =
  | { kind: 'models' }
  | { kind: 'model'; model: WorkshopAbsModuleModel }
  | { kind: 'form' }
  | { kind: 'detail'; module: WorkshopAbsModule }
  | { kind: 'disassemble'; module: WorkshopAbsModule }
  | { kind: 'missing'; publicId: string };

type ActionPanel = null | 'exit' | 'entry' | 'transfer' | 'history';

type AppDraft = {
  vehicle_brand: string;
  vehicle_model: string;
  year_from: string;
  year_to: string;
  engine: string;
  notes: string;
};

type WizardState = {
  manufacturer: string;
  family: string;
  module_kind: AbsModuleKind;
  notes: string;
  eletronicoCodes: { code_role: WorkshopAbsModuleCodeInput['code_role']; code_value: string }[];
  hidraulicoCodes: { code_role: WorkshopAbsModuleCodeInput['code_role']; code_value: string }[];
  appsCompleto: AppDraft[];
  appsEletronico: AppDraft[];
  appsHidraulico: AppDraft[];
  item_state: AbsModuleItemState;
  item_condition: AbsModuleItemCondition;
  damage_description: string;
  unit_cost: number;
  unit_price: number;
  supplier: string;
  location: string;
  unit_notes: string;
};

const emptyApp = (): AppDraft => ({
  vehicle_brand: '',
  vehicle_model: '',
  year_from: '',
  year_to: '',
  engine: '',
  notes: '',
});

const emptyWizard = (): WizardState => ({
  manufacturer: '',
  family: '',
  module_kind: 'completo',
  notes: '',
  eletronicoCodes: [{ code_role: 'fabricante', code_value: '' }],
  hidraulicoCodes: [{ code_role: 'fabricante', code_value: '' }],
  appsCompleto: [emptyApp()],
  appsEletronico: [emptyApp()],
  appsHidraulico: [emptyApp()],
  item_state: 'usado',
  item_condition: 'nao_testado',
  damage_description: '',
  unit_cost: 0,
  unit_price: 0,
  supplier: '',
  location: '',
  unit_notes: '',
});

function StatusPill({ status }: { status: string }) {
  const available = status === 'disponivel';
  const reserved = status === 'reservado';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold ${
        available
          ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
          : reserved
            ? 'bg-amber-500/15 text-amber-900 dark:text-amber-200'
            : 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300'
      }`}
    >
      <span
        className={`h-2.5 w-2.5 rounded-full ${
          available ? 'bg-emerald-500' : reserved ? 'bg-amber-500' : 'bg-zinc-400'
        }`}
      />
      {absModuleStatusLabel(status)}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
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
  'w-full rounded-2xl border-0 bg-zinc-100 px-3 py-3 text-[15px] text-zinc-900 outline-none ring-emerald-500/30 focus:ring-2 shadow-none dark:bg-white/5 dark:text-white';

const selectClass = inputClass;

function toApps(
  drafts: AppDraft[],
  scope: AbsComponentScope
): WorkshopAbsModuleApplicationInput[] {
  return drafts
    .filter((a) => a.vehicle_brand.trim() || a.vehicle_model.trim())
    .map((a, i) => ({
      component_scope: scope,
      vehicle_brand: a.vehicle_brand.trim() || null,
      vehicle_model: a.vehicle_model.trim() || null,
      year_from: a.year_from ? Number(a.year_from) : null,
      year_to: a.year_to ? Number(a.year_to) : null,
      engine: a.engine.trim() || null,
      notes: a.notes.trim() || null,
      sort_order: i,
    }));
}

function toCodes(
  drafts: { code_role: WorkshopAbsModuleCodeInput['code_role']; code_value: string }[],
  scope: AbsComponentScope
): WorkshopAbsModuleCodeInput[] {
  return drafts
    .filter((c) => c.code_value.trim())
    .map((c, i) => ({
      component_scope: scope,
      code_role: c.code_role || 'fabricante',
      code_value: c.code_value.trim(),
      sort_order: i,
    }));
}

function modelPrimaryCode(model: WorkshopAbsModuleModel): string {
  return (
    primaryCodeForScope(model.codes, 'completo') ||
    primaryCodeForScope(model.codes, 'eletronico') ||
    primaryCodeForScope(model.codes, 'hidraulico') ||
    '—'
  );
}

function AppsEditor({
  title,
  apps,
  onChange,
}: {
  title: string;
  apps: AppDraft[];
  onChange: (next: AppDraft[]) => void;
}) {
  return (
    <div className="space-y-2 rounded-2xl bg-zinc-100/80 p-3 dark:bg-white/[0.04]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-zinc-500">{title}</p>
        <button
          type="button"
          onClick={() => onChange([...apps, emptyApp()])}
          className="text-[12px] font-semibold text-emerald-700 dark:text-emerald-300"
        >
          + aplicação
        </button>
      </div>
      {apps.map((app, idx) => (
        <div key={idx} className="grid gap-2 sm:grid-cols-2">
          <input
            className={inputClass}
            placeholder="Marca veículo"
            value={app.vehicle_brand}
            onChange={(e) => {
              const next = [...apps];
              next[idx] = { ...app, vehicle_brand: e.target.value };
              onChange(next);
            }}
          />
          <input
            className={inputClass}
            placeholder="Modelo"
            value={app.vehicle_model}
            onChange={(e) => {
              const next = [...apps];
              next[idx] = { ...app, vehicle_model: e.target.value };
              onChange(next);
            }}
          />
          <input
            className={inputClass}
            placeholder="Ano de"
            value={app.year_from}
            onChange={(e) => {
              const next = [...apps];
              next[idx] = { ...app, year_from: e.target.value };
              onChange(next);
            }}
          />
          <input
            className={inputClass}
            placeholder="Ano até"
            value={app.year_to}
            onChange={(e) => {
              const next = [...apps];
              next[idx] = { ...app, year_to: e.target.value };
              onChange(next);
            }}
          />
          <input
            className={`${inputClass} sm:col-span-2`}
            placeholder="Motor / versão / notas"
            value={app.engine || app.notes}
            onChange={(e) => {
              const next = [...apps];
              next[idx] = { ...app, engine: e.target.value };
              onChange(next);
            }}
          />
        </div>
      ))}
    </div>
  );
}

function CodesEditor({
  title,
  codes,
  onChange,
}: {
  title: string;
  codes: { code_role: WorkshopAbsModuleCodeInput['code_role']; code_value: string }[];
  onChange: (next: typeof codes) => void;
}) {
  return (
    <div className="space-y-2 rounded-2xl bg-zinc-100/80 p-3 dark:bg-white/[0.04]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-zinc-500">{title}</p>
        <button
          type="button"
          onClick={() => onChange([...codes, { code_role: 'alternativo', code_value: '' }])}
          className="text-[12px] font-semibold text-emerald-700 dark:text-emerald-300"
        >
          + código
        </button>
      </div>
      {codes.map((c, idx) => (
        <div key={idx} className="grid grid-cols-[120px_1fr] gap-2">
          <select
            className={selectClass}
            value={c.code_role || 'fabricante'}
            onChange={(e) => {
              const next = [...codes];
              next[idx] = {
                ...c,
                code_role: e.target.value as WorkshopAbsModuleCodeInput['code_role'],
              };
              onChange(next);
            }}
          >
            {ABS_CODE_ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            className={inputClass}
            placeholder="Código"
            value={c.code_value}
            onChange={(e) => {
              const next = [...codes];
              next[idx] = { ...c, code_value: e.target.value };
              onChange(next);
            }}
          />
        </div>
      ))}
    </div>
  );
}

export function WorkshopAbsModulesModal({
  isOpen,
  onClose,
  initialMissingPublicId = null,
  initialPublicId = null,
  initialDisassemblePublicId = null,
}: WorkshopAbsModulesModalProps) {
  const isDesktopShell = useDesktopShellLayout();
  const [view, setView] = useState<View>({ kind: 'models' });
  const [models, setModels] = useState<WorkshopAbsModuleModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanCode, setScanCode] = useState('');
  const [query, setQuery] = useState('');
  const [filterKind, setFilterKind] = useState<AbsModuleKind | ''>('');
  const [filterManufacturer, setFilterManufacturer] = useState('');
  const [filterState, setFilterState] = useState<AbsModuleItemState | ''>('');
  const [filterCondition, setFilterCondition] = useState<AbsModuleItemCondition | ''>('');
  const [filterStatus, setFilterStatus] = useState<AbsModuleStatus | ''>('');
  const [wizard, setWizard] = useState<WizardState>(emptyWizard);
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
  const [disWithdrawn, setDisWithdrawn] = useState<'eletronico' | 'hidraulico'>('eletronico');
  const [disDestination, setDisDestination] = useState<AbsDisassembleDestination>('estoque');
  const [disDestRef, setDisDestRef] = useState('');
  const [disCostRemaining, setDisCostRemaining] = useState('');
  const [disCostWithdrawn, setDisCostWithdrawn] = useState('');
  const [disNotes, setDisNotes] = useState('');
  const [smartSearch, setSmartSearch] = useState<WorkshopAbsModuleSearchResult | null>(null);
  const [smartSearchBusy, setSmartSearchBusy] = useState(false);

  useBrowserBackLayer(isOpen, onClose);

  const recordedByName = useMemo(() => {
    const auth = getStoredAuth();
    return auth?.displayName || auth?.username || (auth?.role === 'admin' ? 'Gerência' : null);
  }, []);

  const loadModels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getWorkshopAbsModuleModels({
        q: query || undefined,
        module_kind: filterKind || undefined,
        manufacturer: filterManufacturer || undefined,
        item_state: filterState || undefined,
        item_condition: filterCondition || undefined,
        status: filterStatus || undefined,
      });
      setModels(list);
      const q = query.trim();
      if (q.length >= 2) {
        setSmartSearchBusy(true);
        try {
          setSmartSearch(await searchWorkshopAbsModules(q));
        } catch {
          setSmartSearch(null);
        } finally {
          setSmartSearchBusy(false);
        }
      } else {
        setSmartSearch(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao listar modelos ABS.');
    } finally {
      setLoading(false);
    }
  }, [filterCondition, filterKind, filterManufacturer, filterState, filterStatus, query]);

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

  const openDisassemble = useCallback((mod: WorkshopAbsModule) => {
    setView({ kind: 'disassemble', module: mod });
    setDisWithdrawn('eletronico');
    setDisDestination('estoque');
    setDisDestRef('');
    setDisCostRemaining(String(Math.round((Number(mod.unit_cost) || 0) / 2)));
    setDisCostWithdrawn(String(Math.round((Number(mod.unit_cost) || 0) / 2)));
    setDisNotes('');
    setActionError(null);
    setSuccessMsg(null);
  }, []);

  const openModel = useCallback(async (model: WorkshopAbsModuleModel) => {
    setLoading(true);
    setError(null);
    try {
      const fresh = await getWorkshopAbsModuleModel(model.id);
      setView({ kind: 'model', model: fresh });
    } catch {
      setView({ kind: 'model', model });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setScanCode('');
    setQuery('');
    setFilterKind('');
    setFilterManufacturer('');
    setFilterState('');
    setFilterCondition('');
    setFilterStatus('');
    setError(null);
    setSuccessMsg(null);
    setAction(null);
    setWizard(emptyWizard());

    const boot = async () => {
      if (initialDisassemblePublicId) {
        setLoading(true);
        try {
          const result = await lookupWorkshopAbsModuleByCode(initialDisassemblePublicId);
          if (result.found && result.module) {
            openDisassemble(result.module);
            return;
          }
          const pid =
            normalizeAbsModuleCode(initialDisassemblePublicId) ||
            initialDisassemblePublicId.toUpperCase();
          setView({ kind: 'missing', publicId: pid });
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Falha na busca.');
          setView({ kind: 'models' });
          await loadModels();
        } finally {
          setLoading(false);
        }
        return;
      }
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
          setView({ kind: 'models' });
          await loadModels();
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
      setView({ kind: 'models' });
      await loadModels();
    };
    void boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- boot only on open / initial ids
  }, [isOpen, initialMissingPublicId, initialPublicId, initialDisassemblePublicId]);

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
      const kind = wizard.module_kind;
      const codes: WorkshopAbsModuleCodeInput[] = [];
      const applications: WorkshopAbsModuleApplicationInput[] = [];

      if (kind === 'eletronico') {
        codes.push(...toCodes(wizard.eletronicoCodes, 'eletronico'));
      } else if (kind === 'hidraulico') {
        codes.push(...toCodes(wizard.hidraulicoCodes, 'hidraulico'));
      } else if (kind === 'completo') {
        codes.push(...toCodes(wizard.eletronicoCodes, 'eletronico'));
        codes.push(...toCodes(wizard.hidraulicoCodes, 'hidraulico'));
        codes.push(...toCodes(wizard.eletronicoCodes, 'completo'));
      } else {
        codes.push(...toCodes(wizard.eletronicoCodes, 'completo'));
      }

      if (kind === 'completo') {
        applications.push(...toApps(wizard.appsCompleto, 'completo'));
        applications.push(...toApps(wizard.appsEletronico, 'eletronico'));
        applications.push(...toApps(wizard.appsHidraulico, 'hidraulico'));
      } else if (kind === 'eletronico') {
        applications.push(...toApps(wizard.appsEletronico, 'eletronico'));
      } else if (kind === 'hidraulico') {
        applications.push(...toApps(wizard.appsHidraulico, 'hidraulico'));
      } else {
        applications.push(...toApps(wizard.appsCompleto, 'completo'));
      }

      const primary =
        primaryCodeForScope(
          codes.map((c, i) => ({
            id: String(i),
            model_id: '',
            component_scope: c.component_scope,
            code_role: c.code_role || 'fabricante',
            code_value: c.code_value,
            sort_order: c.sort_order ?? i,
          })),
          kind === 'hidraulico' ? 'hidraulico' : kind === 'eletronico' ? 'eletronico' : 'completo'
        ) ||
        codes[0]?.code_value ||
        null;

      const created = await createWorkshopAbsModule({
        manufacturer: wizard.manufacturer || null,
        original_code: primary,
        application:
          applications[0]?.vehicle_model ||
          applications[0]?.vehicle_brand ||
          null,
        model: wizard.family || null,
        module_kind: kind,
        item_state: wizard.item_state,
        item_condition: wizard.item_condition,
        damage_description: wizard.damage_description || null,
        unit_cost: wizard.unit_cost,
        unit_price: wizard.unit_price,
        supplier: wizard.supplier || null,
        location: wizard.location || null,
        notes: wizard.unit_notes || wizard.notes || null,
        status: 'disponivel',
        catalog: {
          manufacturer: wizard.manufacturer || null,
          family: wizard.family || null,
          module_kind: kind,
          notes: wizard.notes || null,
          codes,
          applications,
        },
        recorded_by_name: recordedByName,
      });
      openDetail(created);
      setSuccessMsg(
        `Unidade ${formatAbsModuleSequence(created.sequence_number)} (${created.public_id}) cadastrada.`
      );
      void loadModels();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao cadastrar.');
    } finally {
      setSaving(false);
    }
  }, [loadModels, openDetail, recordedByName, wizard]);

  const handlePrint = useCallback(async (mod: WorkshopAbsModule) => {
    setPrintBusy(true);
    try {
      await printAbsModuleLabel({
        publicId: mod.public_id,
        moduleKind: mod.module_kind,
        manufacturer: mod.manufacturer,
        application: mod.application,
        sequenceNumber: mod.sequence_number,
        location: mod.location,
        code: mod.original_code,
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
        void loadModels();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : 'Falha na movimentação.');
      } finally {
        setActionBusy(false);
      }
    },
    [loadModels, openDetail, recordedByName]
  );

  const handleDisassemble = useCallback(async () => {
    if (view.kind !== 'disassemble') return;
    const mod = view.module;
    setActionBusy(true);
    setActionError(null);
    try {
      const result = await disassembleWorkshopAbsModule(mod.public_id, {
        withdrawn_kind: disWithdrawn,
        destination: disDestination,
        destination_ref: disDestRef || null,
        cost_remaining: disCostRemaining ? Number(disCostRemaining) : null,
        cost_withdrawn: disCostWithdrawn ? Number(disCostWithdrawn) : null,
        notes: disNotes || null,
        recorded_by_name: recordedByName,
      });
      setSuccessMsg(
        `Desmembrado: restante ${result.remaining.public_id} · retirado ${result.withdrawn.public_id}. Imprima a etiqueta do componente em estoque.`
      );
      // Prioriza o componente que permanece disponível para etiqueta.
      openDetail(
        result.remaining.status === 'disponivel' ? result.remaining : result.withdrawn
      );
      void loadModels();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Falha ao desmembrar.');
    } finally {
      setActionBusy(false);
    }
  }, [
    disCostRemaining,
    disCostWithdrawn,
    disDestRef,
    disDestination,
    disNotes,
    disWithdrawn,
    loadModels,
    openDetail,
    recordedByName,
    view,
  ]);

  const goBack = useCallback(() => {
    setAction(null);
    setActionError(null);
    if (view.kind === 'detail' || view.kind === 'disassemble') {
      const mod = view.module;
      if (mod.model_id) {
        void openModel({
          id: mod.model_id,
          manufacturer: mod.manufacturer,
          family: mod.model,
          module_kind: mod.module_kind,
          notes: null,
          created_at: mod.created_at,
          updated_at: mod.updated_at,
          units: [],
        });
        return;
      }
    }
    if (view.kind === 'model' || view.kind === 'form' || view.kind === 'missing') {
      setView({ kind: 'models' });
      void loadModels();
      return;
    }
    setView({ kind: 'models' });
    void loadModels();
  }, [loadModels, openModel, view]);

  if (!isOpen) return null;

  const detail = view.kind === 'detail' ? view.module : null;
  const showEletronicoCodes =
    wizard.module_kind === 'completo' ||
    wizard.module_kind === 'eletronico' ||
    wizard.module_kind === 'outro';
  const showHidraulicoCodes =
    wizard.module_kind === 'completo' || wizard.module_kind === 'hidraulico';

  return (
    <RegistrationPortal>
      <div
        className={resolveIosModalOverlayClass(isDesktopShell, NESTED_STOCK_OVERLAY_Z)}
        role="dialog"
        aria-modal="true"
        aria-label="Módulos ABS"
      >
        <div
          className={`flex w-full flex-col overflow-hidden rounded-[1.75rem] border-0 bg-zinc-50 shadow-none dark:bg-zinc-950 sm:rounded-[28px] ${
            isDesktopShell
              ? 'max-h-[min(860px,94vh)] max-w-5xl'
              : 'max-h-[min(920px,94dvh)] max-w-3xl'
          }`}
        >
          <header className="flex shrink-0 items-center gap-3 border-b border-zinc-200/80 px-4 py-4 dark:border-white/10">
            {view.kind !== 'models' ? (
              <button
                type="button"
                onClick={goBack}
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border-0 bg-zinc-100 text-zinc-700 shadow-none dark:bg-white/5 dark:text-white"
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
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-400">
                Estoque · ABS
              </p>
              <h2 className="text-[18px] font-bold text-zinc-900 dark:text-white">Módulos ABS</h2>
              <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
                {view.kind === 'models' && 'Catálogo técnico e unidades físicas'}
                {view.kind === 'model' && 'Unidades do modelo'}
                {view.kind === 'form' && 'Novo módulo — modelo + unidade'}
                {view.kind === 'detail' && 'Detalhe da unidade'}
                {view.kind === 'disassemble' && 'Desmembrar módulo completo'}
                {view.kind === 'missing' && 'QR não encontrado'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border-0 bg-zinc-100 text-zinc-700 shadow-none dark:bg-white/5 dark:text-white"
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

            {view.kind === 'models' ? (
              <>
                <BarcodeScanField
                  value={scanCode}
                  onChange={setScanCode}
                  onSubmitCode={handleScan}
                  placeholder="Leia o QR ABS-000001 ou digite o ID"
                />
                <div className="flex flex-wrap gap-2">
                  <div className="relative min-w-0 flex-1 basis-[200px]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void loadModels();
                      }}
                      placeholder="Buscar fabricante, código, aplicação…"
                      className={`${inputClass} pl-10`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadModels()}
                    className="rounded-2xl border-0 bg-zinc-100 px-4 py-3 text-[14px] font-semibold text-zinc-800 shadow-none dark:bg-white/5 dark:text-white"
                  >
                    Filtrar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setWizard(emptyWizard());
                      setView({ kind: 'form' });
                      requestAnimationFrame(() => {
                        document
                          .querySelector('[data-abs-modules-scroll]')
                          ?.scrollTo({ top: 0 });
                      });
                    }}
                    className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-[14px] font-semibold text-white"
                  >
                    <Plus className="h-4 w-4" />
                    Novo módulo
                  </button>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  <select
                    className={selectClass}
                    value={filterKind}
                    onChange={(e) => setFilterKind(e.target.value as AbsModuleKind | '')}
                  >
                    <option value="">Tipo</option>
                    {ABS_MODULE_KIND_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <input
                    className={inputClass}
                    placeholder="Fabricante"
                    value={filterManufacturer}
                    onChange={(e) => setFilterManufacturer(e.target.value)}
                  />
                  <select
                    className={selectClass}
                    value={filterState}
                    onChange={(e) => setFilterState(e.target.value as AbsModuleItemState | '')}
                  >
                    <option value="">Estado</option>
                    {ABS_MODULE_ITEM_STATE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className={selectClass}
                    value={filterCondition}
                    onChange={(e) =>
                      setFilterCondition(e.target.value as AbsModuleItemCondition | '')
                    }
                  >
                    <option value="">Condição</option>
                    {ABS_MODULE_ITEM_CONDITION_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className={selectClass}
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value as AbsModuleStatus | '')}
                  >
                    <option value="">Disponibilidade</option>
                    {ABS_MODULE_STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                {smartSearchBusy ? (
                  <p className="text-[13px] text-zinc-500">Buscando componentes…</p>
                ) : null}
                {smartSearch &&
                (smartSearch.availableUnits.length > 0 ||
                  smartSearch.availableViaDisassembly.length > 0) ? (
                  <div className="space-y-3">
                    {smartSearch.availableUnits.length > 0 ? (
                      <section className="space-y-2">
                        <h3 className="text-[12px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                          Disponíveis individualmente
                        </h3>
                        <ul className="space-y-2">
                          {smartSearch.availableUnits.map((u) => (
                            <li key={u.id}>
                              <button
                                type="button"
                                onClick={() => openDetail(u)}
                                className="flex w-full items-center gap-3 rounded-3xl border-0 bg-white px-4 py-3 text-left shadow-none hover:bg-zinc-50 dark:bg-white/5 dark:hover:bg-white/10"
                              >
                                <span className="min-w-0 flex-1">
                                  <span className="block text-[15px] font-bold text-zinc-900 dark:text-white">
                                    {formatAbsModuleSequence(u.sequence_number)} · {u.public_id}
                                  </span>
                                  <span className="mt-0.5 block text-[13px] text-zinc-600 dark:text-zinc-300">
                                    {absModuleKindLabel(u.module_kind)}
                                    {u.manufacturer ? ` · ${u.manufacturer}` : ''}
                                    {u.original_code ? ` · ${u.original_code}` : ''}
                                  </span>
                                </span>
                                <StatusPill status={u.status} />
                              </button>
                            </li>
                          ))}
                        </ul>
                      </section>
                    ) : null}
                    {smartSearch.availableViaDisassembly.length > 0 ? (
                      <section className="space-y-2">
                        <h3 className="text-[12px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                          Disponíveis mediante desmembramento
                        </h3>
                        <ul className="space-y-2">
                          {smartSearch.availableViaDisassembly.map((u) => (
                            <li key={u.id}>
                              <div className="flex flex-wrap items-center gap-2 rounded-3xl border-0 bg-white px-4 py-3 shadow-none dark:bg-white/5">
                                <button
                                  type="button"
                                  onClick={() => openDetail(u)}
                                  className="min-w-0 flex-1 text-left"
                                >
                                  <span className="block text-[15px] font-bold text-zinc-900 dark:text-white">
                                    {formatAbsModuleSequence(u.sequence_number)} · {u.public_id}
                                  </span>
                                  <span className="mt-0.5 block text-[13px] text-zinc-600 dark:text-zinc-300">
                                    Completo
                                    {u.manufacturer ? ` · ${u.manufacturer}` : ''}
                                    {u.original_code ? ` · ${u.original_code}` : ''}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openDisassemble(u)}
                                  className="inline-flex items-center gap-1.5 rounded-2xl bg-amber-600 px-3 py-2 text-[13px] font-semibold text-white"
                                >
                                  <Scissors className="h-3.5 w-3.5" />
                                  Desmembrar
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </section>
                    ) : null}
                  </div>
                ) : null}

                {loading ? (
                  <div className="flex justify-center py-10 text-zinc-500">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : models.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-zinc-300 px-4 py-10 text-center text-sm text-zinc-500 dark:border-white/15">
                    Nenhum modelo ABS encontrado. Cadastre o primeiro módulo.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    <li className="px-1 pt-1 text-[12px] font-bold uppercase tracking-wider text-zinc-500">
                      Modelos técnicos
                    </li>
                    {models.map((m) => (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => void openModel(m)}
                          className="flex w-full items-center gap-3 rounded-3xl border-0 bg-white px-4 py-3.5 text-left shadow-none transition hover:bg-zinc-50 dark:bg-white/5 dark:hover:bg-white/10"
                        >
                          <ChevronRight className="h-5 w-5 shrink-0 text-zinc-400" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[15px] font-bold text-zinc-900 dark:text-white">
                              {[m.manufacturer, modelPrimaryCode(m)].filter(Boolean).join(' · ') ||
                                absModuleKindLabel(m.module_kind)}
                            </span>
                            <span className="mt-0.5 block text-[13px] text-zinc-600 dark:text-zinc-300">
                              {absModuleKindLabel(m.module_kind)}
                              {m.family ? ` · ${m.family}` : ''}
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block text-[15px] font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                              {m.available_qty ?? 0}
                            </span>
                            <span className="text-[11px] text-zinc-500">
                              disp. / {m.total_qty ?? 0}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : null}

            {view.kind === 'model' ? (
              <div className="space-y-4">
                <div className="rounded-3xl border-0 bg-white p-4 shadow-none dark:bg-white/5">
                  <p className="text-[12px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                    Modelo técnico
                  </p>
                  <p className="mt-1 text-[20px] font-extrabold text-zinc-900 dark:text-white">
                    {view.model.manufacturer || '—'} · {modelPrimaryCode(view.model)}
                  </p>
                  <p className="mt-1 text-[13px] text-zinc-500">
                    {absModuleKindLabel(view.model.module_kind)}
                    {view.model.family ? ` · ${view.model.family}` : ''} ·{' '}
                    {view.model.available_qty ?? 0} disponíveis
                  </p>
                </div>
                <div className="overflow-x-auto rounded-3xl border-0 bg-white shadow-none dark:bg-white/5">
                  <table className="w-full min-w-[640px] text-left text-[13px]">
                    <thead className="border-b border-zinc-100 text-[11px] uppercase tracking-wide text-zinc-500 dark:border-white/10">
                      <tr>
                        <th className="px-3 py-3 font-semibold">#</th>
                        <th className="px-3 py-3 font-semibold">ID</th>
                        <th className="px-3 py-3 font-semibold">Condição</th>
                        <th className="px-3 py-3 font-semibold">Preço</th>
                        <th className="px-3 py-3 font-semibold">Local</th>
                        <th className="px-3 py-3 font-semibold">Status</th>
                        <th className="px-3 py-3 font-semibold">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(view.model.units || []).length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-3 py-8 text-center text-zinc-500">
                            Nenhuma unidade neste modelo.
                          </td>
                        </tr>
                      ) : (
                        (view.model.units || []).map((u) => (
                          <tr
                            key={u.id}
                            className="border-b border-zinc-50 last:border-0 dark:border-white/[0.04]"
                          >
                            <td className="px-3 py-3 font-mono text-[15px] font-bold tabular-nums text-zinc-900 dark:text-white">
                              {formatAbsModuleSequence(u.sequence_number)}
                            </td>
                            <td className="px-3 py-3 font-mono text-zinc-700 dark:text-zinc-200">
                              {u.public_id}
                            </td>
                            <td className="px-3 py-3 text-zinc-700 dark:text-zinc-300">
                              {absModuleItemStateLabel(u.item_state)} ·{' '}
                              {absModuleItemConditionLabel(u.item_condition)}
                            </td>
                            <td className="px-3 py-3 tabular-nums">
                              {formatAbsModuleMoney(u.unit_price)}
                            </td>
                            <td className="px-3 py-3">{u.location || '—'}</td>
                            <td className="px-3 py-3">
                              <StatusPill status={u.status} />
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex flex-wrap gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => openDetail(u)}
                                  className="rounded-xl bg-zinc-100 px-2.5 py-1.5 text-[12px] font-semibold dark:bg-white/10"
                                >
                                  Abrir
                                </button>
                                <button
                                  type="button"
                                  disabled={printBusy}
                                  onClick={() => void handlePrint(u)}
                                  className="rounded-xl bg-zinc-100 px-2.5 py-1.5 text-[12px] font-semibold dark:bg-white/10"
                                >
                                  Etiqueta
                                </button>
                                {u.module_kind === 'completo' && u.status === 'disponivel' ? (
                                  <button
                                    type="button"
                                    onClick={() => openDisassemble(u)}
                                    className="rounded-xl bg-amber-500/15 px-2.5 py-1.5 text-[12px] font-semibold text-amber-900 dark:text-amber-200"
                                  >
                                    Desmembrar
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setWizard({
                      ...emptyWizard(),
                      manufacturer: view.model.manufacturer || '',
                      family: view.model.family || '',
                      module_kind: view.model.module_kind,
                    });
                    setView({ kind: 'form' });
                  }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3.5 text-[15px] font-semibold text-white"
                >
                  <Plus className="h-5 w-5" />
                  Adicionar unidade neste modelo
                </button>
              </div>
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
                    setWizard(emptyWizard());
                    setView({ kind: 'form' });
                  }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3.5 text-[15px] font-semibold text-white"
                >
                  <Plus className="h-5 w-5" />
                  Cadastrar novo módulo
                </button>
              </div>
            ) : null}

            {view.kind === 'form' ? (
              <div className="space-y-4">
                <section className="space-y-3">
                  <h3 className="text-[14px] font-bold text-zinc-900 dark:text-white">
                    1. Modelo técnico
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Fabricante">
                      <input
                        className={inputClass}
                        value={wizard.manufacturer}
                        onChange={(e) =>
                          setWizard((w) => ({ ...w, manufacturer: e.target.value }))
                        }
                      />
                    </Field>
                    <Field label="Família / linha">
                      <input
                        className={inputClass}
                        value={wizard.family}
                        onChange={(e) => setWizard((w) => ({ ...w, family: e.target.value }))}
                      />
                    </Field>
                    <Field label="Tipo de módulo">
                      <select
                        className={selectClass}
                        value={wizard.module_kind}
                        onChange={(e) =>
                          setWizard((w) => ({
                            ...w,
                            module_kind: e.target.value as AbsModuleKind,
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
                    <Field label="Notas do modelo">
                      <input
                        className={inputClass}
                        value={wizard.notes}
                        onChange={(e) => setWizard((w) => ({ ...w, notes: e.target.value }))}
                      />
                    </Field>
                  </div>
                  {showEletronicoCodes ? (
                    <CodesEditor
                      title="Códigos eletrônico"
                      codes={wizard.eletronicoCodes}
                      onChange={(eletronicoCodes) => setWizard((w) => ({ ...w, eletronicoCodes }))}
                    />
                  ) : null}
                  {showHidraulicoCodes ? (
                    <CodesEditor
                      title="Códigos hidráulico"
                      codes={wizard.hidraulicoCodes}
                      onChange={(hidraulicoCodes) => setWizard((w) => ({ ...w, hidraulicoCodes }))}
                    />
                  ) : null}
                </section>

                <section className="space-y-3">
                  <h3 className="text-[14px] font-bold text-zinc-900 dark:text-white">
                    2. Aplicações (3 escopos)
                  </h3>
                  {(wizard.module_kind === 'completo' || wizard.module_kind === 'outro') && (
                    <AppsEditor
                      title="Escopo completo"
                      apps={wizard.appsCompleto}
                      onChange={(appsCompleto) => setWizard((w) => ({ ...w, appsCompleto }))}
                    />
                  )}
                  {(wizard.module_kind === 'completo' || wizard.module_kind === 'eletronico') && (
                    <AppsEditor
                      title="Escopo eletrônico"
                      apps={wizard.appsEletronico}
                      onChange={(appsEletronico) => setWizard((w) => ({ ...w, appsEletronico }))}
                    />
                  )}
                  {(wizard.module_kind === 'completo' || wizard.module_kind === 'hidraulico') && (
                    <AppsEditor
                      title="Escopo hidráulico"
                      apps={wizard.appsHidraulico}
                      onChange={(appsHidraulico) => setWizard((w) => ({ ...w, appsHidraulico }))}
                    />
                  )}
                </section>

                <section className="space-y-3">
                  <h3 className="text-[14px] font-bold text-zinc-900 dark:text-white">
                    3. Unidade física
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Estado">
                      <select
                        className={selectClass}
                        value={wizard.item_state}
                        onChange={(e) =>
                          setWizard((w) => ({
                            ...w,
                            item_state: e.target.value as AbsModuleItemState,
                          }))
                        }
                      >
                        {ABS_MODULE_ITEM_STATE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Condição">
                      <select
                        className={selectClass}
                        value={wizard.item_condition}
                        onChange={(e) =>
                          setWizard((w) => ({
                            ...w,
                            item_condition: e.target.value as AbsModuleItemCondition,
                          }))
                        }
                      >
                        {ABS_MODULE_ITEM_CONDITION_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Custo">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className={inputClass}
                        value={wizard.unit_cost}
                        onChange={(e) =>
                          setWizard((w) => ({ ...w, unit_cost: Number(e.target.value) || 0 }))
                        }
                      />
                    </Field>
                    <Field label="Preço">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className={inputClass}
                        value={wizard.unit_price}
                        onChange={(e) =>
                          setWizard((w) => ({ ...w, unit_price: Number(e.target.value) || 0 }))
                        }
                      />
                    </Field>
                    <Field label="Localização">
                      <input
                        className={inputClass}
                        value={wizard.location}
                        onChange={(e) => setWizard((w) => ({ ...w, location: e.target.value }))}
                        placeholder="Prateleira B3"
                      />
                    </Field>
                    <Field label="Fornecedor">
                      <input
                        className={inputClass}
                        value={wizard.supplier}
                        onChange={(e) => setWizard((w) => ({ ...w, supplier: e.target.value }))}
                      />
                    </Field>
                    <Field label="Avarias / descrição">
                      <input
                        className={`${inputClass} sm:col-span-2`}
                        value={wizard.damage_description}
                        onChange={(e) =>
                          setWizard((w) => ({ ...w, damage_description: e.target.value }))
                        }
                      />
                    </Field>
                  </div>
                  <Field label="Observações da unidade">
                    <textarea
                      rows={2}
                      className={inputClass}
                      value={wizard.unit_notes}
                      onChange={(e) => setWizard((w) => ({ ...w, unit_notes: e.target.value }))}
                    />
                  </Field>
                </section>

                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleCreate()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3.5 text-[15px] font-semibold text-white disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
                  Salvar modelo + unidade e gerar ID
                </button>
              </div>
            ) : null}

            {view.kind === 'disassemble' ? (
              <div className="space-y-4">
                <div className="rounded-3xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-500/30 dark:bg-amber-950/30">
                  <p className="text-[15px] font-semibold text-amber-950 dark:text-amber-100">
                    Desmembrar {formatAbsModuleSequence(view.module.sequence_number)} ·{' '}
                    {view.module.public_id}
                  </p>
                  <p className="mt-1 text-[13px] text-amber-900/80 dark:text-amber-200/80">
                    Gera duas unidades (restante + retirado) e marca o completo como desmembrado.
                    Somente módulos completos e disponíveis.
                  </p>
                </div>
                {view.module.module_kind !== 'completo' || view.module.status !== 'disponivel' ? (
                  <p className="rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-200">
                    Este módulo não pode ser desmembrado (precisa ser completo + disponível).
                  </p>
                ) : (
                  <div className="space-y-3">
                    <Field label="Parte retirada">
                      <select
                        className={selectClass}
                        value={disWithdrawn}
                        onChange={(e) =>
                          setDisWithdrawn(e.target.value as 'eletronico' | 'hidraulico')
                        }
                      >
                        <option value="eletronico">Eletrônico</option>
                        <option value="hidraulico">Hidráulico</option>
                      </select>
                    </Field>
                    <Field label="Destino da parte retirada">
                      <select
                        className={selectClass}
                        value={disDestination}
                        onChange={(e) =>
                          setDisDestination(e.target.value as AbsDisassembleDestination)
                        }
                      >
                        {ABS_DISASSEMBLE_DESTINATION_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Referência (OS / venda)">
                      <input
                        className={inputClass}
                        value={disDestRef}
                        onChange={(e) => setDisDestRef(e.target.value)}
                      />
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Custo restante">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          className={inputClass}
                          value={disCostRemaining}
                          onChange={(e) => setDisCostRemaining(e.target.value)}
                        />
                      </Field>
                      <Field label="Custo retirado">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          className={inputClass}
                          value={disCostWithdrawn}
                          onChange={(e) => setDisCostWithdrawn(e.target.value)}
                        />
                      </Field>
                    </div>
                    <Field label="Observações">
                      <textarea
                        rows={2}
                        className={inputClass}
                        value={disNotes}
                        onChange={(e) => setDisNotes(e.target.value)}
                      />
                    </Field>
                    {actionError ? (
                      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                        {actionError}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => void handleDisassemble()}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-600 px-4 py-3.5 text-[15px] font-semibold text-white disabled:opacity-50"
                    >
                      {actionBusy ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Scissors className="h-5 w-5" />
                      )}
                      Confirmar desmembramento
                    </button>
                  </div>
                )}
              </div>
            ) : null}

            {detail ? (
              <div className="space-y-4">
                <div className="rounded-3xl border-0 bg-white p-4 shadow-none dark:bg-white/5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[12px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                        Unidade ABS
                      </p>
                      <p className="mt-1 text-[28px] font-black tabular-nums tracking-tight text-zinc-900 dark:text-white">
                        {formatAbsModuleSequence(detail.sequence_number)}
                      </p>
                      <p className="mt-0.5 font-mono text-[15px] font-bold tracking-wide text-zinc-600 dark:text-zinc-300">
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
                      <dt className="text-zinc-500">Código</dt>
                      <dd className="font-semibold text-zinc-900 dark:text-white">
                        {detail.original_code || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500">Tipo</dt>
                      <dd className="font-semibold text-zinc-900 dark:text-white">
                        {absModuleKindLabel(detail.module_kind)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500">Estado / condição</dt>
                      <dd className="font-semibold text-zinc-900 dark:text-white">
                        {absModuleItemStateLabel(detail.item_state)} ·{' '}
                        {absModuleItemConditionLabel(detail.item_condition)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500">Aplicação</dt>
                      <dd className="font-semibold text-zinc-900 dark:text-white">
                        {[detail.application, detail.year_label].filter(Boolean).join(' ') || '—'}
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
                  {detail.damage_description ? (
                    <p className="mt-3 rounded-2xl bg-zinc-100 px-3 py-2 text-[13px] text-zinc-700 dark:bg-white/10 dark:text-zinc-200">
                      {detail.damage_description}
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
                  ) : detail.status !== 'desmembrado' ? (
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
                  ) : (
                    <div />
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
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border-0 bg-zinc-100 px-4 py-3.5 text-[15px] font-semibold text-zinc-800 shadow-none dark:bg-white/5 dark:text-white"
                  >
                    <History className="h-5 w-5" />
                    Ver histórico
                  </button>
                  <button
                    type="button"
                    disabled={printBusy}
                    onClick={() => void handlePrint(detail)}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border-0 bg-zinc-100 px-4 py-3.5 text-[15px] font-semibold text-zinc-800 shadow-none dark:bg-white/5 dark:text-white disabled:opacity-50"
                  >
                    {printBusy ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Printer className="h-5 w-5" />
                    )}
                    Imprimir etiqueta
                  </button>
                  {detail.module_kind === 'completo' && detail.status === 'disponivel' ? (
                    <button
                      type="button"
                      onClick={() => openDisassemble(detail)}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-500/15 px-4 py-3.5 text-[15px] font-semibold text-amber-950 dark:text-amber-100 sm:col-span-2"
                    >
                      <Scissors className="h-5 w-5" />
                      Desmembrar módulo
                    </button>
                  ) : null}
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
                          Confirmar saída de {formatAbsModuleSequence(detail.sequence_number)} (
                          {detail.public_id})?
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
                            className="flex-1 rounded-2xl border-0 bg-zinc-100 px-4 py-3 font-semibold shadow-none dark:bg-white/5"
                          >
                            Cancelar
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <Field label="Motivo da saída">
                          <select
                            className={selectClass}
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
                            placeholder="OS #1842"
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
                          {actionBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
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
                        placeholder="Prateleira C2"
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
                  <div className="rounded-3xl border-0 bg-white p-4 shadow-none dark:bg-white/5">
                    <h3 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-zinc-900 dark:text-white">
                      <ChevronDown className="h-4 w-4" />
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
