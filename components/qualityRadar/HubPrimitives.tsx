import React from 'react';
import { Construction, type LucideIcon } from 'lucide-react';
import { hub } from './hubTheme';

export function HubStatCard({
  label,
  value,
  hint,
  emphasize,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={`${hub.surface} p-4 ${emphasize ? 'ring-2 ring-[#FFD60A]' : ''}`}
    >
      <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${hub.muted}`}>{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-white">
        {value}
      </p>
      {hint ? <p className={`mt-1 text-[12px] ${hub.muted}`}>{hint}</p> : null}
    </div>
  );
}

export function HubEmptyState({
  icon: Icon = Construction,
  title,
  description,
  prepared,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  prepared?: boolean;
}) {
  return (
    <div className={`${hub.surface} flex flex-col items-center gap-3 px-6 py-14 text-center`}>
      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${hub.accent}`}>
        <Icon className="h-6 w-6 text-zinc-900" strokeWidth={2} />
      </div>
      <div className="max-w-md space-y-1.5">
        <h3 className="text-[16px] font-semibold text-zinc-900 dark:text-white">{title}</h3>
        <p className={`text-[13px] leading-relaxed ${hub.muted}`}>{description}</p>
      </div>
      {prepared ? (
        <p className={`${hub.badge} ${hub.accentSoft}`}>Funcionalidade em preparação</p>
      ) : null}
    </div>
  );
}

export function HubPreparedNote({ children }: { children: React.ReactNode }) {
  return <div className={hub.preparedBanner}>{children}</div>;
}

/** Escala 1–5 somente visual — desabilitada até API de avaliações. */
export function HubScorePreview({
  label,
  value,
}: {
  label: string;
  value?: number | null;
}) {
  return (
    <div className={`${hub.surfaceInset} p-3`}>
      <p className={`text-[12px] font-semibold ${hub.ink}`}>{label}</p>
      <div className="mt-2 flex gap-1.5" aria-hidden>
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            className={`flex h-8 w-8 items-center justify-center rounded-lg text-[12px] font-bold ${
              value === n
                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                : 'border border-zinc-200 bg-white text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900'
            }`}
          >
            {n}
          </span>
        ))}
      </div>
    </div>
  );
}

export function HubSectionHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[18px] font-semibold tracking-tight text-zinc-900 dark:text-white">{title}</h2>
        {subtitle ? <p className={`mt-0.5 text-[13px] ${hub.muted}`}>{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
