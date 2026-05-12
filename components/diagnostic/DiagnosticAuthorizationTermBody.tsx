import React from "react";
import { DIAGNOSTIC_AUTHORIZATION_PARAGRAPH_CHUNKS } from "../../utils/diagnosticAuthorizationTerm";

export interface DiagnosticAuthorizationTermBodyProps {
  /** Classes do contêiner (ex.: tamanho/cor do bloco) */
  className?: string;
  /** Classes de cada parágrafo (ex.: margem entre parágrafos) */
  paragraphClassName?: string;
  /** Classes do trecho em destaque (negrito + caixa alta) */
  calloutClassName?: string;
}

export const DiagnosticAuthorizationTermBody: React.FC<DiagnosticAuthorizationTermBodyProps> = ({
  className,
  paragraphClassName,
  calloutClassName = "font-extrabold uppercase tracking-wide text-black",
}) => (
  <div className={className}>
    {DIAGNOSTIC_AUTHORIZATION_PARAGRAPH_CHUNKS.map((chunks, i) => (
      <p key={i} className={paragraphClassName}>
        {chunks.map((chunk, j) =>
          chunk.callout ? (
            <strong key={j} className={calloutClassName}>
              {chunk.text}
            </strong>
          ) : (
            <span key={j}>{chunk.text}</span>
          )
        )}
      </p>
    ))}
  </div>
);
