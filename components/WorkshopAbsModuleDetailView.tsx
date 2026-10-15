import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Hash,
  History,
  Loader2,
  Pencil,
  Tag,
  Trash2,
  ZoomIn,
} from 'lucide-react';
import {
  deleteWorkshopAbsModule,
  getWorkshopAbsModule,
  getWorkshopAbsModuleMovements,
  type WorkshopAbsModule,
  type WorkshopAbsModuleApplication,
  type WorkshopAbsModuleMovement,
  type WorkshopAbsModulePhoto,
} from '../services/apiService';
import {
  absModuleItemConditionLabel,
  absModuleItemStateLabel,
  absModuleKindLabel,
  absModuleStatusLabel,
  describeAbsModuleMovement,
  formatAbsApplicationYearRange,
  formatAbsModuleMoney,
  formatAbsModuleSequence,
  primaryCodeForScope,
} from '../utils/workshopAbsModules';
import { Lightbox } from './Lightbox';
import { NiimbotAbsModuleLabelPrintModal } from './NiimbotAbsModuleLabelPrintModal';
import { PartPhotoImg } from './ui/PartPhotoImg';
import { useBrowserBackLayer } from './ui/BackNavigationContext';

const labelCls =
  'text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400';
const valueCls = 'text-[14px] text-zinc-900 dark:text-zinc-100';
const cardCls =
  'rounded-xl border-0 bg-zinc-50/80 p-4 shadow-none dark:bg-white/[0.03]';

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

export type WorkshopAbsModuleDetailViewProps = {
  /** Public ID da unidade a carregar. */
  publicId: string;
  onBack: () => void;
  /** Abre o fluxo de edição (modal). */
  onEdit?: (module: WorkshopAbsModule) => void;
  /** Chamado após exclusão bem-sucedida. */
  onDeleted?: (publicId: string) => void;
};

export function WorkshopAbsModuleDetailView({
  publicId,
  onBack,
  onEdit,
  onDeleted,
}: WorkshopAbsModuleDetailViewProps) {
  const [module, setModule] = useState<WorkshopAbsModule | null>(null);
  const [movements, setMovements] = useState<WorkshopAbsModuleMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [labelPrintOpen, setLabelPrintOpen] = useState(false);
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
    const catalog = module?.catalog_model?.photos || [];
    return [...catalog].sort((a, b) => a.sort_order - b.sort_order);
  }, [module]);

  const photoUrls = useMemo(
    () => photos.map((p) => p.photo_url).filter((u) => !!String(u || '').trim()),
    [photos]
  );

  const applications = module?.catalog_model?.applications || [];
  const codes = module?.catalog_model?.codes || [];
  const catalog = module?.catalog_model;

  const codeEletronico = primaryCodeForScope(codes, 'eletronico') || null;
  const codeHidraulico = primaryCodeForScope(codes, 'hidraulico') || null;
  const codePrimary =
    primaryCodeForScope(codes, module?.module_kind === 'hidraulico' ? 'hidraulico' : 'eletronico') ||
    module?.original_code ||
    null;

  const siblingUnits = useMemo(() => {
    const units = catalog?.units || [];
    return [...units].sort(
      (a, b) => Number(a.sequence_number ?? 0) - Number(b.sequence_number ?? 0)
    );
  }, [catalog]);

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

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-gradient-to-b from-emerald-50/40 via-white to-zinc-50 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-950">
      <div className="shrink-0 border-b border-zinc-200/60 bg-white/80 px-4 py-3 backdrop-blur-md dark:border-white/[0.06] dark:bg-zinc-950/80 sm:px-6">
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
            <h2 className="truncate text-[17px] font-bold text-zinc-900 dark:text-white">
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

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-auto px-4 py-4 sm:px-6 sm:py-5 custom-scrollbar">
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
          <div className="mx-auto max-w-3xl space-y-5 pb-10">
            <div className="space-y-2">
              <p className={labelCls}>Fotos</p>
              {photos.length > 0 ? (
                <>
                  <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
                    Toque em uma foto para ampliar · pinça ou toque duplo para zoom
                  </p>
                  <div className="grid max-w-[min(100%,520px)] grid-cols-3 gap-3 sm:grid-cols-4">
                    {photos.map((photo, index) => {
                      const url = photo.photo_url?.trim();
                      const canPreview = !!url;
                      return (
                        <div
                          key={photo.id}
                          className="group relative aspect-square overflow-hidden rounded-xl border-0 bg-zinc-100 dark:bg-white/[0.03]"
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
                            <PartPhotoImg src={url} alt="" className="h-full w-full object-cover" />
                          )}
                          {index === 0 ? (
                            <span className="pointer-events-none absolute left-1 top-1 z-[1] rounded-md bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                              Capa
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
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
                    <span className="font-mono font-semibold tracking-wide">{module.public_id}</span>
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
                {module.original_code &&
                module.original_code !== codePrimary &&
                module.original_code !== codeEletronico &&
                module.original_code !== codeHidraulico ? (
                  <DetailRow label="Código original" value={module.original_code} />
                ) : null}
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
                <DetailRow
                  label="Condição legada"
                  value={displayText(module.condition)}
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
              <div className="grid gap-4 lg:grid-cols-2">
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
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <DetailRow label="Custo" value={formatAbsModuleMoney(module.unit_cost)} />
                <DetailRow label="Preço de venda" value={formatAbsModuleMoney(module.unit_price)} />
              </div>
            </div>

            {siblingUnits.length > 1 ? (
              <div className={cardCls}>
                <h3 className="mb-3 text-[13px] font-bold text-zinc-800 dark:text-zinc-200">
                  Unidades do mesmo modelo ({siblingUnits.length})
                </h3>
                <ul className="divide-y divide-zinc-200/60 dark:divide-white/[0.06]">
                  {siblingUnits.map((u) => {
                    const active = u.public_id === module.public_id;
                    return (
                      <li
                        key={u.id}
                        className={`flex flex-wrap items-center justify-between gap-2 py-2.5 text-[14px] ${
                          active ? 'font-semibold text-emerald-800 dark:text-emerald-300' : ''
                        }`}
                      >
                        <span>
                          <span className="mr-2 font-black tabular-nums">
                            {formatAbsModuleSequence(u.sequence_number)}
                          </span>
                          <span className="font-mono text-[12px] text-zinc-500">{u.public_id}</span>
                          {u.location ? (
                            <span className="ml-2 text-[12px] text-zinc-500">· {u.location}</span>
                          ) : null}
                        </span>
                        <span className="text-[12px] font-medium text-zinc-500">
                          {absModuleStatusLabel(u.status)}
                          {active ? ' · atual' : ''}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

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

            <div className="flex flex-col gap-3 border-t border-zinc-200/50 pt-5 dark:border-white/[0.06]">
              <button
                type="button"
                onClick={() => setLabelPrintOpen(true)}
                disabled={loading || deleting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-0 bg-amber-50 px-5 py-3 text-[15px] font-semibold text-amber-950 shadow-none hover:bg-amber-100 disabled:opacity-50 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-950/60"
              >
                <Tag className="h-5 w-5" />
                Imprimir etiqueta
              </button>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={deleting}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border-0 bg-red-50 px-5 py-3 text-[15px] font-semibold text-red-700 shadow-none hover:bg-red-100 disabled:opacity-50 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/60"
                >
                  {deleting ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Trash2 className="h-5 w-5" />
                  )}
                  Excluir
                </button>
                {onEdit ? (
                  <button
                    type="button"
                    onClick={() => onEdit(module)}
                    disabled={deleting}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-8 py-3 text-[15px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    <Pencil className="h-5 w-5" />
                    Editar cadastro
                  </button>
                ) : null}
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
        open={labelPrintOpen}
        modules={module ? [module] : null}
        onClose={() => setLabelPrintOpen(false)}
      />
    </div>
  );
}
