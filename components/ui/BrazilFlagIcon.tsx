import React from 'react';

/** Bandeira do Brasil — cores oficiais (verde #009C3B, amarelo #FFDF00, azul #002776). */
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
    viewBox="0 0 22 15.4"
    width={width}
    height={height}
    className={className}
    role="img"
    aria-label="Bandeira do Brasil"
  >
    <rect width="22" height="15.4" fill="#009C3B" rx="0.35" />
    <path fill="#FFDF00" d="M11 1.1 L20.6 7.7 L11 14.3 L1.4 7.7 Z" />
    <circle cx="11" cy="7.7" r="3.55" fill="#002776" />
    {/* Faixa Order e Progresso */}
    <path
      fill="none"
      stroke="#FFFFFF"
      strokeWidth="0.85"
      strokeLinecap="round"
      d="M7.55 8.35 Q11 5.9 14.45 8.35"
    />
    {/* Estrelas ( Cruzeiro do Sul + vizinhos, esquemático ) */}
    <g fill="#FFFFFF">
      <circle cx="9.15" cy="6.55" r="0.28" />
      <circle cx="10.35" cy="5.95" r="0.22" />
      <circle cx="11.05" cy="7.85" r="0.32" />
      <circle cx="11.75" cy="6.05" r="0.2" />
      <circle cx="12.95" cy="6.65" r="0.26" />
      <circle cx="10.1" cy="8.9" r="0.16" />
      <circle cx="12.2" cy="8.75" r="0.14" />
    </g>
  </svg>
);
