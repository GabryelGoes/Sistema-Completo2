import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Loader2,
  Tag,
  User,
  X,
} from 'lucide-react';
import {
  getServiceOrderById,
  updateServiceOrderStatus,
  type ServiceOrderDetail,
  type ServiceOrderUpdateActor,
} from '../services/apiService';
import {
  EXTERNAL_REPAIR_STAGE,
  EXTERNAL_REPAIR_STATUS,
  getServiceOrderStages,
  getStageConfig,
  getStageStyle,
  isExternalRepairStatus,
  type ServiceOrderStatus,
} from '../constants/serviceOrderStages';
import { LabOsLabelPrintModal } from './LabOsLabelPrintModal';
import type { LabOsLabelInput } from '../utils/labOsLabelRender';
import { ModalPortal } from './ui/ModalPortal';
import { iosModalClose, iosModalShell } from './ui/iosModalStyles';
import { useBrowserBackLayer } from './ui/BackNavigationContext';

export type LabOsScanQuickModalProps = {
  serviceOrderId: string | null;
  /** Muda a cada scan para forçar reload mesmo com o mesmo id. */
  scanToken?: number;
  onClose: () => void;
  onOpenFullOs: (serviceOrderId: string) => void;
  actorOptions?: ServiceOrderUpdateActor;
};

function stripLegacyComplaint(text: string | null | undefined): string {
  return String(text ?? '')
    .replace(/^\s*\[(?:categoria|category)[^\]]*\]\s*/i, '')
    .trim();
}

function formatEntryDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export function LabOsScanQuickModal({
  serviceOrderId,
  scanToken = 0,
  onClose,
  onOpenFullOs,
  actorOptions,
}: LabOsScanQuickModalProps) {
  const open = Boolean(serviceOrderId);
  const [detail, setDetail] = useState<ServiceOrderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stagePickerOpen, setStagePickerOpen] = useState(false);
  const [savingStage, setSavingStage] = useState(false);
  const [labelPrint, setLabelPrint] = useState<LabOsLabelInput | null>(null);

  useBrowserBackLayer(open && !labelPrint, onClose);

  const stages = useMemo(() => {
    const board = getServiceOrderStages('module');
    if (detail && isExternalRepairStatus(detail.status)) {
      return [EXTERNAL_REPAIR_STAGE, ...board];
    }
    return board;
  }, [detail]);

  useEffect(() => {
    if (!serviceOrderId) {
      setDetail(null);
      setError(null);
      setLoading(false);
      setStagePickerOpen(false);
      setLabelPrint(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setStagePickerOpen(false);
    setDetail(null);
    void getServiceOrderById(serviceOrderId)
      .then((order) => {
        if (cancelled) return;
        if (order.order_type && order.order_type !== 'module') {
          setError('Este QR não corresponde a uma peça do laboratório.');
          setDetail(null);
          return;
        }
        setDetail(order);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setDetail(null);
        setError(err instanceof Error ? err.message : 'Não foi possível carregar a OS.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [serviceOrderId, scanToken]);

  const customerName = (detail?.customers?.name ?? '').trim() || 'Cliente';
  const vehicleName = (detail?.vehicle_model ?? '').trim() || '—';
  const moduleRef = (detail?.module_identification ?? '').trim();
  const complaint = stripLegacyComplaint(detail?.issue_description) || 'Sem queixa registrada.';
  const statusId = (detail?.status ?? '') as ServiceOrderStatus;
  const stageCfg =
    getStageConfig(statusId, 'module') ??
    (isExternalRepairStatus(statusId) ? EXTERNAL_REPAIR_STAGE : undefined);
  const stageStyle = getStageStyle(statusId, 'module') || stageCfg?.style || 'bg-zinc-500 text-white';
  const stageLabel = stageCfg?.name ?? (statusId || 'Etapa');

  const handleChangeStage = useCallback(
    async (next: ServiceOrderStatus) => {
      if (!detail || !serviceOrderId || next === detail.status || savingStage) return;
      setSavingStage(true);
      setError(null);
      try {
        await updateServiceOrderStatus(serviceOrderId, next, actorOptions);
        setDetail((prev) => (prev ? { ...prev, status: next } : prev));
        setStagePickerOpen(false);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Falha ao alterar a etapa.');
      } finally {
        setSavingStage(false);
      }
    },
    [actorOptions, detail, savingStage, serviceOrderId]
  );

  const handlePrintLabel = useCallback(() => {
    if (!detail || !serviceOrderId) return;
    setLabelPrint({
      serviceOrderId,
      customerName,
      vehicleName,
      complaint: stripLegacyComplaint(detail.issue_description) || '—',
      osNumber: detail.os_number ?? null,
    });
  }, [customerName, detail, serviceOrderId, vehicleName]);

  const handleOpenFull = useCallback(() => {
    if (!serviceOrderId) return;
    const id = serviceOrderId;
    onClose();
    onOpenFullOs(id);
  }, [onClose, onOpenFullOs, serviceOrderId]);

  if (!open) return null;

  return (
    <>
      <ModalPortal>
        <div
          className="fixed inset-0 z-[245] flex items-end justify-center bg-black/50 p-0 backdrop-blur-[18px] sm:items-center sm:p-4"
          onClick={onClose}
          role="presentation"
        >
          <div
            className={`${iosModalShell} relative flex max-h-[min(92dvh,640px)] w-full max-w-md flex-col overflow-hidden rounded-b-none sm:rounded-[2rem]`}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="lab-os-scan-quick-title"
          >
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_100%_-10%,rgba(0,122,255,0.12),transparent_55%),radial-gradient(ellipse_90%_70%_at_-10%_110%,rgba(245,208,11,0.1),transparent_50%)] dark:bg-[radial-gradient(ellipse_120%_80%_at_100%_-10%,rgba(0,122,255,0.16),transparent_55%),radial-gradient(ellipse_90%_70%_at_-10%_110%,rgba(245,208,11,0.12),transparent_52%)]"
              aria-hidden
            />

            <button
              type="button"
              onClick={onClose}
              className={`${iosModalClose} z-20`}
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="relative shrink-0 border-b border-black/[0.06] px-5 pb-4 pt-7 pr-16 dark:border-white/[0.08]">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[0.95rem] bg-[#007AFF]/10 ring-1 ring-[#007AFF]/15 dark:bg-[#007AFF]/18 dark:ring-[#007AFF]/25">
                  <img
                    src="/icons/laboratorio-ios.png"
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#007AFF] dark:text-[#7ab8ff]">
                    Peça do laboratório
                  </p>
                  <h2
                    id="lab-os-scan-quick-title"
                    className="mt-0.5 truncate font-display text-[22px] font-semibold tracking-tight text-zinc-900 dark:text-white"
                  >
                    {loading ? 'Carregando…' : vehicleName}
                  </h2>
                  {detail?.os_number != null ? (
                    <p className="mt-0.5 text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
                      OS #{detail.os_number}
                      {moduleRef ? ` · ${moduleRef}` : ''}
                    </p>
                  ) : moduleRef ? (
                    <p className="mt-0.5 text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
                      {moduleRef}
                    </p>
                  ) : null}
                </div>
                {!loading && detail ? (
                  <button
                    type="button"
                    onClick={handlePrintLabel}
                    className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-600 text-white shadow-sm shadow-emerald-500/20 transition-[filter] hover:brightness-110"
                    title="Imprimir etiqueta"
                    aria-label="Imprimir etiqueta"
                  >
                    <Tag className="h-4 w-4" strokeWidth={2.25} />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="relative min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4 custom-scrollbar">
              {loading ? (
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-zinc-500">
                  <Loader2 className="h-6 w-6 animate-spin text-[#007AFF]" />
                  <p className="text-[13px]">Buscando dados da OS…</p>
                </div>
              ) : error && !detail ? (
                <div className="rounded-2xl bg-red-50 px-4 py-5 text-center dark:bg-red-950/40">
                  <p className="text-[14px] font-semibold text-red-700 dark:text-red-300">{error}</p>
                </div>
              ) : detail ? (
                <>
                  <div className="grid grid-cols-1 gap-2.5">
                    <div className="rounded-2xl bg-zinc-100/90 px-3.5 py-3 dark:bg-white/[0.05]">
                      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500 dark:text-zinc-400">
                        <User className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                        Cliente
                      </div>
                      <p className="mt-1 text-[15px] font-semibold leading-snug text-zinc-900 dark:text-white">
                        {customerName}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-zinc-100/90 px-3.5 py-3 dark:bg-white/[0.05]">
                      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500 dark:text-zinc-400">
                        <CalendarDays className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                        Data de entrada
                      </div>
                      <p className="mt-1 text-[15px] font-semibold leading-snug text-zinc-900 dark:text-white">
                        {formatEntryDate(detail.created_at)}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-zinc-100/90 px-3.5 py-3 dark:bg-white/[0.05]">
                      <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500 dark:text-zinc-400">
                        Queixa do cliente
                      </p>
                      <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-relaxed text-zinc-800 dark:text-zinc-200">
                        {complaint}
                      </p>
                    </div>
                  </div>

                  <div className="pt-0.5">
                    <button
                      type="button"
                      onClick={() => setStagePickerOpen((v) => !v)}
                      disabled={savingStage}
                      className={`flex w-full items-center justify-between gap-3 rounded-2xl border-2 px-3.5 py-3 text-left transition-all hover:brightness-105 active:scale-[0.99] disabled:opacity-60 ${
                        isExternalRepairStatus(statusId) ? '!text-white' : '!text-black dark:!text-black'
                      } ${stageStyle}`}
                    >
                      <span className="min-w-0">
                        <span className="block text-[10px] font-bold uppercase tracking-[0.12em] opacity-80">
                          Etapa atual
                        </span>
                        <span className="mt-0.5 block truncate text-[15px] font-bold uppercase leading-snug">
                          {stageLabel}
                        </span>
                      </span>
                      {savingStage ? (
                        <Loader2 className="h-5 w-5 shrink-0 animate-spin opacity-90" />
                      ) : (
                        <ChevronDown
                          className={`h-5 w-5 shrink-0 opacity-90 transition-transform ${
                            stagePickerOpen ? 'rotate-180' : ''
                          }`}
                        />
                      )}
                    </button>

                    {stagePickerOpen ? (
                      <div className="mt-2 max-h-[min(40vh,280px)] space-y-1.5 overflow-y-auto rounded-2xl border border-zinc-200/80 bg-white p-2 dark:border-white/[0.1] dark:bg-zinc-950/80 custom-scrollbar">
                        <p className="px-2 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500 dark:text-zinc-400">
                          Alterar etapa
                        </p>
                        {stages.map((stage) => {
                          const active = stage.id === statusId;
                          return (
                            <button
                              key={stage.id}
                              type="button"
                              disabled={savingStage || active}
                              onClick={() => void handleChangeStage(stage.id)}
                              className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold transition-colors ${
                                active
                                  ? `${stage.style} opacity-95`
                                  : 'bg-zinc-50 text-zinc-800 hover:bg-zinc-100 dark:bg-white/[0.04] dark:text-zinc-100 dark:hover:bg-white/[0.08]'
                              } disabled:cursor-default`}
                            >
                              <span className="truncate">{stage.name}</span>
                              {active ? (
                                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide opacity-80">
                                  Atual
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>

                  {error ? (
                    <p className="text-center text-[12px] font-medium text-red-600 dark:text-red-400">
                      {error}
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>

            <div className="relative shrink-0 border-t border-black/[0.06] bg-white/90 px-5 py-4 backdrop-blur-sm dark:border-white/[0.08] dark:bg-zinc-950/80">
              <button
                type="button"
                onClick={handleOpenFull}
                disabled={!detail || loading}
                className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-[#007AFF] px-4 py-3.5 text-[15px] font-bold text-white shadow-lg shadow-blue-500/25 transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
              >
                Abrir OS
                <ChevronRight
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                  strokeWidth={2.5}
                  aria-hidden
                />
              </button>
            </div>
          </div>
        </div>
      </ModalPortal>

      <LabOsLabelPrintModal
        open={!!labelPrint}
        label={labelPrint}
        onClose={() => setLabelPrint(null)}
      />
    </>
  );
}
