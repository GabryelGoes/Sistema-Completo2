import React, { useCallback, useEffect, useRef } from "react";
import { PenLine, X, Eraser, Check } from "lucide-react";
import { useTabletPhonePortraitFullscreen } from "../../hooks/useTabletPhonePortraitFullscreen";
import { useDeviceTypeOptional } from "../ui/DeviceTypeContext";
import { ModalPortal } from "../ui/ModalPortal";
import {
  DIAGNOSTIC_AUTHORIZATION_SIGNATURE_LABEL,
  DIAGNOSTIC_AUTHORIZATION_TITLE,
} from "../../utils/diagnosticAuthorizationTerm";
import { DiagnosticAuthorizationTermBody } from "./DiagnosticAuthorizationTermBody";

export interface DiagnosticAuthorizationSignModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (blob: Blob, meta: { signaturePreviewDataUrl: string }) => void;
  /** Enquanto grava a assinatura no servidor. */
  confirming?: boolean;
}

function applyStrokeStyle(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = "rgba(15,23,42,0.92)";
  ctx.fillStyle = "rgba(15,23,42,0.92)";
  ctx.lineWidth = 2.35;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

function setupCanvas(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2.5, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
  const w = Math.max(360, Math.floor(rect.width || 360));
  const h = Math.max(200, Math.floor(rect.height || 220));
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  applyStrokeStyle(ctx);
  return { ctx, cssW: w, cssH: h };
}

export const DiagnosticAuthorizationSignModal: React.FC<DiagnosticAuthorizationSignModalProps> = ({
  open,
  onClose,
  onConfirm,
  confirming = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const hasInkRef = useRef(false);
  const fullScreenPortrait = useTabletPhonePortraitFullscreen();
  const { isDesktop } = useDeviceTypeOptional();

  const redrawBase = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setupCanvas(canvas);
    hasInkRef.current = false;
  }, []);

  useEffect(() => {
    if (!open) {
      hasInkRef.current = false;
      return;
    }
    const t = window.setTimeout(() => redrawBase(), 50);
    return () => window.clearTimeout(t);
  }, [open, redrawBase]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => redrawBase();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, redrawBase]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => redrawBase(), 80);
    return () => window.clearTimeout(t);
  }, [open, fullScreenPortrait, redrawBase]);

  const clientToLocal = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (confirming) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    e.stopPropagation();
    canvas.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    applyStrokeStyle(ctx);
    const p = clientToLocal(e);
    lastRef.current = p;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 0.01, p.y + 0.01);
    ctx.stroke();
    hasInkRef.current = true;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || confirming) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    applyStrokeStyle(ctx);
    const p = clientToLocal(e);
    const last = lastRef.current;
    if (last) {
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      hasInkRef.current = true;
    }
    lastRef.current = p;
  };

  const endStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas && e.pointerId != null) {
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    drawingRef.current = false;
    lastRef.current = null;
  };

  const handleClear = () => redrawBase();

  const handleConfirm = () => {
    if (confirming) return;
    const canvas = canvasRef.current;
    if (!canvas || !hasInkRef.current) {
      window.alert(
        isDesktop
          ? "Desenhe a assinatura com o mouse (ou trackpad) na área indicada antes de confirmar."
          : "Desenhe sua assinatura na área indicada antes de confirmar."
      );
      return;
    }
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          window.alert("Não foi possível gerar a imagem da assinatura. Tente novamente.");
          return;
        }
        const reader = new FileReader();
        reader.onloadend = () => {
          const url = typeof reader.result === "string" ? reader.result : null;
          if (!url) {
            window.alert("Não foi possível preparar a visualização da assinatura.");
            return;
          }
          onConfirm(blob, { signaturePreviewDataUrl: url });
        };
        reader.readAsDataURL(blob);
      },
      "image/png",
      0.92
    );
  };

  if (!open) return null;

  return (
    <ModalPortal>
      <div
        className={
          fullScreenPortrait
            ? "fixed inset-0 z-[240] flex items-stretch justify-stretch bg-black/80 backdrop-blur-md pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
            : "fixed inset-0 z-[240] flex items-end justify-center bg-black/55 p-0 pt-10 backdrop-blur-md sm:items-center sm:p-6 sm:pt-[max(1rem,env(safe-area-inset-top))] sm:pb-[max(1rem,env(safe-area-inset-bottom))]"
        }
        role="dialog"
        aria-modal="true"
        aria-labelledby="diag-auth-modal-title"
      >
        <div
          className={
            fullScreenPortrait
              ? "flex h-full min-h-0 w-full max-w-none flex-1 flex-col overflow-hidden border-0 bg-white shadow-none"
              : "flex max-h-[min(92dvh,920px)] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] border border-zinc-200/90 bg-white shadow-[0_-12px_48px_-16px_rgba(0,0,0,0.35)] sm:max-h-[min(90vh,940px)] sm:max-w-xl sm:rounded-[28px] sm:shadow-2xl dark:border-white/[0.1] dark:bg-zinc-950"
          }
          onClick={(ev) => ev.stopPropagation()}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200 bg-white px-5 py-4 dark:border-white/[0.08] dark:bg-zinc-950">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#007AFF]/25 bg-[#007AFF]/[0.1] dark:border-[#007AFF]/35 dark:bg-[#007AFF]/15">
                <PenLine className="h-5 w-5 text-[#007AFF] dark:text-[#93c5fd]" strokeWidth={2.25} aria-hidden />
              </div>
              <div className="min-w-0">
                <h2
                  id="diag-auth-modal-title"
                  className="text-[16px] font-bold leading-tight tracking-tight text-zinc-900 dark:text-white sm:text-[17px]"
                >
                  {DIAGNOSTIC_AUTHORIZATION_TITLE}
                </h2>
                <p className="mt-0.5 text-[13px] font-medium text-zinc-600 dark:text-zinc-400 sm:text-[14px]">
                  {isDesktop
                    ? "Leia o termo e assine com o mouse ou trackpad sobre a linha."
                    : "Leia o termo e assine com o dedo ou caneta sobre a linha."}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={confirming}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-700 transition-colors hover:bg-zinc-200 disabled:opacity-50 dark:bg-white/[0.08] dark:text-zinc-300 dark:hover:bg-white/[0.12]"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div
            className={
              fullScreenPortrait
                ? "min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white px-4 py-3 [-webkit-overflow-scrolling:touch] dark:bg-zinc-950"
                : "min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white px-5 py-4 [-webkit-overflow-scrolling:touch] dark:bg-zinc-950"
            }
          >
            <DiagnosticAuthorizationTermBody
              className="rounded-2xl border border-zinc-200 bg-white p-4 text-[16px] leading-relaxed text-zinc-800 sm:p-5 sm:text-[17px] sm:leading-relaxed dark:border-white/[0.08] dark:bg-zinc-900/40 dark:text-zinc-100"
              paragraphClassName="[&:not(:first-child)]:mt-3"
              calloutClassName="font-extrabold uppercase tracking-wide text-zinc-950 dark:text-white"
            />

            <p className="mt-5 text-[13px] font-bold uppercase tracking-[0.14em] text-zinc-700 dark:text-zinc-300 sm:text-[14px]">
              {DIAGNOSTIC_AUTHORIZATION_SIGNATURE_LABEL}
            </p>
            <div className="relative mt-2 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-white/[0.14]">
              {/* Linha-guia discreta (só visual; não entra no PNG exportado). */}
              <div
                className="pointer-events-none absolute inset-x-6 bottom-[28%] z-[1] border-b border-zinc-300/90 dark:border-zinc-500/70"
                aria-hidden
              />
              <canvas
                ref={canvasRef}
                className={`touch-none relative z-0 block w-full select-none bg-white ${
                  isDesktop
                    ? "min-h-[240px] h-[min(320px,42vh)] cursor-crosshair"
                    : "min-h-[200px] h-[min(280px,44vh)] cursor-crosshair"
                }`}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={endStroke}
                onPointerCancel={endStroke}
                onPointerLeave={(e) => {
                  if (drawingRef.current) endStroke(e);
                }}
              />
            </div>
          </div>

          <div
            className={
              fullScreenPortrait
                ? "flex shrink-0 flex-row items-stretch gap-2 border-t border-zinc-200 bg-white p-3 pb-[max(1rem,env(safe-area-inset-bottom))] dark:border-white/[0.08] dark:bg-zinc-950"
                : "flex shrink-0 flex-col gap-2 border-t border-zinc-200 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] dark:border-white/[0.08] dark:bg-zinc-950 sm:flex-row sm:justify-end"
            }
          >
            <button
              type="button"
              onClick={handleClear}
              disabled={confirming}
              className={
                fullScreenPortrait
                  ? "inline-flex min-h-[48px] min-w-0 flex-1 items-center justify-center gap-1 rounded-2xl border border-zinc-300 bg-white px-2 text-[12px] font-semibold leading-tight text-zinc-800 transition-colors hover:bg-zinc-50 active:scale-[0.99] disabled:opacity-50 dark:border-white/[0.12] dark:bg-white/[0.06] dark:text-zinc-100"
                  : "inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-zinc-300 bg-white px-4 text-[14px] font-semibold text-zinc-800 transition-colors hover:bg-zinc-50 active:scale-[0.99] disabled:opacity-50 dark:border-white/[0.12] dark:bg-white/[0.06] dark:text-zinc-100 sm:order-1 sm:h-11"
              }
            >
              <Eraser className="h-4 w-4 shrink-0" aria-hidden />
              Limpar
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={confirming}
              className={
                fullScreenPortrait
                  ? "inline-flex min-h-[48px] min-w-0 flex-1 items-center justify-center rounded-2xl border border-zinc-300 px-2 text-[12px] font-semibold leading-tight text-zinc-700 transition-colors hover:bg-zinc-50 active:scale-[0.99] disabled:opacity-50 dark:border-white/[0.12] dark:text-zinc-300"
                  : "inline-flex h-12 items-center justify-center rounded-2xl border border-zinc-300 px-4 text-[14px] font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 active:scale-[0.99] disabled:opacity-50 dark:border-white/[0.12] dark:text-zinc-300 sm:order-2 sm:h-11"
              }
            >
              Agora não
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={confirming}
              className={
                fullScreenPortrait
                  ? "inline-flex min-h-[48px] min-w-0 flex-1 items-center justify-center gap-1 rounded-2xl bg-[#007AFF] px-2 text-[12px] font-semibold leading-tight text-white shadow-lg shadow-blue-500/25 transition-all hover:opacity-95 active:scale-[0.98] disabled:opacity-50"
                  : "inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#007AFF] px-5 text-[14px] font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:opacity-95 active:scale-[0.98] disabled:opacity-50 sm:order-3 sm:h-11"
              }
            >
              <Check className="h-4 w-4 shrink-0" strokeWidth={2.5} aria-hidden />
              {confirming ? "Salvando…" : fullScreenPortrait ? (
                <span className="text-center leading-snug">Confirmar assinatura</span>
              ) : (
                "Confirmar assinatura"
              )}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
