import React, { useCallback, useEffect, useState } from "react";
import { Printer, X } from "lucide-react";
import { ModalPortal } from "../ui/ModalPortal";
import {
  DIAGNOSTIC_AUTHORIZATION_PARAGRAPHS,
  DIAGNOSTIC_AUTHORIZATION_SIGNATURE_LABEL,
  DIAGNOSTIC_AUTHORIZATION_TITLE,
} from "../../utils/diagnosticAuthorizationTerm";
import { DIAGNOSTIC_AUTHORIZATION_PRINT_CSS } from "../../utils/diagnosticAuthorizationPrintCss";

const paperModalStyle: React.CSSProperties = {
  backgroundColor: "#ece5d8",
  border: "1px solid rgba(0,0,0,0.1)",
  boxShadow:
    "0 0 0 1px rgba(255,255,255,0.42) inset, 0 2px 4px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.13), 0 20px 50px rgba(0,0,0,0.08)",
  backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='grain'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23grain)' opacity='0.045'/%3E%3C/svg%3E")`,
};

/** Celular/tablet em retrato: folha em tela cheia (alinhado a max-lg do Tailwind). */
function useTabletPhonePortraitFullscreen() {
  const [active, setActive] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.matchMedia("(max-width: 1023px) and (orientation: portrait)").matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 1023px) and (orientation: portrait)");
    const sync = () => setActive(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return active;
}

export interface DiagnosticAuthorizationSheetModalProps {
  open: boolean;
  onClose: () => void;
  /** URL pública do storage ou data URL da assinatura */
  signatureImageSrc: string;
  signedAt?: string | null;
  /** Rodapé do cabeçalho (ex.: km) */
  subtitleExtra?: string | null;
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

  const paperStyle: React.CSSProperties = {
    ...paperModalStyle,
    ...(fullScreenPortrait ? { boxShadow: "none", border: "none" } : {}),
  };

  const dateStr =
    signedAt && !Number.isNaN(new Date(signedAt).getTime())
      ? new Date(signedAt).toLocaleString("pt-BR", {
          day: "2-digit",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;

  return (
    <ModalPortal>
      <style dangerouslySetInnerHTML={{ __html: DIAGNOSTIC_AUTHORIZATION_PRINT_CSS }} />
      <div
        className={
          fullScreenPortrait
            ? "diag-auth-sheet-backdrop fixed inset-0 z-[200] flex items-stretch justify-stretch bg-black/80 animate-modal-backdrop pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
            : "diag-auth-sheet-backdrop fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] animate-modal-backdrop"
        }
        role="dialog"
        aria-modal="true"
        aria-labelledby="diag-auth-sheet-title"
      >
        <div
          className={
            fullScreenPortrait
              ? "diag-auth-sheet-paper relative flex h-full min-h-0 w-full max-w-none flex-1 flex-col overflow-hidden rounded-none animate-modal-sheet"
              : "diag-auth-sheet-paper relative flex max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem)] w-full max-w-2xl min-h-0 flex-col overflow-hidden rounded-lg animate-modal-sheet"
          }
          style={paperStyle}
        >
          <div
            className={fullScreenPortrait ? "pointer-events-none absolute inset-0" : "pointer-events-none absolute inset-0 rounded-lg"}
            style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.4)" }}
            aria-hidden
          />
          <div className="diag-auth-sheet-no-print relative z-10 flex shrink-0 items-center justify-between border-b border-black/10 px-6 py-4">
            <div>
              <h2 id="diag-auth-sheet-title" className="text-lg font-bold" style={{ color: "#000000" }}>
                {DIAGNOSTIC_AUTHORIZATION_TITLE}
              </h2>
              {dateStr ? (
                <p className="mt-0.5 text-sm font-medium" style={{ color: "#000000" }}>
                  {dateStr}
                </p>
              ) : null}
              {subtitleExtra ? (
                <p className="mt-1 text-sm font-medium" style={{ color: "#000000" }}>
                  {subtitleExtra}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors hover:opacity-80"
              style={{ color: "#000000" }}
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] [-webkit-overflow-scrolling:touch]">
            <div className="space-y-4 text-sm leading-relaxed" style={{ color: "#000000" }}>
              {DIAGNOSTIC_AUTHORIZATION_PARAGRAPHS.map((para, i) => (
                <p key={i}>{para}</p>
              ))}
              <p className="pt-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "#000000" }}>
                {DIAGNOSTIC_AUTHORIZATION_SIGNATURE_LABEL}
              </p>
              <div className="flex min-h-[120px] items-center justify-center rounded-lg border border-black/15 bg-white/80 p-4">
                <img
                  src={signatureImageSrc}
                  alt="Assinatura do cliente"
                  className="max-h-[140px] w-full object-contain object-center"
                />
              </div>
            </div>
          </div>

          <div
            className={
              fullScreenPortrait
                ? "diag-auth-sheet-no-print relative z-10 flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-black/10 px-6 py-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
                : "diag-auth-sheet-no-print relative z-10 flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-black/10 px-6 py-4"
            }
          >
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-2 rounded-lg border border-black/20 px-5 py-2.5 text-sm font-medium transition-colors hover:bg-black/5"
              style={{ color: "#000000" }}
            >
              <Printer className="h-4 w-4" aria-hidden />
              Imprimir ou PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: "#3d3932" }}
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
