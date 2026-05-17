import React, { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import { Eye, FileText, Paperclip, RefreshCw, Wallet, X } from 'lucide-react';
import { ModalPortal } from './ui/ModalPortal';
import { StorageThumbImg } from './ui/StorageThumbImg';
import { markdownComponentsApp } from './ui/markdownUi';
import { uiReadBody, uiSectionTitleRow } from './ui/appTypography';
import { BudgetHubViewerModal } from './BudgetHubViewerModal';
import {
  budgetChronologicalNumber,
  budgetLastActivityMs,
  getServiceOrderBudgets,
  getServiceOrderById,
  getServiceOrderPhotos,
  type SavedBudgetFromApi,
  type ServiceOrderDetail,
  type ServiceOrderListItem,
} from '../services/apiService';
import { getStageConfig, getStageStyle, CANCELLED_STATUS } from '../constants/serviceOrderStages';
import { formatPlateDisplay } from '../utils/workshopReports';

const PHOTOS_BATCH = 12;

function attachmentMimeType(name: string): string {
  const n = (name || '').toLowerCase();
  if (n.endsWith('.pdf')) return 'application/pdf';
  if (/\.(jpg|jpeg|png|gif|webp|heic|heif|bmp)$/.test(n)) return 'image/*';
  return 'application/octet-stream';
}

type ReportServiceOrderDetailModalProps = {
  order: ServiceOrderListItem | null;
  blurPlates?: boolean;
  onClose: () => void;
};

export const ReportServiceOrderDetailModal: React.FC<ReportServiceOrderDetailModalProps> = ({
  order,
  blurPlates = false,
  onClose,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ServiceOrderDetail | null>(null);
  const [photos, setPhotos] = useState<{ id: string; name: string; url: string; mimeType: string }[]>([]);
  const [budgets, setBudgets] = useState<SavedBudgetFromApi[]>([]);
  const [photosVisible, setPhotosVisible] = useState(PHOTOS_BATCH);
  const [previewPdf, setPreviewPdf] = useState<string | null>(null);
  const [budgetViewerId, setBudgetViewerId] = useState<string | null>(null);

  const open = order != null;

  useEffect(() => {
    if (!order?.id) {
      setDetail(null);
      setPhotos([]);
      setBudgets([]);
      setError(null);
      setBudgetViewerId(null);
      setPreviewPdf(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    setPhotos([]);
    setBudgets([]);
    setPhotosVisible(PHOTOS_BATCH);
    setBudgetViewerId(null);

    void (async () => {
      try {
        const [d, ph, bud] = await Promise.all([
          getServiceOrderById(order.id),
          getServiceOrderPhotos(order.id),
          getServiceOrderBudgets(order.id),
        ]);
        if (cancelled) return;
        setDetail(d);
        setPhotos(
          ph.map((p, i) => ({
            id: p.path || String(i),
            name: p.name,
            url: p.url,
            mimeType: attachmentMimeType(p.name),
          }))
        );
        setBudgets(bud);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Não foi possível carregar os detalhes da OS.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [order?.id]);

  const isModule = detail?.order_type === 'module';
  const statusName = useMemo(() => {
    const st = detail?.status ?? order?.status;
    if (!st) return '—';
    return getStageConfig(st)?.name ?? (st === CANCELLED_STATUS ? 'Arquivado' : st);
  }, [detail?.status, order?.status]);
  const statusCls = getStageStyle(detail?.status ?? order?.status ?? '');

  const sortedBudgets = useMemo(
    () => [...budgets].sort((a, b) => budgetLastActivityMs(b) - budgetLastActivityMs(a)),
    [budgets]
  );

  const photosToShow = photos.slice(0, photosVisible);
  const photosHidden = photos.length - photosToShow.length;

  if (!open) return null;

  const titleVehicle =
    detail?.vehicle_model?.trim() ||
    order?.vehicle_model?.trim() ||
    detail?.module_identification?.trim() ||
    order?.module_identification ||
    'Ordem de serviço';

  return (
    <>
      <ModalPortal>
        <div
          className="fixed inset-0 z-[280] flex items-center justify-center bg-black/45 p-3 backdrop-blur-sm sm:p-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-os-detail-title"
        >
          <div
            className="flex max-h-[min(92vh,900px)] w-full max-w-4xl flex-col overflow-hidden rounded-[22px] border border-zinc-200/80 bg-white/95 shadow-2xl backdrop-blur-xl dark:border-white/[0.1] dark:bg-zinc-900/95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-200/70 px-5 py-4 dark:border-white/[0.08]">
              <div className="min-w-0 space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-600 dark:text-sky-400">
                  Detalhe da OS
                  {(detail?.os_number ?? order?.os_number) != null && (
                    <span className="ml-1.5 text-zinc-600 dark:text-zinc-300">
                      #{detail?.os_number ?? order?.os_number}
                    </span>
                  )}
                </p>
                <h2
                  id="report-os-detail-title"
                  className="truncate text-lg font-bold text-zinc-900 dark:text-white sm:text-xl"
                >
                  {titleVehicle}
                </h2>
                <div className="flex flex-wrap items-center gap-2 text-[13px] text-zinc-600 dark:text-zinc-400">
                  <span>{detail?.customers?.name ?? order?.customer_name ?? '—'}</span>
                  {!isModule && (
                    <span className={`font-mono ${blurPlates ? 'blur-plate' : ''}`}>
                      {formatPlateDisplay(detail?.plate ?? order?.plate ?? '', blurPlates)}
                    </span>
                  )}
                  {isModule && (
                    <span className="font-mono">
                      {(detail?.module_identification ?? order?.module_identification ?? '—').trim()}
                    </span>
                  )}
                  <span className={`inline-flex rounded-lg border px-2 py-0.5 text-[11px] font-semibold ${statusCls}`}>
                    {statusName}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-xl p-2 text-zinc-500 transition hover:bg-zinc-100 dark:hover:bg-white/[0.08]"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-none px-5 py-5 custom-scrollbar">
              {loading && !detail ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-zinc-500">
                  <RefreshCw className="h-9 w-9 animate-spin text-sky-500" />
                  <p className="text-[14px] font-medium">Carregando queixa, anexos e orçamentos⬦</p>
                </div>
              ) : error ? (
                <p className="py-12 text-center text-[14px] text-red-600 dark:text-red-400">{error}</p>
              ) : detail ? (
                <div className="space-y-8">
                  <section>
                    <h3 className={uiSectionTitleRow}>
                      <FileText className="h-3.5 w-3.5" />
                      Queixa do cliente
                    </h3>
                    <div
                      className={`rounded-2xl border border-zinc-200/80 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950/50 ${uiReadBody}`}
                    >
                      <ReactMarkdown remarkPlugins={[remarkBreaks]} components={markdownComponentsApp}>
                        {detail.issue_description?.trim() || 'Nenhuma queixa registrada.'}
                      </ReactMarkdown>
                    </div>
                  </section>

                  <section>
                    <h3 className={`${uiSectionTitleRow} text-sky-700 dark:text-sky-300`}>
                      <Paperclip className="h-3.5 w-3.5" />
                      Fotos e anexos
                      {photos.length > 0 ? (
                        <span className="ml-2 rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-bold text-sky-800 dark:text-sky-200">
                          {photos.length}
                        </span>
                      ) : null}
                    </h3>
                    {photos.length === 0 ? (
                      <p className="text-[14px] italic text-zinc-500">Nenhum anexo nesta OS.</p>
                    ) : (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {photosToShow.map((att) => {
                            const isImage =
                              att.mimeType.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(att.url);
                            const isPdf =
                              att.mimeType === 'application/pdf' || att.url.toLowerCase().endsWith('.pdf');
                            const cardClass =
                              'block w-full overflow-hidden rounded-xl border border-zinc-200/80 bg-white transition hover:border-sky-400/50 dark:border-white/[0.08] dark:bg-zinc-950/40';
                            if (isPdf) {
                              return (
                                <button
                                  key={att.id}
                                  type="button"
                                  onClick={() => setPreviewPdf(att.url)}
                                  className={cardClass}
                                >
                                  <div className="flex flex-col items-center gap-2 p-4 text-center">
                                    <FileText className="h-8 w-8 text-red-500" />
                                    <span className="line-clamp-2 break-all text-xs font-medium text-zinc-700 dark:text-zinc-200">
                                      {att.name}
                                    </span>
                                    <span className="text-[10px] font-bold text-red-500">PDF · toque para ver</span>
                                  </div>
                                </button>
                              );
                            }
                            return (
                              <a
                                key={att.id}
                                href={att.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={cardClass}
                              >
                                {isImage ? (
                                  <div className="relative aspect-square bg-zinc-100 dark:bg-black">
                                    <StorageThumbImg
                                      src={att.url}
                                      alt={att.name}
                                      className="h-full w-full object-cover"
                                      sizes="(max-width: 640px) 33vw, 140px"
                                      thumbMaxWidth={180}
                                      thumbMaxHeight={180}
                                      thumbQuality={50}
                                    />
                                    <div className="absolute inset-x-0 bottom-0 truncate bg-black/60 p-1.5 text-[10px] text-white">
                                      {att.name}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex flex-col items-center gap-2 p-4 text-center">
                                    <FileText className="h-8 w-8 text-zinc-400" />
                                    <span className="line-clamp-2 break-all text-xs font-medium">{att.name}</span>
                                  </div>
                                )}
                              </a>
                            );
                          })}
                        </div>
                        {photosHidden > 0 ? (
                          <button
                            type="button"
                            className="w-full rounded-xl border border-zinc-200/80 py-2 text-[13px] font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-white/[0.1] dark:text-zinc-300 dark:hover:bg-white/[0.06]"
                            onClick={() => setPhotosVisible((n) => n + PHOTOS_BATCH)}
                          >
                            Mostrar mais ({photosHidden} {photosHidden === 1 ? 'anexo' : 'anexos'})
                          </button>
                        ) : null}
                      </div>
                    )}
                  </section>

                  <section>
                    <h3 className={`${uiSectionTitleRow} text-violet-700 dark:text-violet-300`}>
                      <Wallet className="h-3.5 w-3.5" />
                      Orçamentos
                      {budgets.length > 0 ? (
                        <span className="ml-2 rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] font-bold text-violet-800 dark:text-violet-200">
                          {budgets.length}
                        </span>
                      ) : null}
                    </h3>
                    {sortedBudgets.length === 0 ? (
                      <p className="text-[14px] italic text-zinc-500">Nenhum orçamento nesta OS.</p>
                    ) : (
                      <ul className="space-y-2">
                        {sortedBudgets.map((b) => (
                          <li
                            key={b.id}
                            className="rounded-2xl border border-zinc-200/80 bg-white/80 p-4 dark:border-white/[0.08] dark:bg-zinc-950/35"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-[14px] font-semibold text-zinc-900 dark:text-white">
                                Orçamento {budgetChronologicalNumber(budgets, b.id)}
                              </p>
                              <p className="text-[12px] text-zinc-500">
                                {new Date(budgetLastActivityMs(b)).toLocaleString('pt-BR')}
                              </p>
                            </div>
                            {b.diagnosis?.trim() ? (
                              <p className="mt-1 line-clamp-2 text-[13px] text-zinc-600 dark:text-zinc-400">
                                <span className="font-medium">Diagnóstico:</span> {b.diagnosis}
                              </p>
                            ) : null}
                            <p className="mt-1 text-[12px] text-zinc-500">
                              {b.services.length} serviço(s) · {b.parts.length} peça(s)
                            </p>
                            <button
                              type="button"
                              onClick={() => setBudgetViewerId(b.id)}
                              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-3 py-2.5 text-[13px] font-semibold text-white transition hover:bg-sky-700 sm:w-auto"
                            >
                              <Eye className="h-4 w-4" />
                              Abrir orçamento completo
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </ModalPortal>

      {previewPdf ? (
        <ModalPortal>
          <div className="fixed inset-0 z-[290] flex flex-col bg-black/80 p-4">
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={() => setPreviewPdf(null)}
                className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white"
              >
                Fechar PDF
              </button>
            </div>
            <iframe title="PDF" src={previewPdf} className="min-h-0 flex-1 rounded-xl bg-white" />
          </div>
        </ModalPortal>
      ) : null}

      {order && budgetViewerId ? (
        <BudgetHubViewerModal
          serviceOrderId={order.id}
          budgetId={budgetViewerId}
          onClose={() => setBudgetViewerId(null)}
        />
      ) : null}
    </>
  );
};
