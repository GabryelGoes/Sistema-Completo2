import React, { useMemo, useState } from 'react';
import { Loader2, Pencil, Trash2, ZoomIn } from 'lucide-react';
import { Lightbox } from './Lightbox';
import { PartPhotoImg } from './ui/PartPhotoImg';
import { useBrowserBackLayer } from './ui/BackNavigationContext';
import type { WorkshopPart, WorkshopPartCategory, WorkshopPartPurchase } from '../services/apiService';
import { WORKSHOP_PART_PHOTOS_MAX } from '../services/apiService';
import {
  PART_ORIGIN_OPTIONS,
  UNIT_OF_MEASURE_OPTIONS,
} from '../utils/workshopPartFields';
import { getWorkshopPartStockStatus } from '../utils/workshopPartStock';
import { WorkshopPartStockBadge } from './ui/WorkshopPartStockBadge';
import type { PartPhotoSlot } from './WorkshopPartRegistrationForm';

const labelCls =
  'text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400';
const valueCls = 'text-[14px] text-zinc-900 dark:text-zinc-100';
const cardCls =
  'rounded-xl border border-zinc-200/90 bg-zinc-50/80 p-4 dark:border-white/[0.08] dark:bg-white/[0.03] shadow-[0_2px_10px_-3px_rgba(0,0,0,0.08)] dark:shadow-none';

function fmtMoney(n: number): string {
  return `R$ ${Number(n ?? 0).toFixed(2)}`;
}

function fmtQty(n: number, unit: string): string {
  return `${Number(n ?? 0).toFixed(3)} ${unit}`;
}

function displayText(v: string | null | undefined): string {
  const s = (v ?? '').trim();
  return s || '—';
}

function originLabel(code: string): string {
  return PART_ORIGIN_OPTIONS.find((o) => o.value === code)?.label ?? code;
}

function unitLabel(code: string): string {
  const u = UNIT_OF_MEASURE_OPTIONS.find((o) => o.value === code);
  return u ? `${u.value} — ${u.label}` : code;
}

const PURCHASE_STATUS: Record<string, string> = {
  pending: 'Pendente',
  ordered: 'Pedido',
  received: 'Recebido',
  cancelled: 'Cancelado',
};

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className={labelCls}>{label}</p>
      <div className={valueCls}>{value}</div>
    </div>
  );
}

export type WorkshopPartDetailViewProps = {
  part: WorkshopPart;
  /** Número sequencial no catálogo (#1, #2, …). */
  catalogNumber?: number;
  photos: PartPhotoSlot[];
  purchases: WorkshopPartPurchase[];
  categories: WorkshopPartCategory[];
  loading?: boolean;
  onEdit: () => void;
  onDelete: () => void;
};

export function WorkshopPartDetailView({
  part,
  catalogNumber,
  photos,
  purchases,
  categories,
  loading,
  onEdit,
  onDelete,
}: WorkshopPartDetailViewProps) {
  const unit = part.unit_of_measure ?? 'UN';
  const stockStatus = getWorkshopPartStockStatus(part);
  const categoryNames = (part.category_ids ?? [])
    .map((id) => categories.find((c) => c.id === id)?.name)
    .filter((n): n is string => !!n);
  const fe = part.fiscal_extra ?? {};
  const hasFiscal = Object.values(fe).some((v) => v != null && String(v).trim() !== '');

  const photoUrls = useMemo(
    () =>
      photos
        .map((slot) => (slot.remoteUrl ?? slot.previewUrl)?.trim())
        .filter((url): url is string => !!url),
    [photos]
  );

  const [previewImages, setPreviewImages] = useState<{
    urls: string[];
    currentIndex: number;
  } | null>(null);

  useBrowserBackLayer(!!previewImages, () => setPreviewImages(null));

  return (
    <div className="space-y-5">
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <p className={labelCls}>Fotos</p>
            {photos.length > 0 ? (
              <>
                <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
                  Toque em uma foto para ampliar · pinça ou toque duplo para zoom
                </p>
                <div className="grid grid-cols-3 gap-3 max-w-[min(100%,420px)]">
                {photos.map((slot, index) => {
                  const url = (slot.remoteUrl ?? slot.previewUrl)?.trim();
                  const canPreview = !!url;
                  return (
                  <div
                    key={slot.id}
                    className="group relative aspect-square overflow-hidden rounded-xl border border-zinc-200/90 bg-zinc-100 dark:border-white/10 dark:bg-white/[0.03]"
                  >
                    {canPreview ? (
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewImages({
                            urls: photoUrls,
                            currentIndex: index,
                          })
                        }
                        className="absolute inset-0 h-full w-full focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                        aria-label={`Ampliar foto ${index + 1} de ${photos.length}`}
                      >
                        <PartPhotoImg
                          src={url}
                          alt=""
                          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/25 group-active:bg-black/35">
                          <ZoomIn className="h-7 w-7 text-white opacity-0 drop-shadow-lg transition-opacity group-hover:opacity-100" />
                        </div>
                      </button>
                    ) : (
                      <PartPhotoImg
                        src={url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    )}
                    {index === 0 ? (
                      <span className="pointer-events-none absolute left-1 top-1 z-[1] rounded-md bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                        Capa
                      </span>
                    ) : null}
                  </div>
                  );
                })}
                {photos.length < WORKSHOP_PART_PHOTOS_MAX
                  ? Array.from({ length: WORKSHOP_PART_PHOTOS_MAX - photos.length }).map((_, i) => (
                      <div
                        key={`empty-${i}`}
                        className="aspect-square rounded-xl border border-dashed border-zinc-200/70 bg-zinc-50/50 dark:border-white/10 dark:bg-white/[0.02]"
                        aria-hidden
                      />
                    ))
                  : null}
                </div>
              </>
            ) : (
              <p className={`${valueCls} text-zinc-500 dark:text-zinc-400`}>Sem fotos cadastradas.</p>
            )}
          </div>

          <div className={cardCls}>
            <h3 className="mb-3 text-[13px] font-bold text-zinc-800 dark:text-zinc-200">Identificação</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {catalogNumber != null ? (
                <DetailRow label="Nº no estoque" value={`#${catalogNumber}`} />
              ) : null}
              <DetailRow label="Marca" value={displayText(part.brand)} />
              <DetailRow
                label="Produto"
                value={
                  <span className="text-[18px] font-extrabold leading-tight text-zinc-900 dark:text-white">
                    {displayText(part.name)}
                  </span>
                }
              />
              <DetailRow label="Localização" value={displayText(part.location)} />
              <DetailRow label="Código original" value={displayText(part.original_code)} />
              <DetailRow label="Código numérico" value={displayText(part.numeric_code)} />
              <DetailRow
                label="Categorias"
                value={
                  categoryNames.length > 0 ? (
                    <span className="flex flex-wrap gap-1.5">
                      {categoryNames.map((name) => (
                        <span
                          key={name}
                          className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[12px] font-semibold text-emerald-900 dark:text-emerald-100"
                        >
                          {name}
                        </span>
                      ))}
                    </span>
                  ) : (
                    '—'
                  )
                }
              />
              <DetailRow label="Unidade de medida" value={unitLabel(unit)} />
            </div>
          </div>

          {(part.application_similar?.trim() || part.notes?.trim()) ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {part.application_similar?.trim() ? (
                <div className={cardCls}>
                  <h3 className="mb-2 text-[13px] font-bold text-zinc-800 dark:text-zinc-200">
                    Aplicação e similares
                  </h3>
                  <p className="whitespace-pre-wrap text-[14px] text-zinc-800 dark:text-zinc-200">
                    {part.application_similar}
                  </p>
                </div>
              ) : null}
              {part.notes?.trim() ? (
                <div className={cardCls}>
                  <h3 className="mb-2 text-[13px] font-bold text-zinc-800 dark:text-zinc-200">Observações</h3>
                  <p className="whitespace-pre-wrap text-[14px] text-zinc-800 dark:text-zinc-200">{part.notes}</p>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className={cardCls}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h3 className="text-[13px] font-bold text-zinc-800 dark:text-zinc-200">Estoque e preços</h3>
              <WorkshopPartStockBadge status={stockStatus} />
            </div>
            {stockStatus !== 'ok' ? (
              <p
                className={`mb-3 rounded-lg px-3 py-2 text-[13px] font-medium ${
                  stockStatus === 'zero'
                    ? 'bg-red-100 text-red-900 dark:bg-red-950/40 dark:text-red-200'
                    : 'bg-amber-100 text-amber-950 dark:bg-amber-950/40 dark:text-amber-200'
                }`}
              >
                {stockStatus === 'zero'
                  ? 'Este produto está sem estoque. Reposição necessária.'
                  : `Estoque na ou abaixo do mínimo (${fmtQty(part.min_stock_qty ?? 0, unit)}). Considere repor.`}
              </p>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <DetailRow label="Preço venda" value={fmtMoney(part.unit_price)} />
              <DetailRow label="Custo unitário" value={fmtMoney(part.unit_cost)} />
              <DetailRow
                label="Quantidade em estoque"
                value={
                  <span
                    className={
                      stockStatus === 'zero'
                        ? 'font-semibold text-red-700 dark:text-red-300'
                        : stockStatus === 'low'
                          ? 'font-semibold text-amber-800 dark:text-amber-300'
                          : undefined
                    }
                  >
                    {fmtQty(part.stock_qty, unit)}
                  </span>
                }
              />
              <DetailRow label="Quantidade mínima" value={fmtQty(part.min_stock_qty ?? 0, unit)} />
              <DetailRow
                label="Quantidade máxima"
                value={part.max_stock_qty != null ? fmtQty(part.max_stock_qty, unit) : '—'}
              />
              <DetailRow label="Prêmio" value={fmtMoney(part.premium_amount ?? 0)} />
              <DetailRow label="Comissão" value={`${Number(part.commission_pct ?? 0).toFixed(2)} %`} />
              <DetailRow
                label="Lucro padrão"
                value={`${Number(part.default_profit_pct ?? 0).toFixed(2)} %`}
              />
              <DetailRow label="NCM" value={displayText(part.ncm_code)} />
              <DetailRow label="Origem da peça" value={originLabel(part.fiscal_origin ?? '0')} />
              <DetailRow
                label="Km limite"
                value={part.km_limit != null ? String(part.km_limit) : '—'}
              />
              <DetailRow
                label="Validade (meses)"
                value={part.validity_months != null ? String(part.validity_months) : '—'}
              />
            </div>
          </div>

          {hasFiscal ? (
            <div className={cardCls}>
              <h3 className="mb-3 text-[13px] font-bold text-zinc-800 dark:text-zinc-200">Fiscal</h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {fe.cest ? <DetailRow label="CEST" value={fe.cest} /> : null}
                {fe.cfop ? <DetailRow label="CFOP" value={fe.cfop} /> : null}
                {fe.icms_cst ? <DetailRow label="CST ICMS" value={fe.icms_cst} /> : null}
                {fe.ipi_cst ? <DetailRow label="CST IPI" value={fe.ipi_cst} /> : null}
                {fe.pis_cst ? <DetailRow label="CST PIS" value={fe.pis_cst} /> : null}
                {fe.cofins_cst ? <DetailRow label="CST COFINS" value={fe.cofins_cst} /> : null}
              </div>
              {fe.tax_notes?.trim() ? (
                <p className="mt-3 whitespace-pre-wrap text-[14px] text-zinc-700 dark:text-zinc-300">
                  {fe.tax_notes}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className={cardCls}>
            <h3 className="mb-3 text-[13px] font-bold text-zinc-800 dark:text-zinc-200">Lista de compras</h3>
            {purchases.length === 0 ? (
              <p className="text-[14px] text-zinc-500 dark:text-zinc-400">Nenhuma compra planejada.</p>
            ) : (
              <ul className="divide-y divide-zinc-200/60 dark:divide-white/[0.06]">
                {purchases.map((row) => (
                  <li key={row.id} className="grid gap-2 py-3 sm:grid-cols-2 lg:grid-cols-4">
                    <DetailRow label="Fornecedor" value={displayText(row.supplier_name)} />
                    <DetailRow label="Quantidade" value={fmtQty(row.quantity, unit)} />
                    <DetailRow label="Custo un." value={fmtMoney(row.unit_cost)} />
                    <DetailRow
                      label="Previsão / status"
                      value={
                        <>
                          {row.expected_date ? (
                            <span className="tabular-nums">{row.expected_date}</span>
                          ) : (
                            '—'
                          )}
                          <span className="mx-1 text-zinc-400">·</span>
                          <span>{PURCHASE_STATUS[row.status] ?? row.status}</span>
                        </>
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      <div className="flex flex-col-reverse gap-3 border-t border-zinc-200/50 pt-5 dark:border-white/[0.06] sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-[15px] font-semibold text-red-700 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/60"
        >
          <Trash2 className="h-5 w-5" />
          Excluir
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-8 py-3 text-[15px] font-semibold text-white hover:bg-emerald-500"
        >
          <Pencil className="h-5 w-5" />
          Editar produto
        </button>
      </div>

      {previewImages ? (
        <Lightbox
          images={previewImages.urls}
          initialIndex={previewImages.currentIndex >= 0 ? previewImages.currentIndex : 0}
          onClose={() => setPreviewImages(null)}
        />
      ) : null}
    </div>
  );
}
