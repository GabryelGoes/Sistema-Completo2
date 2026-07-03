import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Package, Plus, Trash2, User, Wrench, X } from 'lucide-react';
import { ModalPortal } from '../ui/ModalPortal';
import { useBrowserBackLayer } from '../ui/BackNavigationContext';
import { IosAccentIconSquircle } from '../ui/IosAccentIconSquircle';
import { MechanicIcon } from '../ui/MechanicIcon';
import { useDesktopShellLayout } from '../ui/DesktopShellContext';
import {
  iosLabel,
  iosModalClose,
  iosModalShell,
  iosPrimaryButton,
  resolveIosModalOverlayClass,
} from '../ui/iosModalStyles';
import {
  getServiceOrderServiceTechnicians,
  getWorkshopParts,
  saveServiceOrderServiceTechnicians,
  type FinalizeStockPartLine,
  type ServiceTechnicianClosingLine,
  type SystemUserTechnician,
  type WorkshopPart,
} from '../../services/apiService';
import { validateServiceTechnicianLines, mergeServiceTechnicianDraftLines } from '../../utils/serviceOrderServiceTechnicians';
import { mergeFinalizeStockDraftLines } from '../../utils/serviceOrderFinalizeStock';
import {
  BudgetPartsEditor,
  mapBudgetPartRowsToPayload,
  type BudgetPartRow,
} from '../budget/BudgetPartsEditor';
import { capitalizeFirst } from '../../utils/personNameFormat';

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

type TechOption = {
  id: string;
  name: string;
  style: string;
  photo_url: string | null;
};

const defaultTechStyle = 'bg-zinc-600 text-white border-zinc-600';

/** Cabeçalho/rodapé — branco levemente azulado (claro); escuro inalterado. */
const modalHeaderFooterClass =
  'bg-[#F5F8FC] dark:bg-transparent';

/** Cards de serviço — cinza um pouco mais escuro no claro. */
const serviceCardClass =
  'rounded-[22px] border border-zinc-200/80 bg-zinc-200/95 shadow-[0_2px_10px_-2px_rgba(0,0,0,0.08)] dark:border-white/[0.07] dark:bg-zinc-900/40 dark:backdrop-blur-2xl dark:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.45)]';

const technicianFieldClass =
  'flex w-full min-h-[40px] items-center gap-2.5 rounded-lg border border-zinc-200/90 bg-white py-2 pl-3 pr-3 text-left text-[14px] text-zinc-900 transition-colors hover:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:border-white/20';

const technicianSelectOverlayClass =
  'fixed inset-0 z-[150] flex items-end justify-center bg-black/45 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center sm:p-6';

const technicianSelectShellClass =
  'flex max-h-[min(70vh,420px)] w-full max-w-sm flex-col overflow-hidden rounded-[22px] border border-zinc-200/80 bg-white shadow-2xl dark:border-white/[0.1] dark:bg-zinc-900';

function accentColorToStyle(accent: string | null | undefined): string {
  const c = (accent || 'zinc').toLowerCase();
  const map: Record<string, string> = {
    blue: 'bg-blue-600 text-white border-blue-600',
    emerald: 'bg-emerald-600 text-white border-emerald-600',
    violet: 'bg-violet-600 text-white border-violet-600',
    amber: 'bg-amber-500 text-white border-amber-500',
    rose: 'bg-rose-600 text-white border-rose-600',
    cyan: 'bg-cyan-600 text-white border-cyan-600',
    orange: 'bg-orange-500 text-white border-orange-500',
    zinc: 'bg-zinc-600 text-white border-zinc-600',
  };
  return map[c] ?? map.zinc;
}

function mapTechnicians(technicians: SystemUserTechnician[]): TechOption[] {
  return technicians.map((t) => ({
    id: t.id,
    name: capitalizeFirst((t.display_name || t.username || '').trim() || t.username),
    style: accentColorToStyle(t.accent_color) || defaultTechStyle,
    photo_url: t.photo_url ?? null,
  }));
}

function newDraftLine(partial?: Partial<ServiceTechnicianClosingLine>): DraftLine {
  return {
    key: `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    description: partial?.description ?? '',
    technicianId: partial?.technicianId ?? '',
    budgetId: partial?.budgetId ?? null,
  };
}

function stockLineToPartRow(line: FinalizeStockPartLine, index: number): BudgetPartRow {
  return {
    id: `stock-${index}-${line.description}`,
    description: line.description,
    quantity: line.quantity || '1',
    fromStock: Boolean(line.workshopPartId),
    workshopPartId: line.workshopPartId ?? undefined,
  };
}

const stockPartsInsetClass =
  'rounded-xl border border-zinc-200/80 bg-white/90 dark:border-white/[0.1] dark:bg-zinc-950/50';

const stockPartsInputClass =
  'w-full rounded-lg border border-zinc-200/90 bg-white px-3 py-2 text-[14px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35 dark:border-white/10 dark:bg-white/5 dark:text-white';

type TechnicianFieldProps = {
  value: string;
  options: TechOption[];
  onOpen: () => void;
};

const TechnicianField: React.FC<TechnicianFieldProps> = ({ value, options, onOpen }) => {
  const selected = options.find((t) => t.id === value);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      className={technicianFieldClass}
      aria-haspopup="dialog"
    >
      {selected ? (
        <>
          <div
            className={`relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/25 bg-black/15 shadow-inner ${selected.style}`}
          >
            {selected.photo_url ? (
              <img
                src={selected.photo_url}
                alt=""
                className="absolute inset-0 size-full min-h-0 min-w-0 object-cover object-center"
              />
            ) : (
              <MechanicIcon className="relative z-[1] h-3.5 w-3.5 opacity-95" />
            )}
          </div>
          <span className="min-w-0 flex-1 truncate font-medium">{selected.name}</span>
        </>
      ) : (
        <>
          <User className="h-4 w-4 shrink-0 text-zinc-400" />
          <span className="text-zinc-500 dark:text-zinc-400">Selecione o técnico</span>
        </>
      )}
    </button>
  );
};

type TechnicianSelectMiniModalProps = {
  options: TechOption[];
  selectedId: string;
  serviceLabel: string;
  onSelect: (technicianId: string) => void;
  onClose: () => void;
};

const TechnicianSelectMiniModal: React.FC<TechnicianSelectMiniModalProps> = ({
  options,
  selectedId,
  serviceLabel,
  onSelect,
  onClose,
}) => (
  <div
    className={technicianSelectOverlayClass}
    role="presentation"
    onClick={onClose}
    onKeyDown={(e) => {
      if (e.key === 'Escape') onClose();
    }}
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="technician-select-title"
      className={technicianSelectShellClass}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-200/70 px-4 py-3.5 dark:border-white/[0.08]">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
            Técnico do serviço
          </p>
          <h3
            id="technician-select-title"
            className="mt-0.5 truncate text-[16px] font-semibold text-zinc-900 dark:text-white"
            title={serviceLabel}
          >
            {serviceLabel.trim() || 'Serviço'}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"
          aria-label="Fechar"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 custom-scrollbar">
        {options.length === 0 ? (
          <p className="px-3 py-6 text-center text-[13px] text-zinc-500 dark:text-zinc-400">
            Nenhum técnico cadastrado.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {options.map((tech) => {
              const isSelected = tech.id === selectedId;
              return (
                <li key={tech.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(tech.id)}
                    className={`group flex w-full min-h-[44px] items-center gap-2.5 rounded-xl border-0 py-2 pl-3 pr-3 text-left text-[14px] font-semibold leading-snug transition-all duration-200 hover:brightness-[1.06] active:scale-[0.99] ${tech.style} ${isSelected ? 'ring-2 ring-inset ring-[#007AFF]/55' : ''}`}
                  >
                    <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/25 bg-black/15 shadow-inner">
                      {tech.photo_url ? (
                        <img
                          src={tech.photo_url}
                          alt=""
                          className="absolute inset-0 size-full min-h-0 min-w-0 object-cover object-center"
                        />
                      ) : (
                        <MechanicIcon className="relative z-[1] h-4 w-4 opacity-95" />
                      )}
                    </div>
                    <span className="min-w-0 flex-1 truncate">{tech.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  </div>
);

export const ServiceTechnicianClosingModal: React.FC<ServiceTechnicianClosingModalProps> = ({
  open,
  serviceOrderId,
  vehicleLabel,
  technicians,
  recordedByName,
  onClose,
  onConfirmed,
}) => {
  const isDesktopShell = useDesktopShellLayout();
  const techOptions = useMemo(() => mapTechnicians(technicians), [technicians]);

  const [lines, setLines] = useState<DraftLine[]>([]);
  const [stockPartRows, setStockPartRows] = useState<BudgetPartRow[]>([]);
  const [approvedServices, setApprovedServices] = useState<{ description: string }[]>([]);
  const [approvedStockParts, setApprovedStockParts] = useState<FinalizeStockPartLine[]>([]);
  const [stockAlreadyApplied, setStockAlreadyApplied] = useState(false);
  const [workshopParts, setWorkshopParts] = useState<WorkshopPart[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openPickerKey, setOpenPickerKey] = useState<string | null>(null);

  const pickingLine = useMemo(
    () => (openPickerKey ? lines.find((l) => l.key === openPickerKey) ?? null : null),
    [lines, openPickerKey]
  );

  useBrowserBackLayer(openPickerKey != null, () => setOpenPickerKey(null));

  const loadDraft = useCallback(async () => {
    if (!open || !serviceOrderId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getServiceOrderServiceTechnicians(serviceOrderId);
      const approved = data.approvedServices ?? [];
      const approvedParts = data.approvedStockParts ?? [];
      setApprovedServices(approved);
      setApprovedStockParts(approvedParts);
      setStockAlreadyApplied(data.stockAlreadyApplied);
      const merged = mergeServiceTechnicianDraftLines(
        data.lines.map((l) => ({
          description: l.description,
          technicianId: l.technicianId,
          budgetId: l.budgetId ?? null,
        })),
        approved
      );
      const initial =
        merged.length > 0
          ? merged.map((l) => newDraftLine(l))
          : [newDraftLine()];
      setLines(initial);

      const mergedStock = mergeFinalizeStockDraftLines(
        (data.stockParts ?? []).map((p) => ({
          description: p.description,
          quantity: p.quantity,
          workshopPartId: p.workshopPartId ?? null,
          budgetId: p.budgetId ?? null,
        })),
        approvedParts
      );
      setStockPartRows(mergedStock.map((p, i) => stockLineToPartRow(p, i)));
    } catch (e) {
      setError((e as Error)?.message ?? 'Não foi possível carregar os serviços.');
      setLines([newDraftLine()]);
      setApprovedServices([]);
      setApprovedStockParts([]);
      setStockPartRows([]);
      setStockAlreadyApplied(false);
    } finally {
      setLoading(false);
    }
  }, [open, serviceOrderId]);

  useEffect(() => {
    if (!open) {
      setLines([]);
      setStockPartRows([]);
      setApprovedServices([]);
      setApprovedStockParts([]);
      setStockAlreadyApplied(false);
      setError(null);
      setOpenPickerKey(null);
      return;
    }
    void getWorkshopParts()
      .then(setWorkshopParts)
      .catch(() => setWorkshopParts([]));
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
      const stockPayload = mapBudgetPartRowsToPayload(stockPartRows);
      await saveServiceOrderServiceTechnicians(serviceOrderId, payload, recordedByName, stockPayload);
      await onConfirmed();
    } catch (e) {
      setError((e as Error)?.message ?? 'Erro ao salvar técnicos dos serviços.');
    } finally {
      setSaving(false);
    }
  };

  const modalWidthClass = isDesktopShell ? 'max-w-3xl' : 'max-w-lg';

  return (
    <ModalPortal>
      <div
        className={`${resolveIosModalOverlayClass(isDesktopShell)} animate-in fade-in duration-200 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6`}
      >
        <div
          className={`relative flex max-h-[min(92vh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1rem))] w-full ${modalWidthClass} min-h-0 flex-col overflow-hidden ${iosModalShell} animate-in zoom-in-95 duration-200`}
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

          <div
            className={`shrink-0 border-b border-zinc-200/60 px-6 pb-5 pt-7 dark:border-white/[0.07] sm:px-8 sm:pt-8 ${modalHeaderFooterClass}`}
          >
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
              confirme os técnicos dos serviços aprovados e revise as peças que serão abatidas do estoque.
            </p>
            {approvedServices.length > 0 ? (
              <p className="mb-4 rounded-xl border border-sky-500/25 bg-sky-500/10 px-3 py-2.5 text-[12px] leading-relaxed text-sky-900 dark:text-sky-200">
                {approvedServices.length === 1
                  ? '1 serviço aprovado no orçamento — confirme o técnico responsável.'
                  : `${approvedServices.length} serviços aprovados no orçamento — confirme o técnico de cada um.`}
              </p>
            ) : null}

            {stockAlreadyApplied ? (
              <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-[12px] leading-relaxed text-amber-950 dark:text-amber-200">
                O estoque desta OS já foi abatido anteriormente. Você pode ajustar a lista abaixo, mas o saldo não será
                alterado novamente.
              </p>
            ) : approvedStockParts.length > 0 ? (
              <p className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-[12px] leading-relaxed text-amber-950 dark:text-amber-200">
                {approvedStockParts.length === 1
                  ? '1 peça aprovada será abatida do estoque ao confirmar.'
                  : `${approvedStockParts.length} peças aprovadas serão abatidas do estoque ao confirmar.`}
              </p>
            ) : null}

            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-[#007AFF]" />
              </div>
            ) : (
              <div className="space-y-3">
                {lines.map((line, index) => (
                  <div key={line.key} className={`${serviceCardClass} p-3.5 sm:p-4`}>
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
                    <TechnicianField
                      value={line.technicianId}
                      options={techOptions}
                      onOpen={() => setOpenPickerKey(line.key)}
                    />
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

                <div className={`${serviceCardClass} p-3.5 sm:p-4`}>
                  <div className="mb-3 flex items-center gap-2">
                    <Package className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <span className={iosLabel}>Peças do estoque</span>
                  </div>
                  <p className="mb-3 text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                    Peças aprovadas no orçamento vinculadas ao catálogo. Ajuste quantidades ou remova itens antes de
                    finalizar.
                  </p>
                  <BudgetPartsEditor
                    parts={stockPartRows}
                    onChange={setStockPartRows}
                    workshopParts={workshopParts}
                    inputClass={stockPartsInputClass}
                    insetClass={stockPartsInsetClass}
                    disabled={saving}
                  />
                  {stockPartRows.length === 0 ? (
                    <p className="mt-2 text-[12px] italic text-zinc-500 dark:text-zinc-400">
                      Nenhuma peça para abater. Use o botão abaixo para incluir manualmente, se necessário.
                    </p>
                  ) : null}
                </div>
              </div>
            )}

            {error ? (
              <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-[13px] font-medium text-red-700 dark:text-red-300">
                {error}
              </p>
            ) : null}
          </div>

          <div
            className={`shrink-0 border-t border-zinc-200/60 px-6 py-4 dark:border-white/[0.07] dark:bg-zinc-950 sm:px-8 ${modalHeaderFooterClass} dark:bg-zinc-950`}
          >
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
                className={`${iosPrimaryButton} inline-flex min-h-[46px] items-center justify-center gap-2 px-5`}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Salvar e finalizar
              </button>
            </div>
          </div>
        </div>
      </div>

      {pickingLine ? (
        <TechnicianSelectMiniModal
          options={techOptions}
          selectedId={pickingLine.technicianId}
          serviceLabel={pickingLine.description}
          onClose={() => setOpenPickerKey(null)}
          onSelect={(technicianId) => {
            setLines((prev) =>
              prev.map((l) => (l.key === pickingLine.key ? { ...l, technicianId } : l))
            );
            setOpenPickerKey(null);
          }}
        />
      ) : null}
    </ModalPortal>
  );
};
