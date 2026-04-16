import React from 'react';
import { Sparkles } from 'lucide-react';
import { iosAccentIconShellModal, iosPageTitleIconGlass } from './iosModalStyles';

export interface IosModalHeaderProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  /** @deprecated Ignorado — o ícone usa a cor de destaque da oficina (mesmo material dos títulos das páginas). */
  gradientClass?: string;
}

export const IosModalHeader: React.FC<IosModalHeaderProps> = ({ icon, title, subtitle }) => (
  <div className="flex items-center gap-3 mb-1 pr-2">
    <div className={iosAccentIconShellModal}>
      <span className={iosPageTitleIconGlass} aria-hidden />
      <div className="relative z-10 flex h-full w-full items-center justify-center text-zinc-950 [&_svg]:h-6 [&_svg]:w-6 [&_path]:fill-current [&_svg]:[filter:drop-shadow(0_1px_0_rgba(255,255,255,0.45))]">
        {icon}
      </div>
    </div>
    <div className="min-w-0">
      <h2 className="text-[22px] sm:text-[26px] font-semibold tracking-tight text-zinc-900 dark:text-white leading-tight">
        {title}
      </h2>
      {subtitle ? (
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-brand-yellow shrink-0" strokeWidth={2} />
          {subtitle}
        </p>
      ) : null}
    </div>
  </div>
);
