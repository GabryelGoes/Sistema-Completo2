import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Shield } from "lucide-react";
import {
  DIAGNOSTIC_AUTHORIZATION_PARAGRAPHS,
  DIAGNOSTIC_AUTHORIZATION_SIGNATURE_LABEL,
  DIAGNOSTIC_AUTHORIZATION_TITLE,
} from "../../utils/diagnosticAuthorizationTerm";
import { getVehiclePhotoPublicUrl } from "../../utils/vehicleStoragePublicUrl";

export interface DiagnosticAuthorizationRecordPanelProps {
  signedAt?: string | null;
  signaturePath?: string | null;
  /** Visual do hub de orçamentos (papel) vs modais iOS */
  variant?: "ios" | "paper";
  /** Texto quando não há assinatura */
  emptyMessage?: string;
  className?: string;
}

export const DiagnosticAuthorizationRecordPanel: React.FC<DiagnosticAuthorizationRecordPanelProps> = ({
  signedAt,
  signaturePath,
  variant = "ios",
  emptyMessage = "Nenhuma assinatura foi registrada na abertura desta OS.",
  className = "",
}) => {
  const [termOpen, setTermOpen] = useState(true);
  const imgUrl = useMemo(() => getVehiclePhotoPublicUrl(signaturePath ?? null), [signaturePath]);
  const hasRecord = Boolean(imgUrl && signedAt);
  const dateLabel =
    signedAt && !Number.isNaN(new Date(signedAt).getTime())
      ? new Date(signedAt).toLocaleString("pt-BR", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;

  const shell =
    variant === "paper"
      ? "rounded-2xl border border-black/10 bg-black/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]"
      : "rounded-[22px] border border-zinc-200/80 bg-white/90 shadow-[0_8px_28px_-12px_rgba(0,0,0,0.12)] dark:border-white/[0.1] dark:bg-zinc-950/50 dark:shadow-[0_12px_36px_-16px_rgba(0,0,0,0.45)]";

  const headClass =
    variant === "paper"
      ? "border-b border-black/10 bg-black/[0.04]"
      : "border-b border-zinc-200/70 bg-zinc-50/80 dark:border-white/[0.08] dark:bg-zinc-950/40";

  const bodyText = variant === "paper" ? "text-[12px] leading-relaxed text-black/85" : "text-[12px] leading-relaxed text-zinc-700 dark:text-zinc-200";

  return (
    <section className={`${shell} overflow-hidden ${className}`} aria-labelledby="diag-auth-panel-title">
      <button
        type="button"
        onClick={() => setTermOpen((v) => !v)}
        className={`flex w-full items-center justify-between gap-2 px-3.5 py-3 text-left transition-colors ${headClass} ${
          variant === "paper" ? "hover:bg-black/[0.06]" : "hover:bg-zinc-100/80 dark:hover:bg-white/[0.04]"
        }`}
        aria-expanded={termOpen}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
              variant === "paper"
                ? "border-black/10 bg-white/80"
                : "border-zinc-200/90 bg-gradient-to-b from-white to-zinc-50 dark:border-white/[0.1] dark:from-white/[0.12] dark:to-white/[0.04]"
            }`}
          >
            <Shield className="h-4 w-4 text-[#007AFF] dark:text-[#7ab8ff]" strokeWidth={2.25} aria-hidden />
          </span>
          <span className="min-w-0">
            <span
              id="diag-auth-panel-title"
              className={`block text-[11px] font-bold uppercase tracking-[0.12em] ${
                variant === "paper" ? "text-black/55" : "text-zinc-500 dark:text-zinc-400"
              }`}
            >
              Autorização de diagnóstico
            </span>
            <span
              className={`mt-0.5 block truncate text-[13px] font-semibold ${
                variant === "paper" ? "text-black" : "text-zinc-900 dark:text-white"
              }`}
            >
              {DIAGNOSTIC_AUTHORIZATION_TITLE}
            </span>
          </span>
        </span>
        {termOpen ? (
          <ChevronUp className={`h-4 w-4 shrink-0 ${variant === "paper" ? "text-black/45" : "text-zinc-400"}`} />
        ) : (
          <ChevronDown className={`h-4 w-4 shrink-0 ${variant === "paper" ? "text-black/45" : "text-zinc-400"}`} />
        )}
      </button>

      {termOpen ? (
        <div className="space-y-3 px-3.5 py-3 sm:px-4 sm:py-3.5">
          <div className={`rounded-xl border px-3 py-2.5 ${variant === "paper" ? "border-black/8 bg-white/70" : "border-zinc-200/70 bg-zinc-50/70 dark:border-white/[0.08] dark:bg-white/[0.04]"}`}>
            {DIAGNOSTIC_AUTHORIZATION_PARAGRAPHS.map((para, i) => (
              <p key={i} className={`${bodyText} ${i > 0 ? "mt-2" : ""}`}>
                {para}
              </p>
            ))}
          </div>

          <div>
            <p className={`text-[10px] font-bold uppercase tracking-[0.14em] ${variant === "paper" ? "text-black/50" : "text-zinc-500 dark:text-zinc-400"}`}>
              {DIAGNOSTIC_AUTHORIZATION_SIGNATURE_LABEL}
            </p>
            {hasRecord && imgUrl ? (
              <div className="mt-2 space-y-2">
                <div
                  className={`overflow-hidden rounded-xl border ${
                    variant === "paper" ? "border-black/10 bg-white" : "border-zinc-200/80 bg-white dark:border-white/[0.1] dark:bg-zinc-900/60"
                  }`}
                >
                  <img
                    src={imgUrl}
                    alt="Assinatura do cliente na autorização de diagnóstico"
                    className="max-h-[120px] w-full object-contain object-center p-2"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                {dateLabel ? (
                  <p className={`text-[11px] font-medium ${variant === "paper" ? "text-black/55" : "text-zinc-500 dark:text-zinc-400"}`}>
                    Registrado em {dateLabel}
                  </p>
                ) : null}
              </div>
            ) : (
              <p
                className={`mt-2 rounded-xl border border-dashed px-3 py-3 text-center text-[12px] font-medium leading-snug ${
                  variant === "paper"
                    ? "border-black/15 bg-white/50 text-black/55"
                    : "border-zinc-300/90 bg-zinc-50/50 text-zinc-500 dark:border-white/[0.12] dark:bg-white/[0.03] dark:text-zinc-400"
                }`}
              >
                {emptyMessage}
              </p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
};
