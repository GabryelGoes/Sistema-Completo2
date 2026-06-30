import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, User, Wrench, X } from 'lucide-react';
import { ModalPortal } from '../ui/ModalPortal';
import { IosAccentIconSquircle } from '../ui/IosAccentIconSquircle';
import {
  iosAccentPrimaryButton,
  iosLabel,
  iosModalClose,
  iosModalInsetCard,
  iosModalShell,
  iosModalOverlay,
} from '../ui/iosModalStyles';
import {
  getServiceOrderServiceTechnicians,
  saveServiceOrderServiceTechnicians,
  type ServiceTechnicianClosingLine,
  type SystemUserTechnician,
} from '../../services/apiService';
import { validateServiceTechnicianLines } from '../../utils/serviceOrderServiceTechnicians';

export type ServiceTechnicianClosingModalProps = {
  open: boolean;
  serviceOrderId: string;
  vehicleLabel: string;
  technicians: SystemUserTechnician[];
  recordedByName: string;
  onClose: () => void;
  onConfirmed: () => void | Promise<void>;
};

type DraftLine = ServiceTechnicianClosingLine & { key: string };

function newDraftLine(partial?: Partial<ServiceTechnicianClosingLine>): DraftLine {
  return {
    key: `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    description: partial?.description ?? '',
    technicianId: partial?.technicianId ?? '',
    budgetId: partial?.budgetId ?? null,
  };
}

export const ServiceTechnicianClosingModal: React.FC<ServiceTechnicianClosingModalProps> = ({
  open,
  serviceOrderId,
  vehicleLabel,
  technicians,
  recordedByName,
  onClose,
  onConfirmed,
}) => {
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [approvedServices, setApprovedServices] = useState<{ description: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDraft = useCallback(async () => {
    if (!open || !serviceOrderId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getServiceOrderServiceTechnicians(serviceOrderId);
      setApprovedServices(data.approvedServices ?? []);
      const initial =
        data.lines.length > 0
          ? data.lines.map((l) => newDraftLine(l))
          : (data.approvedServices?.length ?? 0) > 0
            ? data.approvedServices.map((s) =>
                newDraftLine({ description: s.description, technicianId: '', budgetId: s.budgetId ?? null })
              )
            : [newDraftLine()];
      setLines(initial);
    } catch (e) {
      setError((e as Error)?.message ?? 'Não foi possível carregar os serviços.');
      setLines([newDraftLine()]);
      setApprovedServices([]);
    } finally {
      setLoading(false);
    }
  }, [open, serviceOrderId]);

  useEffect(() => {
    if (!open) {
      setLines([]);
      setApprovedServices([]);
      setError(null);
      return;
    }
    void loadDraft();
  }, [open, loadDraft]);

  if (!open) return null;

  const handleConfirm = async () => {
    const payload = lines
      .map((l) => ({
        description: l.description.trim(),
        technicianId: l.technicianId.trim(),
        budgetId: l.budgetId ?? null,
      }))
      .filter((l) => l.description || l.technicianId);

    const check = validateServiceTechnicianLines(payload, approvedServices);
    if (!check.ok) {
      setError(check.error);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await saveServiceOrderServiceTechnicians(serviceOrderId, payload, recordedByName);
      await onConfirmed();
    } catch (e) {
      setError((e as Error)?.message ?? 'Erro ao salvar técnicos dos serviços.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalPortal>
      <div
        className={`${iosModalOverlay} animate-in fade-in duration-200 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6`}
      >
        <div
          className={`relative flex max-h-[min(92vh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1rem))] w-full max-w-lg min-h-0 flex-col overflow-hidden ${iosModalShell} animate-in zoom-in-95 duration-200`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="service-tech-closing-title"
        >
          <button
            type="button"
            onClick={onClose}
            className={iosModalClose}
            aria-label="Fechar"
            disabled={saving}
          >
            <X className="h-5 w-5" />
          </button>

          <div className="shrink-0 border-b border-zinc-200/60 px-6 pb-5 pt-7 dark:border-white/[0.07] sm:px-8 sm:pt-8">
            <div className="flex items-start gap-3 pr-10">
              <IosAccentIconSquircle variant="modal" strokeWidth={2.2}>
                <Wrench className="h-6 w-6" />
              </IosAccentIconSquircle>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                  Finalizar veículo
                </p>
                <h2
                  id="service-tech-closing-title"
                  className="text-[22px] font-semibold leading-tight tracking-tight text-zinc-900 dark:text-white sm:text-[24px]"
                >
                  Técnicos por serviço
                </h2>
                <p className="mt-1 truncate text-[13px] text-zinc-500 dark:text-zinc-400" title={vehicleLabel}>
                  {vehicleLabel}
                </p>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#F2F2F7] px-6 py-5 dark:bg-black/25 custom-scrollbar sm:px-8">
            <p className="mb-4 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">
              Para mover o veículo para <strong className="font-semibold text-zinc-800 dark:text-zinc-200">Finalizado</strong>,
              indique quem executou cada serviço aprovado no orçamento.
            </p>

            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-[#007AFF]" />
              </div>
            ) : (
              <div className="space-y-3">
                {lines.map((line, index) => (
                  <div key={line.key} className={`${iosModalInsetCard} p-3.5 sm:p-4`}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className={iosLabel}>Serviço {index + 1}</span>
                      {lines.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-red-500/10 hover:text-red-600"
                          aria-label="Remover serviço"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                    <input
                      type="text"
                      value={line.description}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l) => (l.key === line.key ? { ...l, description: e.target.value } : l))
                        )
                      }
                      placeholder="Descrição do serviço"
                      className="mb-2.5 w-full rounded-lg border border-zinc-200/90 bg-white px-3 py-2 text-[14px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35 dark:border-white/10 dark:bg-white/5 dark:text-white"
                    />
                    <div className="relative">
                      <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                      <select
                        value={line.technicianId}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((l) =>
                              l.key === line.key ? { ...l, technicianId: e.target.value } : l
                            )
                          )
                        }
                        className="w-full appearance-none rounded-lg border border-zinc-200/90 bg-white py-2 pl-9 pr-8 text-[14px] text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35 dark:border-white/10 dark:bg-white/5 dark:text-white"
                      >
                        <option value="">Selecione o técnico</option>
                        {technicians.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.display_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => setLines((prev) => [...prev, newDraftLine()])}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300/90 bg-white/60 px-4 py-3 text-[14px] font-semibold text-zinc-600 transition-colors hover:border-[#007AFF]/40 hover:text-[#007AFF] dark:border-white/15 dark:bg-white/[0.04] dark:text-zinc-300"
                >
                  <Plus className="h-4 w-4" />
                  Adicionar serviço
                </button>
              </div>
            )}

            {error ? (
              <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-[13px] font-medium text-red-700 dark:text-red-300">
                {error}
              </p>
            ) : null}
          </div>

          <div className="shrink-0 border-t border-zinc-200/60 bg-white px-6 py-4 dark:border-white/[0.07] dark:bg-zinc-950 sm:px-8">
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded-xl px-4 py-2.5 text-[15px] font-semibold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={saving || loading}
                className={`${iosAccentPrimaryButton} inline-flex min-h-[46px] items-center justify-center gap-2 px-5`}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Salvar e finalizar
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
