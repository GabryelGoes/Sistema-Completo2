import React from 'react';

/** Bandeira do Brasil: cores oficiais verde #009739, amarelo #FEDD00, azul #002776 */
interface BrazilFlagIconProps {
  className?: string;
  width?: number;
  height?: number;
}

export const BrazilFlagIcon: React.FC<BrazilFlagIconProps> = ({
  className = '',
  width = 16,
  height = 11,
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 20 14"
    width={width}
    height={height}
    className={className}
    role="img"
    aria-label="Bandeira do Brasil"
  >
    <rect width="20" height="14" fill="#009739" rx="0.5" />
    <path fill="#FEDD00" d="M10 0 L20 7 L10 14 L0 7 Z" />
    <circle cx="10" cy="7" r="3.2" fill="#002776" />
    {/* Faixa branca (Ordem e Progresso) */}
    <path fill="none" stroke="white" strokeWidth="0.5" strokeLinecap="round" d="M7 7.2 Q10 5.5 13 7.2" />
    {/* Estrelas (representação simplificada) */}
    <g fill="white">
      <circle cx="8.4" cy="6" r="0.28" />
      <circle cx="9.6" cy="5.7" r="0.2" />
      <circle cx="10" cy="7.2" r="0.24" />
      <circle cx="10.4" cy="5.7" r="0.2" />
      <circle cx="11.6" cy="6" r="0.28" />
    </g>
  </svg>
);
