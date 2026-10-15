import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpFromLine,
  Camera,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Hash,
  History,
  Loader2,
  MapPin,
  Pencil,
  Printer,
  Scissors,
  Square,
  Tag,
  Trash2,
  ZoomIn,
} from 'lucide-react';
import {
  ABS_MODULE_PHOTOS_MAX,
  createWorkshopAbsModuleMovement,
  deleteWorkshopAbsModule,
  deleteWorkshopAbsModulePhoto,
  getWorkshopAbsModule,
  getWorkshopAbsModuleModel,
  getWorkshopAbsModuleMovements,
  updateWorkshopAbsModule,
  uploadWorkshopAbsModulePhoto,
  type WorkshopAbsModule,
  type WorkshopAbsModuleApplication,
  type WorkshopAbsModuleModel,
  type WorkshopAbsModuleMovement,
  type WorkshopAbsModulePhoto,
} from '../services/apiService';
import {
  ABS_MODULE_EXIT_REASON_OPTIONS,
  absModuleItemConditionLabel,
  absModuleItemStateLabel,
  absModuleKindLabel,
  absModuleStatusLabel,
  describeAbsModuleMovement,
  formatAbsApplicationYearRange,
  formatAbsModuleMoney,
  formatAbsModuleSequence,
  primaryCodeForScope,
  type AbsModuleExitReason,
} from '../utils/workshopAbsModules';
import { Lightbox } from './Lightbox';
import { NiimbotAbsModuleLabelPrintModal } from './NiimbotAbsModuleLabelPrintModal';
import { PartPhotoImg } from './ui/PartPhotoImg';
import { useBrowserBackLayer } from './ui/BackNavigationContext';

const labelCls =
  'text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400';
const valueCls = 'text-[14px] text-zinc-900 dark:text-zinc-100';
const cardCls =
  'rounded-xl border-0 bg-zinc-50/80 p-4 shadow-none dark:bg-white/[0.03] sm:p-5';
const inputCls =
  'w-full rounded-xl border-0 bg-white px-3 py-2.5 text-[14px] text-zinc-900 outline-none ring-1 ring-zinc-200/80 focus:ring-2 focus:ring-emerald-500/40 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-white/10';

function displayText(v: string | null | undefined): string {
  const s = (v ?? '').trim();
  return s || '—';
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className={labelCls}>{label}</p>
      <div className={valueCls}>{value}</div>
    </div>
  );
}

function formatAppRow(app: WorkshopAbsModuleApplication): string {
  const vehicle = [app.vehicle_brand, app.vehicle_model].filter(Boolean).join(' ').trim();
  const years = formatAbsApplicationYearRange(app.year_from, app.year_to);
  const extra = [app.generation, app.engine, app.version].filter(Boolean).join(' · ');
  return [vehicle || '—', years, extra].filter(Boolean).join(' · ');
}

function PhotoGrid({
  photos,
  onPreview,
  onAdd,
  onRemove,
  busy,
}: {
  photos: WorkshopAbsModulePhoto[];
  onPreview: (urls: string[], index: number) => void;
  onAdd?: (file: File) => void;
  onRemove?: (photoId: string) => void;
  busy?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const urls = photos.map((p) => p.photo_url).filter(Boolean);

  return (
    <div className="space-y-2">
      <div className="grid max-w-full grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        {photos.map((photo, index) => {
          const url = photo.photo_url?.trim();
          return (
            <div
              key={photo.id}
              className="group relative aspect-square overflow-hidden rounded-xl border-0 bg-zinc-100 dark:bg-white/[0.03]"
            >
              {url ? (
                <button
                  type="button"
                  onClick={() => onPreview(urls, index)}
                  className="absolute inset-0 h-full w-full focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  aria-label={`Ampliar foto ${index + 1}`}
                >
                  <PartPhotoImg
                    src={url}
                    alt=""
                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/25">
                    <ZoomIn className="h-6 w-6 text-white opacity-0 drop-shadow-lg transition-opacity group-hover:opacity-100" />
                  </div>
                </button>
              ) : null}
              {index === 0 ? (
                <span className="pointer-events-none absolute left-1 top-1 z-[1] rounded-md bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                  Capa
                </span>
              ) : null}
              {onRemove ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(photo.id);
                  }}
                  className="absolute right-1 top-1 z-[2] inline-flex h-7 w-7 items-center justify-center rounded-lg bg-black/55 text-white hover:bg-red-600 disabled:opacity-50"
                  aria-label="Remover foto"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          );
        })}
        {onAdd && photos.length < ABS_MODULE_PHOTOS_MAX ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-0 border-dashed bg-emerald-50 text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:bg-emerald-950/40 dark:text-emerald-200"
          >
            {busy ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Camera className="h-5 w-5" />
            )}
            <span className="text-[11px] font-semibold">Foto</span>
          </button>
        ) : null}
      </div>
      {onAdd ? (
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onAdd(file);
          }}
        />
      ) : null}
    </div>
  );
}

function SiblingUnitCard({
  seed,
  isCurrent,
  selected,
  onToggleSelect,
  onOpenUnit,
  onDisassemble,
  onPreview,
  onChanged,
}: {
  seed: WorkshopAbsModule;
  isCurrent: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onOpenUnit: (publicId: string) => void;
  onDisassemble?: (module: WorkshopAbsModule) => void;
  onPreview: (urls: string[], index: number) => void;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [unit, setUnit] = useState<WorkshopAbsModule>(seed);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [damage, setDamage] = useState(seed.damage_description || '');
  const [notes, setNotes] = useState(seed.notes || '');
  const [labelOpen, setLabelOpen] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fresh = await getWorkshopAbsModule(seed.public_id);
      setUnit(fresh);
      setDamage(fresh.damage_description || '');
      setNotes(fresh.notes || '');
      setDirty(false);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar unidade.');
    } finally {
      setLoading(false);
    }
  }, [seed.public_id]);

  useEffect(() => {
    if (expanded && !loaded && !loading) void load();
  }, [expanded, loaded, loading, load]);

  const photos = useMemo(
    () => [...(unit.photos || [])].sort((a, b) => a.sort_order - b.sort_order),
    [unit.photos]
  );

  const canDisassemble =
    unit.module_kind === 'completo' && unit.status === 'disponivel' && !!onDisassemble;

  const saveTexts = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await updateWorkshopAbsModule(unit.public_id, {
        damage_description: damage.trim() || null,
        notes: notes.trim() || null,
      });
      setUnit(updated);
      setDirty(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar.');
    } finally {
      setBusy(false);
    }
  };

  const addPhoto = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const updated = await uploadWorkshopAbsModulePhoto(unit.public_id, file, file.name);
      setUnit(updated);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao enviar foto.');
    } finally {
      setBusy(false);
    }
  };

  const removePhoto = async (photoId: string) => {
    if (!window.confirm('Remover esta foto?')) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await deleteWorkshopAbsModulePhoto(unit.public_id, photoId);
      setUnit(updated);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao remover foto.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`rounded-2xl border-0 shadow-none ${
        isCurrent
          ? 'bg-emerald-50 ring-2 ring-emerald-500/40 dark:bg-emerald-950/40 dark:ring-emerald-500/30'
          : 'bg-white dark:bg-zinc-900/50'
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-3 sm:px-4">
        <button
          type="button"
          onClick={onToggleSelect}
          className="shrink-0 rounded-lg p-1 text-emerald-700 hover:bg-emerald-100/80 dark:text-emerald-300 dark:hover:bg-white/10"
          aria-label={selected ? 'Desmarcar para impressão' : 'Selecionar para impressão'}
          aria-pressed={selected}
        >
          {selected ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
        </button>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
          )}
          <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-0.5 text-white">
            <Hash className="h-3 w-3 opacity-90" />
            <span className="text-[14px] font-black tabular-nums">
              {seed.sequence_number != null ? Math.floor(Number(seed.sequence_number)) : '—'}
            </span>
          </span>
          <span className="truncate font-mono text-[12px] font-semibold text-zinc-700 dark:text-zinc-200">
            {seed.public_id}
          </span>
          {isCurrent ? (
            <span className="hidden rounded-md bg-emerald-600/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-800 sm:inline dark:text-emerald-200">
              Em foco
            </span>
          ) : null}
          <span className="ml-auto hidden truncate text-[12px] text-zinc-500 sm:inline">
            {absModuleStatusLabel(seed.status)}
            {seed.location ? ` · ${seed.location}` : ''}
          </span>
        </button>
      </div>

      {expanded ? (
        <div className="space-y-3 border-t border-zinc-200/60 px-3 pb-4 pt-3 dark:border-white/[0.06] sm:px-4">
          <div className="flex flex-wrap gap-1.5">
            {!isCurrent ? (
              <button
                type="button"
                onClick={() => onOpenUnit(unit.public_id)}
                className="rounded-xl bg-zinc-100 px-3 py-2 text-[12px] font-semibold text-zinc-800 hover:bg-zinc-200 dark:bg-white/10 dark:text-zinc-100"
              >
                Abrir ficha
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setLabelOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-950 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-100"
            >
              <Tag className="h-3.5 w-3.5" />
              Etiqueta
            </button>
            {canDisassemble ? (
              <button
                type="button"
                onClick={() => onDisassemble?.(unit)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-violet-50 px-3 py-2 text-[12px] font-semibold text-violet-900 hover:bg-violet-100 dark:bg-violet-950/40 dark:text-violet-100"
              >
                <Scissors className="h-3.5 w-3.5" />
                Desmembrar
              </button>
            ) : null}
          </div>

          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-800 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </p>
          ) : null}

          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
            </div>
          ) : (
            <>
              <p className={`${labelCls} mb-1.5`}>Fotos da unidade</p>
              <PhotoGrid
                photos={photos}
                onPreview={onPreview}
                onAdd={(f) => void addPhoto(f)}
                onRemove={(id) => void removePhoto(id)}
                busy={busy}
              />
              {photos.length === 0 ? (
                <p className="mt-1 text-[12px] text-zinc-500">Nenhuma foto nesta unidade.</p>
              ) : null}

              <div className="mt-2 grid gap-3 lg:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className={labelCls}>Avarias / danos</span>
                  <textarea
                    value={damage}
                    rows={3}
                    onChange={(e) => {
                      setDamage(e.target.value);
                      setDirty(true);
                    }}
                    placeholder="Descreva avarias desta unidade…"
                    className={`${inputCls} resize-y`}
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className={labelCls}>Observações</span>
                  <textarea
                    value={notes}
                    rows={3}
                    onChange={(e) => {
                      setNotes(e.target.value);
                      setDirty(true);
                    }}
                    placeholder="Observações desta unidade…"
                    className={`${inputCls} resize-y`}
                  />
                </label>
              </div>
              {dirty ? (
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void saveTexts()}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Pencil className="h-4 w-4" />
                    )}
                    Salvar avarias e observações
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      <NiimbotAbsModuleLabelPrintModal
        open={labelOpen}
        modules={[unit]}
        onClose={() => setLabelOpen(false)}
      />
    </div>
  );
}

export type WorkshopAbsModuleDetailViewProps = {
  publicId: string;
  onBack: () => void;
  onEdit?: (module: WorkshopAbsModule) => void;
  onDisassemble?: (module: WorkshopAbsModule) => void;
  onOpenUnit?: (publicId: string) => void;
  onDeleted?: (publicId: string) => void;
};

export function WorkshopAbsModuleDetailView({
  publicId,
  onBack,
  onEdit,
  onDisassemble,
  onOpenUnit,
  onDeleted,
}: WorkshopAbsModuleDetailViewProps) {
  const [module, setModule] = useState<WorkshopAbsModule | null>(null);
  const [catalogModel, setCatalogModel] = useState<WorkshopAbsModuleModel | null>(null);
  const [movements, setMovements] = useState<WorkshopAbsModuleMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionPanel, setActionPanel] = useState<null | 'exit' | 'entry' | 'transfer'>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const [exitReason, setExitReason] = useState<AbsModuleExitReason>('venda_avulsa');
  const [exitRef, setExitRef] = useState('');
  const [exitNotes, setExitNotes] = useState('');
  const [entryLocation, setEntryLocation] = useState('');
  const [transferLocation, setTransferLocation] = useState('');
  const [labelPrintModules, setLabelPrintModules] = useState<WorkshopAbsModule[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [previewImages, setPreviewImages] = useState<{
    urls: string[];
    currentIndex: number;
  } | null>(null);

  useBrowserBackLayer(!!previewImages, () => setPreviewImages(null));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mod, hist] = await Promise.all([
        getWorkshopAbsModule(publicId),
        getWorkshopAbsModuleMovements(publicId).catch(() => [] as WorkshopAbsModuleMovement[]),
      ]);
      setModule(mod);
      setMovements(hist);
      if (mod.model_id) {
        try {
          const model = await getWorkshopAbsModuleModel(mod.model_id);
          setCatalogModel(model);
        } catch {
          setCatalogModel(mod.catalog_model ?? null);
        }
      } else {
        setCatalogModel(mod.catalog_model ?? null);
      }
    } catch (e) {
      setModule(null);
      setError(e instanceof Error ? e.message : 'Falha ao carregar o módulo.');
    } finally {
      setLoading(false);
    }
  }, [publicId]);

  useEffect(() => {
    void load();
  }, [load]);

  const photos: WorkshopAbsModulePhoto[] = useMemo(() => {
    const unit = module?.photos || [];
    if (unit.length > 0) return [...unit].sort((a, b) => a.sort_order - b.sort_order);
    const catalog = catalogModel?.photos || module?.catalog_model?.photos || [];
    return [...catalog].sort((a, b) => a.sort_order - b.sort_order);
  }, [module, catalogModel]);

  const photoUrls = useMemo(
    () => photos.map((p) => p.photo_url).filter((u) => !!String(u || '').trim()),
    [photos]
  );

  const applications =
    catalogModel?.applications || module?.catalog_model?.applications || [];
  const codes = catalogModel?.codes || module?.catalog_model?.codes || [];
  const catalog = catalogModel || module?.catalog_model;

  const codeEletronico = primaryCodeForScope(codes, 'eletronico') || null;
  const codeHidraulico = primaryCodeForScope(codes, 'hidraulico') || null;
  const codePrimary =
    primaryCodeForScope(codes, 'completo') ||
    primaryCodeForScope(
      codes,
      module?.module_kind === 'hidraulico' ? 'hidraulico' : 'eletronico'
    ) ||
    module?.original_code ||
    null;

  const siblingUnits = useMemo(() => {
    const units = catalogModel?.units || [];
    const list = [...units].sort(
      (a, b) => Number(a.sequence_number ?? 0) - Number(b.sequence_number ?? 0)
    );
    if (list.length === 0 && module) return [module];
    return list;
  }, [catalogModel, module]);

  const toggleSelect = (publicId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(publicId)) next.delete(publicId);
      else next.add(publicId);
      return next;
    });
  };

  const selectAllSiblings = () => {
    setSelectedIds(new Set(siblingUnits.map((u) => u.public_id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const printSelected = () => {
    const list = siblingUnits.filter((u) => selectedIds.has(u.public_id));
    if (!list.length) return;
    setLabelPrintModules(list);
  };

  const printAllSiblings = () => {
    if (!siblingUnits.length) return;
    setLabelPrintModules(siblingUnits);
  };

  const runMovement = async (
    payload: Parameters<typeof createWorkshopAbsModuleMovement>[0]
  ) => {
    setActionBusy(true);
    setActionError(null);
    try {
      const result = await createWorkshopAbsModuleMovement(payload);
      setModule(result.module);
      setActionPanel(null);
      setConfirmExit(false);
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Falha na movimentação.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!module) return;
    const label = `${formatAbsModuleSequence(module.sequence_number)} · ${module.public_id}`;
    if (!window.confirm(`Excluir a unidade ${label}? Esta ação não pode ser desfeita.`)) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteWorkshopAbsModule(module.public_id);
      onDeleted?.(module.public_id);
      onBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao excluir.');
    } finally {
      setDeleting(false);
    }
  };

  const openPreview = (urls: string[], index: number) => {
    setPreviewImages({ urls, currentIndex: index });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-gradient-to-b from-emerald-50/40 via-white to-zinc-50 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-950">
      <div className="shrink-0 border-b border-zinc-200/60 bg-white/80 px-4 py-3 backdrop-blur-md dark:border-white/[0.06] dark:bg-zinc-950/80 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-xl border-0 bg-zinc-100 px-3 py-2 text-[14px] font-semibold text-zinc-800 shadow-none hover:bg-zinc-200/80 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[17px] font-bold text-zinc-900 dark:text-white sm:text-[19px]">
              {module?.manufacturer || 'Módulo ABS'}
              {module ? (
                <span className="ml-2 font-mono text-[14px] font-semibold text-emerald-700 dark:text-emerald-400">
                  {formatAbsModuleSequence(module.sequence_number)}
                </span>
              ) : null}
            </h2>
            <p className="truncate text-[12px] text-zinc-500 dark:text-zinc-400">
              {module
                ? `${absModuleKindLabel(module.module_kind)} · ${module.public_id}`
                : 'Carregando ficha…'}
            </p>
          </div>
          {module ? (
            <div
              className="flex h-11 min-w-[2.85rem] shrink-0 items-center justify-center gap-0.5 rounded-xl bg-emerald-600 px-2.5 text-white shadow-none dark:bg-emerald-500"
              title={`Unidade ${formatAbsModuleSequence(module.sequence_number)}`}
            >
              <Hash className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
              <span className="text-[17px] font-black leading-none tabular-nums tracking-tight">
                {module.sequence_number != null && Number.isFinite(Number(module.sequence_number))
                  ? Math.floor(Number(module.sequence_number))
                  : '—'}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-auto px-4 py-4 sm:px-6 sm:py-5 lg:px-8 custom-scrollbar">
        {error ? (
          <div className="mb-4 rounded-xl border-0 bg-red-50 px-4 py-3 text-[14px] text-red-800 shadow-none dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        ) : null}

        {loading && !module ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-10 w-10 animate-spin text-emerald-600" />
          </div>
        ) : null}

        {module ? (
          <div className="w-full max-w-none space-y-5 pb-10">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
              <div className="space-y-5">
                <div className="space-y-2">
                  <p className={labelCls}>Fotos</p>
                  {photos.length > 0 ? (
                    <>
                      <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
                        Toque em uma foto para ampliar · pinça ou toque duplo para zoom
                      </p>
                      <PhotoGrid photos={photos} onPreview={openPreview} />
                    </>
                  ) : (
                    <p className={`${valueCls} text-zinc-500 dark:text-zinc-400`}>
                      Sem fotos cadastradas.
                    </p>
                  )}
                </div>

                <div className={cardCls}>
                  <h3 className="mb-3 text-[13px] font-bold text-zinc-800 dark:text-zinc-200">
                    Identificação
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <DetailRow
                      label="Unidade"
                      value={
                        <span className="text-[18px] font-extrabold tabular-nums text-emerald-700 dark:text-emerald-400">
                          {formatAbsModuleSequence(module.sequence_number)}
                        </span>
                      }
                    />
                    <DetailRow
                      label="Código interno"
                      value={
                        <span className="font-mono font-semibold tracking-wide">
                          {module.public_id}
                        </span>
                      }
                    />
                    <DetailRow label="Tipo" value={absModuleKindLabel(module.module_kind)} />
                    <DetailRow label="Fabricante" value={displayText(module.manufacturer)} />
                    <DetailRow
                      label="Família"
                      value={displayText(catalog?.family || module.model)}
                    />
                    <DetailRow label="Status" value={absModuleStatusLabel(module.status)} />
                    <DetailRow label="Localização" value={displayText(module.location)} />
                    <DetailRow label="Fornecedor" value={displayText(module.supplier)} />
                    <DetailRow
                      label="Recebido em"
                      value={
                        module.received_at
                          ? new Date(module.received_at).toLocaleDateString('pt-BR')
                          : '—'
                      }
                    />
                  </div>
                </div>

                <div className={cardCls}>
                  <h3 className="mb-3 text-[13px] font-bold text-zinc-800 dark:text-zinc-200">
                    Códigos
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {codeEletronico && codeHidraulico && codeEletronico !== codeHidraulico ? (
                      <>
                        <DetailRow
                          label="Eletrônico"
                          value={
                            <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                              {codeEletronico}
                            </span>
                          }
                        />
                        <DetailRow
                          label="Hidráulico"
                          value={
                            <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                              {codeHidraulico}
                            </span>
                          }
                        />
                      </>
                    ) : (
                      <DetailRow
                        label="Código"
                        value={
                          <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                            {displayText(codePrimary)}
                          </span>
                        }
                      />
                    )}
                  </div>
                </div>

                <div className={cardCls}>
                  <h3 className="mb-3 text-[13px] font-bold text-zinc-800 dark:text-zinc-200">
                    Estado e condição
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <DetailRow label="Estado" value={absModuleItemStateLabel(module.item_state)} />
                    <DetailRow
                      label="Condição"
                      value={absModuleItemConditionLabel(module.item_condition)}
                    />
                  </div>
                  {module.damage_description?.trim() ? (
                    <div className="mt-4">
                      <p className={labelCls}>Avarias / danos</p>
                      <p className="mt-1 whitespace-pre-wrap text-[14px] text-zinc-800 dark:text-zinc-200">
                        {module.damage_description}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="space-y-5">
                <div className={cardCls}>
                  <h3 className="mb-3 text-[13px] font-bold text-zinc-800 dark:text-zinc-200">
                    Aplicações (veículos)
                  </h3>
                  {applications.length === 0 ? (
                    <p className="text-[14px] text-zinc-500 dark:text-zinc-400">
                      {module.application?.trim()
                        ? module.application
                        : 'Nenhuma aplicação cadastrada.'}
                      {module.year_label?.trim() ? ` · ${module.year_label}` : ''}
                    </p>
                  ) : (
                    <ul className="divide-y divide-zinc-200/60 dark:divide-white/[0.06]">
                      {applications.map((app) => (
                        <li key={app.id} className="py-3">
                          <p className="text-[14px] font-semibold text-zinc-900 dark:text-white">
                            {formatAppRow(app)}
                          </p>
                          {app.notes?.trim() ? (
                            <p className="mt-1 text-[12px] text-zinc-500 dark:text-zinc-400">
                              {app.notes}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {(module.notes?.trim() || catalog?.notes?.trim()) ? (
                  <div className="grid gap-4">
                    {module.notes?.trim() ? (
                      <div className={cardCls}>
                        <h3 className="mb-2 text-[13px] font-bold text-zinc-800 dark:text-zinc-200">
                          Observações da unidade
                        </h3>
                        <p className="whitespace-pre-wrap text-[14px] text-zinc-800 dark:text-zinc-200">
                          {module.notes}
                        </p>
                      </div>
                    ) : null}
                    {catalog?.notes?.trim() ? (
                      <div className={cardCls}>
                        <h3 className="mb-2 text-[13px] font-bold text-zinc-800 dark:text-zinc-200">
                          Observações do modelo
                        </h3>
                        <p className="whitespace-pre-wrap text-[14px] text-zinc-800 dark:text-zinc-200">
                          {catalog.notes}
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className={cardCls}>
                  <h3 className="mb-3 text-[13px] font-bold text-zinc-800 dark:text-zinc-200">
                    Preços
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <DetailRow label="Custo" value={formatAbsModuleMoney(module.unit_cost)} />
                    <DetailRow
                      label="Preço de venda"
                      value={formatAbsModuleMoney(module.unit_price)}
                    />
                  </div>
                </div>

                <div className={cardCls}>
                  <div className="mb-3 flex items-center gap-2">
                    <History className="h-4 w-4 text-zinc-500" />
                    <h3 className="text-[13px] font-bold text-zinc-800 dark:text-zinc-200">
                      Histórico de movimentações
                    </h3>
                  </div>
                  {movements.length === 0 ? (
                    <p className="text-[14px] text-zinc-500 dark:text-zinc-400">
                      Nenhuma movimentação registrada.
                    </p>
                  ) : (
                    <ul className="divide-y divide-zinc-200/60 dark:divide-white/[0.06]">
                      {movements.map((m) => (
                        <li key={m.id} className="py-2.5">
                          <p className="text-[14px] font-medium text-zinc-900 dark:text-white">
                            {describeAbsModuleMovement(m)}
                          </p>
                          <p className="mt-0.5 text-[12px] text-zinc-500 dark:text-zinc-400">
                            {new Date(m.created_at).toLocaleString('pt-BR')}
                            {m.recorded_by_name ? ` · ${m.recorded_by_name}` : ''}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border-0 bg-zinc-50/80 p-4 dark:bg-white/[0.03] sm:p-5">
              <p className="text-[13px] font-bold uppercase tracking-wide text-zinc-500">
                Ações desta unidade
              </p>
              <div className="flex flex-wrap gap-2">
                {onEdit ? (
                  <button
                    type="button"
                    onClick={() => onEdit(module)}
                    disabled={deleting || actionBusy}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    <Pencil className="h-4 w-4" />
                    Editar
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setLabelPrintModules([module])}
                  disabled={deleting || actionBusy}
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-[13px] font-semibold text-amber-950 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-100"
                >
                  <Tag className="h-4 w-4" />
                  Etiqueta
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActionPanel('transfer');
                    setTransferLocation(module.location || '');
                    setActionError(null);
                  }}
                  disabled={deleting || actionBusy}
                  className="inline-flex items-center gap-2 rounded-xl bg-zinc-100 px-4 py-2.5 text-[13px] font-semibold text-zinc-800 hover:bg-zinc-200 dark:bg-white/10 dark:text-zinc-100"
                >
                  <MapPin className="h-4 w-4" />
                  Transferir local
                </button>
                {module.status === 'fora_estoque' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setActionPanel('entry');
                      setEntryLocation(module.location || '');
                      setActionError(null);
                    }}
                    disabled={deleting || actionBusy}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    <ArrowDownToLine className="h-4 w-4" />
                    Registrar entrada
                  </button>
                ) : module.status !== 'desmembrado' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setActionPanel('exit');
                      setConfirmExit(false);
                      setActionError(null);
                    }}
                    disabled={deleting || actionBusy}
                    className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    <ArrowUpFromLine className="h-4 w-4" />
                    Dar saída
                  </button>
                ) : null}
                {module.module_kind === 'completo' &&
                module.status === 'disponivel' &&
                onDisassemble ? (
                  <button
                    type="button"
                    onClick={() => onDisassemble(module)}
                    disabled={deleting || actionBusy}
                    className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-[13px] font-semibold text-amber-950 hover:bg-amber-400 disabled:opacity-50"
                  >
                    <Scissors className="h-4 w-4" />
                    Desmembrar
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={deleting || actionBusy}
                  className="inline-flex items-center gap-2 rounded-xl bg-red-50 px-4 py-2.5 text-[13px] font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 dark:bg-red-950/40 dark:text-red-300"
                >
                  {deleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Excluir
                </button>
              </div>

              {actionError ? (
                <p className="rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-800 dark:bg-red-950/40 dark:text-red-200">
                  {actionError}
                </p>
              ) : null}

              {actionPanel === 'exit' ? (
                <div className="space-y-3 rounded-xl bg-rose-50/80 p-3 dark:bg-rose-950/30">
                  {!confirmExit ? (
                    <>
                      <p className="text-[14px] font-semibold text-rose-950 dark:text-rose-100">
                        Confirmar saída de {formatAbsModuleSequence(module.sequence_number)} (
                        {module.public_id})?
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmExit(true)}
                          className="flex-1 rounded-xl bg-rose-600 px-3 py-2.5 text-[13px] font-semibold text-white"
                        >
                          Sim, continuar
                        </button>
                        <button
                          type="button"
                          onClick={() => setActionPanel(null)}
                          className="flex-1 rounded-xl bg-zinc-100 px-3 py-2.5 text-[13px] font-semibold dark:bg-white/10"
                        >
                          Cancelar
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <label className="block space-y-1">
                        <span className={labelCls}>Motivo</span>
                        <select
                          className={inputCls}
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
                      </label>
                      <label className="block space-y-1">
                        <span className={labelCls}>OS / referência</span>
                        <input
                          className={inputCls}
                          value={exitRef}
                          onChange={(e) => setExitRef(e.target.value)}
                          placeholder="OS #1842"
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className={labelCls}>Observações</span>
                        <textarea
                          rows={2}
                          className={inputCls}
                          value={exitNotes}
                          onChange={(e) => setExitNotes(e.target.value)}
                        />
                      </label>
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() =>
                          void runMovement({
                            public_id: module.public_id,
                            movement_type: 'exit',
                            reason_type: exitReason,
                            reason_ref: exitRef || null,
                            notes: exitNotes || null,
                          })
                        }
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-3 text-[14px] font-semibold text-white disabled:opacity-50"
                      >
                        {actionBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Confirmar saída
                      </button>
                    </>
                  )}
                </div>
              ) : null}

              {actionPanel === 'entry' ? (
                <div className="space-y-3 rounded-xl bg-emerald-50/80 p-3 dark:bg-emerald-950/30">
                  <p className="text-[14px] font-semibold text-emerald-950 dark:text-emerald-100">
                    Registrar retorno de {module.public_id} ao estoque?
                  </p>
                  <label className="block space-y-1">
                    <span className={labelCls}>Local (opcional)</span>
                    <input
                      className={inputCls}
                      value={entryLocation}
                      onChange={(e) => setEntryLocation(e.target.value)}
                      placeholder={module.location || 'Prateleira…'}
                    />
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() =>
                        void runMovement({
                          public_id: module.public_id,
                          movement_type: 'entry',
                          to_location: entryLocation || null,
                        })
                      }
                      className="flex-1 rounded-xl bg-emerald-600 px-3 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
                    >
                      {actionBusy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Confirmar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActionPanel(null)}
                      className="flex-1 rounded-xl bg-zinc-100 px-3 py-2.5 text-[13px] font-semibold dark:bg-white/10"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : null}

              {actionPanel === 'transfer' ? (
                <div className="space-y-3 rounded-xl bg-sky-50/80 p-3 dark:bg-sky-950/30">
                  <p className="text-[14px] font-semibold text-sky-950 dark:text-sky-100">
                    Local atual: {module.location || '—'}
                  </p>
                  <label className="block space-y-1">
                    <span className={labelCls}>Novo local</span>
                    <input
                      className={inputCls}
                      value={transferLocation}
                      onChange={(e) => setTransferLocation(e.target.value)}
                      placeholder="Prateleira…"
                    />
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={actionBusy || !transferLocation.trim()}
                      onClick={() =>
                        void runMovement({
                          public_id: module.public_id,
                          movement_type: 'transfer',
                          to_location: transferLocation.trim(),
                        })
                      }
                      className="flex-1 rounded-xl bg-sky-600 px-3 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
                    >
                      {actionBusy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Transferir'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActionPanel(null)}
                      className="flex-1 rounded-xl bg-zinc-100 px-3 py-2.5 text-[13px] font-semibold dark:bg-white/10"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="text-[15px] font-bold text-zinc-900 dark:text-white">
                    Unidades do mesmo modelo
                  </h3>
                  <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
                    Toque para expandir · selecione para imprimir etiquetas
                    {siblingUnits.length ? ` · ${siblingUnits.length} no total` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={selectAllSiblings}
                    className="rounded-xl bg-zinc-100 px-3 py-2 text-[12px] font-semibold text-zinc-800 dark:bg-white/10 dark:text-zinc-100"
                  >
                    Selecionar todas
                  </button>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="rounded-xl bg-zinc-100 px-3 py-2 text-[12px] font-semibold text-zinc-800 dark:bg-white/10 dark:text-zinc-100"
                  >
                    Limpar
                  </button>
                  <button
                    type="button"
                    disabled={selectedIds.size === 0}
                    onClick={printSelected}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-2 text-[12px] font-semibold text-amber-950 disabled:opacity-40"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Imprimir selecionadas ({selectedIds.size})
                  </button>
                  <button
                    type="button"
                    onClick={printAllSiblings}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-950 dark:bg-amber-950/40 dark:text-amber-100"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Imprimir todas
                  </button>
                </div>
              </div>
              <div className="grid gap-2 xl:grid-cols-2">
                {siblingUnits.map((u) => (
                  <SiblingUnitCard
                    key={u.id}
                    seed={u}
                    isCurrent={u.public_id === module.public_id}
                    selected={selectedIds.has(u.public_id)}
                    onToggleSelect={() => toggleSelect(u.public_id)}
                    onOpenUnit={(id) => onOpenUnit?.(id)}
                    onDisassemble={onDisassemble}
                    onPreview={openPreview}
                    onChanged={() => void load()}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {previewImages ? (
        <Lightbox
          images={previewImages.urls}
          initialIndex={previewImages.currentIndex >= 0 ? previewImages.currentIndex : 0}
          onClose={() => setPreviewImages(null)}
        />
      ) : null}

      <NiimbotAbsModuleLabelPrintModal
        open={!!labelPrintModules?.length}
        modules={labelPrintModules}
        onClose={() => setLabelPrintModules(null)}
      />
    </div>
  );
}
