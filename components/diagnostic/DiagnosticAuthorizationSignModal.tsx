import React, { useCallback, useEffect, useRef } from "react";
import { PenLine, X, Eraser, Check } from "lucide-react";
import { ModalPortal } from "../ui/ModalPortal";
import {
  DIAGNOSTIC_AUTHORIZATION_PARAGRAPHS,
  DIAGNOSTIC_AUTHORIZATION_SIGNATURE_LABEL,
  DIAGNOSTIC_AUTHORIZATION_TITLE,
} from "../../utils/diagnosticAuthorizationTerm";

export interface DiagnosticAuthorizationSignModalProps {
  open: boolean;
  onClose: () => void;
  /** PNG com fundo transparente ou branco */
  onConfirm: (pngBlob: Blob) => void;
}

function setupCanvas(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2.5, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
  const w = Math.max(320, Math.floor(rect.width));
  const h = Math.max(160, Math.floor(rect.height));
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.fillStyle = "#fafafa";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(15,23,42,0.88)";
  ctx.lineWidth = 2.25;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  return { ctx, cssW: w, cssH: h };
}

export const DiagnosticAuthorizationSignModal: React.FC<DiagnosticAuthorizationSignModalProps> = ({
  open,
  onClose,
  onConfirm,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const hasInkRef = useRef(false);

  const redrawBase = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setupCanvas(canvas);
    hasInkRef.current = false;
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => redrawBase(), 50);
    return () => window.clearTimeout(t);
  }, [open, redrawBase]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => redrawBase();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, redrawBase]);

  const clientToLocal = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const p = clientToLocal(e);
    lastRef.current = p;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
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
    if (canvas && e.pointerId) {
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
    const canvas = canvasRef.current;
    if (!canvas || !hasInkRef.current) {
      window.alert("Desenhe sua assinatura na área indicada antes de confirmar.");
      return;
    }
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          window.alert("Não foi possível gerar a imagem da assinatura. Tente novamente.");
          return;
        }
        onConfirm(blob);
      },
      "image/png",
      0.92
    );
  };

  if (!open) return null;

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[240] flex items-end justify-center bg-black/55 p-0 pt-10 backdrop-blur-md sm:items-center sm:p-6 sm:pt-[max(1rem,env(safe-area-inset-top))] sm:pb-[max(1rem,env(safe-area-inset-bottom))]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="diag-auth-modal-title"
      >
        <div
          className="flex max-h-[min(92dvh,920px)] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] border border-zinc-200/90 bg-white shadow-[0_-12px_48px_-16px_rgba(0,0,0,0.35)] animate-in slide-in-from-bottom-4 duration-300 dark:border-white/[0.1] dark:bg-zinc-950 sm:max-h-[min(88vh,900px)] sm:rounded-[28px] sm:shadow-2xl"
          onClick={(ev) => ev.stopPropagation()}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200/80 px-5 py-4 dark:border-white/[0.08]">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#007AFF]/25 bg-[#007AFF]/[0.1] dark:border-[#007AFF]/35 dark:bg-[#007AFF]/15">
                <PenLine className="h-5 w-5 text-[#007AFF] dark:text-[#93c5fd]" strokeWidth={2.25} aria-hidden />
              </div>
              <div className="min-w-0">
                <h2
                  id="diag-auth-modal-title"
                  className="text-[15px] font-bold leading-tight tracking-tight text-zinc-900 dark:text-white"
                >
                  {DIAGNOSTIC_AUTHORIZATION_TITLE}
                </h2>
                <p className="mt-0.5 text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
                  Leia o termo e assine com o dedo ou caneta na área abaixo.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 transition-colors hover:bg-zinc-200 dark:bg-white/[0.08] dark:text-zinc-300 dark:hover:bg-white/[0.12]"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 [-webkit-overflow-scrolling:touch]">
            <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/90 p-4 text-[13px] leading-relaxed text-zinc-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] dark:border-white/[0.08] dark:bg-zinc-900/40 dark:text-zinc-100">
              {DIAGNOSTIC_AUTHORIZATION_PARAGRAPHS.map((para, i) => (
                <p key={i} className={i > 0 ? "mt-3" : ""}>
                  {para}
                </p>
              ))}
            </div>

            <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
              {DIAGNOSTIC_AUTHORIZATION_SIGNATURE_LABEL}
            </p>
            <div className="mt-2 overflow-hidden rounded-2xl border-2 border-dashed border-zinc-300/95 bg-white dark:border-white/[0.14] dark:bg-zinc-900/30">
              <canvas
                ref={canvasRef}
                className="touch-none block h-[min(200px,32vh)] w-full cursor-crosshair select-none"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={endStroke}
                onPointerCancel={endStroke}
                onPointerLeave={(e) => {
                  if (drawingRef.current) endStroke(e);
                }}
              />
            </div>
            <p className="mt-2 text-center text-[11px] text-zinc-500 dark:text-zinc-500">
              A assinatura será salva na ficha desta ordem de serviço.
            </p>
          </div>

          <div className="flex shrink-0 flex-col gap-2 border-t border-zinc-200/80 bg-white/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] dark:border-white/[0.08] dark:bg-zinc-950/95 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-zinc-200/90 bg-zinc-50 px-4 text-[14px] font-semibold text-zinc-800 transition-colors hover:bg-zinc-100 active:scale-[0.99] dark:border-white/[0.12] dark:bg-white/[0.06] dark:text-zinc-100 dark:hover:bg-white/[0.1] sm:order-1 sm:h-11"
            >
              <Eraser className="h-4 w-4 shrink-0" aria-hidden />
              Limpar
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-zinc-200/90 px-4 text-[14px] font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 active:scale-[0.99] dark:border-white/[0.12] dark:text-zinc-300 dark:hover:bg-white/[0.06] sm:order-2 sm:h-11"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#007AFF] px-5 text-[14px] font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:opacity-95 active:scale-[0.98] sm:order-3 sm:h-11"
            >
              <Check className="h-4 w-4 shrink-0" strokeWidth={2.5} aria-hidden />
              Confirmar assinatura
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
