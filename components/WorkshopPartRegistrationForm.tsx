import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Eye,
  HelpCircle,
  Images,
  Loader2,
  Package,
  Plus,
  Save,
  Trash2,
  X,
  ChevronDown,
  Tags,
} from 'lucide-react';
import { PartPhotoImg } from './ui/PartPhotoImg';
import { CurrencyMaskInput } from './ui/CurrencyMaskInput';
import type { WorkshopPart, WorkshopPartCategory, WorkshopPartFiscalExtra } from '../services/apiService';
import { WORKSHOP_PART_PHOTOS_MAX } from '../services/apiService';

export type PartPhotoSlot = {
  id: string;
  previewUrl: string;
  remoteUrl?: string;
};
import {
  COMMON_NCM_SUGGESTIONS,
  CONTENT_UNIT_OPTIONS,
  PART_ORIGIN_OPTIONS,
  STORAGE_SITE_OPTIONS,
  UNIT_OF_MEASURE_OPTIONS,
  emptyPartFormValues,
  emptyPurchaseDraft,
  formValuesToApiPayload,
  partToFormValues,
  purchaseDraftToPayload,
  purchaseToDraft,
  type WorkshopPartFormValues,
  type WorkshopPartPurchaseDraft,
} from '../utils/workshopPartFields';

const labelCls =
  'block text-[11px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-400';
/** Sombras suaves só no modo claro (campos elevados sobre fundo branco). */
const lightFieldShadow =
  'shadow-[0_2px_10px_-3px_rgba(0,0,0,0.08),0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none';
const lightCardShadow =
  'shadow-[0_4px_20px_-6px_rgba(0,0,0,0.1),0_2px_8px_-2px_rgba(0,0,0,0.06)] dark:shadow-none';
const inputCls =
  `w-full min-w-0 rounded-lg border border-zinc-200/90 dark:border-white/10 bg-zinc-100 dark:bg-white/5 px-3 py-2 text-[14px] text-zinc-900 dark:text-white placeholder:text-zinc-500 dark:placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/35 focus:border-emerald-500/40 ${lightFieldShadow}`;
const textareaCls = `${inputCls} resize-y min-h-[88px]`;

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={labelCls}>{children}</span>
      {hint ? (
        <span title={hint} className="text-zinc-400 dark:text-zinc-500">
          <HelpCircle className="h-3.5 w-3.5" aria-hidden />
        </span>
      ) : null}
    </div>
  );
}

function QtyWithUnit({
  value,
  onChange,
  unit,
}: {
  value: string;
  onChange: (v: string) => void;
  unit: string;
}) {
  return (
    <div className="flex gap-2">
      <input
        type="number"
        min="0"
        step="0.001"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputCls} flex-1 tabular-nums`}
      />
      <span
        className={`flex shrink-0 items-center rounded-lg border border-zinc-200/90 dark:border-white/10 bg-zinc-200/80 dark:bg-white/[0.04] px-2.5 text-[12px] font-bold text-zinc-600 dark:text-zinc-300 ${lightFieldShadow}`}
      >
        {unit}
      </span>
    </div>
  );
}

/** Lista com nome completo; valor fechado mostra só a sigla (select nativo não permite isso). */
function UnitOfMeasureSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected =
    UNIT_OF_MEASURE_OPTIONS.find((o) => o.value === value) ?? UNIT_OF_MEASURE_OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        id="workshop-part-unit-of-measure"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="workshop-part-unit-of-measure-list"
        onClick={() => setOpen((v) => !v)}
        className={`${inputCls} flex w-full items-center justify-between gap-2 text-left font-semibold tabular-nums`}
      >
        <span>{selected.value}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open ? (
        <ul
          id="workshop-part-unit-of-measure-list"
          role="listbox"
          aria-labelledby="workshop-part-unit-of-measure"
          className={`absolute left-0 right-0 top-full z-30 mt-1 max-h-[min(280px,40vh)] overflow-y-auto rounded-lg border border-zinc-200/90 bg-white py-1 shadow-lg shadow-zinc-900/10 dark:border-white/[0.12] dark:bg-zinc-900 dark:shadow-[0_12px_40px_-8px_rgba(0,0,0,0.65)]`}
        >
          {UNIT_OF_MEASURE_OPTIONS.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <li key={opt.value} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={`flex w-full px-3 py-2.5 text-left text-[14px] transition-colors ${
                    isSelected
                      ? 'bg-emerald-500/12 font-semibold text-emerald-900 dark:bg-emerald-400/15 dark:text-emerald-50'
                      : 'font-medium text-zinc-800 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-white/[0.08]'
                  }`}
                >
                  {opt.label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

/** Seleção múltipla de categorias do estoque. */
function PartCategoriesSelect({
  categories,
  selectedIds,
  onChange,
  onManageCategories,
  disabled,
}: {
  categories: WorkshopPartCategory[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onManageCategories?: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const toggle = (id: string) => {
    onChange(
      selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]
    );
  };

  const selectedNames = selectedIds
    .map((id) => categories.find((c) => c.id === id)?.name)
    .filter((n): n is string => !!n);

  const triggerLabel =
    selectedNames.length === 0
      ? 'Selecionar categorias…'
      : selectedNames.length <= 2
        ? selectedNames.join(', ')
        : `${selectedNames.length} categorias selecionadas`;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="space-y-2">
      <div ref={rootRef} className="relative flex gap-2">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          className={`${inputCls} flex min-h-[42px] flex-1 items-center justify-between gap-2 text-left text-[14px] font-medium disabled:opacity-50`}
        >
          <span className="min-w-0 truncate">{triggerLabel}</span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </button>
        {onManageCategories ? (
          <button
            type="button"
            onClick={onManageCategories}
            disabled={disabled}
            title="Gerenciar categorias"
            className={`flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg border border-zinc-200/90 bg-zinc-100 text-zinc-700 hover:bg-zinc-200/90 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.05] dark:text-zinc-200 ${lightFieldShadow}`}
          >
            <Tags className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
        {open ? (
          <ul
            role="listbox"
            aria-multiselectable="true"
            className="absolute left-0 right-0 top-full z-30 mt-1 max-h-[min(240px,36vh)] overflow-y-auto rounded-lg border border-zinc-200/90 bg-white py-1 shadow-lg shadow-zinc-900/10 dark:border-white/[0.12] dark:bg-zinc-900 dark:shadow-[0_12px_40px_-8px_rgba(0,0,0,0.65)]"
          >
            {categories.length === 0 ? (
              <li className="px-3 py-3 text-[13px] text-zinc-500 dark:text-zinc-400">
                Nenhuma categoria cadastrada. Use o botão ao lado para criar.
              </li>
            ) : (
              categories.map((cat) => {
                const isSelected = selectedIds.includes(cat.id);
                return (
                  <li key={cat.id} role="none">
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => toggle(cat.id)}
                      className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[14px] transition-colors ${
                        isSelected
                          ? 'bg-emerald-500/12 font-semibold text-emerald-900 dark:bg-emerald-400/15 dark:text-emerald-50'
                          : 'font-medium text-zinc-800 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-white/[0.08]'
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          isSelected
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : 'border-zinc-300 bg-white dark:border-white/20 dark:bg-transparent'
                        }`}
                      >
                        {isSelected ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                      </span>
                      <span className="min-w-0 truncate">{cat.name}</span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        ) : null}
      </div>
      {selectedNames.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedIds.map((id) => {
            const name = categories.find((c) => c.id === id)?.name;
            if (!name) return null;
            return (
              <span
                key={id}
                className="inline-flex max-w-full items-center gap-1 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[12px] font-semibold text-emerald-900 dark:text-emerald-100"
              >
                <span className="truncate">{name}</span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => toggle(id)}
                  className="shrink-0 rounded p-0.5 text-emerald-800 hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-200"
                  aria-label={`Remover categoria ${name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export type WorkshopPartRegistrationFormProps = {
  mode: 'create' | 'edit';
  initialPart?: WorkshopPart | null;
  initialPurchases?: WorkshopPartPurchaseDraft[];
  categories?: WorkshopPartCategory[];
  onManageCategories?: () => void;
  photos?: PartPhotoSlot[];
  maxPhotos?: number;
  saving?: boolean;
  error?: string | null;
  onValuesChange?: (name: string) => void;
  onAddPhoto?: () => void;
  onAddPhotoCamera?: () => void;
  onRemovePhoto?: (photoId: string) => void;
  onEditPhoto?: (photoId: string) => void;
  photoBusy?: boolean;
  onSubmit: (payload: {
    values: WorkshopPartFormValues;
    purchases: WorkshopPartPurchaseDraft[];
  }) => void | Promise<void>;
  onCancel: () => void;
};

export function WorkshopPartRegistrationForm({
  mode,
  initialPart,
  initialPurchases,
  categories = [],
  onManageCategories,
  photos = [],
  maxPhotos = WORKSHOP_PART_PHOTOS_MAX,
  saving = false,
  error,
  onValuesChange,
  onAddPhoto,
  onAddPhotoCamera,
  onRemovePhoto,
  onEditPhoto,
  photoBusy,
  onSubmit,
  onCancel,
}: WorkshopPartRegistrationFormProps) {
  const [values, setValues] = useState<WorkshopPartFormValues>(() =>
    initialPart ? partToFormValues(initialPart) : emptyPartFormValues()
  );
  const [purchases, setPurchases] = useState<WorkshopPartPurchaseDraft[]>(
    initialPurchases ?? []
  );
  const [fiscalOpen, setFiscalOpen] = useState(false);
  const [fiscalDraft, setFiscalDraft] = useState<WorkshopPartFiscalExtra>({});

  useEffect(() => {
    if (initialPart) {
      setValues(partToFormValues(initialPart));
      setFiscalDraft(initialPart.fiscal_extra ?? {});
    } else {
      setValues(emptyPartFormValues());
      setFiscalDraft({});
    }
    setPurchases(initialPurchases ?? []);
  }, [initialPart?.id, mode]);

  const patch = useCallback((patchValues: Partial<WorkshopPartFormValues>) => {
    setValues((prev) => {
      const next = { ...prev, ...patchValues };
      if (patchValues.name !== undefined) onValuesChange?.(patchValues.name);
      return next;
    });
  }, [onValuesChange]);

  useEffect(() => {
    onValuesChange?.(values.name);
  }, []);

  const unit = values.unit_of_measure || 'UN';

  const handleSave = () => {
    void onSubmit({ values: { ...values, fiscal_extra: fiscalDraft }, purchases });
  };

  return (
    <div className="space-y-6">
      {error ? (
        <p
          className={`rounded-xl border border-red-300/80 bg-red-50 px-4 py-3 text-[14px] text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200 ${lightCardShadow}`}
        >
          {error}
        </p>
      ) : null}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <FieldLabel hint="A primeira foto é a capa na lista do estoque. Até 3 imagens.">
            Fotos do produto
          </FieldLabel>
          <span className="text-[12px] font-semibold tabular-nums text-zinc-500 dark:text-zinc-400">
            {photos.length}/{maxPhotos}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3 max-w-[min(100%,420px)]">
          {Array.from({ length: maxPhotos }, (_, index) => {
            const slot = photos[index] ?? null;
            const isAddSlot = !slot && photos.length === index && photos.length < maxPhotos;
            return (
              <div key={slot?.id ?? `empty-${index}`} className="relative aspect-square">
                {slot ? (
                  <>
                    <div
                      className={`relative isolate h-full w-full overflow-hidden rounded-xl border border-zinc-200/90 bg-zinc-100 dark:border-white/10 dark:bg-white/[0.03] ${index === 0 ? 'ring-2 ring-emerald-500/45' : ''} ${lightCardShadow}`}
                    >
                      {index === 0 ? (
                        <span className="absolute left-1 top-1 z-10 rounded-md bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow-sm">
                          Capa
                        </span>
                      ) : null}
                      <PartPhotoImg
                        src={slot.remoteUrl ?? slot.previewUrl}
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
                      onClick={() => onRemovePhoto?.(slot.id)}
                      disabled={photoBusy}
                      className="absolute -right-1.5 -top-1.5 flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 bg-white text-red-600 shadow-md hover:bg-red-50 disabled:opacity-50 dark:border-white/15 dark:bg-zinc-900"
                      aria-label="Remover foto"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    {onEditPhoto ? (
                      <button
                        type="button"
                        onClick={() => onEditPhoto(slot.id)}
                        disabled={photoBusy}
                        className="absolute bottom-1 left-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white hover:bg-black/70 disabled:opacity-50"
                      >
                        Ajustar
                      </button>
                    ) : null}
                  </>
                ) : isAddSlot ? (
                  <button
                    type="button"
                    onClick={onAddPhoto}
                    disabled={photoBusy || !onAddPhoto}
                    className={`flex h-full w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-zinc-300/90 bg-zinc-100 text-zinc-500 transition-colors hover:border-emerald-500/50 hover:text-emerald-700 disabled:opacity-50 dark:border-white/15 dark:bg-white/[0.03] dark:hover:text-emerald-400 ${lightFieldShadow}`}
                  >
                    <Plus className="h-6 w-6" aria-hidden />
                    <span className="text-[10px] font-bold uppercase tracking-wide">Adicionar</span>
                  </button>
                ) : (
                  <div
                    className={`flex h-full w-full items-center justify-center rounded-xl border border-dashed border-zinc-200/60 bg-zinc-50/80 dark:border-white/10 dark:bg-white/[0.02] ${lightFieldShadow}`}
                    aria-hidden
                  >
                    <Package className="h-8 w-8 text-zinc-300 dark:text-zinc-600" strokeWidth={1.25} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {onAddPhoto ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onAddPhoto}
              disabled={photoBusy || photos.length >= maxPhotos}
              className={`inline-flex items-center gap-1 rounded-lg border border-zinc-200/90 bg-zinc-100 px-2.5 py-1.5 text-[12px] font-semibold text-zinc-700 disabled:opacity-50 dark:border-white/10 dark:bg-transparent dark:text-zinc-200 ${lightFieldShadow}`}
            >
              <Images className="h-3.5 w-3.5" /> Galeria
            </button>
            <button
              type="button"
              onClick={onAddPhotoCamera ?? onAddPhoto}
              disabled={photoBusy || photos.length >= maxPhotos}
              className={`inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50 shadow-[0_3px_12px_-2px_rgba(5,150,105,0.45)] dark:shadow-none`}
            >
              <Camera className="h-3.5 w-3.5" /> Câmera
            </button>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
            <FieldLabel>Nome da peça</FieldLabel>
            <input
              type="text"
              value={values.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="Ex.: Pastilha de freio dianteira"
              className={inputCls}
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Marca</FieldLabel>
            <input
              type="text"
              value={values.brand}
              onChange={(e) => patch({ brand: e.target.value })}
              placeholder="Ex.: Bosch, TRW, Cofap"
              className={inputCls}
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Modelo</FieldLabel>
            <input
              type="text"
              value={values.model}
              onChange={(e) => patch({ model: e.target.value })}
              placeholder="Ex.: ABS 8.1, DOT 4"
              className={inputCls}
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Código original</FieldLabel>
            <input
              type="text"
              value={values.original_code}
              onChange={(e) => patch({ original_code: e.target.value })}
              className={inputCls}
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Código numérico</FieldLabel>
            <input
              type="text"
              value={values.numeric_code}
              onChange={(e) => patch({ numeric_code: e.target.value })}
              className={`${inputCls} tabular-nums`}
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel hint="Barracão onde o produto está guardado">Empresa / barracão</FieldLabel>
            <select
              value={values.storage_site}
              onChange={(e) =>
                patch({ storage_site: e.target.value === 'deposito' ? 'deposito' : 'oficina' })
              }
              className={inputCls}
            >
              {STORAGE_SITE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <FieldLabel hint="Prateleira ou posição dentro do barracão">Localização</FieldLabel>
            <input
              type="text"
              value={values.location}
              onChange={(e) => patch({ location: e.target.value })}
              placeholder="Prateleira, corredor…"
              className={inputCls}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <FieldLabel hint="Quantidade líquida da embalagem (ex.: 500 ml, 1 L)">Conteúdo</FieldLabel>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                step="0.001"
                value={values.content_qty}
                onChange={(e) => patch({ content_qty: e.target.value })}
                placeholder="Ex.: 500"
                className={`${inputCls} flex-1 tabular-nums`}
              />
              <select
                value={values.content_unit}
                onChange={(e) => patch({ content_unit: e.target.value })}
                className={`${inputCls} w-36 shrink-0`}
                aria-label="Unidade do conteúdo"
              >
                <option value="">Unidade</option>
                {CONTENT_UNIT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
            <FieldLabel>Descrição</FieldLabel>
            <textarea
              value={values.description}
              onChange={(e) => patch({ description: e.target.value })}
              placeholder="Descrição do produto…"
              className={textareaCls}
              rows={3}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
            <FieldLabel>Características</FieldLabel>
            <textarea
              value={values.characteristics}
              onChange={(e) => patch({ characteristics: e.target.value })}
              placeholder="Características técnicas, material, compatibilidade…"
              className={textareaCls}
              rows={3}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
            <FieldLabel hint="Pode escolher mais de uma; a primeira é a família principal">
              Categorias
            </FieldLabel>
            <PartCategoriesSelect
              categories={categories}
              selectedIds={values.category_ids}
              onChange={(ids) => patch({ category_ids: ids })}
              onManageCategories={onManageCategories}
              disabled={saving}
            />
          </div>
        </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-1.5">
          <FieldLabel hint="Veículos, aplicações e códigos similares">Aplicação e similares</FieldLabel>
          <textarea
            value={values.application_similar}
            onChange={(e) => patch({ application_similar: e.target.value })}
            className={textareaCls}
            rows={5}
          />
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Observações</FieldLabel>
          <textarea
            value={values.notes}
            onChange={(e) => patch({ notes: e.target.value })}
            className={textareaCls}
            rows={5}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5 sm:col-span-2">
          <FieldLabel hint="Nomenclatura Comum do Mercosul">NCM</FieldLabel>
          <input
            type="text"
            list="workshop-part-ncm-list"
            value={values.ncm_code}
            onChange={(e) => patch({ ncm_code: e.target.value })}
            placeholder="Escolha ou digite um NCM"
            className={inputCls}
          />
          <datalist id="workshop-part-ncm-list">
            {COMMON_NCM_SUGGESTIONS.map((n) => (
              <option key={n.code} value={n.code}>
                {n.label}
              </option>
            ))}
          </datalist>
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Unidade de medida</FieldLabel>
          <UnitOfMeasureSelect
            value={values.unit_of_measure}
            onChange={(code) => patch({ unit_of_measure: code })}
          />
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Quantidade mínima</FieldLabel>
          <QtyWithUnit
            value={values.min_stock_qty}
            onChange={(v) => patch({ min_stock_qty: v })}
            unit={unit}
          />
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
            Quando o estoque ficar neste valor ou abaixo, o produto aparecerá com alerta &quot;Acabando&quot; na lista.
          </p>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <FieldLabel>Origem da peça</FieldLabel>
          <select
            value={values.fiscal_origin}
            onChange={(e) => patch({ fiscal_origin: e.target.value })}
            className={inputCls}
          >
            {PART_ORIGIN_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Preço venda</FieldLabel>
          <CurrencyMaskInput
            value={values.unit_price}
            onChange={(v) => patch({ unit_price: v })}
            inputClassName={inputCls}
            aria-label="Preço de venda"
          />
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Prêmio</FieldLabel>
          <CurrencyMaskInput
            value={values.premium_amount}
            onChange={(v) => patch({ premium_amount: v })}
            inputClassName={inputCls}
            aria-label="Prêmio"
          />
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Comissão</FieldLabel>
          <div className="relative">
            <input
              type="number"
              min="0"
              step="0.01"
              value={values.commission_pct}
              onChange={(e) => patch({ commission_pct: e.target.value })}
              className={`${inputCls} pr-9 tabular-nums`}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-zinc-500">
              %
            </span>
          </div>
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Lucro padrão</FieldLabel>
          <div className="relative">
            <input
              type="number"
              min="0"
              step="0.01"
              value={values.default_profit_pct}
              onChange={(e) => patch({ default_profit_pct: e.target.value })}
              className={`${inputCls} pr-9 tabular-nums`}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-zinc-500">
              %
            </span>
          </div>
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Km limite</FieldLabel>
          <input
            type="number"
            min="0"
            step="1"
            value={values.km_limit}
            onChange={(e) => patch({ km_limit: e.target.value })}
            className={`${inputCls} tabular-nums`}
          />
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Validade em meses</FieldLabel>
          <input
            type="number"
            min="0"
            step="1"
            value={values.validity_months}
            onChange={(e) => patch({ validity_months: e.target.value })}
            className={`${inputCls} tabular-nums`}
          />
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Custo unitário</FieldLabel>
          <CurrencyMaskInput
            value={values.unit_cost}
            onChange={(v) => patch({ unit_cost: v })}
            inputClassName={inputCls}
            aria-label="Custo unitário"
          />
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Quantidade em estoque</FieldLabel>
          <QtyWithUnit value={values.stock_qty} onChange={(v) => patch({ stock_qty: v })} unit={unit} />
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Quantidade máxima</FieldLabel>
          <QtyWithUnit value={values.max_stock_qty} onChange={(v) => patch({ max_stock_qty: v })} unit={unit} />
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          setFiscalDraft(values.fiscal_extra ?? {});
          setFiscalOpen(true);
        }}
        className={`flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-200/90 bg-zinc-100 px-4 py-3 text-[13px] font-semibold text-zinc-800 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 hover:bg-zinc-200/90 dark:hover:bg-white/[0.06] ${lightCardShadow}`}
      >
        <Eye className="h-4 w-4" aria-hidden />
        Mais configurações fiscais
      </button>

      <div
        className={`overflow-hidden rounded-xl border border-zinc-200/90 bg-zinc-50/50 dark:border-white/[0.08] dark:bg-transparent ${lightCardShadow}`}
      >
        <div
          className={`flex items-center justify-between gap-3 border-b border-zinc-200/70 bg-zinc-100 px-4 py-3 dark:border-white/[0.06] dark:bg-white/[0.03] ${lightFieldShadow}`}
        >
          <p className="text-[13px] font-bold text-zinc-800 dark:text-zinc-100">Lista de compras</p>
          <button
            type="button"
            onClick={() => setPurchases((p) => [...p, emptyPurchaseDraft()])}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-500"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar compra
          </button>
        </div>
        <p className="px-4 pb-2 text-[12px] text-zinc-500 dark:text-zinc-400">
          Com status <span className="font-semibold text-emerald-700 dark:text-emerald-400">Recebido</span>, a
          quantidade da compra é somada ao estoque do produto ao salvar.
        </p>
        {purchases.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-zinc-500 dark:text-zinc-400">
            Nenhuma compra planejada. Use &quot;Adicionar compra&quot; para registrar pedidos ao fornecedor.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200/60 dark:divide-white/[0.06]">
            {purchases.map((row, idx) => (
              <li
                key={row.id ?? `new-${idx}`}
                className={`grid gap-3 bg-white p-4 sm:grid-cols-2 lg:grid-cols-6 dark:bg-transparent ${lightFieldShadow}`}
              >
                <div className="space-y-1 lg:col-span-2">
                  <span className={labelCls}>Fornecedor</span>
                  <input
                    type="text"
                    value={row.supplier_name}
                    onChange={(e) =>
                      setPurchases((list) =>
                        list.map((r, i) => (i === idx ? { ...r, supplier_name: e.target.value } : r))
                      )
                    }
                    className={inputCls}
                  />
                </div>
                <div className="space-y-1">
                  <span className={labelCls}>Qtd</span>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={row.quantity}
                    onChange={(e) =>
                      setPurchases((list) =>
                        list.map((r, i) => (i === idx ? { ...r, quantity: e.target.value } : r))
                      )
                    }
                    className={`${inputCls} tabular-nums`}
                  />
                </div>
                <div className="space-y-1">
                  <span className={labelCls}>Custo un.</span>
                  <CurrencyMaskInput
                    showPrefix={false}
                    value={row.unit_cost}
                    onChange={(v) =>
                      setPurchases((list) =>
                        list.map((r, i) => (i === idx ? { ...r, unit_cost: v } : r))
                      )
                    }
                    inputClassName={inputCls}
                    aria-label="Custo unitário da compra"
                  />
                </div>
                <div className="space-y-1">
                  <span className={labelCls}>Previsão</span>
                  <input
                    type="date"
                    value={row.expected_date}
                    onChange={(e) =>
                      setPurchases((list) =>
                        list.map((r, i) => (i === idx ? { ...r, expected_date: e.target.value } : r))
                      )
                    }
                    className={inputCls}
                  />
                </div>
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <span className={labelCls}>Status</span>
                    <select
                      value={row.status}
                      onChange={(e) =>
                        setPurchases((list) =>
                          list.map((r, i) =>
                            i === idx
                              ? { ...r, status: e.target.value as WorkshopPartPurchaseDraft['status'] }
                              : r
                          )
                        )
                      }
                      className={inputCls}
                    >
                      <option value="pending">Pendente</option>
                      <option value="ordered">Pedido</option>
                      <option value="received">Recebido</option>
                      <option value="cancelled">Cancelado</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPurchases((list) => list.filter((_, i) => i !== idx))}
                    className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-red-600 hover:bg-red-500/10"
                    aria-label="Remover compra"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-zinc-200/50 dark:border-white/[0.06] pt-6 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-xl px-5 py-3 text-[15px] font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!values.name.trim() || saving}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-8 py-3 text-[15px] font-semibold text-white shadow-[0_4px_16px_-2px_rgba(5,150,105,0.45)] hover:bg-emerald-500 disabled:opacity-50 dark:shadow-none"
        >
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
          Salvar
        </button>
      </div>

      {fiscalOpen ? (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setFiscalOpen(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Configurações fiscais</h3>
              <button type="button" onClick={() => setFiscalOpen(false)} aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ['cest', 'CEST'],
                  ['cfop', 'CFOP'],
                  ['icms_cst', 'CST ICMS'],
                  ['ipi_cst', 'CST IPI'],
                  ['pis_cst', 'CST PIS'],
                  ['cofins_cst', 'CST COFINS'],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="space-y-1">
                  <span className={labelCls}>{label}</span>
                  <input
                    type="text"
                    value={fiscalDraft[key] ?? ''}
                    onChange={(e) => setFiscalDraft((d) => ({ ...d, [key]: e.target.value }))}
                    className={inputCls}
                  />
                </div>
              ))}
              <div className="space-y-1 sm:col-span-2">
                <span className={labelCls}>Observações fiscais</span>
                <textarea
                  value={fiscalDraft.tax_notes ?? ''}
                  onChange={(e) => setFiscalDraft((d) => ({ ...d, tax_notes: e.target.value }))}
                  className={textareaCls}
                  rows={3}
                />
              </div>
            </div>
            <button
              type="button"
              className="mt-4 w-full rounded-xl bg-emerald-600 py-2.5 text-[14px] font-semibold text-white"
              onClick={() => {
                patch({ fiscal_extra: fiscalDraft });
                setFiscalOpen(false);
              }}
            >
              Aplicar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
