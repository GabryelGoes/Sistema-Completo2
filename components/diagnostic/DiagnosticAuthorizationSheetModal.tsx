import React, { useCallback } from "react";
import { Printer, X } from "lucide-react";
import { ModalPortal } from "../ui/ModalPortal";
import { useTabletPhonePortraitFullscreen } from "../../hooks/useTabletPhonePortraitFullscreen";
import {
  DIAGNOSTIC_AUTHORIZATION_SIGNATURE_LABEL,
  DIAGNOSTIC_AUTHORIZATION_TITLE,
} from "../../utils/diagnosticAuthorizationTerm";
import { DIAGNOSTIC_AUTHORIZATION_PRINT_CSS } from "../../utils/diagnosticAuthorizationPrintCss";
import { DiagnosticAuthorizationTermBody } from "./DiagnosticAuthorizationTermBody";

export interface DiagnosticAuthorizationSheetModalProps {
  open: boolean;
  onClose: () => void;
  /** URL pública do storage ou data URL da assinatura */
  signatureImageSrc: string;
  signedAt?: string | null;
  /** Rodapé do cabeçalho (ex.: km) */
  subtitleExtra?: string | null;
}

function formatSignedAt(signedAt?: string | null): { date: string; time: string } | null {
  if (!signedAt) return null;
  const d = new Date(signedAt);
  if (Number.isNaN(d.getTime())) return null;
  return {
    date: d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }),
    time: d.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

export const DiagnosticAuthorizationSheetModal: React.FC<DiagnosticAuthorizationSheetModalProps> = ({
  open,
  onClose,
  signatureImageSrc,
  signedAt,
  subtitleExtra,
}) => {
  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const fullScreenPortrait = useTabletPhonePortraitFullscreen();

  if (!open) return null;

  const signed = formatSignedAt(signedAt);

  return (
    <ModalPortal>
      <style dangerouslySetInnerHTML={{ __html: DIAGNOSTIC_AUTHORIZATION_PRINT_CSS }} />
      <div
        className={
          fullScreenPortrait
            ? "diag-auth-sheet-backdrop fixed inset-0 z-[200] flex items-stretch justify-stretch bg-black/55 animate-modal-backdrop pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
            : "diag-auth-sheet-backdrop fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] animate-modal-backdrop"
        }
        role="dialog"
        aria-modal="true"
        aria-labelledby="diag-auth-sheet-title"
      >
        <div
          className={
            fullScreenPortrait
              ? "diag-auth-sheet-paper relative flex h-full min-h-0 w-full max-w-none flex-1 flex-col overflow-hidden rounded-none border-0 bg-white animate-modal-sheet"
              : "diag-auth-sheet-paper relative flex max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem)] w-full max-w-2xl min-h-0 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_24px_64px_-24px_rgba(0,0,0,0.35)] animate-modal-sheet"
          }
        >
          <div className="diag-auth-sheet-no-print relative z-10 flex shrink-0 items-start justify-between gap-3 border-b border-zinc-200 px-6 py-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Documento
              </p>
              <h2
                id="diag-auth-sheet-title"
                className="mt-1 text-[17px] font-bold tracking-tight text-zinc-950 sm:text-lg"
              >
                {DIAGNOSTIC_AUTHORIZATION_TITLE}
              </h2>
              {signed ? (
                <p className="mt-1.5 text-[13px] font-medium text-zinc-600">
                  Assinado em {signed.date} às {signed.time}
                </p>
              ) : null}
              {subtitleExtra ? (
                <p className="mt-0.5 text-[13px] font-medium text-zinc-500">{subtitleExtra}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-600 transition-colors hover:bg-zinc-100"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain bg-white p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] [-webkit-overflow-scrolling:touch] sm:p-8">
            <div className="diag-auth-sheet-doc mx-auto w-full max-w-xl">
              <header className="border-b border-zinc-200 pb-4">
                <h3 className="text-center text-[15px] font-bold uppercase tracking-[0.08em] text-zinc-950 sm:text-[16px]">
                  {DIAGNOSTIC_AUTHORIZATION_TITLE}
                </h3>
                {signed ? (
                  <p className="mt-2 text-center text-[12px] font-medium text-zinc-500 sm:text-[13px]">
                    Data: {signed.date} &nbsp;·&nbsp; Hora: {signed.time}
                  </p>
                ) : null}
              </header>

              <DiagnosticAuthorizationTermBody
                className="mt-6 space-y-4 text-[15px] leading-relaxed text-zinc-800 sm:text-[16px] sm:leading-relaxed"
                paragraphClassName="text-zinc-800"
                calloutClassName="font-extrabold uppercase tracking-wide text-zinc-950"
              />

              <div className="mt-10">
                <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                  {DIAGNOSTIC_AUTHORIZATION_SIGNATURE_LABEL}
                </p>
                <div className="relative mt-6 flex min-h-[88px] items-end justify-center px-2 pb-3">
                  <img
                    src={signatureImageSrc}
                    alt="Assinatura do cliente"
                    className="relative z-[1] max-h-[72px] w-full max-w-md object-contain object-bottom"
                  />
                  <div
                    className="absolute inset-x-0 bottom-0 border-b border-zinc-400"
                    aria-hidden
                  />
                </div>
                {signed ? (
                  <p className="mt-3 text-center text-[12px] text-zinc-500">
                    {signed.date} — {signed.time}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div
            className={
              fullScreenPortrait
                ? "diag-auth-sheet-no-print relative z-10 flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-zinc-200 bg-white px-6 py-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
                : "diag-auth-sheet-no-print relative z-10 flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-zinc-200 bg-white px-6 py-4"
            }
          >
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50"
            >
              <Printer className="h-4 w-4" aria-hidden />
              Imprimir ou PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
