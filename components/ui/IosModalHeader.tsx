import React from 'react';
import { Sparkles } from 'lucide-react';

export interface IosModalHeaderProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  /** Classes Tailwind do gradiente do quadrado do ícone, ex.: from-zinc-500 to-zinc-700 */
  gradientClass?: string;
}

export const IosModalHeader: React.FC<IosModalHeaderProps> = ({
  icon,
  title,
  subtitle,
  gradientClass = 'from-zinc-500 to-zinc-700',
}) => (
  <div className="flex items-center gap-3 mb-1 pr-2">
    <div
      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${gradientClass} shadow-lg shadow-black/10`}
    >
      {icon}
    </div>
    <div className="min-w-0">
      <h2 className="text-[22px] sm:text-[26px] font-semibold tracking-tight text-zinc-900 dark:text-white leading-tight">
        {title}
      </h2>
      {subtitle ? (
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-amber-500/90 shrink-0" strokeWidth={2} />
          {subtitle}
        </p>
      ) : null}
    </div>
  </div>
);
