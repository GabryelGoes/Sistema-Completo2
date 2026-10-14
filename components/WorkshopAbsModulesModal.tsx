import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpFromLine,
  ChevronDown,
  ChevronRight,
  Camera,
  HelpCircle,
  History,
  Images,
  Loader2,
  MapPin,
  Package,
  Pencil,
  Plus,
  Printer,
  QrCode,
  Save,
  Scissors,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  ABS_MODULE_PHOTOS_MAX,
  createWorkshopAbsModule,
  createWorkshopAbsModuleMovement,
  deleteWorkshopAbsModule,
  deleteWorkshopAbsModulePhoto,
  disassembleWorkshopAbsModule,
  getWorkshopAbsModule,
  getWorkshopAbsModuleModel,
  getWorkshopAbsModuleModels,
  getWorkshopAbsModuleMovements,
  lookupWorkshopAbsModuleByCode,
  searchWorkshopAbsModules,
  updateWorkshopAbsModule,
  updateWorkshopAbsModuleModel,
  uploadWorkshopAbsModulePhoto,
  type WorkshopAbsModule,
  type WorkshopAbsModuleModel,
  type WorkshopAbsModuleMovement,
  type WorkshopAbsModulePhoto,
  type WorkshopAbsModuleSearchResult,
} from '../services/apiService';
import { setActiveBarcodeScanClaim } from '../utils/activeBarcodeScanClaim';
import { parseCurrencyStringToNumber } from '../utils/currencyMaskInput';
import { isLabOsQrPayload } from '../utils/labOsQrCode';
import { getLabProductKindPhotoUrl } from '../utils/moduleMetadata';
import { storageThumbnailUrl } from '../utils/storageThumbnailUrl';
import { normalizeBarcodeInput } from '../utils/workshopPartBarcode';
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
  formatAbsApplicationBrands,
  formatAbsApplicationVehicles,
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
import { getStoredAuth } from './views/LoginView';
import { BarcodeScanField } from './BarcodeScanField';
import { NiimbotAbsModuleLabelPrintModal } from './NiimbotAbsModuleLabelPrintModal';
import { CurrencyMaskInput } from './ui/CurrencyMaskInput';
import { PartPhotoImg } from './ui/PartPhotoImg';
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
  /** Abre unidades de um modelo técnico. */
  initialModelId?: string | null;
  /** Abre direto o formulário de novo módulo. */
  initialShowForm?: boolean;
  /** Abre a listagem com foco em leitura de código. */
  initialShowScan?: boolean;
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
  /** String monetária BR (ex.: "123.45") para CurrencyMaskInput. */
  unit_cost: string;
  unit_price: string;
  /** Quantidade de unidades físicas a criar neste cadastro (só criação). String para digitação livre. */
  unit_qty: string;
  supplier: string;
  location: string;
  unit_notes: string;
};

const ABS_MODULE_CREATE_QTY_MAX = 50;

function parseAbsCreateQty(
  raw: string | number | null | undefined,
  opts?: { allowZero?: boolean }
): number {
  const allowZero = Boolean(opts?.allowZero);
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 0) return allowZero ? 0 : 1;
  if (n === 0) return allowZero ? 0 : 1;
  return Math.min(ABS_MODULE_CREATE_QTY_MAX, n);
}

type PendingAbsPhoto = {
  id: string;
  file: File;
  previewUrl: string;
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
  unit_cost: '0',
  unit_price: '0',
  unit_qty: '1',
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

function FieldHintButton({ hint }: { hint: string }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLSpanElement>(null);

  const placePopover = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const width = Math.min(288, window.innerWidth - 24);
    let left = rect.left;
    if (left + width > window.innerWidth - 12) left = window.innerWidth - 12 - width;
    if (left < 12) left = 12;
    const below = rect.bottom + 8;
    const approxH = 88;
    const top =
      below + approxH > window.innerHeight - 12 ? Math.max(12, rect.top - approxH - 8) : below;
    setCoords({ top, left });
  }, []);

  useEffect(() => {
    if (!open) return;
    placePopover();
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onReposition = () => placePopover();
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open, placePopover]);

  return (
    <span className="relative inline-flex shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-200/80 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-white/10 dark:hover:text-zinc-200"
        aria-label="Ajuda sobre este campo"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <HelpCircle className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open && coords
        ? createPortal(
            <span
              ref={popRef}
              role="dialog"
              style={{ top: coords.top, left: coords.left, width: Math.min(288, window.innerWidth - 24) }}
              className="fixed z-[200] rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-[13px] font-medium leading-snug text-zinc-700 shadow-lg dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100"
            >
              {hint}
            </span>,
            document.body
          )
        : null}
    </span>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center gap-1.5">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {label}
        </span>
        {hint ? <FieldHintButton hint={hint} /> : null}
      </span>
      {children}
    </label>
  );
}

function SectionHint({ title, hint }: { title: string; hint: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-[12px] font-semibold uppercase tracking-wide text-zinc-500">{title}</span>
      <FieldHintButton hint={hint} />
    </span>
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

function detailHeroPhotoUrl(mod: WorkshopAbsModule): string | null {
  const unitPhoto = (mod.photos || [])[0]?.photo_url;
  if (unitPhoto) {
    return storageThumbnailUrl(unitPhoto, { maxWidth: 960, maxHeight: 640, resize: 'cover' }) || unitPhoto;
  }
  const kindRaw = getLabProductKindPhotoUrl(mod.module_kind);
  if (!kindRaw) return null;
  return storageThumbnailUrl(kindRaw, { maxWidth: 960, maxHeight: 640, resize: 'cover' }) || kindRaw;
}

function detailApplicationLabel(mod: WorkshopAbsModule): string {
  const apps = mod.catalog_model?.applications || [];
  if (apps.length) {
    const brands = formatAbsApplicationBrands(apps);
    const vehicles = formatAbsApplicationVehicles(apps);
    if (brands && vehicles) {
      const multiBrand = new Set(
        apps.map((a) => String(a.vehicle_brand || '').trim().toLowerCase()).filter(Boolean)
      ).size > 1;
      if (multiBrand) return vehicles;
      return `${brands} · ${vehicles}`;
    }
    return brands || vehicles || '—';
  }
  return [mod.application, mod.model, mod.year_label].filter(Boolean).join(' · ') || '—';
}

function detailCodes(mod: WorkshopAbsModule): { eletronico: string | null; hidraulico: string | null; primary: string | null } {
  const codes = mod.catalog_model?.codes;
  const eletronico =
    primaryCodeForScope(codes, 'eletronico') ||
    (mod.module_kind === 'eletronico' ? mod.original_code : null);
  const hidraulico =
    primaryCodeForScope(codes, 'hidraulico') ||
    (mod.module_kind === 'hidraulico' ? mod.original_code : null);
  const primary =
    primaryCodeForScope(codes, 'completo') ||
    mod.original_code ||
    eletronico ||
    hidraulico;
  return { eletronico, hidraulico, primary };
}

function AppsEditor({
  title,
  hint,
  apps,
  onChange,
}: {
  title: string;
  hint: string;
  apps: AppDraft[];
  onChange: (next: AppDraft[]) => void;
}) {
  return (
    <div className="space-y-2 rounded-2xl bg-zinc-100/80 p-3 dark:bg-white/[0.04]">
      <div className="flex items-center justify-between gap-2">
        <SectionHint title={title} hint={hint} />
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
          <Field label="Marca" hint="Marca do veículo compatível (ex.: VW, Fiat).">
            <input
              className={inputClass}
              value={app.vehicle_brand}
              onChange={(e) => {
                const next = [...apps];
                next[idx] = { ...app, vehicle_brand: e.target.value };
                onChange(next);
              }}
            />
          </Field>
          <Field label="Modelo" hint="Modelo do veículo (ex.: Gol, Palio).">
            <input
              className={inputClass}
              value={app.vehicle_model}
              onChange={(e) => {
                const next = [...apps];
                next[idx] = { ...app, vehicle_model: e.target.value };
                onChange(next);
              }}
            />
          </Field>
          <Field label="Ano de" hint="Ano inicial da faixa de aplicação.">
            <input
              className={inputClass}
              value={app.year_from}
              onChange={(e) => {
                const next = [...apps];
                next[idx] = { ...app, year_from: e.target.value };
                onChange(next);
              }}
            />
          </Field>
          <Field label="Ano até" hint="Ano final da faixa de aplicação.">
            <input
              className={inputClass}
              value={app.year_to}
              onChange={(e) => {
                const next = [...apps];
                next[idx] = { ...app, year_to: e.target.value };
                onChange(next);
              }}
            />
          </Field>
          <Field
            label="Motor / versão / notas"
            hint="Motorização, versão ou observação técnica desta aplicação."
          >
            <input
              className={inputClass}
              value={app.engine || app.notes}
              onChange={(e) => {
                const next = [...apps];
                next[idx] = { ...app, engine: e.target.value };
                onChange(next);
              }}
            />
          </Field>
        </div>
      ))}
    </div>
  );
}

function CodesEditor({
  title,
  hint,
  codes,
  onChange,
}: {
  title: string;
  hint: string;
  codes: { code_role: WorkshopAbsModuleCodeInput['code_role']; code_value: string }[];
  onChange: (next: typeof codes) => void;
}) {
  return (
    <div className="space-y-2 rounded-2xl bg-zinc-100/80 p-3 dark:bg-white/[0.04]">
      <div className="flex items-center justify-between gap-2">
        <SectionHint title={title} hint={hint} />
        <button
          type="button"
          onClick={() => onChange([...codes, { code_role: 'alternativo', code_value: '' }])}
          className="text-[12px] font-semibold text-emerald-700 dark:text-emerald-300"
        >
          + código
        </button>
      </div>
      {codes.map((c, idx) => (
        <div key={idx} className="grid gap-2 sm:grid-cols-[140px_1fr]">
          <Field label="Tipo do código" hint="Origem da referência: fabricante, montadora ou alternativa.">
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
          </Field>
          <Field
            label="Código"
            hint="Referência técnica em texto (preserva zeros à esquerda)."
          >
            <input
              className={inputClass}
              value={c.code_value}
              onChange={(e) => {
                const next = [...codes];
                next[idx] = { ...c, code_value: e.target.value };
                onChange(next);
              }}
            />
          </Field>
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
  initialModelId = null,
  initialShowForm = false,
  initialShowScan = false,
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
  /** Quando definido, o formulário edita esta unidade (e seu modelo técnico). */
  const [editingModule, setEditingModule] = useState<WorkshopAbsModule | null>(null);
  /** Cadastro de nova unidade vinculada a um modelo já existente. */
  const [createForModelId, setCreateForModelId] = useState<string | null>(null);
  const [labelPrintModules, setLabelPrintModules] = useState<WorkshopAbsModule[] | null>(null);
  const [modelAddQty, setModelAddQty] = useState('1');
  const [pendingPhotos, setPendingPhotos] = useState<PendingAbsPhoto[]>([]);
  const [existingPhotos, setExistingPhotos] = useState<WorkshopAbsModulePhoto[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
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
    void (async () => {
      try {
        let fresh = await getWorkshopAbsModule(mod.public_id);
        if (!fresh.catalog_model && fresh.model_id) {
          try {
            const catalog = await getWorkshopAbsModuleModel(fresh.model_id);
            fresh = { ...fresh, catalog_model: catalog };
          } catch {
            /* sem catálogo */
          }
        }
        setView((v) =>
          v.kind === 'detail' && v.module.public_id === fresh.public_id
            ? { kind: 'detail', module: fresh }
            : v
        );
      } catch {
        /* mantém o módulo já exibido */
      }
    })();
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
    setModelAddQty('1');
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
    setEditingModule(null);
    setCreateForModelId(null);
    setLabelPrintModules(null);
    setPendingPhotos((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      return [];
    });
    setExistingPhotos([]);

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
      if (initialModelId) {
        setLoading(true);
        try {
          const fresh = await getWorkshopAbsModuleModel(initialModelId);
          setView({ kind: 'model', model: fresh });
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Falha ao abrir modelo.');
          setView({ kind: 'models' });
          await loadModels();
        } finally {
          setLoading(false);
        }
        return;
      }
      if (initialShowForm) {
        setWizard(emptyWizard());
        setView({ kind: 'form' });
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
      if (initialShowScan) {
        // listagem com campo de scan já visível
      }
      await loadModels();
    };
    void boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- boot only on open / initial ids
  }, [
    isOpen,
    initialMissingPublicId,
    initialPublicId,
    initialDisassemblePublicId,
    initialModelId,
    initialShowForm,
    initialShowScan,
  ]);

  const handleDeleteUnit = useCallback(
    async (mod: WorkshopAbsModule) => {
      const label = `${formatAbsModuleSequence(mod.sequence_number)} · ${mod.public_id}`;
      if (
        !window.confirm(
          `Excluir a unidade ${label}?\n\nO código ${mod.public_id} não será reutilizado.`
        )
      ) {
        return;
      }
      setActionBusy(true);
      setActionError(null);
      try {
        await deleteWorkshopAbsModule(mod.public_id);
        setSuccessMsg(`Unidade ${mod.public_id} excluída.`);
        if (mod.model_id) {
          const fresh = await getWorkshopAbsModuleModel(mod.model_id);
          setView({ kind: 'model', model: fresh });
        } else {
          setView({ kind: 'models' });
          await loadModels();
        }
        setAction(null);
      } catch (e) {
        setActionError(e instanceof Error ? e.message : 'Falha ao excluir unidade.');
      } finally {
        setActionBusy(false);
      }
    },
    [loadModels]
  );

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
        setError('Leia o código de barras do módulo (ABS-000001).');
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

  /** Pistola USB na página/modal ABS: abre a unidade pelo código de barras. */
  useEffect(() => {
    if (!isOpen) return;
    return setActiveBarcodeScanClaim((raw) => {
      const code = normalizeBarcodeInput(raw);
      if (!code) return false;
      if (isLabOsQrPayload(code)) return false;
      if (view.kind === 'form' && !normalizeAbsModuleCode(code) && !looksLikeAbsModuleCode(code)) {
        // No formulário, deixa códigos de peça/outros seguirem para o campo focado.
        return false;
      }
      void handleScan(code);
      return true;
    });
  }, [handleScan, isOpen, view.kind]);

  const buildCatalogPayload = useCallback(() => {
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

    return { kind, codes, applications, primary };
  }, [wizard]);

  const openEdit = useCallback(
    async (mod: WorkshopAbsModule) => {
      setLoading(true);
      setError(null);
      setAction(null);
      try {
        let catalog: WorkshopAbsModuleModel | null = mod.catalog_model ?? null;
        if (mod.model_id) {
          catalog = await getWorkshopAbsModuleModel(mod.model_id);
        }
        const codes = catalog?.codes || [];
        const apps = catalog?.applications || [];
        const mapCodes = (scope: AbsComponentScope) => {
          const list = codes
            .filter((c) => c.component_scope === scope)
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((c) => ({
              code_role: c.code_role || ('fabricante' as const),
              code_value: c.code_value,
            }));
          return list.length > 0
            ? list
            : [
                { code_role: 'fabricante' as const, code_value: '' },
                { code_role: 'fabricante' as const, code_value: '' },
              ];
        };
        const mapApps = (scope: AbsComponentScope): AppDraft[] => {
          const list = apps
            .filter((a) => a.component_scope === scope)
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((a) => ({
              vehicle_brand: a.vehicle_brand || '',
              vehicle_model: a.vehicle_model || '',
              year_from: a.year_from != null ? String(a.year_from) : '',
              year_to: a.year_to != null ? String(a.year_to) : '',
              engine: a.engine || '',
              notes: a.notes || '',
            }));
          return list.length > 0 ? list : [emptyApp()];
        };

        setEditingModule(mod);
        setCreateForModelId(null);
        setWizard({
          manufacturer: catalog?.manufacturer || mod.manufacturer || '',
          family: catalog?.family || mod.model || '',
          module_kind: catalog?.module_kind || mod.module_kind,
          notes: catalog?.notes || '',
          eletronicoCodes: mapCodes('eletronico'),
          hidraulicoCodes: mapCodes('hidraulico'),
          appsCompleto: mapApps('completo'),
          appsEletronico: mapApps('eletronico'),
          appsHidraulico: mapApps('hidraulico'),
          item_state: mod.item_state,
          item_condition: mod.item_condition,
          damage_description: mod.damage_description || '',
          unit_cost: String(Number(mod.unit_cost) || 0),
          unit_price: String(Number(mod.unit_price) || 0),
          unit_qty: '0',
          supplier: mod.supplier || '',
          location: mod.location || '',
          unit_notes: mod.notes || '',
        });
        let photos = mod.photos || [];
        try {
          const fresh = await getWorkshopAbsModule(mod.public_id);
          photos = fresh.photos || photos;
        } catch {
          // mantém photos do objeto atual
        }
        setExistingPhotos(photos);
        setPendingPhotos((prev) => {
          prev.forEach((p) => URL.revokeObjectURL(p.previewUrl));
          return [];
        });
        setView({ kind: 'form' });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao abrir edição.');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const clearPendingPhotos = useCallback(() => {
    setPendingPhotos((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      return [];
    });
  }, []);

  const addPendingPhotosFromFiles = useCallback(
    (files: FileList | File[] | null) => {
      if (!files) return;
      const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
      if (!list.length) return;
      setPendingPhotos((prev) => {
        const room = ABS_MODULE_PHOTOS_MAX - existingPhotos.length - prev.length;
        if (room <= 0) return prev;
        const slice = list.slice(0, room);
        return [
          ...prev,
          ...slice.map((file) => ({
            id: crypto.randomUUID(),
            file,
            previewUrl: URL.createObjectURL(file),
          })),
        ];
      });
    },
    [existingPhotos.length]
  );

  const removePendingPhoto = useCallback((id: string) => {
    setPendingPhotos((prev) => {
      const hit = prev.find((p) => p.id === id);
      if (hit) URL.revokeObjectURL(hit.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }, []);

  const removeExistingPhoto = useCallback(
    async (photoId: string) => {
      if (!editingModule) {
        setExistingPhotos((prev) => prev.filter((p) => p.id !== photoId));
        return;
      }
      setPhotoBusy(true);
      setError(null);
      try {
        const updated = await deleteWorkshopAbsModulePhoto(editingModule.public_id, photoId);
        setExistingPhotos(updated.photos || []);
        setEditingModule(updated);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao remover foto.');
      } finally {
        setPhotoBusy(false);
      }
    },
    [editingModule]
  );

  const syncPhotosForModule = useCallback(
    async (publicId: string, pending: PendingAbsPhoto[]) => {
      let last: WorkshopAbsModule | null = null;
      for (const photo of pending) {
        last = await uploadWorkshopAbsModulePhoto(publicId, photo.file, photo.file.name);
      }
      return last;
    },
    []
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const { kind, codes, applications, primary } = buildCatalogPayload();
      const catalog = {
        manufacturer: wizard.manufacturer || null,
        family: wizard.family || null,
        module_kind: kind,
        notes: wizard.notes || null,
        codes,
        applications,
      };
      const unitCost = parseCurrencyStringToNumber(wizard.unit_cost);
      const unitPrice = parseCurrencyStringToNumber(wizard.unit_price);
      const photosSnapshot = [...pendingPhotos];
      const wasEditing = Boolean(editingModule);

      let saved: WorkshopAbsModule;
      let createdBatch: WorkshopAbsModule[] = [];

      const createUnits = async (opts: {
        qty: number;
        modelId: string | null;
        withCatalog: boolean;
        photoUrls?: string[];
        uploadPendingToFirst: boolean;
      }) => {
        const batch: WorkshopAbsModule[] = [];
        let modelId = opts.modelId;
        let sharedPhotoUrls = opts.photoUrls;
        for (let i = 0; i < opts.qty; i++) {
          let created = await createWorkshopAbsModule({
            manufacturer: wizard.manufacturer || null,
            original_code: primary,
            application:
              applications[0]?.vehicle_model || applications[0]?.vehicle_brand || null,
            model: wizard.family || null,
            module_kind: kind,
            item_state: wizard.item_state,
            item_condition: wizard.item_condition,
            damage_description: wizard.damage_description || null,
            unit_cost: unitCost,
            unit_price: unitPrice,
            supplier: wizard.supplier || null,
            location: wizard.location || null,
            notes: wizard.unit_notes || wizard.notes || null,
            status: 'disponivel',
            model_id: modelId,
            catalog: opts.withCatalog && i === 0 && !modelId ? catalog : undefined,
            photo_urls: i > 0 || !opts.uploadPendingToFirst ? sharedPhotoUrls : undefined,
            recorded_by_name: recordedByName,
          });
          if (!modelId && created.model_id) modelId = created.model_id;

          if (opts.uploadPendingToFirst && i === 0 && photosSnapshot.length > 0) {
            setPhotoBusy(true);
            try {
              const withPhotos = await syncPhotosForModule(created.public_id, photosSnapshot);
              if (withPhotos) {
                created = withPhotos;
                sharedPhotoUrls = (withPhotos.photos || [])
                  .map((p) => p.photo_url)
                  .filter(Boolean);
              }
            } finally {
              setPhotoBusy(false);
            }
          }
          batch.push(created);
        }
        return { batch, modelId };
      };

      if (editingModule) {
        if (editingModule.model_id) {
          await updateWorkshopAbsModuleModel(editingModule.model_id, catalog);
        }
        saved = await updateWorkshopAbsModule(editingModule.public_id, {
          manufacturer: wizard.manufacturer || null,
          original_code: primary,
          application:
            applications[0]?.vehicle_model || applications[0]?.vehicle_brand || null,
          model: wizard.family || null,
          module_kind: kind,
          item_state: wizard.item_state,
          item_condition: wizard.item_condition,
          damage_description: wizard.damage_description || null,
          unit_cost: unitCost,
          unit_price: unitPrice,
          supplier: wizard.supplier || null,
          location: wizard.location || null,
          notes: wizard.unit_notes || wizard.notes || null,
          model_id: editingModule.model_id,
        });
        if (photosSnapshot.length > 0) {
          setPhotoBusy(true);
          try {
            const withPhotos = await syncPhotosForModule(saved.public_id, photosSnapshot);
            if (withPhotos) saved = withPhotos;
          } finally {
            setPhotoBusy(false);
          }
        }

        const extraQty = parseAbsCreateQty(wizard.unit_qty, { allowZero: true });
        if (extraQty > 0) {
          const photoUrls = (saved.photos || []).map((p) => p.photo_url).filter(Boolean);
          const { batch } = await createUnits({
            qty: extraQty,
            modelId: saved.model_id || editingModule.model_id,
            withCatalog: !saved.model_id && !editingModule.model_id,
            photoUrls: photoUrls.length ? photoUrls : undefined,
            uploadPendingToFirst: false,
          });
          createdBatch = batch;
        }
      } else {
        if (createForModelId) {
          await updateWorkshopAbsModuleModel(createForModelId, catalog);
        }
        const qty = parseAbsCreateQty(wizard.unit_qty);
        const { batch } = await createUnits({
          qty,
          modelId: createForModelId,
          withCatalog: !createForModelId,
          uploadPendingToFirst: true,
        });
        createdBatch = batch;
        saved = createdBatch[0]!;
      }

      clearPendingPhotos();
      setExistingPhotos([]);
      setEditingModule(null);
      setCreateForModelId(null);
      openDetail(saved);

      if (wasEditing && createdBatch.length > 0) {
        const first = createdBatch[0]!;
        const last = createdBatch[createdBatch.length - 1]!;
        setSuccessMsg(
          `Cadastro atualizado e ${createdBatch.length} unidade(s) adicionada(s): ${formatAbsModuleSequence(first.sequence_number)}–${formatAbsModuleSequence(last.sequence_number)}.`
        );
        setLabelPrintModules(createdBatch);
      } else if (wasEditing) {
        setSuccessMsg(
          `Unidade ${formatAbsModuleSequence(saved.sequence_number)} (${saved.public_id}) atualizada.`
        );
      } else if (createdBatch.length > 1) {
        const first = createdBatch[0]!;
        const last = createdBatch[createdBatch.length - 1]!;
        setSuccessMsg(
          `${createdBatch.length} unidades cadastradas: ${formatAbsModuleSequence(first.sequence_number)}–${formatAbsModuleSequence(last.sequence_number)}. Imprima as etiquetas na ordem.`
        );
        setLabelPrintModules(createdBatch);
      } else {
        setSuccessMsg(
          `Unidade ${formatAbsModuleSequence(saved.sequence_number)} (${saved.public_id}) cadastrada.`
        );
      }
      void loadModels();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar.');
    } finally {
      setSaving(false);
      setPhotoBusy(false);
    }
  }, [
    buildCatalogPayload,
    clearPendingPhotos,
    createForModelId,
    editingModule,
    loadModels,
    openDetail,
    pendingPhotos,
    recordedByName,
    syncPhotosForModule,
    wizard,
  ]);

  const handlePrint = useCallback((mod: WorkshopAbsModule) => {
    setLabelPrintModules([mod]);
  }, []);

  const handlePrintUnits = useCallback((units: WorkshopAbsModule[]) => {
    const list = [...units]
      .filter(Boolean)
      .sort((a, b) => Number(a.sequence_number ?? 0) - Number(b.sequence_number ?? 0));
    if (!list.length) return;
    setLabelPrintModules(list);
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
    if (view.kind === 'form' && editingModule) {
      openDetail(editingModule);
      setEditingModule(null);
      return;
    }
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
      setEditingModule(null);
      setView({ kind: 'models' });
      void loadModels();
      return;
    }
    setView({ kind: 'models' });
    void loadModels();
  }, [editingModule, loadModels, openDetail, openModel, view]);

  if (!isOpen) return null;

  const detail = view.kind === 'detail' ? view.module : null;
  const showEletronicoCodes =
    wizard.module_kind === 'completo' ||
    wizard.module_kind === 'eletronico' ||
    wizard.module_kind === 'outro';
  const showHidraulicoCodes =
    wizard.module_kind === 'completo' || wizard.module_kind === 'hidraulico';

  return (
    <>
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
                {view.kind === 'form' &&
                  (editingModule ? 'Editar módulo cadastrado' : 'Novo módulo — modelo + unidade')}
                {view.kind === 'detail' && 'Detalhe da unidade'}
                {view.kind === 'disassemble' && 'Desmembrar módulo completo'}
                {view.kind === 'missing' && 'Código não encontrado'}
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
                  placeholder="Leia o código de barras ABS-000001 ou digite o ID"
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
                      setEditingModule(null);
                      setCreateForModelId(null);
                      setWizard(emptyWizard());
                      clearPendingPhotos();
                      setExistingPhotos([]);
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
                    {models.map((m) => {
                      const kindPhotoRaw = getLabProductKindPhotoUrl(m.module_kind);
                      const kindPhoto = kindPhotoRaw
                        ? storageThumbnailUrl(kindPhotoRaw, {
                            maxWidth: 96,
                            maxHeight: 96,
                            resize: 'cover',
                          }) || kindPhotoRaw
                        : null;
                      const apps = [
                        ...new Set(
                          (m.applications || [])
                            .map((a) => String(a.vehicle_brand || '').trim())
                            .filter(Boolean)
                        ),
                      ];
                      return (
                        <li key={m.id}>
                          <button
                            type="button"
                            onClick={() => void openModel(m)}
                            className="flex w-full items-center gap-3 rounded-3xl border-0 bg-white px-4 py-3.5 text-left shadow-none transition hover:bg-zinc-50 dark:bg-white/5 dark:hover:bg-white/10"
                          >
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-100 dark:bg-white/5">
                              {kindPhoto ? (
                                <PartPhotoImg
                                  src={kindPhoto}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <Package className="h-5 w-5 text-zinc-400" />
                              )}
                            </div>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[15px] font-bold text-zinc-900 dark:text-white">
                                {m.manufacturer?.trim() || '—'}
                              </span>
                              <span className="mt-0.5 block text-[13px] text-zinc-600 dark:text-zinc-300">
                                {apps.length ? `${apps.join(', ')} · ` : ''}
                                {modelPrimaryCode(m)} · {absModuleKindLabel(m.module_kind)}
                                {m.family ? ` · ${m.family}` : ''}
                              </span>
                            </span>
                            <span className="shrink-0 text-right">
                              <span className="block text-[15px] font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                                {m.available_qty ?? 0}
                              </span>
                              <span className="text-[11px] text-zinc-500">disp.</span>
                            </span>
                            <ChevronRight className="h-5 w-5 shrink-0 text-zinc-400" />
                          </button>
                        </li>
                      );
                    })}
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
                {(view.model.units || []).length > 0 ? (
                  <button
                    type="button"
                    onClick={() => handlePrintUnits(view.model.units || [])}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border-0 bg-zinc-100 px-4 py-3 text-[14px] font-semibold text-zinc-800 shadow-none dark:bg-white/5 dark:text-white"
                  >
                    <Printer className="h-4 w-4" />
                    Imprimir etiquetas de todas ({(view.model.units || []).length})
                  </button>
                ) : null}
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
                                  onClick={() => void openEdit(u)}
                                  className="inline-flex items-center gap-1 rounded-xl bg-zinc-100 px-2.5 py-1.5 text-[12px] font-semibold dark:bg-white/10"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handlePrint(u)}
                                  className="inline-flex items-center gap-1 rounded-xl bg-emerald-500/15 px-2.5 py-1.5 text-[12px] font-semibold text-emerald-800 dark:text-emerald-200"
                                  title="Reimprimir etiqueta"
                                >
                                  <Printer className="h-3.5 w-3.5" />
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
                                <button
                                  type="button"
                                  disabled={actionBusy}
                                  onClick={() => void handleDeleteUnit(u)}
                                  className="inline-flex items-center gap-1 rounded-xl bg-red-500/10 px-2.5 py-1.5 text-[12px] font-semibold text-red-700 dark:text-red-300 disabled:opacity-50"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Excluir
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="rounded-3xl border-0 bg-white p-4 shadow-none dark:bg-white/5">
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-zinc-500">
                    Adicionar unidades neste modelo
                  </p>
                  <p className="mt-1 text-[13px] text-zinc-600 dark:text-zinc-300">
                    Já cadastrado: {view.model.total_qty ?? (view.model.units || []).length} unidade(s).
                    Informe quantas deseja incluir agora.
                  </p>
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <label className="min-w-[7rem] flex-1 space-y-1.5">
                      <span className="text-[12px] font-semibold uppercase tracking-wide text-zinc-500">
                        Quantidade
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoComplete="off"
                        className={`${inputClass} tabular-nums`}
                        value={modelAddQty}
                        onChange={(e) =>
                          setModelAddQty(e.target.value.replace(/\D/g, '').slice(0, 3))
                        }
                        onBlur={() => setModelAddQty(String(parseAbsCreateQty(modelAddQty)))}
                        aria-label="Quantidade a adicionar"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const qty = parseAbsCreateQty(modelAddQty);
                        setEditingModule(null);
                        setCreateForModelId(view.model.id);
                        setWizard({
                          ...emptyWizard(),
                          manufacturer: view.model.manufacturer || '',
                          family: view.model.family || '',
                          module_kind: view.model.module_kind,
                          unit_qty: String(qty),
                        });
                        clearPendingPhotos();
                        setExistingPhotos([]);
                        setView({ kind: 'form' });
                      }}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3.5 text-[15px] font-semibold text-white sm:flex-none sm:min-w-[14rem]"
                    >
                      <Plus className="h-5 w-5" />
                      Adicionar {parseAbsCreateQty(modelAddQty)} unidade(s)
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {view.kind === 'missing' ? (
              <div className="space-y-4 rounded-3xl border border-amber-200 bg-amber-50/80 px-4 py-5 dark:border-amber-500/30 dark:bg-amber-950/30">
                <p className="text-[16px] font-semibold text-amber-950 dark:text-amber-100">
                  Código de barras não encontrado.
                </p>
                <p className="text-[14px] text-amber-900/80 dark:text-amber-200/80">
                  O identificador <span className="font-mono font-bold">{view.publicId}</span> não
                  existe no estoque de módulos ABS.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setEditingModule(null);
                    setCreateForModelId(null);
                    setWizard(emptyWizard());
                    clearPendingPhotos();
                    setExistingPhotos([]);
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
                {editingModule ? (
                  <div className="rounded-2xl bg-sky-50 px-4 py-3 text-[13px] text-sky-950 dark:bg-sky-950/40 dark:text-sky-100">
                    Editando {formatAbsModuleSequence(editingModule.sequence_number)} ·{' '}
                    <span className="font-mono font-semibold">{editingModule.public_id}</span>
                    {' — '}o código ABS e o número sequencial não mudam. Use “Adicionar mais
                    unidades” para incluir novas peças iguais a esta.
                  </div>
                ) : null}
                <section className="space-y-3">
                  <h3 className="text-[14px] font-bold text-zinc-900 dark:text-white">
                    1. Modelo técnico
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field
                      label="Fabricante"
                      hint="Marca do ABS (ex.: Bosch, Continental, TRW)."
                    >
                      <input
                        className={inputClass}
                        value={wizard.manufacturer}
                        onChange={(e) =>
                          setWizard((w) => ({ ...w, manufacturer: e.target.value }))
                        }
                      />
                    </Field>
                    <Field
                      label="Família / linha"
                      hint="Geração ou família técnica (ex.: Bosch 8.0, 9.0) — não substitui o código exato."
                    >
                      <input
                        className={inputClass}
                        value={wizard.family}
                        onChange={(e) => setWizard((w) => ({ ...w, family: e.target.value }))}
                      />
                    </Field>
                    <Field
                      label="Tipo de módulo"
                      hint="Completo = eletrônica + hidráulica juntas. Eletrônico ou hidráulico = componente separado."
                    >
                      <select
                        className={selectClass}
                        value={wizard.module_kind}
                        disabled={Boolean(editingModule)}
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
                    <Field
                      label="Notas do modelo"
                      hint="Observações técnicas do cadastro do modelo (compartilhadas por todas as unidades)."
                    >
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
                      hint="Referências da parte eletrônica. Use + código para alternativas."
                      codes={wizard.eletronicoCodes}
                      onChange={(eletronicoCodes) => setWizard((w) => ({ ...w, eletronicoCodes }))}
                    />
                  ) : null}
                  {showHidraulicoCodes ? (
                    <CodesEditor
                      title="Códigos hidráulico"
                      hint="Referências da parte hidráulica. Use + código para alternativas."
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
                      hint="Veículos compatíveis com o módulo completo (não se aplicam automaticamente aos componentes)."
                      apps={wizard.appsCompleto}
                      onChange={(appsCompleto) => setWizard((w) => ({ ...w, appsCompleto }))}
                    />
                  )}
                  {(wizard.module_kind === 'completo' || wizard.module_kind === 'eletronico') && (
                    <AppsEditor
                      title="Escopo eletrônico"
                      hint="Veículos compatíveis só com a parte eletrônica."
                      apps={wizard.appsEletronico}
                      onChange={(appsEletronico) => setWizard((w) => ({ ...w, appsEletronico }))}
                    />
                  )}
                  {(wizard.module_kind === 'completo' || wizard.module_kind === 'hidraulico') && (
                    <AppsEditor
                      title="Escopo hidráulico"
                      hint="Veículos compatíveis só com a parte hidráulica."
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
                    <Field label="Estado" hint="Situação comercial da peça: novo, usado ou recondicionado.">
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
                    <Field
                      label="Condição"
                      hint="Estado físico/testes: perfeito, com avarias, defeituoso ou não testado."
                    >
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
                    <Field
                      label={
                        editingModule ? 'Adicionar mais unidades' : 'Quantidade de unidades'
                      }
                      hint={
                        editingModule
                          ? `Quantas unidades iguais criar agora além desta (0 = só salvar alterações; máx. ${ABS_MODULE_CREATE_QTY_MAX}). Cada nova recebe seu #N e ABS-######.`
                          : `Quantas unidades físicas iguais cadastrar agora (1–${ABS_MODULE_CREATE_QTY_MAX}). Cada uma recebe seu #N e ABS-######; ao salvar, abre a impressão em sequência.`
                      }
                    >
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoComplete="off"
                        className={`${inputClass} tabular-nums`}
                        value={wizard.unit_qty}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, '').slice(0, 3);
                          setWizard((w) => ({ ...w, unit_qty: digits }));
                        }}
                        onBlur={() => {
                          setWizard((w) => ({
                            ...w,
                            unit_qty: String(
                              parseAbsCreateQty(w.unit_qty, { allowZero: Boolean(editingModule) })
                            ),
                          }));
                        }}
                        aria-label={
                          editingModule ? 'Adicionar mais unidades' : 'Quantidade de unidades'
                        }
                      />
                    </Field>
                    <Field label="Custo" hint="Custo individual desta unidade (não do modelo).">
                      <CurrencyMaskInput
                        value={wizard.unit_cost}
                        onChange={(v) => setWizard((w) => ({ ...w, unit_cost: v }))}
                        inputClassName={inputClass}
                        aria-label="Custo da unidade"
                      />
                    </Field>
                    <Field label="Preço" hint="Preço de venda individual desta unidade.">
                      <CurrencyMaskInput
                        value={wizard.unit_price}
                        onChange={(v) => setWizard((w) => ({ ...w, unit_price: v }))}
                        inputClassName={inputClass}
                        aria-label="Preço de venda da unidade"
                      />
                    </Field>
                    <Field
                      label="Localização"
                      hint="Prateleira ou posição física onde a unidade está guardada."
                    >
                      <input
                        className={inputClass}
                        value={wizard.location}
                        onChange={(e) => setWizard((w) => ({ ...w, location: e.target.value }))}
                        placeholder="Prateleira B3"
                      />
                    </Field>
                    <Field label="Fornecedor" hint="Procedência / fornecedor desta unidade.">
                      <input
                        className={inputClass}
                        value={wizard.supplier}
                        onChange={(e) => setWizard((w) => ({ ...w, supplier: e.target.value }))}
                      />
                    </Field>
                    <Field
                      label="Avarias / descrição"
                      hint="Descreva avarias visíveis ou defeitos desta unidade."
                    >
                      <input
                        className={inputClass}
                        value={wizard.damage_description}
                        onChange={(e) =>
                          setWizard((w) => ({ ...w, damage_description: e.target.value }))
                        }
                      />
                    </Field>
                  </div>
                  <Field
                    label="Observações da unidade"
                    hint="Anotações só desta peça física (histórico, procedência, etc.)."
                  >
                    <textarea
                      rows={2}
                      className={inputClass}
                      value={wizard.unit_notes}
                      onChange={(e) => setWizard((w) => ({ ...w, unit_notes: e.target.value }))}
                    />
                  </Field>

                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <SectionHint
                        title="Fotos do módulo"
                        hint={`A primeira foto é a capa. Até ${ABS_MODULE_PHOTOS_MAX} imagens.`}
                      />
                      <span className="text-[12px] font-semibold tabular-nums text-zinc-500 dark:text-zinc-400">
                        {existingPhotos.length + pendingPhotos.length}/{ABS_MODULE_PHOTOS_MAX}
                      </span>
                    </div>
                    <input
                      ref={galleryInputRef}
                      type="file"
                      accept="image/*,.png,.jpg,.jpeg,.webp,.heic,.heif"
                      multiple
                      className="sr-only fixed left-0 top-0 h-px w-px opacity-0"
                      tabIndex={-1}
                      aria-hidden
                      onChange={(e) => {
                        addPendingPhotosFromFiles(e.target.files);
                        e.target.value = '';
                      }}
                    />
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*,.png,.jpg,.jpeg,.webp,.heic,.heif"
                      capture="environment"
                      className="sr-only fixed left-0 top-0 h-px w-px opacity-0"
                      tabIndex={-1}
                      aria-hidden
                      onChange={(e) => {
                        addPendingPhotosFromFiles(e.target.files);
                        e.target.value = '';
                      }}
                    />
                    <div className="grid max-w-[min(100%,520px)] grid-cols-3 gap-3 sm:grid-cols-4">
                      {existingPhotos.map((photo, index) => (
                        <div key={photo.id} className="relative aspect-square">
                          <div
                            className={`relative isolate h-full w-full overflow-hidden rounded-xl border-0 bg-zinc-100 dark:bg-white/[0.03] ${
                              index === 0 ? 'ring-2 ring-emerald-500/45' : ''
                            }`}
                          >
                            {index === 0 ? (
                              <span className="absolute left-1 top-1 z-10 rounded-md bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                                Capa
                              </span>
                            ) : null}
                            <PartPhotoImg
                              src={photo.photo_url}
                              alt=""
                              className="h-full w-full object-cover [transform:translateZ(0)]"
                            />
                            {photoBusy ? (
                              <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                                <Loader2 className="h-6 w-6 animate-spin text-white" />
                              </span>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => void removeExistingPhoto(photo.id)}
                            disabled={photoBusy || saving}
                            className="absolute -right-1.5 -top-1.5 flex h-7 w-7 items-center justify-center rounded-full border-0 bg-white text-red-600 shadow-none hover:bg-red-50 disabled:opacity-50 dark:bg-zinc-900"
                            aria-label="Remover foto"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      {pendingPhotos.map((photo, index) => {
                        const coverIndex = existingPhotos.length + index;
                        return (
                          <div key={photo.id} className="relative aspect-square">
                            <div
                              className={`relative isolate h-full w-full overflow-hidden rounded-xl border-0 bg-zinc-100 dark:bg-white/[0.03] ${
                                coverIndex === 0 ? 'ring-2 ring-emerald-500/45' : ''
                              }`}
                            >
                              {coverIndex === 0 ? (
                                <span className="absolute left-1 top-1 z-10 rounded-md bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                                  Capa
                                </span>
                              ) : null}
                              <PartPhotoImg
                                src={photo.previewUrl}
                                alt=""
                                className="h-full w-full object-cover [transform:translateZ(0)]"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => removePendingPhoto(photo.id)}
                              disabled={photoBusy || saving}
                              className="absolute -right-1.5 -top-1.5 flex h-7 w-7 items-center justify-center rounded-full border-0 bg-white text-red-600 shadow-none hover:bg-red-50 disabled:opacity-50 dark:bg-zinc-900"
                              aria-label="Remover foto"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })}
                      {existingPhotos.length + pendingPhotos.length < ABS_MODULE_PHOTOS_MAX ? (
                        <button
                          type="button"
                          onClick={() => galleryInputRef.current?.click()}
                          disabled={photoBusy || saving}
                          className="flex aspect-square h-full w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-zinc-300/90 bg-zinc-100 text-zinc-500 transition-colors hover:border-emerald-500/50 hover:text-emerald-700 disabled:opacity-50 dark:border-white/15 dark:bg-white/[0.03] dark:hover:text-emerald-400"
                        >
                          <Plus className="h-6 w-6" aria-hidden />
                          <span className="text-[10px] font-bold uppercase tracking-wide">
                            Adicionar
                          </span>
                        </button>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => galleryInputRef.current?.click()}
                        disabled={
                          photoBusy ||
                          saving ||
                          existingPhotos.length + pendingPhotos.length >= ABS_MODULE_PHOTOS_MAX
                        }
                        className="inline-flex items-center gap-1 rounded-lg border-0 bg-zinc-100 px-2.5 py-1.5 text-[12px] font-semibold text-zinc-700 disabled:opacity-50 dark:bg-transparent dark:text-zinc-200"
                      >
                        <Images className="h-3.5 w-3.5" /> Galeria
                      </button>
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        disabled={
                          photoBusy ||
                          saving ||
                          existingPhotos.length + pendingPhotos.length >= ABS_MODULE_PHOTOS_MAX
                        }
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[12px] font-semibold text-white shadow-none disabled:opacity-50"
                      >
                        <Camera className="h-3.5 w-3.5" /> Câmera
                      </button>
                    </div>
                  </div>
                </section>

                <button
                  type="button"
                  disabled={saving || photoBusy}
                  onClick={() => void handleSave()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3.5 text-[15px] font-semibold text-white disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : editingModule ? (
                    <Save className="h-5 w-5" />
                  ) : (
                    <Plus className="h-5 w-5" />
                  )}
                  {editingModule
                    ? parseAbsCreateQty(wizard.unit_qty, { allowZero: true }) > 0
                      ? `Salvar e adicionar ${parseAbsCreateQty(wizard.unit_qty, { allowZero: true })} unidade(s)`
                      : 'Salvar alterações'
                    : parseAbsCreateQty(wizard.unit_qty) > 1
                      ? `Salvar ${parseAbsCreateQty(wizard.unit_qty)} unidades e gerar IDs`
                      : 'Salvar modelo + unidade e gerar ID'}
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
                {(() => {
                  const heroPhoto = detailHeroPhotoUrl(detail);
                  const catalog = detail.catalog_model;
                  const family = catalog?.family || null;
                  const appsLabel = detailApplicationLabel(detail);
                  const codes = detailCodes(detail);
                  const showBothCodes = Boolean(codes.eletronico && codes.hidraulico);
                  const secondaryBtn =
                    'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white';
                  return (
                    <div className="overflow-hidden rounded-[1.5rem] border-0 bg-white shadow-none dark:bg-white/[0.04]">
                      <div className="relative aspect-[2.2/1] min-h-[148px] bg-gradient-to-br from-zinc-100 via-zinc-50 to-emerald-50/40 dark:from-zinc-900 dark:via-zinc-900 dark:to-emerald-950/30">
                        {heroPhoto ? (
                          <PartPhotoImg
                            src={heroPhoto}
                            alt=""
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Package className="h-14 w-14 text-zinc-300 dark:text-zinc-600" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
                        <div className="absolute left-3 top-3">
                          <StatusPill status={detail.status} />
                        </div>
                        <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-[22px] font-bold tracking-tight text-white drop-shadow-sm">
                              {detail.manufacturer || 'Módulo ABS'}
                            </p>
                            <p className="mt-0.5 text-[12px] font-medium text-white/75">
                              {absModuleKindLabel(detail.module_kind)}
                              <span className="mx-1.5 text-white/40">·</span>
                              <span className="tabular-nums">
                                {formatAbsModuleSequence(detail.sequence_number)}
                              </span>
                              <span className="mx-1.5 text-white/40">·</span>
                              <span className="font-mono tracking-wide">{detail.public_id}</span>
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4 p-4 sm:p-5">
                        <div className="flex items-start gap-3 rounded-2xl bg-emerald-50/90 px-4 py-3.5 dark:bg-emerald-950/35">
                          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600/15 text-emerald-700 dark:text-emerald-300">
                            <MapPin className="h-4.5 w-4.5 h-[18px] w-[18px]" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700/80 dark:text-emerald-400/90">
                              Localização
                            </p>
                            <p className="mt-0.5 text-[18px] font-bold tracking-tight text-emerald-950 dark:text-emerald-50">
                              {detail.location?.trim() || 'Sem local definido'}
                            </p>
                          </div>
                        </div>

                        <dl className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-xl bg-zinc-50 px-3.5 py-3 dark:bg-white/[0.03]">
                            <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                              Fabricante
                            </dt>
                            <dd className="mt-1 text-[15px] font-semibold text-zinc-900 dark:text-white">
                              {detail.manufacturer || '—'}
                            </dd>
                          </div>
                          <div className="rounded-xl bg-zinc-50 px-3.5 py-3 dark:bg-white/[0.03]">
                            <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                              Família
                            </dt>
                            <dd className="mt-1 text-[15px] font-semibold text-zinc-900 dark:text-white">
                              {family || '—'}
                            </dd>
                          </div>
                          <div className="rounded-xl bg-zinc-50 px-3.5 py-3 sm:col-span-2 dark:bg-white/[0.03]">
                            <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                              Aplicação
                            </dt>
                            <dd className="mt-1 text-[15px] font-semibold text-zinc-900 dark:text-white">
                              {appsLabel}
                            </dd>
                          </div>
                          <div className="rounded-xl bg-zinc-50 px-3.5 py-3 sm:col-span-2 dark:bg-white/[0.03]">
                            <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                              Código
                            </dt>
                            <dd className="mt-1 space-y-1">
                              {showBothCodes ? (
                                <>
                                  <p className="text-[14px] font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                                    <span className="mr-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                                      Eletrônico
                                    </span>
                                    {codes.eletronico}
                                  </p>
                                  <p className="text-[14px] font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                                    <span className="mr-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                                      Hidráulico
                                    </span>
                                    {codes.hidraulico}
                                  </p>
                                </>
                              ) : (
                                <p className="text-[15px] font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                                  {codes.primary || '—'}
                                </p>
                              )}
                            </dd>
                          </div>
                          <div className="rounded-xl bg-zinc-50 px-3.5 py-3 dark:bg-white/[0.03]">
                            <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                              Estado / condição
                            </dt>
                            <dd className="mt-1 text-[15px] font-semibold text-zinc-900 dark:text-white">
                              {absModuleItemStateLabel(detail.item_state)} ·{' '}
                              {absModuleItemConditionLabel(detail.item_condition)}
                            </dd>
                          </div>
                          <div className="rounded-xl bg-zinc-50 px-3.5 py-3 dark:bg-white/[0.03]">
                            <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                              Preços
                            </dt>
                            <dd className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[15px] font-semibold text-zinc-900 dark:text-white">
                              <span>
                                <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                                  Custo
                                </span>
                                {formatAbsModuleMoney(detail.unit_cost)}
                              </span>
                              <span className="text-zinc-300 dark:text-zinc-600">|</span>
                              <span>
                                <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                                  Venda
                                </span>
                                {formatAbsModuleMoney(detail.unit_price)}
                              </span>
                            </dd>
                          </div>
                        </dl>

                        {detail.damage_description ? (
                          <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
                            {detail.damage_description}
                          </p>
                        ) : null}

                        {(detail.photos || []).length > 1 ? (
                          <div className="space-y-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                              Mais fotos
                            </p>
                            <div className="grid grid-cols-4 gap-2">
                              {(detail.photos || []).slice(1).map((photo) => (
                                <div
                                  key={photo.id}
                                  className="aspect-square overflow-hidden rounded-xl bg-zinc-100 dark:bg-white/[0.03]"
                                >
                                  <PartPhotoImg
                                    src={photo.photo_url}
                                    alt=""
                                    className="h-full w-full object-cover"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        <div className="flex flex-wrap items-center gap-1 border-t border-zinc-100 pt-3 dark:border-white/[0.06]">
                          <button
                            type="button"
                            onClick={() => {
                              setAction('transfer');
                              setTransferLocation(detail.location || '');
                              setActionError(null);
                            }}
                            className={secondaryBtn}
                          >
                            <MapPin className="h-3.5 w-3.5" />
                            Transferir local
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAction('history');
                              void loadHistory(detail.public_id);
                            }}
                            className={secondaryBtn}
                          >
                            <History className="h-3.5 w-3.5" />
                            Histórico
                          </button>
                          <button
                            type="button"
                            onClick={() => void openEdit(detail)}
                            className={secondaryBtn}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePrint(detail)}
                            className={secondaryBtn}
                          >
                            <Printer className="h-3.5 w-3.5" />
                            Etiqueta
                          </button>
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => void handleDeleteUnit(detail)}
                            className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-red-600/80 transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/40"
                          >
                            {actionBusy ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                            Excluir
                          </button>
                        </div>

                        <div
                          className={`grid gap-2 ${
                            detail.module_kind === 'completo' && detail.status === 'disponivel'
                              ? 'sm:grid-cols-2'
                              : ''
                          }`}
                        >
                          {detail.status === 'fora_estoque' ? (
                            <button
                              type="button"
                              onClick={() => {
                                setAction('entry');
                                setActionError(null);
                              }}
                              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-[14px] font-semibold text-white transition hover:bg-emerald-700"
                            >
                              <ArrowDownToLine className="h-4 w-4" />
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
                              className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-3 text-[14px] font-semibold text-white transition hover:bg-rose-700"
                            >
                              <ArrowUpFromLine className="h-4 w-4" />
                              Dar saída
                            </button>
                          ) : null}
                          {detail.module_kind === 'completo' && detail.status === 'disponivel' ? (
                            <button
                              type="button"
                              onClick={() => openDisassemble(detail)}
                              className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-[14px] font-semibold text-amber-950 transition hover:bg-amber-400"
                            >
                              <Scissors className="h-4 w-4" />
                              Desmembrar
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })()}

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
      <NiimbotAbsModuleLabelPrintModal
        open={Boolean(labelPrintModules?.length)}
        modules={labelPrintModules}
        onClose={() => setLabelPrintModules(null)}
      />
    </>
  );
}
