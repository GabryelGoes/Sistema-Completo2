import React from 'react';
import type { AbsModuleKind, WorkshopAbsModuleApplication } from '../utils/workshopAbsModules';
import {
  absComponentScopeLabel,
  formatAbsApplicationLine,
  groupAbsModuleApplications,
} from '../utils/workshopAbsModules';

const ORIGINAL_HINT =
  'Aplicação cadastrada inicialmente para este módulo (montadora/modelo de origem).';
const SECONDARY_HINT =
  'Outros veículos em que o módulo (ou só uma das partes) também serve.';

export type AbsApplicationsPanelProps = {
  applications: WorkshopAbsModuleApplication[] | null | undefined;
  moduleKind: AbsModuleKind | string | null | undefined;
  /** Texto legado da unidade quando não há aplicações no catálogo. */
  fallbackText?: string | null;
  /** Visual mais compacto (modal de detalhe). */
  compact?: boolean;
};

/**
 * Exibe aplicação original + secundárias agrupadas por escopo
 * (módulo completo / parte eletrônica / parte hidráulica).
 */
export function AbsApplicationsPanel({
  applications,
  moduleKind,
  fallbackText,
  compact = false,
}: AbsApplicationsPanelProps) {
  const grouped = groupAbsModuleApplications(applications, moduleKind);
  const fallback = String(fallbackText || '').trim();

  if (grouped.total === 0) {
    return (
      <p
        className={
          compact
            ? 'text-[14px] font-semibold text-zinc-900 dark:text-white'
            : 'text-[14px] text-zinc-500 dark:text-zinc-400'
        }
      >
        {fallback || 'Nenhuma aplicação cadastrada.'}
      </p>
    );
  }

  const titleCls = compact
    ? 'text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400'
    : 'text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400';
  const valueCls = compact
    ? 'text-[14px] font-semibold leading-snug text-zinc-900 dark:text-white'
    : 'text-[14px] font-semibold leading-snug text-zinc-900 dark:text-white';
  const noteCls = 'mt-0.5 text-[12px] text-zinc-500 dark:text-zinc-400';

  return (
    <div className={compact ? 'space-y-2.5' : 'space-y-4'}>
      <div
        className={
          compact
            ? 'rounded-lg bg-emerald-50/90 px-2.5 py-2 dark:bg-emerald-950/45'
            : 'rounded-xl bg-emerald-50 px-3.5 py-3 dark:bg-emerald-950/40'
        }
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-300">
            Aplicação original
          </p>
          <span className="rounded-md bg-emerald-600/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200">
            {absComponentScopeLabel(grouped.primaryScope)}
          </span>
        </div>
        {!compact ? <p className="mt-0.5 text-[11px] text-emerald-800/80 dark:text-emerald-200/80">{ORIGINAL_HINT}</p> : null}
        <p className={`mt-1 ${valueCls}`}>
          {grouped.primary ? formatAbsApplicationLine(grouped.primary) : fallback || '—'}
        </p>
        {grouped.primary?.notes?.trim() ? (
          <p className={noteCls}>{grouped.primary.notes}</p>
        ) : null}
      </div>

      {grouped.secondaryByScope.length > 0 ? (
        <div className={compact ? 'space-y-2' : 'space-y-3'}>
          <div>
            <p className={titleCls}>Aplicações secundárias</p>
            {!compact ? <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">{SECONDARY_HINT}</p> : null}
          </div>
          {grouped.secondaryByScope.map((group) => (
            <div
              key={group.scope}
              className={
                compact
                  ? 'rounded-lg bg-zinc-100/90 px-2.5 py-2 dark:bg-white/[0.04]'
                  : 'rounded-xl bg-zinc-100/80 px-3.5 py-3 dark:bg-white/[0.04]'
              }
            >
              <p className="text-[11px] font-bold text-zinc-700 dark:text-zinc-200">
                {group.label}
                <span className="ml-1.5 font-medium text-zinc-400">
                  · {group.apps.length}
                </span>
              </p>
              <ul
                className={
                  compact
                    ? 'mt-1.5 space-y-1 border-l-2 border-zinc-300/70 pl-2.5 dark:border-white/15'
                    : 'mt-2 space-y-1.5 border-l-2 border-zinc-300/70 pl-3 dark:border-white/15'
                }
              >
                {group.apps.map((app) => (
                  <li key={app.id}>
                    <p className={compact ? 'text-[13px] font-medium text-zinc-800 dark:text-zinc-100' : valueCls}>
                      {formatAbsApplicationLine(app)}
                    </p>
                    {app.notes?.trim() ? <p className={noteCls}>{app.notes}</p> : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
          Sem aplicações secundárias cadastradas.
        </p>
      )}
    </div>
  );
}
