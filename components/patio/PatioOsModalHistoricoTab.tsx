import React, { useMemo } from 'react';
import { Clock, MessageSquare, Calculator, Truck, FileText } from 'lucide-react';
import type { ServiceOrderDetail, SavedBudgetFromApi } from '../../services/apiService';
import type { TrelloAction } from '../../types';
import type { ExternalRepairDraft } from '../../utils/externalRepair';
import { formatExternalRepairDate } from '../../utils/externalRepair';

export type PatioOsModalHistoricoTabProps = {
  serviceOrderDetail: ServiceOrderDetail | null;
  comments: TrelloAction[];
  budgets: SavedBudgetFromApi[];
  serviceOrderId: string;
  externalRepairDraft: ExternalRepairDraft;
  insetCardClass: string;
};

type HistoryEvent = {
  id: string;
  at: string;
  title: string;
  detail?: string;
  icon: 'clock' | 'comment' | 'budget' | 'truck' | 'file';
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function IconFor({ kind }: { kind: HistoryEvent['icon'] }) {
  const cls = 'h-4 w-4 shrink-0 text-[#007AFF] dark:text-[#7ab8ff]';
  switch (kind) {
    case 'comment':
      return <MessageSquare className={cls} strokeWidth={2.2} />;
    case 'budget':
      return <Calculator className={cls} strokeWidth={2.2} />;
    case 'truck':
      return <Truck className={cls} strokeWidth={2.2} />;
    case 'file':
      return <FileText className={cls} strokeWidth={2.2} />;
    default:
      return <Clock className={cls} strokeWidth={2.2} />;
  }
}

export const PatioOsModalHistoricoTab: React.FC<PatioOsModalHistoricoTabProps> = ({
  serviceOrderDetail,
  comments,
  budgets,
  serviceOrderId,
  externalRepairDraft,
  insetCardClass,
}) => {
  const events = useMemo(() => {
    const list: HistoryEvent[] = [];
    if (serviceOrderDetail?.created_at) {
      list.push({
        id: 'created',
        at: serviceOrderDetail.created_at,
        title: 'OS criada',
        icon: 'clock',
      });
    }
    for (const b of budgets.filter((x) => x.serviceOrderId === serviceOrderId)) {
      list.push({
        id: `budget-${b.id}`,
        at: b.createdAt,
        title: 'Orçamento criado',
        detail: b.diagnosis?.split('\n')[0]?.slice(0, 80) || undefined,
        icon: 'budget',
      });
    }
    if (externalRepairDraft.sentAt.trim()) {
      list.push({
        id: 'ext-sent',
        at: externalRepairDraft.sentAt,
        title: 'Enviado para conserto externo',
        detail: externalRepairDraft.vendor.trim() || undefined,
        icon: 'truck',
      });
    }
    if (externalRepairDraft.returnedAt.trim()) {
      list.push({
        id: 'ext-return',
        at: externalRepairDraft.returnedAt,
        title: 'Retorno do conserto externo',
        icon: 'truck',
      });
    }
    for (const c of comments) {
      list.push({
        id: `comment-${c.id}`,
        at: c.date,
        title: `Comentário — ${c.memberCreator.fullName}`,
        detail: c.data.text?.slice(0, 120) || undefined,
        icon: 'comment',
      });
    }
    if (serviceOrderDetail?.updated_at) {
      list.push({
        id: 'updated',
        at: serviceOrderDetail.updated_at,
        title: 'Última atualização da OS',
        icon: 'file',
      });
    }
    return list.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [serviceOrderDetail, budgets, serviceOrderId, externalRepairDraft, comments]);

  return (
    <div className={`${insetCardClass} overflow-hidden p-4 sm:p-5`}>
      <h3 className="mb-4 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
        <Clock className="h-3.5 w-3.5" />
        Linha do tempo
      </h3>
      {events.length === 0 ? (
        <p className="text-[14px] text-zinc-500 dark:text-zinc-400">Nenhum evento registrado.</p>
      ) : (
        <ul className="space-y-3">
          {events.map((ev) => (
            <li
              key={ev.id}
              className="flex gap-3 rounded-xl border border-zinc-200/80 bg-zinc-50/80 px-3 py-3 dark:border-white/[0.08] dark:bg-white/[0.03]"
            >
              <IconFor kind={ev.icon} />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100">{ev.title}</p>
                {ev.detail ? (
                  <p className="mt-0.5 line-clamp-2 text-[13px] text-zinc-600 dark:text-zinc-400">{ev.detail}</p>
                ) : null}
                <p className="mt-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-500">
                  {ev.id.startsWith('ext-') ? formatExternalRepairDate(ev.at) : formatWhen(ev.at)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
