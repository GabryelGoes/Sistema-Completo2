import React, { useCallback } from "react";
import { Printer, X } from "lucide-react";
import { ModalPortal } from "../ui/ModalPortal";
import { DiagnosticAuthorizationCertificateDocument } from "./DiagnosticAuthorizationCertificateDocument";
import { DIAGNOSTIC_AUTHORIZATION_PRINT_CSS } from "../../utils/diagnosticAuthorizationPrintCss";

export interface DiagnosticAuthorizationCertificateModalProps {
  open: boolean;
  onClose: () => void;
  signatureDataUrl: string;
  declarantName?: string;
  vehicleSummary?: string;
  protocolNote?: string | null;
  issuedAt?: Date;
}

export const DiagnosticAuthorizationCertificateModal: React.FC<DiagnosticAuthorizationCertificateModalProps> = ({
  open,
  onClose,
  signatureDataUrl,
  declarantName,
  vehicleSummary,
  protocolNote,
  issuedAt,
}) => {
  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  if (!open) return null;

  const at = issuedAt ?? new Date();

  return (
    <ModalPortal>
      <style dangerouslySetInnerHTML={{ __html: DIAGNOSTIC_AUTHORIZATION_PRINT_CSS }} />
      <div
        className="diag-auth-cert-backdrop fixed inset-0 z-[245] flex flex-col bg-zinc-900/75 backdrop-blur-md print:bg-white"
        role="dialog"
        aria-modal="true"
        aria-labelledby="diag-auth-cert-modal-title"
      >
        <div className="diag-auth-cert-no-print flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-zinc-950/90 px-4 py-3 sm:px-5">
          <h2 id="diag-auth-cert-modal-title" className="text-[15px] font-bold text-white">
            Documento para impressão ou PDF
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-zinc-300/90 p-4 pb-[max(5rem,env(safe-area-inset-bottom))] print:bg-white print:p-0 sm:p-6">
          <DiagnosticAuthorizationCertificateDocument
            signatureDataUrl={signatureDataUrl}
            declarantName={declarantName}
            vehicleSummary={vehicleSummary}
            protocolNote={protocolNote}
            issuedAt={at}
          />
        </div>

        <div className="diag-auth-cert-no-print pointer-events-auto fixed bottom-0 left-0 right-0 border-t border-white/10 bg-zinc-950/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:relative sm:border-0 sm:bg-transparent sm:py-0">
          <div className="mx-auto flex max-w-lg flex-col gap-2 sm:max-w-[210mm] sm:flex-row sm:justify-end sm:px-6 sm:pb-4">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-[14px] font-semibold text-zinc-900 shadow-md transition-opacity hover:opacity-95 sm:h-11"
            >
              <Printer className="h-4 w-4 shrink-0" aria-hidden />
              Imprimir ou salvar PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-white/20 px-5 text-[14px] font-semibold text-white transition-colors hover:bg-white/10 sm:h-11"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
