import React from 'react';

type IosNotificationBadgeProps = {
  count: number;
  className?: string;
  /** Para leitores de tela (ex.: "3 itens no laboratório"). */
  ariaLabel?: string;
};

/**
 * Bolinha vermelha estilo notificação iOS (canto superior direito do alvo).
 */
export const IosNotificationBadge: React.FC<IosNotificationBadgeProps> = ({
  count,
  className = '',
  ariaLabel,
}) => {
  if (!count || count < 1) return null;
  const label = count > 99 ? '99+' : String(count);
  return (
    <span
      className={`pointer-events-none absolute -right-1.5 -top-1.5 z-[2] flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#FF3B30] px-[5px] text-[11px] font-bold leading-none text-white shadow-[0_1px_3px_rgba(0,0,0,0.28)] ring-2 ring-white dark:ring-zinc-900 ${className}`}
      aria-label={ariaLabel ?? `${count} notificaç${count === 1 ? 'ão' : 'ões'}`}
      role="status"
    >
      {label}
    </span>
  );
};
