import React, { useId } from "react";

/**
 * Ícone da Zaya: estilo assistente de IA moderno — orbs em gradiente com movimento suave.
 */
export const AssistantIcon: React.FC<{ className?: string }> = ({ className }) => {
  const uid = useId().replace(/:/g, "");

  const g1 = `${uid}-g1`;
  const g2 = `${uid}-g2`;
  const g3 = `${uid}-g3`;
  const g4 = `${uid}-g4`;
  const bg = `${uid}-bg`;
  const shine = `${uid}-shine`;
  const ring = `${uid}-ring`;

  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <radialGradient id={g1} cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#a5f3fc" />
          <stop offset="55%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#0369a1" />
        </radialGradient>
        <radialGradient id={g2} cx="30%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#e9d5ff" />
          <stop offset="50%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#6d28d9" />
        </radialGradient>
        <radialGradient id={g3} cx="40%" cy="25%" r="60%">
          <stop offset="0%" stopColor="#fecdd3" />
          <stop offset="55%" stopColor="#fb7185" />
          <stop offset="100%" stopColor="#be123c" />
        </radialGradient>
        <radialGradient id={g4} cx="40%" cy="40%" r="55%">
          <stop offset="0%" stopColor="#fef3c7" />
          <stop offset="100%" stopColor="#f59e0b" />
        </radialGradient>
        <radialGradient id={bg} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#020617" />
        </radialGradient>
        <linearGradient id={shine} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={ring} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.8" />
          <stop offset="50%" stopColor="#a78bfa" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#fb7185" stopOpacity="0.8" />
        </linearGradient>
      </defs>

      {/* Base escura com leve profundidade */}
      <circle cx="24" cy="24" r="22" fill={`url(#${bg})`} />
      <circle cx="24" cy="24" r="22" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.75" />

      {/* Orbs coloridos — movimento independente (parece “vivo”) */}
      <circle r="11" fill={`url(#${g1})`} opacity="0.92">
        <animate attributeName="cx" values="17;20;17;15;17" dur="3.8s" repeatCount="indefinite" />
        <animate attributeName="cy" values="19;17;21;19;19" dur="3.8s" repeatCount="indefinite" />
      </circle>

      <circle r="9.5" fill={`url(#${g2})`} opacity="0.88">
        <animate attributeName="cx" values="27;24;28;27;27" dur="4.2s" repeatCount="indefinite" />
        <animate attributeName="cy" values="22;25;21;23;22" dur="4.2s" repeatCount="indefinite" />
      </circle>

      <circle r="8" fill={`url(#${g3})`} opacity="0.85">
        <animate attributeName="cx" values="22;25;21;22;22" dur="3.2s" repeatCount="indefinite" />
        <animate attributeName="cy" values="26;24;27;26;26" dur="3.2s" repeatCount="indefinite" />
      </circle>

      <circle r="4.5" fill={`url(#${g4})`} opacity="0.95">
        <animate attributeName="cx" values="24;26;23;24;24" dur="2.6s" repeatCount="indefinite" />
        <animate attributeName="cy" values="20;21;19;20;20" dur="2.6s" repeatCount="indefinite" />
      </circle>

      {/* Brilho tipo vidro / lente */}
      <ellipse
        cx="20"
        cy="16"
        rx="14"
        ry="10"
        fill={`url(#${shine})`}
        transform="rotate(-18 24 24)"
        style={{ pointerEvents: "none" }}
      />

      {/* Anel sutil que “respira” */}
      <circle cx="24" cy="24" r="20" fill="none" stroke={`url(#${ring})`} strokeWidth="0.6" opacity="0.4">
        <animate attributeName="opacity" values="0.25;0.5;0.25" dur="2.4s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
};
