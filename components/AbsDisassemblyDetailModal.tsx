import React, { useEffect, useState } from 'react';
import { ExternalLink, History, Loader2, Maximize2, Scissors, X } from 'lucide-react';
import {
  getWorkshopAbsModuleDisassembly,
  type WorkshopAbsDisassemblyDetail,
  type WorkshopAbsModule,
  type WorkshopAbsModuleMovement,
} from '../services/apiService';
import {
  absDisassembleDestinationLabel,
  absModuleKindLabel,
  absModuleStatusLabel,
  describeAbsModuleMovement,
  formatAbsModuleMoney,
  formatAbsModuleSequence,
  formatAbsModuleWhen,
  primaryCodeForScope,
} from '../utils/workshopAbsModules';
import { ModalPortal } from './ui/ModalPortal';
import { useBrowserBackLayer } from './ui/BackNavigationContext';

export type AbsDisassemblyDetailModalProps = {
  open: boolean;
  /** Qualquer public_id envolvido (origem, restante ou retirado). */
  publicId: string | null;
  onClose: () => void;
  /** Abre o modal detalhe da unidade. */
  onOpenUnitDetail?: (module: WorkshopAbsModule) => void;
  /** Abre a ficha completa. */
  onExpandFiche?: (module: WorkshopAbsModule) => void;
};

function codeOf(mod: WorkshopAbsModule): string {
  const codes = mod.catalog_model?.codes || [];
  const scope =
    mod.module_kind === 'hidraulico'
      ? 'hidraulico'
      : mod.module_kind === 'eletronico'
        ? 'eletronico'
        : 'completo';
  return (
    primaryCodeForScope(codes, scope) ||
    primaryCodeForScope(codes, 'completo') ||
    mod.original_code ||
    '—'
  );
}

function MovementTimeline({
  title,
  movements,
}: {
  title: string;
  movements: WorkshopAbsModuleMovement[];
}) {
  if (!movements.length) {
    return (
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">{title}</p>
        <p className="mt-1 text-[13px] text-zinc-500">Sem movimentações.</p>
      </div>
    );
  }
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">{title}</p>
      <ol className="mt-2 space-y-2 border-l-2 border-zinc-200 pl-3 dark:border-white/10">
        {movements.map((m) => (
          <li key={m.id} className="relative">
            <span className="absolute -left-[calc(0.75rem+5px)] top-1.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-zinc-950" />
            <p className="text-[13px] font-semibold text-zinc-900 dark:text-white">
              {describeAbsModuleMovement(m)}
            </p>
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
              {formatAbsModuleWhen(m.created_at)}
              {m.recorded_by_name ? ` · ${m.recorded_by_name}` : ''}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function UnitCard({
  title,
  badge,
  badgeClass,
  module,
  onOpenDetail,
  onExpand,
}: {
  title: string;
  badge: string;
  badgeClass: string;
  module: WorkshopAbsModule;
  onOpenDetail?: (m: WorkshopAbsModule) => void;
  onExpand?: (m: WorkshopAbsModule) => void;
}) {
  return (
    <div className="rounded-2xl bg-zinc-50 p-3.5 dark:bg-white/[0.04]">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">{title}</p>
        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${badgeClass}`}>
          {badge}
        </span>
      </div>
      <p className="mt-1.5 font-mono text-[15px] font-bold tracking-wide text-zinc-900 dark:text-white">
        {module.public_id}
        <span className="ml-2 text-[13px] font-semibold text-emerald-700 dark:text-emerald-300">
          {formatAbsModuleSequence(module.sequence_number)}
        </span>
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
        <div>
          <dt className="text-zinc-500">Tipo</dt>
          <dd className="font-semibold text-zinc-800 dark:text-zinc-100">
            {absModuleKindLabel(module.module_kind)}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Status</dt>
          <dd className="font-semibold text-zinc-800 dark:text-zinc-100">
            {absModuleStatusLabel(module.status)}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-zinc-500">Código</dt>
          <dd className="font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
            {codeOf(module)}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Local</dt>
          <dd className="font-semibold text-zinc-800 dark:text-zinc-100">
            {module.location?.trim() || '—'}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Custo</dt>
          <dd className="font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">
            {formatAbsModuleMoney(module.unit_cost)}
          </dd>
        </div>
      </dl>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {onOpenDetail ? (
          <button
            type="button"
            onClick={() => onOpenDetail(module)}
            className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-2.5 py-1.5 text-[12px] font-semibold text-white"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Detalhe da unidade
          </button>
        ) : null}
        {onExpand ? (
          <button
            type="button"
            onClick={() => onExpand(module)}
            className="inline-flex items-center gap-1 rounded-xl bg-zinc-200 px-2.5 py-1.5 text-[12px] font-semibold text-zinc-800 dark:bg-white/10 dark:text-zinc-100"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            Ficha completa
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function AbsDisassemblyDetailModal({
  open,
  publicId,
  onClose,
  onOpenUnitDetail,
  onExpandFiche,
}: AbsDisassemblyDetailModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<WorkshopAbsDisassemblyDetail | null>(null);

  useBrowserBackLayer(open, onClose);

  useEffect(() => {
    if (!open || !publicId) {
      setDetail(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getWorkshopAbsModuleDisassembly(publicId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e) => {
        if (!cancelled) {
          setDetail(null);
          setError(e instanceof Error ? e.message : 'Falha ao carregar desmembramento.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, publicId]);

  if (!open) return null;

  const remainingKind = detail
    ? detail.disassembly.withdrawn_kind === 'eletronico'
      ? 'hidraulico'
      : 'eletronico'
    : null;

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[220] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
        onClick={onClose}
        role="presentation"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Detalhes do desmembramento"
          className="flex max-h-[min(920px,94dvh)] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-xl dark:bg-zinc-950 sm:rounded-3xl"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="flex shrink-0 items-start gap-3 border-b border-zinc-100 px-4 py-4 dark:border-white/[0.06] sm:px-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-800 dark:text-amber-200">
              <Scissors className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300">
                Desmembramento
              </p>
              <h2 className="text-[18px] font-bold text-zinc-900 dark:text-white">
                Detalhes da divisão do módulo
              </h2>
              {detail ? (
                <p className="mt-0.5 text-[13px] text-zinc-500 dark:text-zinc-400">
                  {formatAbsModuleWhen(detail.disassembly.created_at)}
                  {detail.disassembly.recorded_by_name
                    ? ` · por ${detail.disassembly.recorded_by_name}`
                    : ''}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700 dark:bg-white/10 dark:text-zinc-200"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 custom-scrollbar">
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
              </div>
            ) : error ? (
              <div className="rounded-2xl bg-red-50 px-4 py-3 text-[14px] text-red-800 dark:bg-red-950/40 dark:text-red-200">
                {error}
              </div>
            ) : detail ? (
              <div className="space-y-5 pb-4">
                <section className="rounded-2xl bg-amber-50/90 px-3.5 py-3 dark:bg-amber-950/35">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-200">
                    Resumo
                  </p>
                  <ul className="mt-1.5 space-y-1 text-[13px] text-amber-950 dark:text-amber-50">
                    <li>
                      <span className="text-amber-800/80 dark:text-amber-200/80">Quem desmembrou: </span>
                      <strong>{detail.disassembly.recorded_by_name || '—'}</strong>
                    </li>
                    <li>
                      <span className="text-amber-800/80 dark:text-amber-200/80">Quando: </span>
                      <strong>{formatAbsModuleWhen(detail.disassembly.created_at)}</strong>
                    </li>
                    <li>
                      <span className="text-amber-800/80 dark:text-amber-200/80">Parte retirada: </span>
                      <strong>{absModuleKindLabel(detail.disassembly.withdrawn_kind)}</strong>
                      <span className="text-amber-800/80 dark:text-amber-200/80"> → </span>
                      <strong>
                        {absDisassembleDestinationLabel(detail.disassembly.destination)}
                      </strong>
                      {detail.disassembly.destination_ref
                        ? ` (${detail.disassembly.destination_ref})`
                        : ''}
                    </li>
                    <li>
                      <span className="text-amber-800/80 dark:text-amber-200/80">Parte que ficou: </span>
                      <strong>{absModuleKindLabel(remainingKind)}</strong>
                      <span className="text-amber-800/80 dark:text-amber-200/80"> no estoque</span>
                    </li>
                    {detail.disassembly.notes?.trim() ? (
                      <li>
                        <span className="text-amber-800/80 dark:text-amber-200/80">Obs.: </span>
                        {detail.disassembly.notes}
                      </li>
                    ) : null}
                  </ul>
                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-amber-200/70 pt-3 dark:border-amber-500/20">
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-amber-800/70 dark:text-amber-200/70">
                        Custo original
                      </p>
                      <p className="text-[13px] font-bold tabular-nums">
                        {formatAbsModuleMoney(detail.disassembly.cost_original)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-amber-800/70 dark:text-amber-200/70">
                        Restante
                      </p>
                      <p className="text-[13px] font-bold tabular-nums">
                        {formatAbsModuleMoney(detail.disassembly.cost_remaining)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-amber-800/70 dark:text-amber-200/70">
                        Retirada
                      </p>
                      <p className="text-[13px] font-bold tabular-nums">
                        {formatAbsModuleMoney(detail.disassembly.cost_withdrawn)}
                      </p>
                    </div>
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-[13px] font-bold text-zinc-800 dark:text-zinc-200">
                    Unidades geradas
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <UnitCard
                      title="Ficou no estoque (nova etiqueta)"
                      badge={absModuleKindLabel(remainingKind)}
                      badgeClass="bg-emerald-600/15 text-emerald-800 dark:text-emerald-200"
                      module={detail.remaining}
                      onOpenDetail={onOpenUnitDetail}
                      onExpand={onExpandFiche}
                    />
                    <UnitCard
                      title="Deu saída"
                      badge={absModuleKindLabel(detail.disassembly.withdrawn_kind)}
                      badgeClass="bg-violet-600/15 text-violet-800 dark:text-violet-200"
                      module={detail.withdrawn}
                      onOpenDetail={onOpenUnitDetail}
                      onExpand={onExpandFiche}
                    />
                  </div>
                  <UnitCard
                    title="Completo de origem (etiqueta antiga)"
                    badge="Desmembrado"
                    badgeClass="bg-zinc-500/15 text-zinc-700 dark:text-zinc-300"
                    module={detail.source}
                    onOpenDetail={onOpenUnitDetail}
                    onExpand={onExpandFiche}
                  />
                </section>

                <section className="space-y-4 rounded-2xl bg-zinc-50 p-3.5 dark:bg-white/[0.04]">
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4 text-zinc-500" />
                    <h3 className="text-[13px] font-bold text-zinc-800 dark:text-zinc-200">
                      Linha do tempo
                    </h3>
                  </div>
                  <MovementTimeline
                    title={`Origem · ${detail.source.public_id}`}
                    movements={detail.movements.source}
                  />
                  <MovementTimeline
                    title={`Restante · ${detail.remaining.public_id}`}
                    movements={detail.movements.remaining}
                  />
                  <MovementTimeline
                    title={`Retirada · ${detail.withdrawn.public_id}`}
                    movements={detail.movements.withdrawn}
                  />
                </section>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
