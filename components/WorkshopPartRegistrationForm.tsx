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
} from 'lucide-react';
import { StorageThumbImg } from './ui/StorageThumbImg';
import type { WorkshopPart, WorkshopPartCategory, WorkshopPartFiscalExtra } from '../services/apiService';
import {
  COMMON_NCM_SUGGESTIONS,
  PART_ORIGIN_OPTIONS,
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
  'block text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400';
const inputCls =
  'w-full min-w-0 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-[14px] text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/35';
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

function MoneyInput({
  value,
  onChange,
  placeholder = '0,00',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-zinc-500">
        R$
      </span>
      <input
        type="number"
        min="0"
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${inputCls} pl-9 tabular-nums`}
      />
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
      <span className="flex shrink-0 items-center rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.04] px-2.5 text-[12px] font-bold text-zinc-600 dark:text-zinc-300">
        {unit}
      </span>
    </div>
  );
}

export type WorkshopPartRegistrationFormProps = {
  mode: 'create' | 'edit';
  categories: WorkshopPartCategory[];
  initialPart?: WorkshopPart | null;
  initialPurchases?: WorkshopPartPurchaseDraft[];
  photoPreviewUrl?: string | null;
  saving?: boolean;
  error?: string | null;
  onValuesChange?: (name: string) => void;
  onPickPhoto?: () => void;
  onPickGallery?: () => void;
  onPickCamera?: () => void;
  onAdjustPhoto?: () => void;
  hasPhoto?: boolean;
  photoBusy?: boolean;
  onSubmit: (payload: {
    values: WorkshopPartFormValues;
    categoryIds: string[];
    purchases: WorkshopPartPurchaseDraft[];
  }) => void | Promise<void>;
  onCancel: () => void;
};

export function WorkshopPartRegistrationForm({
  mode,
  categories,
  initialPart,
  initialPurchases,
  photoPreviewUrl,
  saving = false,
  error,
  onValuesChange,
  onPickPhoto,
  onPickGallery,
  onPickCamera,
  onAdjustPhoto,
  hasPhoto,
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
    const categoryIds = values.primary_category_id ? [values.primary_category_id] : [];
    void onSubmit({ values: { ...values, fiscal_extra: fiscalDraft }, categoryIds, purchases });
  };

  return (
    <div className="space-y-6">
      {error ? (
        <p className="rounded-xl border border-red-300/80 bg-red-50 px-4 py-3 text-[14px] text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[200px_1fr]">
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={onPickPhoto}
            className="relative flex aspect-square w-full max-w-[200px] items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-zinc-300 dark:border-white/15 bg-zinc-50 dark:bg-white/[0.03] hover:border-emerald-500/50 transition-colors"
          >
            {photoPreviewUrl ? (
              <img src={photoPreviewUrl} alt="" className="h-full w-full object-cover" />
            ) : hasPhoto && initialPart?.photo_url ? (
              <StorageThumbImg
                src={initialPart.photo_url}
                alt=""
                className="h-full w-full object-cover"
                thumbMaxWidth={200}
                thumbMaxHeight={200}
              />
            ) : (
              <Package className="h-12 w-12 text-emerald-600/70" strokeWidth={1.25} aria-hidden />
            )}
            {photoBusy ? (
              <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                <Loader2 className="h-8 w-8 animate-spin text-white" />
              </span>
            ) : null}
          </button>
          <div className="flex flex-wrap justify-center gap-2">
            {onPickGallery ? (
              <button
                type="button"
                onClick={onPickGallery}
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-white/10 px-2.5 py-1.5 text-[12px] font-semibold text-zinc-700 dark:text-zinc-200"
              >
                <Images className="h-3.5 w-3.5" /> Galeria
              </button>
            ) : null}
            {onPickCamera ? (
              <button
                type="button"
                onClick={onPickCamera}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[12px] font-semibold text-white"
              >
                <Camera className="h-3.5 w-3.5" /> Câmera
              </button>
            ) : null}
            {onAdjustPhoto && (hasPhoto || initialPart?.photo_url) ? (
              <button
                type="button"
                onClick={onAdjustPhoto}
                className="inline-flex items-center gap-1 rounded-lg border border-violet-300/80 px-2.5 py-1.5 text-[12px] font-semibold text-violet-800 dark:text-violet-200"
              >
                Ajustar
              </button>
            ) : null}
          </div>
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
            <FieldLabel>Código original</FieldLabel>
            <input
              type="text"
              value={values.original_code}
              onChange={(e) => patch({ original_code: e.target.value })}
              className={inputCls}
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel hint="Família / categoria principal">Família</FieldLabel>
            <select
              value={values.primary_category_id}
              onChange={(e) => patch({ primary_category_id: e.target.value })}
              className={inputCls}
            >
              <option value="">Selecione uma família</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
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
            <FieldLabel>Localização</FieldLabel>
            <input
              type="text"
              value={values.location}
              onChange={(e) => patch({ location: e.target.value })}
              placeholder="Prateleira, corredor…"
              className={inputCls}
            />
          </div>
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
          <select
            value={values.unit_of_measure}
            onChange={(e) => patch({ unit_of_measure: e.target.value })}
            className={inputCls}
          >
            {UNIT_OF_MEASURE_OPTIONS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Quantidade mínima</FieldLabel>
          <QtyWithUnit
            value={values.min_stock_qty}
            onChange={(v) => patch({ min_stock_qty: v })}
            unit={unit}
          />
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
          <MoneyInput value={values.unit_price} onChange={(v) => patch({ unit_price: v })} />
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Prêmio</FieldLabel>
          <MoneyInput value={values.premium_amount} onChange={(v) => patch({ premium_amount: v })} />
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
          <MoneyInput value={values.unit_cost} onChange={(v) => patch({ unit_cost: v })} />
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
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.03] px-4 py-3 text-[13px] font-semibold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06]"
      >
        <Eye className="h-4 w-4" aria-hidden />
        Mais configurações fiscais
      </button>

      <div className="rounded-xl border border-zinc-200/80 dark:border-white/[0.08] overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200/60 dark:border-white/[0.06] bg-zinc-50/80 dark:bg-white/[0.03] px-4 py-3">
          <p className="text-[13px] font-bold text-zinc-800 dark:text-zinc-100">Lista de compras</p>
          <button
            type="button"
            onClick={() => setPurchases((p) => [...p, emptyPurchaseDraft()])}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-500"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar compra
          </button>
        </div>
        {purchases.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-zinc-500 dark:text-zinc-400">
            Nenhuma compra planejada. Use &quot;Adicionar compra&quot; para registrar pedidos ao fornecedor.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200/60 dark:divide-white/[0.06]">
            {purchases.map((row, idx) => (
              <li key={row.id ?? `new-${idx}`} className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
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
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.unit_cost}
                    onChange={(e) =>
                      setPurchases((list) =>
                        list.map((r, i) => (i === idx ? { ...r, unit_cost: e.target.value } : r))
                      )
                    }
                    className={`${inputCls} tabular-nums`}
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
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-8 py-3 text-[15px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
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
            className="w-full max-w-lg rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 p-6 shadow-xl"
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
