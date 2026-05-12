import React from "react";
import { DiagnosticAuthorizationLegalText } from "./DiagnosticAuthorizationLegalText";
import { DIAGNOSTIC_AUTHORIZATION_SIGNATURE_LABEL } from "../../utils/diagnosticAuthorizationTerm";

export interface DiagnosticAuthorizationCertificateDocumentProps {
  signatureDataUrl: string;
  declarantName?: string;
  vehicleSummary?: string;
  /** Ex.: "OS nº 123" ou aviso de cadastro em elaboração */
  protocolNote?: string | null;
  issuedAt: Date;
  /** id estável para CSS de impressão */
  printRootId?: string;
}

function formatLongDatePt(d: Date): string {
  try {
    return d.toLocaleString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return d.toISOString();
  }
}

/**
 * Página única estilo cartório — otimizada para impressão e “Salvar como PDF” do navegador.
 */
export function DiagnosticAuthorizationCertificateDocument({
  signatureDataUrl,
  declarantName,
  vehicleSummary,
  protocolNote,
  issuedAt,
  printRootId = "diag-auth-print-root",
}: DiagnosticAuthorizationCertificateDocumentProps) {
  const when = formatLongDatePt(issuedAt);

  return (
    <article
      id={printRootId}
      className="diag-auth-print-root mx-auto box-border w-full max-w-[210mm] bg-[#fdfbf7] p-[clamp(12px,4vw,28px)] font-serif text-zinc-900 shadow-[0_2px_0_rgba(0,0,0,0.06),0_12px_40px_-20px_rgba(0,0,0,0.18)] print:shadow-none print:max-w-none"
    >
      <div className="border-[3px] border-double border-zinc-900/90 p-[clamp(10px,3vw,22px)]">
        <header className="border-b-2 border-zinc-900/85 pb-4 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-zinc-600">Registro de manifestação de vontade</p>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-700">Oficina receptora · ordem de serviço</p>
          {protocolNote ? (
            <p className="mt-3 inline-block rounded-md border border-zinc-800/15 bg-zinc-900/[0.04] px-3 py-1.5 text-[11px] font-medium text-zinc-800">
              {protocolNote}
            </p>
          ) : null}
        </header>

        <div className="mt-6">
          <DiagnosticAuthorizationLegalText
            presentation="certificate"
            declarantName={declarantName}
            vehicleSummary={vehicleSummary}
          />
        </div>

        <section className="mt-10 border-t border-zinc-900/20 pt-6">
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-700">
            {DIAGNOSTIC_AUTHORIZATION_SIGNATURE_LABEL}
          </p>
          <div className="mx-auto mt-4 flex min-h-[100px] max-w-md items-center justify-center rounded-lg border border-zinc-900/20 bg-white px-3 py-4">
            <img
              src={signatureDataUrl}
              alt="Assinatura manuscrita do declarante"
              className="max-h-[100px] w-full object-contain object-center"
            />
          </div>
          <p className="mt-6 text-center text-[12px] leading-relaxed text-zinc-800">
            <span className="font-semibold uppercase tracking-wide text-zinc-900">Local e data do instrumento: </span>
            <span className="italic">{when}</span>
          </p>
        </section>

        <footer className="mt-10 border-t border-zinc-900/15 pt-4 text-center text-[10px] leading-relaxed text-zinc-600">
          <p>
            O presente documento foi elaborado em meio eletrônico, com assinatura manuscrita capturada por meio digital, para fins de comprovação da
            ciência e concordância do declarante quanto às cláusulas acima transcritas, nos termos da legislação civil e consumerista vigente no Brasil.
          </p>
          <p className="mt-2 font-medium text-zinc-700">________________________________________</p>
          <p className="mt-1 text-[9px] uppercase tracking-[0.2em] text-zinc-500">Rubrica e identificação do declarante (quando exigido em via física)</p>
        </footer>
      </div>
    </article>
  );
}
