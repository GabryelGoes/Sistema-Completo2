import React from 'react';

export type PatioBoardOriginKind = 'laboratorio' | 'patio';

type PatioBoardOriginIconProps = {
  kind: PatioBoardOriginKind;
  ready?: boolean;
  /** card | modal — controla o tamanho */
  size?: 'card' | 'cardCompact' | 'modal';
  className?: string;
};

const SIZE_CLASS: Record<NonNullable<PatioBoardOriginIconProps['size']>, string> = {
  card: 'h-9 w-9 portrait:h-8 portrait:w-8 rounded-[9px]',
  cardCompact: 'h-8 w-8 portrait:h-7 portrait:w-7 rounded-[9px]',
  modal: 'h-10 w-10 rounded-[11px] sm:h-11 sm:w-11',
};

/**
 * Ícone de origem cruzada pátio ↔ laboratório nos cards/modais.
 */
export const PatioBoardOriginIcon: React.FC<PatioBoardOriginIconProps> = ({
  kind,
  ready = false,
  size = 'card',
  className = '',
}) => {
  const isLab = kind === 'laboratorio';
  const title = isLab
    ? ready
      ? 'Peça pronta para retirada no laboratório'
      : 'Peça em andamento no laboratório'
    : ready
      ? 'Produto do pátio pronto para retirada'
      : 'Produto enviado pelo pátio';

  return (
    <img
      src={isLab ? '/icons/laboratorio-ios.png' : '/icons/patio-ios.png'}
      alt=""
      title={title}
      aria-label={title}
      className={`shrink-0 object-cover shadow-sm ring-1 ring-black/10 dark:ring-white/15 ${SIZE_CLASS[size]} ${className}`}
    />
  );
};
