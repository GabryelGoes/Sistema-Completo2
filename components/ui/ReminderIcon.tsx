import React from 'react';

/**
 * Ícone de lembrete para o botão e modal de Lembretes (Pátio/Laboratório).
 * Usa currentColor no stroke para herdar a cor do texto.
 */
interface ReminderIconProps {
  className?: string;
  strokeWidth?: number;
}

export const ReminderIcon: React.FC<ReminderIconProps> = ({
  className = '',
  strokeWidth = 1.5,
}) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M13 17H21M17 21V13M10 11H4M20 9V7C20 5.89543 19.1046 5 18 5H6C4.89543 5 4 5.89543 4 7V19C4 20.1046 4.89543 21 6 21H10M15 3V7M9 3V7" />
    </svg>
  );
};
