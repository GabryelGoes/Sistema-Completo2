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
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.35" result="b" />
          <feColorMatrix
            in="b"
            type="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.92 0"
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
          <stop offset="0%" stopColor="#7dd3fc" />
          <stop offset="40%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0c4a6e" />
        </radialGradient>
        <radialGradient id={g2} cx="28%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#c4b5fd" />
          <stop offset="45%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#4c1d95" />
        </radialGradient>
        <radialGradient id={g3} cx="38%" cy="22%" r="68%">
          <stop offset="0%" stopColor="#fda4af" />
          <stop offset="50%" stopColor="#fb7185" />
          <stop offset="100%" stopColor="#881337" />
        </radialGradient>
        <radialGradient id={g4} cx="45%" cy="40%" r="58%">
          <stop offset="0%" stopColor="#fde047" />
          <stop offset="100%" stopColor="#b45309" />
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
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="35%" stopColor="#ffffff" stopOpacity="0.06" />
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
      <g opacity="0.42" filter={`url(#${filterSoft})`}>
        <circle r="12" fill={`url(#${g1})`} opacity="0.5">
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
        <circle r="10" fill={`url(#${g2})`} opacity="0.38">
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
        <circle r="10.5" fill={`url(#${g1})`} opacity="0.78">
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

        <circle r="9" fill={`url(#${g2})`} opacity="0.74">
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

        <circle r="7.5" fill={`url(#${g3})`} opacity="0.72">
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

        <circle r="4.2" fill={`url(#${g4})`} opacity="0.76">
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

/** Mesmas cores do linearGradient `aurora` do ícone — borda do modal da Zaya. */
export const ZAYA_AURORA_CONIC =
  "conic-gradient(from 0deg, #22d3ee, #a78bfa, #f472b6, #34d399, #22d3ee)";

/** Moldura com aro colorido (gradiente girando), alinhada ao anel do ícone. */
export const ZayaAuroraModalFrame: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <div
    className={`relative w-full overflow-hidden rounded-[2rem] p-[2px] sm:rounded-[2.25rem] ${className ?? ""}`}
  >
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 h-[250%] min-h-[600px] w-[250%] min-w-[600px] -translate-x-1/2 -translate-y-1/2 opacity-[0.82] [animation:zayaAuroraModalSpin_16s_linear_infinite] motion-reduce:opacity-55 motion-reduce:[animation:none]"
        style={{ background: ZAYA_AURORA_CONIC }}
      />
    </div>
    <div className="relative z-[1] flex min-h-0 w-full min-w-0 flex-col">{children}</div>
  </div>
);
