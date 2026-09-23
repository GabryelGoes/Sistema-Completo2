import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  Check,
  ChevronRight,
  Loader2,
  Tag,
  Truck,
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
  getServiceOrderStages,
  getStageConfig,
  getStageStyle,
  isExternalRepairStatus,
  type ServiceOrderStatus,
} from '../constants/serviceOrderStages';
import { LabOsLabelPrintModal } from './LabOsLabelPrintModal';
import type { LabOsLabelInput } from '../utils/labOsLabelRender';
import { ModalPortal } from './ui/ModalPortal';
import {
  iosLabel,
  iosModalClose,
  iosModalInsetCard,
  iosModalOverlay,
  iosModalShell,
  iosVehicleModalShell,
} from './ui/iosModalStyles';
import { useBrowserBackLayer } from './ui/BackNavigationContext';
import {
  modalBackdropAnimClass,
  modalSheetAnimClass,
  useModalExitPresence,
} from '../hooks/useModalExitAnimation';

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
  const [stageModalOpen, setStageModalOpen] = useState(false);
  const [savingStage, setSavingStage] = useState(false);
  const [labelPrint, setLabelPrint] = useState<LabOsLabelInput | null>(null);
  const currentStageRef = useRef<HTMLElement | null>(null);

  const stageModalPresence = useModalExitPresence(stageModalOpen);
  const stageModalExiting = stageModalPresence.exiting;

  useBrowserBackLayer(open && !labelPrint && !stageModalOpen, onClose);
  useBrowserBackLayer(stageModalOpen, () => setStageModalOpen(false));

  const stages = useMemo(() => getServiceOrderStages('module'), []);

  useEffect(() => {
    if (!serviceOrderId) {
      setDetail(null);
      setError(null);
      setLoading(false);
      setStageModalOpen(false);
      setLabelPrint(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setStageModalOpen(false);
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

  useEffect(() => {
    if (!stageModalOpen) return;
    const scrollCurrent = () => currentStageRef.current?.scrollIntoView({ block: 'center', behavior: 'auto' });
    const raf = window.requestAnimationFrame(() => {
      scrollCurrent();
      window.requestAnimationFrame(scrollCurrent);
    });
    const t = window.setTimeout(scrollCurrent, 80);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [stageModalOpen, detail?.status]);

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
        setStageModalOpen(false);
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
            className={`${iosModalShell} relative flex max-h-[min(92dvh,680px)] w-full max-w-lg flex-col overflow-hidden rounded-b-none sm:rounded-[2rem]`}
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

            <div className="relative shrink-0 border-b border-black/[0.06] px-5 pb-4 pt-7 pr-16 dark:border-white/[0.08] sm:px-6">
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

            <div className="relative min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4 custom-scrollbar sm:px-6">
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

                  <button
                    type="button"
                    onClick={() => setStageModalOpen(true)}
                    disabled={savingStage}
                    title="Alterar etapa"
                    aria-label={`Alterar etapa: ${stageLabel}`}
                    className={`group flex w-full items-center justify-between gap-3 rounded-2xl border-2 px-3.5 py-3.5 text-left transition-all hover:brightness-105 active:scale-[0.99] disabled:opacity-60 ${
                      isExternalRepairStatus(statusId) ? '!text-white' : '!text-black dark:!text-black'
                    } ${stageStyle}`}
                  >
                    <span className="min-w-0 truncate text-[15px] font-bold uppercase leading-snug tracking-wide">
                      {stageLabel}
                    </span>
                    {savingStage ? (
                      <Loader2 className="h-5 w-5 shrink-0 animate-spin opacity-90" />
                    ) : (
                      <ChevronRight className="h-5 w-5 shrink-0 opacity-90 transition-transform group-hover:translate-x-0.5" />
                    )}
                  </button>

                  {error ? (
                    <p className="text-center text-[12px] font-medium text-red-600 dark:text-red-400">
                      {error}
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>

            <div className="relative shrink-0 border-t border-black/[0.06] bg-white/90 px-5 py-4 backdrop-blur-sm dark:border-white/[0.08] dark:bg-zinc-950/80 sm:px-6">
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

      {stageModalPresence.mounted && detail ? (
        <ModalPortal>
          <div
            className={`${iosModalOverlay} z-[255] p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6 ${modalBackdropAnimClass(stageModalExiting)}`}
            onClick={() => !savingStage && setStageModalOpen(false)}
            role="presentation"
          >
            <div
              className={`relative flex w-full min-h-0 max-h-[min(90vh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1rem))] max-w-md flex-col overflow-hidden ${iosVehicleModalShell} ${modalSheetAnimClass(stageModalExiting)}`}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="lab-os-scan-stage-title"
            >
              <button
                type="button"
                onClick={() => setStageModalOpen(false)}
                className={iosModalClose}
                aria-label="Fechar"
                disabled={savingStage}
              >
                <X className="h-5 w-5" />
              </button>

              <div className="shrink-0 border-b border-zinc-200/60 px-6 pb-5 pt-7 dark:border-white/[0.07] sm:px-8 sm:pt-8">
                <div className="min-w-0 flex-1 pr-10">
                  <h2
                    id="lab-os-scan-stage-title"
                    className="text-[22px] font-semibold leading-tight tracking-tight text-zinc-900 dark:text-white sm:text-[24px]"
                  >
                    Alterar etapa
                  </h2>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px] text-zinc-500 dark:text-zinc-400">
                    <span className="font-vehicle min-w-0 truncate font-medium text-zinc-700 dark:text-zinc-200">
                      {vehicleName}
                    </span>
                    <span className="text-zinc-400 dark:text-zinc-500">—</span>
                    <span>Toque na etapa de destino.</span>
                  </p>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#F2F2F7] px-6 py-5 dark:bg-black/25 custom-scrollbar sm:px-8">
                <p className={iosLabel}>Etapas</p>
                {savingStage ? (
                  <p className="mb-3 flex items-center gap-2 text-[13px] font-medium text-[#007AFF] dark:text-[#64B5FF]">
                    <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} />
                    Atualizando etapa…
                  </p>
                ) : null}

                {isExternalRepairStatus(statusId) ? (
                  <div
                    ref={(el) => {
                      currentStageRef.current = el;
                    }}
                    className={`mb-3 flex min-h-[54px] items-center justify-between gap-3 rounded-[16px] border-0 px-4 py-3 shadow-none sm:min-h-[56px] sm:px-5 sm:py-3.5 ${EXTERNAL_REPAIR_STAGE.style}`}
                  >
                    <span className="text-[16px] font-semibold uppercase leading-snug tracking-wide !text-white sm:text-[17px]">
                      {EXTERNAL_REPAIR_STAGE.name}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/90">
                      <Check className="h-5 w-5 shrink-0" strokeWidth={2.5} />
                      Atual
                    </span>
                  </div>
                ) : null}

                <div className="space-y-2.5">
                  {stages.map((stage) => {
                    const isCurrent =
                      !isExternalRepairStatus(statusId) && stage.id === statusId;
                    const style = getStageStyle(stage.id, 'module') || stage.style;
                    return (
                      <button
                        key={stage.id}
                        type="button"
                        ref={
                          isCurrent
                            ? (el) => {
                                currentStageRef.current = el;
                              }
                            : undefined
                        }
                        onClick={() => void handleChangeStage(stage.id)}
                        disabled={isCurrent || savingStage}
                        className={`
                          group flex min-h-[54px] w-full items-center justify-between gap-3 rounded-[16px] border-0 px-4 py-3.5 text-left shadow-none transition-all duration-200 sm:min-h-[56px] sm:px-5
                          ${
                            isCurrent
                              ? `${iosModalInsetCard} cursor-not-allowed opacity-75`
                              : `${style} hover:brightness-110 active:scale-[0.99] disabled:opacity-55`
                          }
                        `}
                      >
                        <span className="text-[16px] font-semibold uppercase leading-snug tracking-wide !text-black dark:!text-black sm:text-[17px]">
                          {stage.name}
                        </span>
                        {isCurrent ? (
                          <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                            <Check
                              className="h-5 w-5 shrink-0 text-[#007AFF] dark:text-[#64B5FF]"
                              strokeWidth={2.5}
                            />
                            Atual
                          </span>
                        ) : (
                          <ChevronRight
                            className={`h-5 w-5 shrink-0 opacity-80 transition-transform group-hover:translate-x-0.5 ${
                              savingStage ? 'opacity-30' : ''
                            }`}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>

                {!isExternalRepairStatus(statusId) ? (
                  <div className="mt-4 border-t border-zinc-200/70 pt-4 dark:border-white/[0.08]">
                    <p className={iosLabel}>Conserto em terceiros</p>
                    <button
                      type="button"
                      onClick={() => void handleChangeStage(EXTERNAL_REPAIR_STAGE.id)}
                      disabled={savingStage}
                      className={`group flex min-h-[54px] w-full items-center justify-between gap-3 rounded-[16px] border-0 px-4 py-3.5 text-left transition-[filter,transform] duration-200 sm:min-h-[56px] sm:px-5 ${EXTERNAL_REPAIR_STAGE.style} shadow-none hover:brightness-110 active:scale-[0.99] disabled:opacity-55`}
                    >
                      <span className="text-[16px] font-semibold uppercase leading-snug tracking-wide !text-white sm:text-[17px]">
                        {EXTERNAL_REPAIR_STAGE.name}
                      </span>
                      <Truck className="h-5 w-5 shrink-0 text-white/90" strokeWidth={2.2} />
                    </button>
                    <p className="mt-2 text-[12px] leading-snug text-zinc-500 dark:text-zinc-400">
                      Envia a peça para a aba Conserto externo.
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="shrink-0 border-t border-zinc-200/60 bg-white px-4 py-3 dark:border-white/[0.07] dark:bg-zinc-950/40 sm:px-6">
                <button
                  type="button"
                  onClick={() => setStageModalOpen(false)}
                  disabled={savingStage}
                  className="w-full rounded-xl py-3.5 text-[15px] font-semibold text-zinc-500 transition-colors hover:bg-black/[0.04] hover:text-zinc-900 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}

      <LabOsLabelPrintModal
        open={!!labelPrint}
        label={labelPrint}
        onClose={() => setLabelPrint(null)}
      />
    </>
  );
}
