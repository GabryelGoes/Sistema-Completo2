import React, { useId } from "react";

/**
 * Ícone da Zaya — estética assistente de voz premium (aurora + bloom + movimento fluido).
 */
export const AssistantIcon: React.FC<{ className?: string }> = ({ className }) => {
  const uid = useId().replace(/:/g, "");

  const g1 = `${uid}-g1`;
  const g2 = `${uid}-g2`;
  const g3 = `${uid}-g3`;
  const g4 = `${uid}-g4`;
  const bg = `${uid}-bg`;
  const bgVignette = `${uid}-bgVig`;
  const shine = `${uid}-shine`;
  const aurora = `${uid}-aurora`;
  const filterBloom = `${uid}-bloom`;
  const filterSoft = `${uid}-soft`;

  const ease = "0.42 0 0.58 1";

  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <filter id={filterBloom} x="-35%" y="-35%" width="170%" height="170%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.8" result="b" />
          <feColorMatrix
            in="b"
            type="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1.15 0"
            result="glow"
          />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter id={filterSoft} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="0.9" result="s" />
          <feMerge>
            <feMergeNode in="s" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <radialGradient id={g1} cx="32%" cy="28%" r="72%">
          <stop offset="0%" stopColor="#ecfeff" />
          <stop offset="40%" stopColor="#67e8f9" />
          <stop offset="100%" stopColor="#0e7490" />
        </radialGradient>
        <radialGradient id={g2} cx="28%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#f5f3ff" />
          <stop offset="45%" stopColor="#c4b5fd" />
          <stop offset="100%" stopColor="#5b21b6" />
        </radialGradient>
        <radialGradient id={g3} cx="38%" cy="22%" r="68%">
          <stop offset="0%" stopColor="#ffe4e6" />
          <stop offset="50%" stopColor="#fda4af" />
          <stop offset="100%" stopColor="#9f1239" />
        </radialGradient>
        <radialGradient id={g4} cx="45%" cy="40%" r="58%">
          <stop offset="0%" stopColor="#fef9c3" />
          <stop offset="100%" stopColor="#d97706" />
        </radialGradient>

        <radialGradient id={bg} cx="50%" cy="45%" r="65%">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="70%" stopColor="#0f172a" />
          <stop offset="100%" stopColor="#020617" />
        </radialGradient>
        <radialGradient id={bgVignette} cx="50%" cy="50%" r="50%">
          <stop offset="70%" stopColor="#000000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.45" />
        </radialGradient>

        <linearGradient id={shine} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
          <stop offset="35%" stopColor="#ffffff" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>

        {/* Aurora no anel — rotação lenta (estilo luz interna) */}
        <linearGradient id={aurora} gradientUnits="userSpaceOnUse" x1="0" y1="24" x2="48" y2="24">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.95" />
          <stop offset="22%" stopColor="#a78bfa" stopOpacity="0.9" />
          <stop offset="48%" stopColor="#f472b6" stopOpacity="0.85" />
          <stop offset="72%" stopColor="#34d399" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.95" />
          <animateTransform
            attributeName="gradientTransform"
            type="rotate"
            from="0 24 24"
            to="360 24 24"
            dur="16s"
            repeatCount="indefinite"
          />
        </linearGradient>
      </defs>

      {/* Base */}
      <circle cx="24" cy="24" r="22" fill={`url(#${bg})`} />
      <circle cx="24" cy="24" r="22" fill={`url(#${bgVignette})`} />

      {/* Camada de bloom (aura difusa atrás dos orbs) */}
      <g opacity="0.55" filter={`url(#${filterSoft})`}>
        <circle r="12" fill={`url(#${g1})`} opacity="0.65">
          <animate
            attributeName="cx"
            values="16;19;16;14;16"
            keyTimes="0;0.25;0.5;0.75;1"
            dur="5s"
            calcMode="spline"
            keySplines={`${ease};${ease};${ease};${ease}`}
            repeatCount="indefinite"
          />
          <animate
            attributeName="cy"
            values="18;16;20;18;18"
            keyTimes="0;0.25;0.5;0.75;1"
            dur="5s"
            calcMode="spline"
            keySplines={`${ease};${ease};${ease};${ease}`}
            repeatCount="indefinite"
          />
        </circle>
        <circle r="10" fill={`url(#${g2})`} opacity="0.5">
          <animate
            attributeName="cx"
            values="28;25;29;28;28"
            keyTimes="0;0.25;0.5;0.75;1"
            dur="5.5s"
            calcMode="spline"
            keySplines={`${ease};${ease};${ease};${ease}`}
            repeatCount="indefinite"
          />
          <animate
            attributeName="cy"
            values="23;26;22;24;23"
            keyTimes="0;0.25;0.5;0.75;1"
            dur="5.5s"
            calcMode="spline"
            keySplines={`${ease};${ease};${ease};${ease}`}
            repeatCount="indefinite"
          />
        </circle>
      </g>

      {/* Orbs principais + bloom */}
      <g filter={`url(#${filterBloom})`}>
        <circle r="10.5" fill={`url(#${g1})`} opacity="0.94">
          <animate
            attributeName="cx"
            values="17;20;17;15;17"
            keyTimes="0;0.25;0.5;0.75;1"
            dur="4.2s"
            calcMode="spline"
            keySplines={`${ease};${ease};${ease};${ease}`}
            repeatCount="indefinite"
          />
          <animate
            attributeName="cy"
            values="19;17;21;19;19"
            keyTimes="0;0.25;0.5;0.75;1"
            dur="4.2s"
            calcMode="spline"
            keySplines={`${ease};${ease};${ease};${ease}`}
            repeatCount="indefinite"
          />
        </circle>

        <circle r="9" fill={`url(#${g2})`} opacity="0.9">
          <animate
            attributeName="cx"
            values="27;24;28;27;27"
            keyTimes="0;0.25;0.5;0.75;1"
            dur="4.8s"
            calcMode="spline"
            keySplines={`${ease};${ease};${ease};${ease}`}
            repeatCount="indefinite"
          />
          <animate
            attributeName="cy"
            values="22;25;21;23;22"
            keyTimes="0;0.25;0.5;0.75;1"
            dur="4.8s"
            calcMode="spline"
            keySplines={`${ease};${ease};${ease};${ease}`}
            repeatCount="indefinite"
          />
        </circle>

        <circle r="7.5" fill={`url(#${g3})`} opacity="0.88">
          <animate
            attributeName="cx"
            values="22;25;21;22;22"
            keyTimes="0;0.25;0.5;0.75;1"
            dur="3.6s"
            calcMode="spline"
            keySplines={`${ease};${ease};${ease};${ease}`}
            repeatCount="indefinite"
          />
          <animate
            attributeName="cy"
            values="26;24;27;26;26"
            keyTimes="0;0.25;0.5;0.75;1"
            dur="3.6s"
            calcMode="spline"
            keySplines={`${ease};${ease};${ease};${ease}`}
            repeatCount="indefinite"
          />
        </circle>

        <circle r="4.2" fill={`url(#${g4})`} opacity="0.96">
          <animate
            attributeName="cx"
            values="24;26;23;24;24"
            keyTimes="0;0.25;0.5;0.75;1"
            dur="3s"
            calcMode="spline"
            keySplines={`${ease};${ease};${ease};${ease}`}
            repeatCount="indefinite"
          />
          <animate
            attributeName="cy"
            values="20;21;19;20;20"
            keyTimes="0;0.25;0.5;0.75;1"
            dur="3s"
            calcMode="spline"
            keySplines={`${ease};${ease};${ease};${ease}`}
            repeatCount="indefinite"
          />
        </circle>
      </g>

      {/* Brilho especular (luz que “desliza”) */}
      <ellipse
        cx="19"
        cy="15"
        rx="13"
        ry="9"
        fill={`url(#${shine})`}
        transform="rotate(-16 24 24)"
        style={{ pointerEvents: "none" }}
      >
        <animate attributeName="cx" values="18;21;18;19;18" dur="7s" repeatCount="indefinite" />
        <animate attributeName="cy" values="14;16;15;15;14" dur="7s" repeatCount="indefinite" />
      </ellipse>

      {/* Anel aurora — rotação do gradiente + respiração */}
      <circle
        cx="24"
        cy="24"
        r="20.5"
        fill="none"
        stroke={`url(#${aurora})`}
        strokeWidth="0.85"
        strokeLinecap="round"
        opacity="0.72"
      >
        <animate attributeName="opacity" values="0.5;0.82;0.5" dur="3.2s" repeatCount="indefinite" />
        <animate attributeName="r" values="20.2;20.8;20.2" dur="4s" repeatCount="indefinite" />
      </circle>

      {/* Halo externo muito suave */}
      <circle cx="24" cy="24" r="21.5" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
    </svg>
  );
};
